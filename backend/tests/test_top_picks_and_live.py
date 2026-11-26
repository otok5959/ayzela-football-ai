"""Tests for Top-2 real-odd value picks, all-market parsing, daily 2x4 coupons, learning weights, and live evaluation."""

from __future__ import annotations

import numpy as np

from backend.analytics.coupons import build_daily_coupons
from backend.analytics.market_calculator import compute_all_markets
from backend.analytics.report_formatter import format_daily_report_tr
from backend.analytics.top_picks import (
    MAX_PICK_ODD,
    MIN_PICK_ODD,
    compute_market_family_weights,
    compute_top2_picks,
    evaluate_pick_outcome,
    select_daily_top15,
)
from backend.models.poisson import score_matrix
from backend.providers.iddaa_provider import parse_iddaa_markets
from backend.scheduler.results_sync import sync_results_and_compute_metrics
from backend.schemas import FixtureRecord, MatchPredictionBundle, SourceProvenance


def _make_bundle(
    idx: int,
    league: str,
    lam_h: float,
    lam_a: float,
    cov: float,
    with_odds: bool = True,
) -> MatchPredictionBundle:
    mat = score_matrix(lam_h, lam_a, max_goals=6)
    p1 = float(np.tril(mat, k=-1).sum())
    px = float(np.trace(mat))
    p2 = float(np.triu(mat, k=1).sum())
    probs = {"home": round(p1, 4), "draw": round(px, 4), "away": round(p2, 4)}
    markets = compute_all_markets(matrix=mat, probs_1x2=probs, lambda_home=lam_h, lambda_away=lam_a)

    odds_payload = {}
    if with_odds:
        raw_markets = [
            {"t": 1, "st": 1, "o": [{"n": "1", "odd": 1.58}, {"n": "0", "odd": 3.85}, {"n": "2", "odd": 4.90}]},
            {"t": 2, "st": 92, "o": [{"n": "1 ve 0", "odd": 1.16}, {"n": "0 ve 2", "odd": 2.15}, {"n": "1 ve 2", "odd": 1.22}]},
            {"t": 2, "st": 89, "o": [{"n": "Var", "odd": 1.78}, {"n": "Yok", "odd": 1.84}]},
            {"t": 2, "st": 101, "sov": "1.5", "o": [{"n": "Alt", "odd": 3.45}, {"n": "Üst", "odd": 1.21}]},
            {"t": 2, "st": 101, "sov": "2.5", "o": [{"n": "Alt", "odd": 1.95}, {"n": "Üst", "odd": 1.72}]},
            {"t": 2, "st": 101, "sov": "3.5", "o": [{"n": "Alt", "odd": 1.33}, {"n": "Üst", "odd": 2.75}]},
            {"t": 2, "st": 88, "o": [{"n": "1", "odd": 2.10}, {"n": "0", "odd": 2.25}, {"n": "2", "odd": 4.40}]},
            {"t": 2, "st": 60, "sov": "0.5", "o": [{"n": "Alt", "odd": 2.70}, {"n": "Üst", "odd": 1.34}]},
            {"t": 2, "st": 603, "sov": "1.5", "o": [{"n": "Alt", "odd": 1.95}, {"n": "Üst", "odd": 1.66}]},
            {
                "t": 2,
                "st": 7,
                "sov": "1.5",
                "o": [
                    {"n": "1 ve Alt", "odd": 7.50},
                    {"n": "0 ve Alt", "odd": 9.00},
                    {"n": "2 ve Alt", "odd": 12.0},
                    {"n": "1 ve Üst", "odd": 1.88},
                    {"n": "0 ve Üst", "odd": 4.50},
                    {"n": "2 ve Üst", "odd": 6.20},
                ],
            },
            {
                "t": 2,
                "st": 700,
                "sov": "2.5",
                "o": [
                    {"n": "Alt ve Var", "odd": 5.20},
                    {"n": "Üst ve Var", "odd": 2.15},
                    {"n": "Alt ve Yok", "odd": 2.40},
                    {"n": "Üst ve Yok", "odd": 6.10},
                ],
            },
            {"t": 2, "st": 100, "sov": "-1", "o": [{"n": "1", "odd": 2.55}, {"n": "0", "odd": 3.55}, {"n": "2", "odd": 2.10}]},
            {"t": 2, "st": 4, "o": [{"n": "0-1 gol", "odd": 3.20}, {"n": "2-3 gol", "odd": 1.85}, {"n": "4-5 gol", "odd": 3.40}, {"n": "6+ gol", "odd": 15.0}]},
        ]
        _, odds_payload = parse_iddaa_markets(raw_markets)

    fx = FixtureRecord(
        fixture_id=f"iddaa_{1000 + idx}",
        iddaa_event_id=str(1000 + idx),
        iddaa_match_code=str(5000 + idx),
        organization_id=f"org_{idx % 4}",
        league_name=league,
        country="TR",
        home_team=f"Ev {idx}",
        away_team=f"Dep {idx}",
        kickoff_utc="2026-11-26T18:00:00Z",
        kickoff_tr="2026-11-26T21:00:00+03:00",
        analysis_day_tr="2026-11-26",
        status="scheduled",
        bulletin_source="iddaa",
        iddaa_verified=True,
        iddaa_odds=odds_payload,
        provenance=SourceProvenance(
            source_name="İddaa",
            source_url="https://sportsbookv2.iddaa.com",
            fetched_at="2026-11-26T08:00:00Z",
            data_type="bulletin_fixture",
        ),
    )
    picks = compute_top2_picks(markets=markets, probs_1x2=probs, iddaa_odds=fx.iddaa_odds)
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
        created_at_utc="2026-11-26T08:00:00Z",
    )


