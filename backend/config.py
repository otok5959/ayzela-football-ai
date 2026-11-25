"""Central configuration for AyzEla Football AI."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env", override=False)

ISTANBUL_TZ = ZoneInfo("Europe/Istanbul")


class FreeOnlyModeViolation(RuntimeError):
    """Raised when a paid provider/feature is attempted while FREE_ONLY_MODE is active."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="development", alias="APP_ENV")
    tz: str = Field(default="Europe/Istanbul", alias="TZ")
    free_only_mode: bool = Field(default=True, alias="FREE_ONLY_MODE")
    all_iddaa_bulletin: bool = Field(default=True, alias="ALL_IDDAA_BULLETIN")
    daily_max_matches: int = Field(default=250, alias="DAILY_MAX_MATCHES")
    lineup_check_interval_minutes: int = Field(default=30, alias="LINEUP_CHECK_INTERVAL_MINUTES")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    db_backend: str = Field(default="sqlite", alias="DB_BACKEND")
    sqlite_db_path: str = Field(default=str(PROJECT_ROOT / "data" / "ayzela.db"), alias="SQLITE_DB_PATH")

    telegram_bot_token: str = Field(default="", alias="TELEGRAM_BOT_TOKEN")
    telegram_allowed_user_id: str = Field(default="", alias="TELEGRAM_ALLOWED_USER_ID")
    telegram_chat_id: str = Field(default="", alias="TELEGRAM_CHAT_ID")
    telegram_webhook_secret: str = Field(default="", alias="TELEGRAM_WEBHOOK_SECRET")

    cloudflare_account_id: str = Field(default="", alias="CLOUDFLARE_ACCOUNT_ID")
    cloudflare_database_id: str = Field(default="", alias="CLOUDFLARE_DATABASE_ID")
    cloudflare_api_token: str = Field(default="", alias="CLOUDFLARE_API_TOKEN")

    admin_session_secret: str = Field(default="", alias="ADMIN_SESSION_SECRET")
    panel_base_url: str = Field(default="https://ayzela-panel.pages.dev", alias="PANEL_BASE_URL")

    github_repository: str = Field(default="", alias="GITHUB_REPOSITORY")
    github_dispatch_token: str = Field(default="", alias="GITHUB_DISPATCH_TOKEN")

    @property
    def cache_dir(self) -> Path:
        p = PROJECT_ROOT / "data" / "cache"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def config_dir(self) -> Path:
        return PROJECT_ROOT / "config"

    @property
    def migrations_dir(self) -> Path:
        return PROJECT_ROOT / "migrations"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def ensure_free_only_allowed(requires_payment: bool, provider_name: str) -> None:
    """Block any paid API/service when FREE_ONLY_MODE=True."""
    settings = get_settings()
    if settings.free_only_mode and requires_payment:
        raise FreeOnlyModeViolation(
            f"FREE_ONLY_MODE aktif: Ücretli servis '{provider_name}' engellendi."
        )
