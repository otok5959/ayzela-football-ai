"""Adapter for FIFA.com public v3 calendar matches API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.collectors.team_matcher import canonical_team_id
from backend.config import ISTANBUL_TZ, ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.providers.iddaa_provider import compute_analysis_day_tr
from backend.schemas import FixtureRecord, SourceHealthStatus, SourceProvenance
from backend.validation.league_filter import LeagueFilter


class FifaProvider(BaseProvider):
    source_id = "fifa"
    source_name = "FIFA.com Takvim API"
    requires_payment = False

    def __init__(self, http=None, league_filter: LeagueFilter | None = None) -> None:
        super().__init__(http=http)
        self.league_filter = league_filter or LeagueFilter()

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        now_dt = datetime.now(timezone.utc)
        from_str = (now_dt - timedelta(days=2)).strftime("%Y-%m-%dT00:00:00Z")
        to_str = (now_dt + timedelta(days=7)).strftime("%Y-%m-%dT23:59:59Z")
        url = f"https://api.fifa.com/api/v3/calendar/matches?from={from_str}&to={to_str}&count=20&language=en"
        try:
            data, status, latency, fetched_at = self.http.get_json(url, ttl_seconds=120, check_robots=False)
            results = data.get("Results", [])
            if not isinstance(results, list):
                raise ValueError("FIFA v3 Results alanı liste değil")
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(results),
                coverage_summary=f"FIFA v3 takvim API aktif (aralıktaki maç sayısı={len(results)})",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="FIFA takvim API erişilemedi",
                updated_at=now,
            )

    def fetch_upcoming_fixtures(self) -> list[FixtureRecord]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now_dt = datetime.now(timezone.utc)
        from_str = now_dt.strftime("%Y-%m-%dT00:00:00Z")
        to_str = (now_dt + timedelta(days=5)).strftime("%Y-%m-%dT23:59:59Z")
        url = f"https://api.fifa.com/api/v3/calendar/matches?from={from_str}&to={to_str}&count=50&language=en"
        try:
            data, _, _, fetched_at = self.http.get_json(url, ttl_seconds=600, check_robots=False)
        except Exception:
            return []

        fixtures: list[FixtureRecord] = []
        for m in data.get("Results", []):
            comp_desc = ""
            comp_names = m.get("CompetitionName") or []
            if comp_names and isinstance(comp_names, list):
                comp_desc = str(comp_names[0].get("Description") or "")
            matched = self.league_filter.match(league_name=comp_desc, country_code="INT")
            if not matched:
                continue
            home_obj = m.get("Home") or {}
            away_obj = m.get("Away") or {}
            home_names = home_obj.get("TeamName") or []
            away_names = away_obj.get("TeamName") or []
            home = str(home_names[0].get("Description") if home_names else (home_obj.get("IdCountry") or "")).strip()
            away = str(away_names[0].get("Description") if away_names else (away_obj.get("IdCountry") or "")).strip()
            if not home or not away:
                continue
            date_str = str(m.get("Date") or "")
            try:
                dt_utc = datetime.fromisoformat(date_str.replace("Z", "+00:00")).astimezone(timezone.utc)
            except ValueError:
                continue
            dt_tr = dt_utc.astimezone(ISTANBUL_TZ)
            fixtures.append(
                FixtureRecord(
                    fixture_id=f"fifa_{m.get('IdMatch')}",
                    organization_id=matched["organization_id"],
                    league_name=matched["name_tr"],
                    country=matched["country"],
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
                        verification_status="verified",
                        data_type="official_fifa_fixture",
                        is_demo=False,
                    ),
                )
            )
        return fixtures