def test_top2_picks_require_real_odds_in_range_and_no_oddless():
    b_with = _make_bundle(1, "Türkiye Süper Lig", 2.1, 0.8, 0.85, with_odds=True)
    assert len(b_with.top_picks) == 2
    for p in b_with.top_picks:
        assert isinstance(p["iddaa_odd"], float)
        assert MIN_PICK_ODD <= p["iddaa_odd"] <= MAX_PICK_ODD

    # Without any real iddaa odds -> ZERO picks emitted (never fabricates or emits odd-less)
    b_no_odds = _make_bundle(2, "Türkiye Süper Lig", 2.1, 0.8, 0.85, with_odds=False)
    assert b_no_odds.top_picks == []

    # Odds only < 1.30 (e.g. 1.15) -> also skipped
    b_low = _make_bundle(3, "Türkiye Süper Lig", 2.1, 0.8, 0.85, with_odds=False)
    low_picks = compute_top2_picks(
        markets=b_low.markets,
        probs_1x2={"home": b_low.prob_home, "draw": b_low.prob_draw, "away": b_low.prob_away},
        iddaa_odds={"flat_odds": {"ust_1_5": 1.15, "dc_1x": 1.09}},
    )
    assert low_picks == []


def test_select_daily_top15_coupons_and_formatter():
    bundles = [
        _make_bundle(i, f"Lig {i % 5}", 1.5 + (i % 4) * 0.25, 0.8 + (i % 3) * 0.2, 0.45 + i * 0.02)
        for i in range(20)
    ]
    select_daily_top15(bundles, limit=15)
    selected = [b for b in bundles if b.is_selected_top15]
    assert len(selected) == 15
    assert sorted(b.selection_rank for b in selected if b.selection_rank is not None) == list(range(1, 16))

    coupons = build_daily_coupons(bundles, analysis_day_tr="2026-11-26", run_id="run_test_1")
    assert len(coupons) == 2
    assert coupons[0]["coupon_slot"] == 1 and len(coupons[0]["legs"]) == 4
    assert coupons[1]["coupon_slot"] == 2 and len(coupons[1]["legs"]) == 4

    ids1 = {l["fixture_id"] for l in coupons[0]["legs"]}
    ids2 = {l["fixture_id"] for l in coupons[1]["legs"]}
    assert ids1.isdisjoint(ids2)

    for c in coupons:
        prod = 1.0
        for leg in c["legs"]:
            assert MIN_PICK_ODD <= leg["iddaa_odd"] <= MAX_PICK_ODD
            prod *= leg["iddaa_odd"]
        assert abs(c["total_odd"] - round(prod, 2)) < 0.05

    text = format_daily_report_tr(
        bundles=bundles,
        run_type_label="Anlık Analiz",
        analysis_day_tr="2026-11-26",
        bulletin_source="iddaa",
        panel_url="https://ayzela-panel.pages.dev",
        coupons=coupons,
    )
    assert "20 maç incelendi" in text
    assert "Seçilen: 15 maç" in text
    assert "Dengeli 4'lü Kupon" in text
    assert "Yüksek Oran 4'lü Kupon" in text


def test_evaluate_pick_outcome_extended_markets():
    assert evaluate_pick_outcome("ms_1", None, None, "scheduled")["status"] == "pending"
    # HT / 2H evaluation
    assert evaluate_pick_outcome("iy_1", 2, 1, "finished", ht_home_goals=1, ht_away_goals=0) == {"status": "won", "locked": True}
    assert evaluate_pick_outcome("2y_2", 2, 2, "finished", ht_home_goals=2, ht_away_goals=0) == {"status": "won", "locked": True}
    assert evaluate_pick_outcome("iy_ust_0_5", 1, 0, "live", ht_home_goals=1, ht_away_goals=0, live_minute="35'") == {"status": "live_won", "locked": True}
    # Team goals, combos, handicap, goal range
    assert evaluate_pick_outcome("ev_ust_1_5", 2, 1, "live") == {"status": "live_won", "locked": True}
    assert evaluate_pick_outcome("ms1_ust_2_5", 2, 1, "finished") == {"status": "won", "locked": True}
    assert evaluate_pick_outcome("ust25_kg_var", 2, 1, "finished") == {"status": "won", "locked": True}
    assert evaluate_pick_outcome("hnd_m1_1", 3, 1, "finished") == {"status": "won", "locked": True}
    assert evaluate_pick_outcome("gol_2_3", 2, 1, "finished") == {"status": "won", "locked": True}
    assert evaluate_pick_outcome("gol_0_1", 2, 0, "live") == {"status": "live_lost", "locked": True}


def test_silent_results_sync_and_learning_weights(temp_repo):
    repo = temp_repo
    b = _make_bundle(1, "Türkiye Süper Lig", 1.9, 0.8, 0.8)
    repo.upsert_fixture(b.fixture)
    repo.create_analysis_run(
        run_id="run_test_1",
        run_type="manual",
        analysis_day_tr="2026-11-26",
        scheduled_at_tr="2026-11-26T14:00:00+03:00",
        actual_started_at_tr="2026-11-26T14:00:00+03:00",
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
    weights = compute_market_family_weights(repo)
    assert len(weights) >= 1
    for w in weights.values():
        assert 0.85 <= w <= 1.15
