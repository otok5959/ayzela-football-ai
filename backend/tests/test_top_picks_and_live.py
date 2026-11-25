"""Tests for Top-3 probability picks, daily Top-15 selection, green/red outcome evaluation, and silent sync."""

from __future__ import annotations

from datetime import datetime, timezone

from backend.analytics.market_calculator import compute_all_markets
from backend.analytics.report_formatter import format_daily_report_tr
from backend.analytics.top_picks import compute_top3_picks, evaluate_pick_outcome, select_daily_top15
from backend.models.poisson import score_matrix
from backend.scheduler.results_sync import sync_results_and_compute_metrics
from backend.schemas import FixtureRecord, MatchPredictionBundle, SourceProvenance


def _make_bundle(idx: int, league: str, lam_h: float, lam_a: float, cov: float) -> MatchPredictionBundle:
    mat = score_matrix(lam_h, lam_a, max_goals=6)
    import numpy as np

    p1 = float(np.tril(mat, k=-1).sum())
    px = float(np.trace(mat))
    p2 = float(np.triu(mat, k=1).sum())
    probs = {"home": round(p1, 4), "draw": round(px, 4), "away": round(p2, 4)}
    markets = compute_all_markets(matrix=mat, probs_1x2=probs, lambda_home=lam_h, lambda_away=lam_a)
    fx = FixtureRecord(
        fixture_id=f"iddaa_{1000 + idx}",
        iddaa_event_id=str(1000 + idx),
        iddaa_match_code=str(5000 + idx),
        organization_id=f"org_{idx % 3}",
        league_name=league,
        country="TR",
        home_team=f"Ev {idx}",
        away_team=f"Dep {idx}",
        kickoff_utc="2026-11-25T18:00:00Z",
        kickoff_tr="2026-11-25T21:00:00+03:00",
        analysis_day_tr="2026-11-25",
        status="scheduled",
        bulletin_source="iddaa",
        iddaa_verified=True,
        iddaa_odds={
            "1x2": {"home": 1.45, "draw": 4.2, "away": 6.5},
            "ou_15": {"over": 1.22, "under": 3.5},
            "ou_25": {"over": 1.72, "under": 1.98},
            "btts": {"yes": 1.85, "no": 1.78},
            "dc": {"1x": 1.11, "x2": 2.4, "12": 1.2},
        },
        provenance=SourceProvenance(
            source_name="İddaa",
            source_url="https://sportsbookv2.iddaa.com",
            fetched_at="2026-11-25T08:00:00Z",
            data_type="bulletin_fixture",
        ),
    )
    picks = compute_top3_picks(markets=markets, probs_1x2=probs, iddaa_odds=fx.iddaa_odds)
    return MatchPredictionBundle(
        prediction_id=f"pred_{idx}",
        run_id="run_test_1",
        fixture=fx,
        model_version="v1.0.0-ensemble",
        prob_home=probs["home"],
        prob_draw=probs["draw"],
        prob_away=probs["away"],
        prob_btts_yes=markets["btts"].probabilities.get("kg_var"),
        prob_over_25=markets["over_under_lines"].probabilities.get("ust_2_5"),
        markets=markets,
        data_coverage_score=cov,
        research_quality_score=cov,
        top_picks=picks,
        created_at_utc="2026-11-25T08:00:00Z",
    )


def test_top3_picks_returns_three_non_redundant_sorted():
    b = _make_bundle(1, "Türkiye Süper Lig", 2.2, 0.7, 0.85)
    assert len(b.top_picks) == 3
    families = [p["family"] for p in b.top_picks]
    assert len(set(families)) == 3
    probs = [p["probability"] for p in b.top_picks]
    assert probs == sorted(probs, reverse=True)


def test_select_daily_top15_and_formatter():
    bundles = [
        _make_bundle(i, f"Lig {i % 4}", 1.3 + (i % 5) * 0.25, 0.8 + (i % 3) * 0.2, 0.4 + i * 0.02)
        for i in range(25)
    ]
    select_daily_top15(bundles, limit=15)
    selected = [b for b in bundles if b.is_selected_top15]
    assert len(selected) == 15
    ranks = sorted(b.selection_rank for b in selected if b.selection_rank is not None)
    assert ranks == list(range(1, 16))

    text = format_daily_report_tr(
        bundles=bundles,
        run_type_label="Anlık Analiz",
        analysis_day_tr="2026-11-25",
        bulletin_source="iddaa",
        panel_url="https://ayzela-panel.pages.dev",
    )
    assert "25 maç incelendi" in text
    assert "Seçilen: 15 maç" in text
    assert "[Kod: 50" in text
    assert "1.5 Üst" in text or "1.5 Alt" in text


def test_evaluate_pick_outcome_live_and_final():
    assert evaluate_pick_outcome("ms_1", None, None, "scheduled")["status"] == "pending"
    # Live 1-1 at 60'
    assert evaluate_pick_outcome("kg_var", 1, 1, "live") == {"status": "live_won", "locked": True}
    assert evaluate_pick_outcome("kg_yok", 1, 1, "live") == {"status": "live_lost", "locked": True}
    assert evaluate_pick_outcome("ust_1_5", 1, 1, "live") == {"status": "live_won", "locked": True}
    assert evaluate_pick_outcome("ust_2_5", 1, 1, "live") == {"status": "live_lost", "locked": False}
    assert evaluate_pick_outcome("dc_x2", 1, 1, "live") == {"status": "live_won", "locked": False}
    # Final 2-1
    assert evaluate_pick_outcome("ms_1", 2, 1, "finished") == {"status": "won", "locked": True}
    assert evaluate_pick_outcome("ust_2_5", 2, 1, "finished") == {"status": "won", "locked": True}
    assert evaluate_pick_outcome("kg_yok", 2, 1, "finished") == {"status": "lost", "locked": True}


def test_silent_results_sync_updates_without_telegram(temp_repo):
    repo = temp_repo
    b = _make_bundle(1, "Türkiye Süper Lig", 1.8, 0.9, 0.8)
    repo.upsert_fixture(b.fixture)
    repo.create_analysis_run(
        run_id="run_test_1",
        run_type="manual",
        analysis_day_tr="2026-11-25",
        scheduled_at_tr="2026-11-25T14:00:00+03:00",
        actual_started_at_tr="2026-11-25T14:00:00+03:00",
        delay_seconds=0,
        bulletin_source="iddaa",
    )
    select_daily_top15([b], limit=15)
    repo.insert_immutable_prediction(b)

    class _FakeIddaa:
        def fetch_live_and_finished_scores(self, dates):
            return {
                "1001": {
                    "event_id": "1001",
                    "fixture_id": "iddaa_1001",
                    "status": "finished",
                    "home_goals": 3,
                    "away_goals": 1,
                    "ht_home_goals": 1,
                    "ht_away_goals": 0,
                    "minute": "MS",
                    "status_label": "MS",
                    "source_url": "https://statisticsv2.iddaa.com/live-results",
                }
            }

    class _FakeFailover:
        iddaa = _FakeIddaa()

        def fetch_historical_for_league(self, org_id):
            return []

    before_notif = len(repo.db.execute("SELECT id FROM telegram_notifications"))
    res = sync_results_and_compute_metrics(repo=repo, failover=_FakeFailover())
    after_notif = len(repo.db.execute("SELECT id FROM telegram_notifications"))

    assert res["synced_results"] == 1
    assert after_notif == before_notif
    mr = repo.db.execute("SELECT * FROM match_results WHERE fixture_id = 'iddaa_1001'")
    assert len(mr) == 1
    assert mr[0]["home_goals"] == 3 and mr[0]["away_goals"] == 1
