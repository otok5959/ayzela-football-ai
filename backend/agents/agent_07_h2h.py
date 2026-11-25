"""Agent 07 – Geçmiş Karşılaşma (H2H) Analisti: son 6 H2H maç + zaman çürümesi uyarısı."""

from __future__ import annotations

from backend.collectors.team_matcher import teams_match
from backend.schemas import AgentOutput, FixtureRecord, HistoricalMatch


def run_agent_07(fixture: FixtureRecord, history: list[HistoricalMatch]) -> AgentOutput:
    h2h = [
        m for m in sorted(history, key=lambda x: x.match_date_utc)
        if (teams_match(m.home_team, fixture.home_team) and teams_match(m.away_team, fixture.away_team))
        or (teams_match(m.home_team, fixture.away_team) and teams_match(m.away_team, fixture.home_team))
    ][-6:]

    if not h2h:
        return AgentOutput(
            agent_id="agent_07",
            agent_name="Geçmiş Karşılaşma Analisti",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr="Takımlar arasında son dönem H2H kaydı bulunamadı.",
            warnings=["H2H kaydı bulunamadı"],
        )

    hw = draws = aw = 0
    for m in h2h:
        if m.home_goals == m.away_goals:
            draws += 1
        elif (teams_match(m.home_team, fixture.home_team) and m.home_goals > m.away_goals) or (
            teams_match(m.away_team, fixture.home_team) and m.away_goals > m.home_goals
        ):
            hw += 1
        else:
            aw += 1

    cov = round(min(1.0, len(h2h) / 6.0), 4)
    return AgentOutput(
        agent_id="agent_07",
        agent_name="Geçmiş Karşılaşma Analisti",
        fixture_id=fixture.fixture_id,
        status="ok" if len(h2h) >= 3 else "partial",
        data_coverage=cov,
        summary_tr=f"Son {len(h2h)} H2H: {fixture.home_team} {hw}G, {draws}B, {fixture.away_team} {aw}G (eski maçların ağırlığı sınırlıdır).",
        metrics={"count": len(h2h), "home_wins": hw, "draws": draws, "away_wins": aw},
    )
