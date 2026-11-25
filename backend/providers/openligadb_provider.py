"""Adapter for OpenLigaDB (ODbL open REST API, Bundesliga live fixtures, results, and standings)."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.collectors.team_matcher import canonical_team_id
from backend.config import ISTANBUL_TZ, ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.providers.iddaa_provider import compute_analysis_day_tr
from backend.schemas import FixtureRecord, HistoricalMatch, SourceHealthStatus, SourceProvenance, TeamStandingRow
from backend.validation.league_filter import LeagueFilter


class OpenLigaDBProvider(BaseProvider):
    source_id = "openligadb"
    source_name = "OpenLigaDB"
    requires_payment = False

    def __init__(self, http=None, league_filter: LeagueFilter | None = None) -> None:
        super().__init__(http=http)
        self.league_filter = league_filter or LeagueFilter()

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        url = "https://api.openligadb.de/getmatchdata/bl1/2026"
        try:
            data, status, latency, fetched_at = self.http.get_json(url, ttl_seconds=120, check_robots=False)
            if not isinstance(data, list):
                raise ValueError("OpenLigaDB yanıtı liste değil")
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if data else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(data),
                coverage_summary=f"Bundesliga 2026/27 tam fikstür ve canlı skorlar ({len(data)} maç)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="OpenLigaDB erişilemedi",
                updated_at=now,
            )

    def fetch_historical_matches(self, organization_id: str, seasons: list[str] | None = None) -> list[HistoricalMatch]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        if organization_id != "ger_bundesliga":
            return []
        out: list[HistoricalMatch] = []
        for yr in seasons or ["2025", "2026"]:
            url = f"https://api.openligadb.de/getmatchdata/bl1/{yr}"
            try:
                matches, _, _, _ = self.http.get_json(url, ttl_seconds=900, check_robots=False)
            except Exception:
                continue
            for m in matches:
                if not m.get("matchIsFinished"):
                    continue
                res_list = m.get("matchResults") or []
                ft = next((r for r in res_list if r.get("resultTypeID") == 2), None) or (res_list[-1] if res_list else None)
                ht = next((r for r in res_list if r.get("resultTypeID") == 1), None)
                if not ft:
                    continue
                out.append(
                    HistoricalMatch(
                        match_id=f"oldb_{m['matchID']}",
                        organization_id="ger_bundesliga",
                        season=yr,
                        match_date_utc=str(m.get("matchDateTimeUTC") or m.get("matchDateTime")),
                        home_team=str(m["team1"]["teamName"]),
                        away_team=str(m["team2"]["teamName"]),
                        home_goals=int(ft["pointsTeam1"]),
                        away_goals=int(ft["pointsTeam2"]),
                        ht_home_goals=int(ht["pointsTeam1"]) if ht else None,
                        ht_away_goals=int(ht["pointsTeam2"]) if ht else None,
                        source_name=self.source_name,
                        source_url=url,
                    )
                )
        out.sort(key=lambda x: x.match_date_utc)
        return out

    def fetch_upcoming_fixtures(self) -> list[FixtureRecord]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        lg = self.league_filter.by_org_id.get("ger_bundesliga")
        if not lg or not lg.get("enabled", True):
            return []
        url = "https://api.openligadb.de/getmatchdata/bl1/2026"
        matches, _, _, fetched_at = self.http.get_json(url, ttl_seconds=300, check_robots=False)
        now_utc = datetime.now(timezone.utc)
        fixtures: list[FixtureRecord] = []
        for m in matches:
            if m.get("matchIsFinished"):
                continue
            dt_str = str(m.get("matchDateTimeUTC") or "")
            if not dt_str:
                continue
            dt_utc = datetime.fromisoformat(dt_str.replace("Z", "+00:00")).astimezone(timezone.utc)
            if (dt_utc - now_utc).total_seconds() < -3600 or (dt_utc - now_utc).days > 7:
                continue
            dt_tr = dt_utc.astimezone(ISTANBUL_TZ)
            home = str(m["team1"]["teamName"])
            away = str(m["team2"]["teamName"])
            fixtures.append(
                FixtureRecord(
                    fixture_id=f"oldb_{m['matchID']}",
                    organization_id="ger_bundesliga",
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

    def fetch_standings(self, season: str = "2026") -> list[TeamStandingRow]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        url = f"https://api.openligadb.de/getbltable/bl1/{season}"
        rows, _, _, fetched_at = self.http.get_json(url, ttl_seconds=1800, check_robots=False)
        out: list[TeamStandingRow] = []
        for idx, r in enumerate(rows, start=1):
            out.append(
                TeamStandingRow(
                    organization_id="ger_bundesliga",
                    team_name=str(r["teamName"]),
                    rank=idx,
                    played=int(r.get("matches", 0)),
                    wins=int(r.get("won", 0)),
                    draws=int(r.get("draw", 0)),
                    losses=int(r.get("lost", 0)),
                    goals_for=int(r.get("goals", 0)),
                    goals_against=int(r.get("opponentGoals", 0)),
                    points=int(r.get("points", 0)),
                    source_name=self.source_name,
                    source_url=url,
                    fetched_at=fetched_at,
                )
            )
        return out
