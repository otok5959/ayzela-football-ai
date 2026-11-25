"""Agent 01 – Bülten Araştırmacısı: fikstür doğrulama, saat/lig filtreleme, mükerrer temizliği."""

from __future__ import annotations

from datetime import datetime

from backend.config import ISTANBUL_TZ
from backend.schemas import AgentOutput, FixtureRecord
from backend.validation.league_filter import LeagueFilter


def filter_and_dedup_bulletin(
    fixtures: list[FixtureRecord],
    league_filter: LeagueFilter | None = None,
    window_start_tr: datetime | None = None,
    window_end_tr: datetime | None = None,
) -> list[FixtureRecord]:
    lf = league_filter or LeagueFilter()
    seen: set[str] = set()
    clean: list[FixtureRecord] = []

    for fx in fixtures:
        if fx.status in ("live", "finished", "postponed", "cancelled"):
            continue
        if not lf.match(fx.league_name, organization_id_hint=fx.organization_id):
            continue
        kickoff_tr = datetime.fromisoformat(fx.kickoff_tr)
        if kickoff_tr.tzinfo is None:
            kickoff_tr = kickoff_tr.replace(tzinfo=ISTANBUL_TZ)
        if window_start_tr and kickoff_tr < window_start_tr:
            continue
        if window_end_tr and kickoff_tr >= window_end_tr:
            continue

        dedup_key = f"{fx.organization_id}|{fx.analysis_day_tr}|{fx.home_team_id}|{fx.away_team_id}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        clean.append(fx)

    clean.sort(key=lambda f: f.kickoff_tr)
    return clean


def run_agent_01(fixture: FixtureRecord) -> AgentOutput:
    valid_status = fixture.status == "scheduled"
    has_iddaa_meta = bool(fixture.iddaa_match_code and fixture.iddaa_verified)
    cov = 1.0 if (valid_status and has_iddaa_meta) else (0.75 if valid_status else 0.2)
    src_note = "İddaa.com doğrulandı" if fixture.iddaa_verified else f"Yedek kaynak ({fixture.bulletin_source})"
    return AgentOutput(
        agent_id="agent_01",
        agent_name="Bülten Araştırmacısı",
        fixture_id=fixture.fixture_id,
        status="ok" if valid_status else "insufficient_data",
        data_coverage=cov,
        summary_tr=f"{fixture.league_name} fikstürü doğrulandı ({src_note}).",
        metrics={
            "iddaa_verified": fixture.iddaa_verified,
            "bulletin_source": fixture.bulletin_source,
            "markets_count": len(fixture.available_markets),
        },
        provenance=[fixture.provenance],
    )
