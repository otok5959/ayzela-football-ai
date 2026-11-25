"""Acceptance tests: 12 agents, results update, walk-forward backtest, FREE_ONLY_MODE, usage limits."""

from __future__ import annotations

from datetime import datetime, timedelta
import pytest

from backend.agents.orchestrator import analyze_single_fixture
from backend.backtesting.version_manager import ModelVersionManager
from backend.backtesting.walk_forward import run_walk_forward_backtest
from backend.config import FreeOnlyModeViolation, ensure_free_only_allowed
from backend.scheduler.results_sync import recompute_period_metrics
from backend.scheduler.usage_guard import UsageLimitGuard
from backend.schemas import FixtureRecord, HistoricalMatch, SourceProvenance


def _make_sample_history(count: int = 130) -> list[HistoricalMatch]:
    teams = ["Arsenal", "Chelsea", "Liverpool", "Manchester City", "Tottenham", "Newcastle"]
    out: list[HistoricalMatch] = []
    base = datetime(2025, 8, 1, 15, 0)
    idx = 0
    while len(out) < count:
        for i in range(len(teams)):
            for j in range(len(teams)):
                if i == j or len(out) >= count:
                    continue
                dt = base + timedelta(days=idx * 2)
                out.append(
                    HistoricalMatch(
                        match_id=f"hist_{idx}",
                        organization_id="eng_premier_league",
                        season="2025-26",
                        match_date_utc=dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        home_team=teams[i],
                        away_team=teams[j],
                        home_goals=2 if i < j else 1,
                        away_goals=1 if i < j else 2,
                        ht_home_goals=1,
                        ht_away_goals=0,
                        source_name="test",
                        source_url="https://example.local",
                    )
                )
                idx += 1
    return out


def test_12_agents_and_results_sync_and_version_rollback(temp_repo):
    hist = _make_sample_history(130)
    fx = FixtureRecord(
        fixture_id="fx_test_1",
        iddaa_event_id="9001",
        iddaa_match_code="9001",
        organization_id="eng_premier_league",
        league_name="İngiltere Premier League",
        country="İngiltere",
        home_team="Arsenal",
        away_team="Chelsea",
        home_team_id="team_arsenal",
        away_team_id="team_chelsea",
        kickoff_utc="2026-11-25T17:00:00Z",
        kickoff_tr="2026-11-25T20:00:00+03:00",
        analysis_day_tr="2026-11-25",
        status="scheduled",
        bulletin_source="iddaa",
        iddaa_verified=True,
        is_demo=False,
        provenance=SourceProvenance(
            source_name="iddaa",
            source_url="https://sportsbookv2.iddaa.com",
            fetched_at="2026-11-25T05:00:00Z",
            data_type="bulletin_fixture",
        ),
    )

    temp_repo.create_analysis_run(
        run_id="run_test_1",
        run_type="morning_0800",
        analysis_day_tr="2026-11-25",
        scheduled_at_tr="2026-11-25T08:00:00+03:00",
        actual_started_at_tr="2026-11-25T08:00:00+03:00",
        delay_seconds=0,
        bulletin_source="iddaa",
    )
    temp_repo.upsert_fixture(fx)
    bundle = analyze_single_fixture(fx, run_id="run_test_1", history=hist, news_items=[])
    assert bundle is not None
    assert len(bundle.agent_outputs) == 12
    assert bundle.markets["corners"].available is False  # Never fabricated
    assert abs((bundle.prob_home + bundle.prob_draw + bundle.prob_away) - 1.0) < 0.01

    temp_repo.insert_immutable_prediction(bundle)
    temp_repo.upsert_match_result(
        fixture_id="fx_test_1",
        home_goals=2,
        away_goals=1,
        source_name="openfootball_json",
        source_url="https://raw.githubusercontent.com/openfootball/football.json/master/2026-27/en.1.json",
    )
    updated = recompute_period_metrics(temp_repo)
    assert updated >= 1

    # Model version promotion and rollback
    vm = ModelVersionManager(temp_repo)
    promoted = vm.register_and_maybe_promote(
        version_id="v1.1.0-test",
        model_name="Candidate",
        parameters={"w": 1},
        trained_matches_count=100,
        validation_brier=0.51,
        validation_log_loss=0.91,
        validation_accuracy=0.56,
    )
    assert promoted is True
    assert vm.get_active_version()["version_id"] == "v1.1.0-test"
    vm.rollback_to_version("v1.0.0-ensemble")
    assert vm.get_active_version()["version_id"] == "v1.0.0-ensemble"


def test_chronological_walk_forward_backtest():
    hist = _make_sample_history(130)
    res = run_walk_forward_backtest(hist, min_train_matches=80, fold_size=15, max_eval_matches=45)
    assert res["total_folds"] == 3
    assert res["models"]["ensemble"]["evaluated_matches"] == 45
    assert 0.0 <= res["models"]["poisson"]["brier_score"] <= 2.0


def test_free_only_mode_and_usage_limit_guard_and_market_implied(temp_repo):
    from backend.models.market_implied import predict_from_market_odds

    mkt = predict_from_market_odds({"1x2": {"home": 2.1, "draw": 3.2, "away": 3.4}, "ou_25": {"under": 1.85, "over": 1.85}})
    assert mkt["enabled"] is True
    assert abs(sum(mkt["probs"].values()) - 1.0) < 0.01

    with pytest.raises(FreeOnlyModeViolation):
        ensure_free_only_allowed(requires_payment=True, provider_name="PaidFootballAPI")

    guard = UsageLimitGuard(temp_repo)
    # Push usage to 96% (above 95% hard stop)
    temp_repo.increment_usage("github_actions_minutes_monthly", 1920)
    chk = guard.check_and_consume("github_actions_minutes_monthly", units=10, heavy_task=True)
    assert chk.allowed is False
    assert chk.warning is True
