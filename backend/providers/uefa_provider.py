"""Adapter for UEFA.com public v5 match endpoint (UCL, UEL, UNL, EURO)."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.collectors.team_matcher import canonical_team_id
from backend.config import ISTANBUL_TZ, ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.providers.iddaa_provider import compute_analysis_day_tr
from backend.schemas import FixtureRecord, SourceHealthStatus, SourceProvenance
from backend.validation.league_filter import LeagueFilter

UEFA_COMPS = {
    "uefa_ucl": 1,
    "uefa_uel": 14,
    "uefa_euro": 3,
    "uefa_nations_league": 2014,
}


class UefaProvider(BaseProvider):
    source_id = "uefa"
    source_name = "UEFA.com Maç Merkezi"
    requires_payment = False

    def __init__(self, http=None, league_filter: LeagueFilter | None = None) -> None:
        super().__init__(http=http)
        self.league_filter = league_filter or LeagueFilter()

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        url = "https://match.uefa.com/v5/matches?competitionId=1&offset=0&limit=10"
        try:
            data, status, latency, fetched_at = self.http.get_json(url, ttl_seconds=120, check_robots=False)
            if not isinstance(data, list):
                raise ValueError("UEFA v5 yanıtı liste değil")
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if data else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(data),
                coverage_summary=f"UEFA v5 maç verisi aktif (UCL/UEL/UNL/EURO; örnek={len(data)} maç)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="UEFA.com maç verisi erişilemedi",
                updated_at=now,
            )

    def fetch_upcoming_fixtures(self) -> list[FixtureRecord]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now_utc = datetime.now(timezone.utc)
        fixtures: list[FixtureRecord] = []
        for org_id, comp_id in UEFA_COMPS.items():
            lg = self.league_filter.by_org_id.get(org_id)
            if not lg or not lg.get("enabled", True):
                continue
            url = f"https://match.uefa.com/v5/matches?competitionId={comp_id}&offset=0&limit=40"
            try:
                matches, _, _, fetched_at = self.http.get_json(url, ttl_seconds=600, check_robots=False)
            except Exception:
                continue
            for m in matches:
                kickoff_str = ((m.get("kickOffTime") or {}).get("dateTime")) or m.get("dateTime")
                if not kickoff_str:
                    continue
                try:
                    dt_utc = datetime.fromisoformat(str(kickoff_str).replace("Z", "+00:00")).astimezone(timezone.utc)
                except ValueError:
                    continue
                if (dt_utc - now_utc).total_seconds() < -3600 or (dt_utc - now_utc).days > 10:
                    continue
                dt_tr = dt_utc.astimezone(ISTANBUL_TZ)
                home = str((m.get("homeTeam") or {}).get("internationalName") or "")
                away = str((m.get("awayTeam") or {}).get("internationalName") or "")
                if not home or not away:
                    continue
                raw_status = str(m.get("status") or "").upper()
                status_val = "finished" if raw_status == "FINISHED" else ("live" if raw_status == "LIVE" else "scheduled")
                fixtures.append(
                    FixtureRecord(
                        fixture_id=f"uefa_{m.get('id')}",
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
                        status=status_val,
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
                            data_type="official_uefa_fixture",
                            is_demo=False,
                        ),
                    )
                )
        return fixtures
