"""Orchestrator executing all 12 independent research modules for a fixture."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from backend.agents.agent_01_bulletin import run_agent_01
from backend.agents.agent_02_form import run_agent_02
from backend.agents.agent_03_home_away import run_agent_03
from backend.agents.agent_04_player_performance import run_agent_04
from backend.agents.agent_05_injuries import run_agent_05
from backend.agents.agent_06_goals_attack import run_agent_06
from backend.agents.agent_07_h2h import run_agent_07
from backend.agents.agent_08_tactics import run_agent_08
from backend.agents.agent_09_motivation import run_agent_09
from backend.agents.agent_10_environment import run_agent_10
from backend.agents.agent_11_math import run_agent_11
from backend.agents.agent_12_validation import run_agent_12
from backend.analytics.coverage import compute_data_coverage_score, compute_research_quality_score
from backend.analytics.market_calculator import compute_all_markets
from backend.schemas import (
    FixtureRecord,
    HistoricalMatch,
    MatchPredictionBundle,
    NewsItem,
    TeamStandingRow,
)


def analyze_single_fixture(
    fixture: FixtureRecord,
    run_id: str,
    history: list[HistoricalMatch],
    news_items: list[NewsItem],
    standings: list[TeamStandingRow] | None = None,
    weather: dict | None = None,
    lineup_info: dict | None = None,
    model_version: str = "v1.0.0-ensemble",
) -> MatchPredictionBundle | None:
    """Run Agents 01..12 and assemble a MatchPredictionBundle (or None if math model has zero data)."""
    a1 = run_agent_01(fixture)
    a2 = run_agent_02(fixture, history)
    a3 = run_agent_03(fixture, history)
    a4 = run_agent_04(fixture, lineup_info=lineup_info)
    a5 = run_agent_05(fixture, news_items)
    a6 = run_agent_06(fixture, history)
    a7 = run_agent_07(fixture, history)
    a8 = run_agent_08(fixture, news_items, lineup_info=lineup_info)
    a9 = run_agent_09(fixture, history, standings=standings)
    a10 = run_agent_10(fixture, weather=weather)
    a11, ens = run_agent_11(fixture, history)

    probs = ens.get("probs") if ens.get("enabled") else None
    pre_audit = [a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11]
    a12 = run_agent_12(fixture, pre_audit, probs)
    all_agents = [*pre_audit, a12]

    if not probs:
        return None

    markets = compute_all_markets(
        matrix=ens.get("matrix"),
        probs_1x2=probs,
        lambda_home=ens.get("lambda_home"),
        lambda_away=ens.get("lambda_away"),
        history=history,
    )
    btts_yes = markets["btts"].probabilities.get("kg_var") if markets["btts"].available else None
    over_25 = (
        markets["over_under_lines"].probabilities.get("ust_2_5")
        if markets["over_under_lines"].available
        else None
    )

    return MatchPredictionBundle(
        prediction_id=f"pred_{uuid.uuid4().hex[:14]}",
        run_id=run_id,
        fixture=fixture,
        model_version=model_version,
        prob_home=probs["home"],
        prob_draw=probs["draw"],
        prob_away=probs["away"],
        prob_btts_yes=btts_yes,
        prob_over_25=over_25,
        markets=markets,
        model_breakdown=ens.get("breakdown", {}),
        data_coverage_score=compute_data_coverage_score(all_agents),
        research_quality_score=compute_research_quality_score(all_agents),
        agent_outputs=all_agents,
        created_at_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        is_demo=fixture.is_demo,
    )
