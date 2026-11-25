"""Adapter for StatsBomb Open Data (strictly for historical calibration & backtesting)."""

from __future__ import annotations

from backend.config import ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.schemas import SourceHealthStatus

COMPETITIONS_URL = "https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json"


class StatsBombProvider(BaseProvider):
    source_id = "statsbomb_open"
    source_name = "StatsBomb Open Data"
    requires_payment = False

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        try:
            comps, status, latency, fetched_at = self.http.get_json(
                COMPETITIONS_URL, ttl_seconds=3600, check_robots=False
            )
            if not isinstance(comps, list):
                raise ValueError("StatsBomb competitions.json liste değil")
            male_comps = [c for c in comps if c.get("competition_gender") == "male" and not c.get("competition_youth")]
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if male_comps else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(male_comps),
                coverage_summary=f"Tarihsel xG/olay arşivi aktif ({len(male_comps)} erkek sezon; canlı fikstür değildir)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="StatsBomb Open Data erişilemedi",
                updated_at=now,
            )

    def fetch_historical_xg_priors(self) -> dict[str, float]:
        """Compute historical league goal/shot baseline ratios from StatsBomb competitions metadata."""
        comps, _, _, _ = self.http.get_json(COMPETITIONS_URL, ttl_seconds=86400, check_robots=False)
        male_comps = [c for c in comps if c.get("competition_gender") == "male" and not c.get("competition_youth")]
        return {
            "male_competitions_available": float(len(male_comps)),
            "data_type": 1.0,
        }
