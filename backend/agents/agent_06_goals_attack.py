"""Agent 06 – Gol ve Hücum Analisti: gol dağılımları, İY/2Y ayrımı, mevcutsa şut/xG."""

from __future__ import annotations

from backend.collectors.team_matcher import teams_match
from backend.schemas import AgentOutput, FixtureRecord, HistoricalMatch


def run_agent_06(fixture: FixtureRecord, history: list[HistoricalMatch]) -> AgentOutput:
    relevant = [
        m for m in history
        if teams_match(m.home_team, fixture.home_team) or teams_match(m.away_team, fixture.home_team)
        or teams_match(m.home_team, fixture.away_team) or teams_match(m.away_team, fixture.away_team)
    ]
    if len(relevant) < 6:
        return AgentOutput(
            agent_id="agent_06",
            agent_name="Gol ve Hücum Analisti",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr="Gol ve hücum profili için yeterli tarihsel maç yok.",
            warnings=["Gol profili yetersiz"],
        )

    ht_rows = [m for m in relevant if m.ht_home_goals is not None and m.ht_away_goals is not None]
    xg_rows = [m for m in relevant if m.xg_home is not None and m.xg_away is not None]
    avg_total = sum(m.home_goals + m.away_goals for m in relevant) / len(relevant)
    btts_rate = sum(1 for m in relevant if m.home_goals > 0 and m.away_goals > 0) / len(relevant)
    over25_rate = sum(1 for m in relevant if m.home_goals + m.away_goals >= 3) / len(relevant)

    cov = 0.65 + (0.20 if len(ht_rows) >= 6 else 0.0) + (0.15 if len(xg_rows) >= 6 else 0.0)
    return AgentOutput(
        agent_id="agent_06",
        agent_name="Gol ve Hücum Analisti",
        fixture_id=fixture.fixture_id,
        status="ok" if cov >= 0.65 else "partial",
        data_coverage=round(min(cov, 1.0), 4),
        summary_tr=f"Ortalama toplam gol {avg_total:.2f}, KG oranı %{int(btts_rate * 100)}, 2.5 Üst oranı %{int(over25_rate * 100)}.",
        metrics={
            "sample_matches": len(relevant),
            "avg_total_goals": round(avg_total, 3),
            "btts_rate": round(btts_rate, 3),
            "over_25_rate": round(over25_rate, 3),
            "ht_data_available": len(ht_rows) >= 6,
            "xg_data_available": len(xg_rows) >= 6,
        },
    )
