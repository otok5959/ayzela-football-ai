"""Multi-user Telegram security verification (User ID, Chat ID, Subscribers table, Webhook Secret)."""

from __future__ import annotations

import hmac
from typing import Any

from backend.config import get_settings
from backend.database.repositories import AyzelaRepository


def _split_ids(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [part.strip() for part in str(raw).split(",") if part.strip()]


def verify_webhook_secret(header_secret: str | None) -> bool:
    expected = get_settings().telegram_webhook_secret
    if not expected:
        return False
    if not header_secret:
        return False
    return hmac.compare_digest(header_secret, expected)


def is_authorized_telegram_actor(
    user_id: str | int | None,
    chat_id: str | int | None,
    allowed_user_id: str | None = None,
    allowed_chat_id: str | None = None,
    repo: AyzelaRepository | None = None,
) -> bool:
    if user_id is None or chat_id is None:
        return False
    uid_str = str(user_id).strip()
    cid_str = str(chat_id).strip()

    settings = get_settings()
    exp_users = _split_ids(allowed_user_id if allowed_user_id is not None else settings.telegram_allowed_user_id)
    exp_chats = _split_ids(allowed_chat_id if allowed_chat_id is not None else settings.telegram_chat_id)

    ok = bool(exp_users and exp_chats and uid_str in exp_users and cid_str in exp_chats)

    if not ok and repo is not None:
        subs = repo.list_telegram_subscribers(enabled_only=True)
        for s in subs:
            if str(s.get("telegram_user_id") or "").strip() == uid_str:
                sub_chat = str(s.get("chat_id") or uid_str).strip()
                if sub_chat == cid_str or uid_str == cid_str:
                    ok = True
                    break

    if not ok and repo:
        repo.log(
            "SECURITY",
            "telegram.security",
            "Yetkisiz Telegram erişim girişimi engellendi",
            {"user_id": uid_str, "chat_id": cid_str},
        )
    return ok


def extract_actor_from_update(update: dict[str, Any]) -> tuple[str | None, str | None, str]:
    if "message" in update:
        msg = update["message"]
        uid = (msg.get("from") or {}).get("id")
        cid = (msg.get("chat") or {}).get("id")
        txt = str(msg.get("text") or "").strip()
        return (str(uid) if uid is not None else None, str(cid) if cid is not None else None, txt)
    if "callback_query" in update:
        cb = update["callback_query"]
        uid = (cb.get("from") or {}).get("id")
        msg = cb.get("message") or {}
        cid = (msg.get("chat") or {}).get("id")
        data = str(cb.get("data") or "").strip()
        return (str(uid) if uid is not None else None, str(cid) if cid is not None else None, data)
    return None, None, ""
