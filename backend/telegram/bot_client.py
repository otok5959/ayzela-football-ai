"""Idempotent Telegram Bot API client preventing duplicate report/alert sends."""

from __future__ import annotations

from typing import Any

import httpx

from backend.config import get_settings
from backend.database.repositories import AyzelaRepository
from backend.validation.sanitizer import assert_safe_report_text


class TelegramBotClient:
    def __init__(self, repo: AyzelaRepository, bot_token: str | None = None, chat_id: str | None = None) -> None:
        settings = get_settings()
        self.repo = repo
        self.bot_token = (bot_token if bot_token is not None else settings.telegram_bot_token).strip()
        self.chat_id = (chat_id if chat_id is not None else settings.telegram_chat_id).strip()

    def send_message(
        self,
        text: str,
        dedup_key: str,
        notification_type: str = "report",
        reply_markup: dict[str, Any] | None = None,
        target_chat_id: str | None = None,
    ) -> dict[str, Any]:
        """Send a message once per dedup_key. Returns status dict."""
        assert_safe_report_text(text)
        cid = target_chat_id or self.chat_id or "dry_run_chat"

        if self.repo.was_notification_sent(dedup_key):
            return {"sent": False, "reason": "duplicate_blocked", "dedup_key": dedup_key}

        if not self.bot_token or self.bot_token.startswith("1234567890:REPLACE"):
            self.repo.record_telegram_notification(
                dedup_key=dedup_key,
                chat_id=cid,
                notification_type=notification_type,
                message_text=text,
                sent_status="dry_run",
            )
            return {"sent": True, "mode": "dry_run", "dedup_key": dedup_key}

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload: dict[str, Any] = {
            "chat_id": cid,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": True,
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        try:
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(url, json=payload)
                resp.raise_for_status()
                res_json = resp.json()
            msg_id = str(((res_json.get("result") or {}).get("message_id")) or "")
            self.repo.record_telegram_notification(
                dedup_key=dedup_key,
                chat_id=cid,
                notification_type=notification_type,
                message_text=text,
                sent_status="sent",
                telegram_message_id=msg_id,
            )
            return {"sent": True, "mode": "live", "message_id": msg_id, "dedup_key": dedup_key}
        except Exception as exc:
            self.repo.record_telegram_notification(
                dedup_key=dedup_key,
                chat_id=cid,
                notification_type=notification_type,
                message_text=text,
                sent_status="failed",
            )
            self.repo.log("ERROR", "telegram.bot_client", f"Mesaj gönderilemedi: {exc}")
            return {"sent": False, "reason": str(exc), "dedup_key": dedup_key}
