"""Base interface for all data providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone

from backend.collectors.http_client import RespectfulHttpClient
from backend.schemas import FixtureRecord, HistoricalMatch, SourceHealthStatus


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class BaseProvider(ABC):
    source_id: str = ""
    source_name: str = ""
    requires_payment: bool = False

    def __init__(self, http: RespectfulHttpClient | None = None) -> None:
        self.http = http or RespectfulHttpClient()

    @abstractmethod
    def check_health(self) -> SourceHealthStatus:
        """Perform a real live probe against the source and return SourceHealthStatus."""

    def fetch_upcoming_fixtures(self) -> list[FixtureRecord]:
        return []

    def fetch_historical_matches(self, organization_id: str) -> list[HistoricalMatch]:
        return []
