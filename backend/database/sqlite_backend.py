"""SQLite backend with connection closing, foreign key enforcement, and idempotent migration runner."""

from __future__ import annotations

import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class SQLiteClient:
    def __init__(self, db_path: str | Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        return conn

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> list[dict[str, Any]]:
        with closing(self._connect()) as conn:
            with conn:
                cur = conn.execute(sql, tuple(params))
                if cur.description is None:
                    return []
                rows = cur.fetchall()
                return [dict(row) for row in rows]

    def execute_many(self, sql: str, params_list: list[tuple[Any, ...] | list[Any]]) -> None:
        if not params_list:
            return
        with closing(self._connect()) as conn:
            with conn:
                conn.executemany(sql, [tuple(p) for p in params_list])

    def execute_script(self, sql_script: str) -> None:
        with closing(self._connect()) as conn:
            with conn:
                conn.executescript(sql_script)

    def _table_columns(self, table_name: str) -> set[str]:
        rows = self.execute(f"PRAGMA table_info({table_name})")
        return {str(r["name"]) for r in rows}

    def _apply_0005_safely(self, sql_script: str) -> None:
        pred_cols = self._table_columns("match_predictions")
        fix_cols = self._table_columns("fixtures")
        statements = [s.strip() for s in sql_script.split(";") if s.strip()]
        for stmt in statements:
            upper = stmt.upper()
            if upper.startswith("ALTER TABLE MATCH_PREDICTIONS ADD COLUMN "):
                col_name = stmt.split()[5].strip()
                if col_name in pred_cols:
                    continue
                self.execute(stmt)
                pred_cols.add(col_name)
            elif upper.startswith("ALTER TABLE FIXTURES ADD COLUMN "):
                col_name = stmt.split()[5].strip()
                if col_name in fix_cols:
                    continue
                self.execute(stmt)
                fix_cols.add(col_name)
            else:
                self.execute(stmt)

    def init_schema(self, migrations_dir: Path) -> None:
        self.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                applied_at_utc TEXT NOT NULL
            )
            """
        )
        applied_rows = self.execute("SELECT filename FROM schema_migrations")
        applied = {str(r["filename"]) for r in applied_rows}

        for sql_file in sorted(migrations_dir.glob("*.sql")):
            if sql_file.name in applied:
                continue
            sql_text = sql_file.read_text(encoding="utf-8")

            if sql_file.name.startswith("0003_") or sql_file.name.startswith("0004_"):
                ar_rows = self.execute(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='analysis_runs'"
                )
                ar_sql = str(ar_rows[0]["sql"] or "") if ar_rows else ""
                if "matches_analyzed >= 0" in ar_sql:
                    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                    self.execute(
                        "INSERT OR IGNORE INTO schema_migrations (filename, applied_at_utc) VALUES (?, ?)",
                        (sql_file.name, now_utc),
                    )
                    continue

            if sql_file.name.startswith("0005_"):
                self._apply_0005_safely(sql_text)
            else:
                self.execute_script(sql_text)

            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            self.execute(
                "INSERT OR IGNORE INTO schema_migrations (filename, applied_at_utc) VALUES (?, ?)",
                (sql_file.name, now_utc),
            )
