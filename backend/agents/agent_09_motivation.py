"""Agent 09 – Motivasyon ve Fikstür Analisti: sıralama, puan hedefi, dinlenme günü."""

from __future__ import annotations

from datetime import datetime

from backend.collectors.team_matcher import teams_match
from backend.schemas import AgentOutput, FixtureRecord, HistoricalMatch, TeamStandingRow


def _days_rest(history: list[HistoricalMatch], team_name: str, kickoff_utc: str) -> int | None:
    try:
        kdt = datetime.fromisoformat(kickoff_utc.replace("Z", "+00:00"))
    except ValueError:
        return None
    dates = []
    for m in history:
        if teams_match(m.home_team, team_name) or teams_match(m.away_team, team_name):
            try:
                mdt = datetime.fromisoformat(m.match_date_utc.replace("Z", "+00:00"))
                if mdt.tzinfo is None:
                    mdt = mdt.replace(tzinfo=kdt.tzinfo)
                if mdt < kdt:
                    dates.append(mdt)
            except ValueError:
                continue
    if not dates:
        return None
    return max(int((kdt - max(dates)).total_seconds() // 86400), 0)


def run_agent_09(
    fixture: FixtureRecord,
    history: list[HistoricalMatch],
    standings: list[TeamStandingRow] | None = None,
) -> AgentOutput:
    h_rest = _days_rest(history, fixture.home_team, fixture.kickoff_utc)
    a_rest = _days_rest(history, fixture.away_team, fixture.kickoff_utc)

    h_row = next((r for r in (standings or []) if teams_match(r.team_name, fixture.home_team)), None)
    a_row = next((r for r in (standings or []) if teams_match(r.team_name, fixture.away_team)), None)

    parts = []
    signals = 0
    if h_row and a_row:
        signals += 2
        parts.append(f"Sıralama: {fixture.home_team} {h_row.rank}. ({h_row.points}p) vs {fixture.away_team} {a_row.rank}. ({a_row.points}p)")
    if h_rest is not None and a_rest is not None:
        signals += 1
        parts.append(f"Dinlenme: ev {h_rest}g, dep {a_rest}g")

    if signals == 0:
        return AgentOutput(
            agent_id="agent_09",
            agent_name="Motivasyon ve Fikstür Analisti",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr="Puan durumu ve fikstür dinlenme süresi verisi yetersiz.",
        )

    cov = round(min(1.0, signals / 3.0), 4)
    return AgentOutput(
        agent_id="agent_09",
        agent_name="Motivasyon ve Fikstür Analisti",
        fixture_id=fixture.fixture_id,
        status="ok" if cov >= 0.65 else "partial",
        data_coverage=cov,
        summary_tr=" | ".join(parts),
        metrics={
            "home_rank": h_row.rank if h_row else None,
            "away_rank": a_row.rank if a_row else None,
            "home_rest_days": h_rest,
            "away_rest_days": a_rest,
        },
    )
