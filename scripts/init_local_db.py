"""Initialize local SQLite database with all 28 tables and seed defaults."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import get_settings
from backend.database.sqlite_backend import SQLiteClient


def main() -> None:
    settings = get_settings()
    client = SQLiteClient(settings.sqlite_db_path)
    client.init_schema(settings.migrations_dir)
    tables = client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    print(f"Veritabani hazir: {settings.sqlite_db_path}")
    print(f"Toplam tablo sayisi: {len(tables)}")
    for t in tables:
        print(f"  - {t['name']}")


if __name__ == "__main__":
    main()
