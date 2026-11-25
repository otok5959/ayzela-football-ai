"""Shared pytest fixtures."""

from __future__ import annotations

from pathlib import Path
import sys
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.config import get_settings
from backend.database.repositories import AyzelaRepository
from backend.database.sqlite_backend import SQLiteClient


@pytest.fixture()
def temp_repo(tmp_path: Path) -> AyzelaRepository:
    db_path = tmp_path / "test_ayzela.db"
    client = SQLiteClient(db_path)
    client.init_schema(get_settings().migrations_dir)
    return AyzelaRepository(client)
