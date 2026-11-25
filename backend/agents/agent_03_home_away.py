"""Agent 03 – Ev Sahibi ve Deplasman Analisti: son 6 iç saha / dış saha ayrımı."""

from __future__ import annotations

from backend.collectors.team_matcher import teams_match
from backend.schemas import AgentOutput, FixtureRecord, HistoricalMatch


def run_agent_03(fixture: FixtureRecord, history: list[HistoricalMatch]) -> AgentOutput:
    ordered = sorted(history, key=lambda x: x.match_date_utc)
    home_home = [m for m in ordered if teams_match(m.home_team, fixture.home_team)][-6:]
    away_away = [m for m in ordered if teams_match(m.away_team, fixture.away_team)][-6:]

    if not home_home or not away_away:
        return AgentOutput(
            agent_id="agent_03",
            agent_name="Ev Sahibi ve Deplasman Analisti",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr="İç saha / dış saha son 6 maç verisi yetersiz.",
            warnings=["İç/dış saha geçmişi bulunamadı"],
        )

    h_gf = sum(m.home_goals for m in home_home) / len(home_home)
    h_ga = sum(m.away_goals for m in home_home) / len(home_home)
    h_ppg = sum(3 if m.home_goals > m.away_goals else (1 if m.home_goals == m.away_goals else 0) for m in home_home) / len(home_home)

    a_gf = sum(m.away_goals for m in away_away) / len(away_away)
    a_ga = sum(m.home_goals for m in away_away) / len(away_away)
    a_ppg = sum(3 if m.away_goals > m.home_goals else (1 if m.away_goals == m.home_goals else 0) for m in away_away) / len(away_away)

    cov = round(min(1.0, (len(home_home) + len(away_away)) / 12.0), 4)
    return AgentOutput(
        agent_id="agent_03",
        agent_name="Ev Sahibi ve Deplasman Analisti",
        fixture_id=fixture.fixture_id,
        status="ok" if cov >= 0.75 else "partial",
        data_coverage=cov,
        summary_tr=(
            f"İç saha ({len(home_home)} maç): {h_ppg:.2f} puan/maç, {h_gf:.2f} AG | "
            f"Dış saha ({len(away_away)} maç): {a_ppg:.2f} puan/maç, {a_gf:.2f} AG."
        ),
        metrics={
            "home_split": {"n": len(home_home), "ppg": round(h_ppg, 3), "gf_pg": round(h_gf, 3), "ga_pg": round(h_ga, 3)},
            "away_split": {"n": len(away_away), "ppg": round(a_ppg, 3), "gf_pg": round(a_gf, 3), "ga_pg": round(a_ga, 3)},
        },
    )
