"""Adapter for OpenFootball World repository (CC0-1.0)."""

from __future__ import annotations

from backend.config import ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.schemas import SourceHealthStatus

WORLD_README_URL = "https://raw.githubusercontent.com/openfootball/world/master/README.md"
WORLD_API_URL = "https://api.github.com/repos/openfootball/world/contents"


class OpenFootballWorldProvider(BaseProvider):
    source_id = "openfootball_world"
    source_name = "OpenFootball World"
    requires_payment = False

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        try:
            data, status, latency, fetched_at = self.http.get_json(WORLD_API_URL, ttl_seconds=600, check_robots=False)
            regions = [d["name"] for d in data if isinstance(d, dict) and d.get("type") == "dir"]
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if regions else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(regions),
                coverage_summary=f"Kapsam bölgeleri: {', '.join(regions)} (Güney Amerika & TR beyaz liste ligleri sınırlı)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="OpenFootball World erişilemedi",
                updated_at=now,
            )
