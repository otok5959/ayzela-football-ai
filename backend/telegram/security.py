"""Single-user Telegram security verification (User ID, Chat ID, Webhook Secret)."""

from __future__ import annotations

import hmac
from typing import Any

from backend.config import get_settings
from backend.database.repositories import AyzelaRepository


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
    settings = get_settings()
    exp_user = (allowed_user_id if allowed_user_id is not None else settings.telegram_allowed_user_id).strip()
    exp_chat = (allowed_chat_id if allowed_chat_id is not None else settings.telegram_chat_id).strip()

    if not exp_user or not exp_chat:
        return False

    ok = str(user_id) == exp_user and str(chat_id) == exp_chat
    if not ok and repo:
        repo.log(
            "SECURITY",
            "telegram.security",
            "Yetkisiz Telegram erişim girişimi engellendi",
            {"user_id": str(user_id), "chat_id": str(chat_id)},
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
