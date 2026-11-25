"""Securely bootstrap .env for AyzEla Football AI without printing secret values."""

from __future__ import annotations

import argparse
import hashlib
import os
import secrets
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_ENV = PROJECT_ROOT.parent / "Iddaa_Tahmin_Telegram_Botu" / ".env"
TARGET_ENV = PROJECT_ROOT / ".env"
PANEL_CREDS_FILE = PROJECT_ROOT / "data" / "panel_giris_bilgisi.txt"


def parse_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def detect_chat_id(bot_token: str) -> tuple[str, str]:
    resp = httpx.get(f"https://api.telegram.org/bot{bot_token}/getUpdates?limit=10", timeout=15.0)
    resp.raise_for_status()
    data = resp.json()
    for upd in reversed(data.get("result") or []):
        msg = upd.get("message") or {}
        uid = (msg.get("from") or {}).get("id")
        cid = (msg.get("chat") or {}).get("id")
        if uid is not None and cid is not None:
            return str(uid), str(cid)
    return "", ""


def update_env_keys(env_path: Path, updates: dict[str, str]) -> None:
    lines = env_path.read_text(encoding="utf-8").splitlines()
    new_lines: list[str] = []
    seen: set[str] = set()
    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            k = line.split("=", 1)[0].strip()
            if k in updates:
                new_lines.append(f"{k}={updates[k]}")
                seen.add(k)
                continue
        new_lines.append(line)
    for k, v in updates.items():
        if k not in seen:
            new_lines.append(f"{k}={v}")
    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--detect-chat-id", action="store_true")
    args = parser.parse_args()

    if args.detect_chat_id:
        cur = parse_env_file(TARGET_ENV)
        token = cur.get("TELEGRAM_BOT_TOKEN", "")
        if not token:
            raise SystemExit("HATA: .env içinde TELEGRAM_BOT_TOKEN bulunamadı.")
        uid, cid = detect_chat_id(token)
        if not uid or not cid:
            print("DETECTED=False (Henüz /start mesajı bulunamadı)")
            return
        update_env_keys(TARGET_ENV, {"TELEGRAM_ALLOWED_USER_ID": uid, "TELEGRAM_CHAT_ID": cid})
        print(f"DETECTED=True user_id={uid} chat_id={cid}")
        return

    src = parse_env_file(SOURCE_ENV)
    bot_token = src.get("TELEGRAM_BOT_TOKEN", "")
    raw_chat_ids = src.get("ALLOWED_CHAT_IDS", "")
    first_chat_id = raw_chat_ids.split(",")[0].strip() if raw_chat_ids else ""

    if not bot_token:
        raise SystemExit("HATA: Iddaa_Tahmin_Telegram_Botu/.env içinde TELEGRAM_BOT_TOKEN boş.")

    if not first_chat_id:
        try:
            uid, cid = detect_chat_id(bot_token)
            first_chat_id = cid or uid
        except Exception:
            first_chat_id = ""

    webhook_secret = secrets.token_hex(32)
    session_secret = secrets.token_hex(32)
    panel_password = secrets.token_urlsafe(12)
    salt = os.urandom(16).hex()
    dk = hashlib.pbkdf2_hmac("sha256", panel_password.encode("utf-8"), salt.encode("utf-8"), 100000)
    password_hash = f"pbkdf2_sha256$100000${salt}${dk.hex()}"

    env_content = "\n".join(
        [
            "APP_ENV=development",
            "TZ=Europe/Istanbul",
            "FREE_ONLY_MODE=true",
            "DAILY_MAX_MATCHES=10",
            "LINEUP_CHECK_INTERVAL_MINUTES=30",
            "LOG_LEVEL=INFO",
            "DB_BACKEND=sqlite",
            "SQLITE_DB_PATH=./data/ayzela.db",
            f"TELEGRAM_BOT_TOKEN={bot_token}",
            f"TELEGRAM_ALLOWED_USER_ID={first_chat_id}",
            f"TELEGRAM_CHAT_ID={first_chat_id}",
            f"TELEGRAM_WEBHOOK_SECRET={webhook_secret}",
            "CLOUDFLARE_ACCOUNT_ID=",
            "CLOUDFLARE_DATABASE_ID=",
            "CLOUDFLARE_API_TOKEN=",
            f"ADMIN_SESSION_SECRET={session_secret}",
            "ADMIN_USERNAME=ayzela_admin",
            f"ADMIN_PASSWORD_HASH={password_hash}",
            "PANEL_BASE_URL=https://ayzela-panel.pages.dev",
            "GITHUB_REPOSITORY=username/ayzela-football-ai",
            "GITHUB_DISPATCH_TOKEN=",
            "",
        ]
    )
    TARGET_ENV.write_text(env_content, encoding="utf-8")

    PANEL_CREDS_FILE.parent.mkdir(parents=True, exist_ok=True)
    PANEL_CREDS_FILE.write_text(
        f"Kullanıcı Adı: ayzela_admin\nParola: {panel_password}\n",
        encoding="utf-8",
    )

    print("BOOTSTRAP_OK")
    print("TELEGRAM_BOT_TOKEN_SET=", bool(bot_token))
    print("TELEGRAM_CHAT_ID_SET=", bool(first_chat_id))
    print("TELEGRAM_WEBHOOK_SECRET_SET=", bool(webhook_secret))
    print("ADMIN_SESSION_SECRET_SET=", bool(session_secret))
    print("ADMIN_PASSWORD_HASH_SET=", bool(password_hash))
    print("PANEL_CREDS_FILE_WRITTEN=", PANEL_CREDS_FILE.exists())


if __name__ == "__main__":
    main()
