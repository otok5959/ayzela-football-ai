"""Adapter for OpenFootball football.json (CC0-1.0 public domain JSON datasets)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.collectors.team_matcher import canonical_team_id
from backend.config import ISTANBUL_TZ, ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.providers.iddaa_provider import compute_analysis_day_tr
from backend.schemas import FixtureRecord, HistoricalMatch, SourceHealthStatus, SourceProvenance
from backend.validation.league_filter import LeagueFilter

BASE_RAW = "https://raw.githubusercontent.com/openfootball/football.json/master"

LEAGUE_FILE_MAP = {
    "eng_premier_league": "en.1.json",
    "ger_bundesliga": "de.1.json",
    "esp_la_liga": "es.1.json",
    "fra_ligue_1": "fr.1.json",
    "ita_serie_a": "it.1.json",
    "ned_eredivisie": "nl.1.json",
    "por_primeira_liga": "pt.1.json",
    "bel_pro_league": "be.1.json",
    "bra_serie_a": "br.1.json",
}

DEFAULT_SEASONS = ["2026-27", "2025-26"]
CALENDAR_YEAR_SEASONS = ["2026", "2025"]


class OpenFootballJsonProvider(BaseProvider):
    source_id = "openfootball_json"
    source_name = "OpenFootball football.json"
    requires_payment = False

    def __init__(self, http=None, league_filter: LeagueFilter | None = None) -> None:
        super().__init__(http=http)
        self.league_filter = league_filter or LeagueFilter()

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        probe_url = f"{BASE_RAW}/2026-27/en.1.json"
        try:
            data, status, latency, fetched_at = self.http.get_json(probe_url, ttl_seconds=120, check_robots=False)
            matches = data.get("matches", [])
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if matches else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(matches),
                coverage_summary=f"2026-27 en.1.json doğrulandı ({len(matches)} maç), 8 Avrupa ligi mevcut",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="OpenFootball JSON erişilemedi",
                updated_at=now,
            )

    def fetch_historical_matches(self, organization_id: str, seasons: list[str] | None = None) -> list[HistoricalMatch]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        filename = LEAGUE_FILE_MAP.get(organization_id)
        if not filename:
            return []

        season_list = seasons or (CALENDAR_YEAR_SEASONS if organization_id == "bra_serie_a" else DEFAULT_SEASONS)
        results: list[HistoricalMatch] = []
        for season in season_list:
            url = f"{BASE_RAW}/{season}/{filename}"
            try:
                data, _, _, _ = self.http.get_json(url, ttl_seconds=1800, check_robots=False)
            except Exception:
                continue
            for idx, m in enumerate(data.get("matches", [])):
                score = m.get("score")
                if isinstance(score, dict):
                    ft = score.get("ft")
                    ht = score.get("ht")
                elif isinstance(score, list) and len(score) == 2:
                    ft = score
                    ht = None
                else:
                    continue
                if not ft or len(ft) != 2:
                    continue
                date_str = str(m.get("date", ""))
                time_str = str(m.get("time") or "15:00")
                if not date_str:
                    continue
                results.append(
                    HistoricalMatch(
                        match_id=f"ofj_{organization_id}_{season}_{date_str}_{idx}",
                        organization_id=organization_id,
                        season=season,
                        match_date_utc=f"{date_str}T{time_str}:00Z",
                        home_team=str(m["team1"]),
                        away_team=str(m["team2"]),
                        home_goals=int(ft[0]),
                        away_goals=int(ft[1]),
                        ht_home_goals=int(ht[0]) if ht and len(ht) == 2 else None,
                        ht_away_goals=int(ht[1]) if ht and len(ht) == 2 else None,
                        source_name=self.source_name,
                        source_url=url,
                    )
                )
        results.sort(key=lambda x: x.match_date_utc)
        return results

    def fetch_upcoming_fixtures(self, season: str = "2026-27") -> list[FixtureRecord]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now_utc = datetime.now(timezone.utc)
        fixtures: list[FixtureRecord] = []
        for org_id, filename in LEAGUE_FILE_MAP.items():
            lg = self.league_filter.by_org_id.get(org_id)
            if not lg or not lg.get("enabled", True):
                continue
            target_season = CALENDAR_YEAR_SEASONS[0] if org_id == "bra_serie_a" else season
            url = f"{BASE_RAW}/{target_season}/{filename}"
            try:
                data, _, _, fetched_at = self.http.get_json(url, ttl_seconds=900, check_robots=False)
            except Exception:
                continue
            for idx, m in enumerate(data.get("matches", [])):
                score = m.get("score")
                has_score = (isinstance(score, dict) and bool(score.get("ft"))) or (isinstance(score, list) and len(score) == 2)
                if has_score:
                    continue
                date_str = str(m.get("date", ""))
                time_str = str(m.get("time") or "15:00")
                if not date_str:
                    continue
                try:
                    dt_utc = datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
                if (dt_utc - now_utc).total_seconds() < -3600 or (dt_utc - now_utc).days > 7:
                    continue
                dt_tr = dt_utc.astimezone(ISTANBUL_TZ)
                home = str(m["team1"])
                away = str(m["team2"])
                fixtures.append(
                    FixtureRecord(
                        fixture_id=f"ofj_{org_id}_{date_str}_{canonical_team_id(home)}_{canonical_team_id(away)}",
                        organization_id=org_id,
                        league_name=lg["name_tr"],
                        country=lg["country"],
                        home_team=home,
                        away_team=away,
                        home_team_id=canonical_team_id(home),
                        away_team_id=canonical_team_id(away),
                        kickoff_utc=dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        kickoff_tr=dt_tr.strftime("%Y-%m-%dT%H:%M:%S+03:00"),
                        analysis_day_tr=compute_analysis_day_tr(dt_tr),
                        status="scheduled",
                        bulletin_source=self.source_id,
                        iddaa_verified=False,
                        available_markets=[],
                        is_demo=False,
                        provenance=SourceProvenance(
                            source_name=self.source_name,
                            source_url=url,
                            published_at=fetched_at,
                            fetched_at=fetched_at,
                            verification_status="fallback",
                            data_type="fallback_fixture",
                            is_demo=False,
                        ),
                    )
                )
        return fixtures
