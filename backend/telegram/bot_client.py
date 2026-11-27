"""Idempotent multi-recipient Telegram Bot API client with automatic message chunking (>3800 chars)."""

from __future__ import annotations

from typing import Any

import httpx

from backend.config import get_settings
from backend.database.repositories import AyzelaRepository
from backend.validation.sanitizer import assert_safe_report_text


def split_telegram_message(text: str, max_len: int = 3800) -> list[str]:
    if len(text) <= max_len:
        return [text]
    chunks: list[str] = []
    current_lines: list[str] = []
    current_len = 0
    for line in text.splitlines():
        add_len = len(line) + 1
        if current_lines and current_len + add_len > max_len:
            chunks.append("\n".join(current_lines))
            current_lines = [line]
            current_len = add_len
        else:
            current_lines.append(line)
            current_len += add_len
    if current_lines:
        chunks.append("\n".join(current_lines))
    total = len(chunks)
    if total > 1:
        return [f"_(Bölüm {i + 1}/{total})_\n{c}" for i, c in enumerate(chunks)]
    return chunks


class TelegramBotClient:
    def __init__(self, repo: AyzelaRepository, bot_token: str | None = None, chat_id: str | None = None) -> None:
        settings = get_settings()
        self.repo = repo
        self.bot_token = (bot_token if bot_token is not None else settings.telegram_bot_token).strip()
        self.chat_id = (chat_id if chat_id is not None else settings.telegram_chat_id).strip()

    def _resolve_recipients(self, target_chat_id: str | None = None) -> list[str]:
        if target_chat_id:
            return [target_chat_id.strip()]
        cids: list[str] = [c.strip() for c in self.chat_id.split(",") if c.strip()]
        for sub in self.repo.list_telegram_subscribers(enabled_only=True):
            sc = str(sub.get("chat_id") or sub.get("telegram_user_id") or "").strip()
            if sc and sc not in cids:
                cids.append(sc)
        return cids or ["dry_run_chat"]

    def _send_to_single(
        self,
        cid: str,
        text: str,
        dedup_key: str,
        notification_type: str,
        reply_markup: dict[str, Any] | None,
    ) -> dict[str, Any]:
        if self.repo.was_notification_sent(dedup_key):
            return {"sent": False, "reason": "duplicate_blocked", "dedup_key": dedup_key, "chat_id": cid}

        parts = split_telegram_message(text)
        if not self.bot_token or self.bot_token.startswith("1234567890:REPLACE"):
            self.repo.record_telegram_notification(
                dedup_key=dedup_key,
                chat_id=cid,
                notification_type=notification_type,
                message_text=text,
                sent_status="dry_run",
            )
            return {"sent": True, "mode": "dry_run", "parts": len(parts), "dedup_key": dedup_key, "chat_id": cid}

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        last_msg_id = ""
        try:
            with httpx.Client(timeout=15.0) as client:
                for idx, chunk in enumerate(parts):
                    payload: dict[str, Any] = {
                        "chat_id": cid,
                        "text": chunk,
                        "parse_mode": "Markdown",
                        "disable_web_page_preview": True,
                    }
                    if reply_markup and idx == len(parts) - 1:
                        payload["reply_markup"] = reply_markup
                    resp = client.post(url, json=payload)
                    if resp.status_code == 400:
                        plain_payload = {k: v for k, v in payload.items() if k != "parse_mode"}
                        resp = client.post(url, json=plain_payload)
                    resp.raise_for_status()
                    res_json = resp.json()
                    last_msg_id = str(((res_json.get("result") or {}).get("message_id")) or "")

            self.repo.record_telegram_notification(
                dedup_key=dedup_key,
                chat_id=cid,
                notification_type=notification_type,
                message_text=text,
                sent_status="sent",
                telegram_message_id=last_msg_id,
            )
            return {
                "sent": True,
                "mode": "live",
                "parts": len(parts),
                "message_id": last_msg_id,
                "dedup_key": dedup_key,
                "chat_id": cid,
            }
        except Exception as exc:
            self.repo.record_telegram_notification(
                dedup_key=dedup_key,
                chat_id=cid,
                notification_type=notification_type,
                message_text=text,
                sent_status="failed",
            )
            self.repo.log("ERROR", "telegram.bot_client", f"Mesaj gönderilemedi ({cid}): {exc}")
            return {"sent": False, "reason": str(exc), "dedup_key": dedup_key, "chat_id": cid}

    def send_message(
        self,
        text: str,
        dedup_key: str,
        notification_type: str = "report",
        reply_markup: dict[str, Any] | None = None,
        target_chat_id: str | None = None,
    ) -> dict[str, Any]:
        """Send a message once per dedup_key (to one chat or broadcast to all active subscribers)."""
        assert_safe_report_text(text)
        recipients = self._resolve_recipients(target_chat_id)
        if len(recipients) == 1:
            return self._send_to_single(recipients[0], text, dedup_key, notification_type, reply_markup)

        results: list[dict[str, Any]] = []
        for idx, cid in enumerate(recipients):
            per_key = dedup_key if idx == 0 else f"{dedup_key}__{cid}"
            results.append(self._send_to_single(cid, text, per_key, notification_type, reply_markup))
        return {
            "sent": any(r.get("sent") for r in results),
            "mode": results[0].get("mode") if results else "none",
            "parts": results[0].get("parts", 1) if results else 0,
            "dedup_key": dedup_key,
            "recipients": results,
        }
