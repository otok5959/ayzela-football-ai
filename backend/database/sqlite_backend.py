"""SQLite backend with foreign key enforcement and migration runner."""

from __future__ import annotations

import sqlite3
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
        with self._connect() as conn:
            cur = conn.execute(sql, tuple(params))
            if cur.description is None:
                conn.commit()
                return []
            rows = cur.fetchall()
            conn.commit()
            return [dict(row) for row in rows]

    def execute_many(self, sql: str, params_list: list[tuple[Any, ...] | list[Any]]) -> None:
        if not params_list:
            return
        with self._connect() as conn:
            conn.executemany(sql, [tuple(p) for p in params_list])
            conn.commit()

    def execute_script(self, sql_script: str) -> None:
        with self._connect() as conn:
            conn.executescript(sql_script)
            conn.commit()

    def init_schema(self, migrations_dir: Path) -> None:
        for sql_file in sorted(migrations_dir.glob("*.sql")):
            self.execute_script(sql_file.read_text(encoding="utf-8"))
