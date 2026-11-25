"""Database layer supporting SQLite (local/CI) and Cloudflare D1 REST API (cloud)."""

from backend.database.client import DatabaseClient, get_db_client
from backend.database.repositories import AyzelaRepository

__all__ = ["DatabaseClient", "get_db_client", "AyzelaRepository"]
