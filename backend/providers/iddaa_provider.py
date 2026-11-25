"""Independent adapter for iddaa.com public sportsbook bulletin."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.collectors.team_matcher import canonical_team_id
from backend.config import ISTANBUL_TZ, ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.schemas import FixtureRecord, SourceHealthStatus, SourceProvenance
from backend.validation.league_filter import LeagueFilter

IDDAA_EVENTS_URL = "https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0"
IDDAA_COMPS_URL = "https://sportsbookv2.iddaa.com/sportsbook/competitions"

MARKET_TYPE_LABELS = {
    1: "Maç Sonucu (1X2)",
    2: "Alt / Üst",
    3: "Çifte Şans",
    4: "Karşılıklı Gol",
    6: "Handikap",
    89: "İlk Yarı / Maç Sonucu",
}


def compute_analysis_day_tr(dt_tr: datetime) -> str:
    """Assign matches between 00:00 and 07:59 TRT to previous analysis day."""
    from datetime import timedelta

    if dt_tr.hour < 8:
        return (dt_tr.date() - timedelta(days=1)).isoformat()
    return dt_tr.date().isoformat()


class IddaaProvider(BaseProvider):
    source_id = "iddaa"
    source_name = "İddaa.com Bülten"
    requires_payment = False

    def __init__(self, http=None, league_filter: LeagueFilter | None = None) -> None:
        super().__init__(http=http)
        self.league_filter = league_filter or LeagueFilter()

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        try:
            data, status, latency, fetched_at = self.http.get_json(IDDAA_EVENTS_URL, ttl_seconds=60)
            events = data.get("data", {}).get("events", [])
            if not data.get("isSuccess") or not isinstance(events, list):
                raise ValueError("İddaa bülten şeması değişti veya isSuccess=false")
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if len(events) > 0 else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(events),
                coverage_summary=f"Canlı bülten erişildi ({len(events)} ham futbol etkinliği)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="İddaa bülteni erişilemedi",
                updated_at=now,
            )

    def fetch_upcoming_fixtures(self) -> list[FixtureRecord]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        comp_data, _, _, _ = self.http.get_json(IDDAA_COMPS_URL, ttl_seconds=600)
        comp_map: dict[int, dict[str, Any]] = {
            int(c["i"]): c for c in comp_data.get("data", []) if str(c.get("si")) == "1"
        }

        ev_data, _, _, fetched_at = self.http.get_json(IDDAA_EVENTS_URL, ttl_seconds=120)
        if not ev_data.get("isSuccess"):
            raise RuntimeError("İddaa events endpoint isSuccess=false")
        events = ev_data.get("data", {}).get("events", [])
        if not isinstance(events, list):
            raise RuntimeError("İddaa events alanı liste değil (şema değişmiş olabilir)")

        fixtures: list[FixtureRecord] = []
        for ev in events:
            try:
                if int(ev.get("sid", 0)) != 1:
                    continue
                comp_id = int(ev.get("ci", 0))
                comp_info = comp_map.get(comp_id, {})
                raw_league_name = str(comp_info.get("n") or f"Lig {comp_id}")
                country_code = str(comp_info.get("cid") or "INT")

                matched_lg = self.league_filter.match(
                    league_name=raw_league_name,
                    iddaa_comp_id=comp_id,
                    country_code=country_code,
                )
                if not matched_lg:
                    continue

                ts = int(ev["d"])
                dt_utc = datetime.fromtimestamp(ts, tz=timezone.utc)
                dt_tr = dt_utc.astimezone(ISTANBUL_TZ)

                raw_status = int(ev.get("s", 0))
                # s=0 upcoming, s=1 live, s=2/3 finished/settled (treat nonzero cautiously)
                if raw_status == 0:
                    status_str = "scheduled"
                elif raw_status == 1:
                    status_str = "live"
                else:
                    status_str = "finished"

                home_name = str(ev.get("hn", "")).strip()
                away_name = str(ev.get("an", "")).strip()
                if not home_name or not away_name:
                    continue

                market_names: list[str] = []
                for m in ev.get("m", []):
                    t = int(m.get("t", -1))
                    label = MARKET_TYPE_LABELS.get(t)
                    if label and label not in market_names:
                        market_names.append(label)

                event_id = str(ev["i"])
                match_code = str(ev.get("bri") or event_id)
                fixtures.append(
                    FixtureRecord(
                        fixture_id=f"iddaa_{event_id}",
                        iddaa_event_id=event_id,
                        iddaa_match_code=match_code,
                        organization_id=matched_lg["organization_id"],
                        league_name=matched_lg["name_tr"],
                        country=matched_lg["country"],
                        home_team=home_name,
                        away_team=away_name,
                        home_team_id=canonical_team_id(home_name),
                        away_team_id=canonical_team_id(away_name),
                        kickoff_utc=dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        kickoff_tr=dt_tr.strftime("%Y-%m-%dT%H:%M:%S+03:00"),
                        analysis_day_tr=compute_analysis_day_tr(dt_tr),
                        status=status_str,
                        bulletin_source="iddaa",
                        iddaa_verified=True,
                        available_markets=market_names,
                        is_demo=False,
                        provenance=SourceProvenance(
                            source_name=self.source_name,
                            source_url=IDDAA_EVENTS_URL,
                            published_at=fetched_at,
                            fetched_at=fetched_at,
                            verification_status="verified",
                            data_type="bulletin_fixture",
                            is_demo=False,
                        ),
                    )
                )
            except Exception:
                # Isolate malformed individual event rows without crashing pipeline
                continue
        return fixtures
