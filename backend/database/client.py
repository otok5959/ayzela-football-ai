"""Unified database interface and factory for SQLite and Cloudflare D1."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Protocol

from backend.config import get_settings


class DatabaseClient(Protocol):
    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> list[dict[str, Any]]:
        ...

    def execute_many(self, sql: str, params_list: list[tuple[Any, ...] | list[Any]]) -> None:
        ...

    def execute_script(self, sql_script: str) -> None:
        ...


def get_db_client(db_path: str | Path | None = None) -> DatabaseClient:
    settings = get_settings()
    if db_path is not None or settings.db_backend.lower() == "sqlite":
        from backend.database.sqlite_backend import SQLiteClient

        return SQLiteClient(db_path or settings.sqlite_db_path)

    if settings.db_backend.lower() == "d1":
        from backend.database.d1_backend import CloudflareD1Client

        return CloudflareD1Client(
            account_id=settings.cloudflare_account_id,
            database_id=settings.cloudflare_database_id,
            api_token=settings.cloudflare_api_token,
        )

    raise ValueError(f"Desteklenmeyen DB_BACKEND: {settings.db_backend}")
