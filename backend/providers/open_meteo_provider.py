"""Adapter for Open-Meteo free weather forecast API."""

from __future__ import annotations

import json
from typing import Any

from backend.collectors.team_matcher import normalize_team_name
from backend.config import ensure_free_only_allowed, get_settings
from backend.providers.base import BaseProvider, utc_now_iso
from backend.schemas import SourceHealthStatus


class OpenMeteoProvider(BaseProvider):
    source_id = "open_meteo"
    source_name = "Open-Meteo Hava Durumu"
    requires_payment = False

    def __init__(self, http=None) -> None:
        super().__init__(http=http)
        stadium_file = get_settings().config_dir / "stadiums.json"
        self.stadium_cfg = json.loads(stadium_file.read_text(encoding="utf-8"))

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        url = (
            "https://api.open-meteo.com/v1/forecast"
            "?latitude=41.0082&longitude=28.9784&hourly=temperature_2m,precipitation_probability,wind_speed_10m&forecast_days=1"
        )
        try:
            data, status, latency, fetched_at = self.http.get_json(url, ttl_seconds=600, check_robots=False)
            hours = (data.get("hourly") or {}).get("time") or []
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if hours else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(hours),
                coverage_summary=f"Saatlik stadyum hava tahmini aktif ({len(hours)} saat)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="Open-Meteo erişilemedi",
                updated_at=now,
            )

    def fetch_match_weather(self, home_team: str, country_code: str, kickoff_utc_iso: str) -> dict[str, Any] | None:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        norm = normalize_team_name(home_team)
        loc = self.stadium_cfg.get("teams", {}).get(norm)
        loc_type = "stadium"
        if not loc:
            loc = self.stadium_cfg.get("country_fallbacks", {}).get(country_code)
            loc_type = "country_capital_fallback"
        if not loc:
            return None

        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={loc['lat']}&longitude={loc['lon']}"
            f"&hourly=temperature_2m,precipitation_probability,wind_speed_10m&forecast_days=3"
        )
        try:
            data, _, _, fetched_at = self.http.get_json(url, ttl_seconds=3600, check_robots=False)
        except Exception:
            return None

        hourly = data.get("hourly") or {}
        times = hourly.get("time") or []
        target_hour = kickoff_utc_iso[:13] + ":00"
        if target_hour not in times:
            return None
        idx = times.index(target_hour)
        return {
            "stadium": loc.get("stadium", loc.get("city")),
            "city": loc.get("city"),
            "location_precision": loc_type,
            "temperature_c": hourly["temperature_2m"][idx],
            "precipitation_prob_pct": hourly["precipitation_probability"][idx],
            "wind_speed_kmh": hourly["wind_speed_10m"][idx],
            "source_url": url,
            "fetched_at": fetched_at,
        }
