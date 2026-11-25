"""Adapter for TheSportsDB free public key (123) as tertiary fixture/result fallback."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.collectors.team_matcher import canonical_team_id
from backend.config import ISTANBUL_TZ, ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.providers.iddaa_provider import compute_analysis_day_tr
from backend.schemas import FixtureRecord, HistoricalMatch, SourceHealthStatus, SourceProvenance
from backend.validation.league_filter import LeagueFilter

THESPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/123"


class TheSportsDBProvider(BaseProvider):
    source_id = "thesportsdb_free"
    source_name = "TheSportsDB (Ücretsiz)"
    requires_payment = False

    def __init__(self, http=None, league_filter: LeagueFilter | None = None) -> None:
        super().__init__(http=http)
        self.league_filter = league_filter or LeagueFilter()

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        url = f"{THESPORTSDB_BASE}/eventsnextleague.php?id=4328"
        try:
            data, status, latency, fetched_at = self.http.get_json(url, ttl_seconds=300, check_robots=False)
            events = data.get("events") or []
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if isinstance(events, list) else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(events),
                coverage_summary=f"Ücretsiz katman (key=123) aktif (EPL sonraki maç sayısı={len(events)})",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="TheSportsDB erişilemedi",
                updated_at=now,
            )

    def fetch_upcoming_fixtures(self, org_ids: list[str] | None = None) -> list[FixtureRecord]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        fixtures: list[FixtureRecord] = []
        now_utc = datetime.now(timezone.utc)
        for lg in self.league_filter.leagues:
            if not lg.get("enabled", True):
                continue
            if org_ids and lg["organization_id"] not in org_ids:
                continue
            tsdb_id = lg.get("thesportsdb_id")
            if not tsdb_id:
                continue
            url = f"{THESPORTSDB_BASE}/eventsnextleague.php?id={tsdb_id}"
            try:
                data, _, _, fetched_at = self.http.get_json(url, ttl_seconds=900, check_robots=False)
            except Exception:
                continue
            for ev in data.get("events") or []:
                home = str(ev.get("strHomeTeam") or "").strip()
                away = str(ev.get("strAwayTeam") or "").strip()
                ts_str = str(ev.get("strTimestamp") or "")
                if not home or not away or not ts_str:
                    continue
                try:
                    dt_utc = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    if dt_utc.tzinfo is None:
                        dt_utc = dt_utc.replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
                if (dt_utc - now_utc).total_seconds() < -3600 or (dt_utc - now_utc).days > 7:
                    continue
                dt_tr = dt_utc.astimezone(ISTANBUL_TZ)
                fixtures.append(
                    FixtureRecord(
                        fixture_id=f"tsdb_{ev['idEvent']}",
                        organization_id=lg["organization_id"],
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

    def fetch_historical_matches(self, organization_id: str) -> list[HistoricalMatch]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        lg = self.league_filter.by_org_id.get(organization_id)
        tsdb_id = lg.get("thesportsdb_id") if lg else None
        if not tsdb_id:
            return []
        url = f"{THESPORTSDB_BASE}/eventspastleague.php?id={tsdb_id}"
        try:
            data, _, _, _ = self.http.get_json(url, ttl_seconds=1800, check_robots=False)
        except Exception:
            return []
        out: list[HistoricalMatch] = []
        for ev in data.get("events") or []:
            hs = ev.get("intHomeScore")
            as_ = ev.get("intAwayScore")
            if hs is None or as_ is None:
                continue
            ts_str = str(ev.get("strTimestamp") or ev.get("dateEvent") or "")
            out.append(
                HistoricalMatch(
                    match_id=f"tsdb_{ev['idEvent']}",
                    organization_id=organization_id,
                    season=str(ev.get("strSeason") or "2026-27"),
                    match_date_utc=ts_str if "T" in ts_str else f"{ts_str}T15:00:00Z",
                    home_team=str(ev.get("strHomeTeam")),
                    away_team=str(ev.get("strAwayTeam")),
                    home_goals=int(hs),
                    away_goals=int(as_),
                    source_name=self.source_name,
                    source_url=url,
                )
            )
        out.sort(key=lambda x: x.match_date_utc)
        return out
