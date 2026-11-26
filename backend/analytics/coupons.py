"""Daily 2x4-match auto-coupon builder (Balanced & High-Odds) using real Iddaa odds."""

from __future__ import annotations

import itertools
import math
import uuid
from datetime import datetime, timezone
from typing import Any

from backend.analytics.top_picks import extract_all_eligible_candidates
from backend.schemas import MatchPredictionBundle


def _best_leg_for_slot(
    candidates: list[dict[str, Any]],
    slot_mode: str,
) -> dict[str, Any] | None:
    if not candidates:
        return None
    if slot_mode == "balanced":
        # Prefer high probability + clean odd in 1.35..1.90
        pool = [c for c in candidates if c["probability"] >= 0.48 and 1.30 <= c["iddaa_odd"] <= 2.05]
        if not pool:
            pool = [c for c in candidates if 1.30 <= c["iddaa_odd"] <= 2.15] or candidates
        return max(
            pool,
            key=lambda c: (
                c["probability"] * 0.72
                + (0.18 if 1.38 <= c["iddaa_odd"] <= 1.82 else 0.08)
                + min(c["expected_value"], 1.2) * 0.15
            ),
        )
    # high_odds: target 1.65..2.95 with strong EV & value_score
    pool = [c for c in candidates if c["probability"] >= 0.36 and 1.60 <= c["iddaa_odd"] <= 3.10]
    if not pool:
        pool = [c for c in candidates if c["iddaa_odd"] >= 1.45] or candidates
    return max(
        pool,
        key=lambda c: (
            c["value_score"] * 0.65
            + min(c["expected_value"], 1.35) * 0.25
            + (0.12 if 1.70 <= c["iddaa_odd"] <= 2.65 else 0.04)
        ),
    )


def _pick_best_4_combo(
    match_pool: list[tuple[MatchPredictionBundle, dict[str, Any]]],
    target_min: float,
    target_max: float,
    slot_mode: str,
) -> tuple[list[tuple[MatchPredictionBundle, dict[str, Any]]], float, float] | None:
    if len(match_pool) < 4:
        return None
    capped = match_pool[:14]
    best_score = -1.0
    best_combo: tuple[tuple[MatchPredictionBundle, dict[str, Any]], ...] | None = None
    best_odd = 0.0
    best_prob = 0.0

    for combo in itertools.combinations(capped, 4):
        total_odd = 1.0
        comb_prob = 1.0
        avg_val = 0.0
        leagues = set()
        for b, leg in combo:
            total_odd *= float(leg["iddaa_odd"])
            comb_prob *= float(leg["probability"])
            avg_val += float(leg.get("value_score") or leg["probability"])
            leagues.add(b.fixture.organization_id)
        avg_val /= 4.0

        if target_min <= total_odd <= target_max:
            range_fit = 1.0
        elif total_odd < target_min:
            dist = target_min - total_odd
            range_fit = math.exp(-0.35 * dist)
        else:
            dist = total_odd - target_max
            range_fit = math.exp(-0.22 * dist)

        league_div_bonus = 1.0 + 0.02 * (len(leagues) - 1)
        if slot_mode == "balanced":
            score = (comb_prob * 1.4 + avg_val * 0.35) * range_fit * league_div_bonus
        else:
            ev_prod = total_odd * comb_prob
            score = (avg_val * 0.7 + min(ev_prod, 1.8) * 0.4) * range_fit * league_div_bonus

        if score > best_score:
            best_score = score
            best_combo = combo
            best_odd = round(total_odd, 2)
            best_prob = round(comb_prob, 4)

    if best_combo is None:
        return None
    return list(best_combo), best_odd, best_prob


def _format_leg(b: MatchPredictionBundle, leg: dict[str, Any]) -> dict[str, Any]:
    fx = b.fixture
    return {
        "fixture_id": fx.fixture_id,
        "iddaa_event_id": fx.iddaa_event_id,
        "iddaa_match_code": fx.iddaa_match_code,
        "league_name": fx.league_name,
        "home_team": fx.home_team,
        "away_team": fx.away_team,
        "kickoff_tr": fx.kickoff_tr,
        "pick_key": leg["key"],
        "label_tr": leg["label_tr"],
        "family": leg["family"],
        "probability": round(float(leg["probability"]), 4),
        "iddaa_odd": round(float(leg["iddaa_odd"]), 2),
    }


def build_daily_coupons(
    bundles: list[MatchPredictionBundle],
    analysis_day_tr: str,
    run_id: str,
    family_weights: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """
    Build 2 distinct 4-match coupons from scheduled matches with real iddaa odds in [1.30, 3.60]:
      - Slot 1: Dengeli 4'lü Kupon (hedef toplam oran 4.0 - 7.0)
      - Slot 2: Yüksek Oran 4'lü Kupon (hedef toplam oran 8.0 - 18.0, farklı 4 maç)
    """
    scheduled = [b for b in bundles if b.fixture.status == "scheduled"]
    scheduled.sort(
        key=lambda b: (1 if b.is_selected_top15 else 0, float(b.selection_score or 0.0), b.data_coverage_score),
        reverse=True,
    )

    cands_by_fixture: dict[str, list[dict[str, Any]]] = {}
    balanced_pool: list[tuple[MatchPredictionBundle, dict[str, Any]]] = []
    for b in scheduled:
        cands = extract_all_eligible_candidates(
            markets=b.markets,
            probs_1x2={"home": b.prob_home, "draw": b.prob_draw, "away": b.prob_away},
            iddaa_odds=b.fixture.iddaa_odds,
            family_weights=family_weights,
        )
        if not cands:
            continue
        cands_by_fixture[b.fixture.fixture_id] = cands
        leg_b = _best_leg_for_slot(cands, "balanced")
        if leg_b is not None:
            balanced_pool.append((b, leg_b))

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    coupons: list[dict[str, Any]] = []
    used_fixture_ids: set[str] = set()

    slot1 = _pick_best_4_combo(balanced_pool, target_min=4.0, target_max=7.0, slot_mode="balanced")
    if slot1 is not None:
        combo1, total_odd1, comb_prob1 = slot1
        used_fixture_ids = {b.fixture.fixture_id for b, _ in combo1}
        coupons.append(
            {
                "coupon_id": f"cpn_{analysis_day_tr}_1_{uuid.uuid4().hex[:8]}",
                "analysis_day_tr": analysis_day_tr,
                "run_id": run_id,
                "coupon_slot": 1,
                "coupon_type": "balanced",
                "title_tr": "Dengeli 4'lü Kupon",
                "total_odd": total_odd1,
                "combined_probability": comb_prob1,
                "legs": [_format_leg(b, leg) for b, leg in combo1],
                "status": "pending",
                "is_demo": 0,
                "created_at_utc": now_utc,
            }
        )

    # Slot 2: prefer 4 completely different matches
    high_pool_disjoint: list[tuple[MatchPredictionBundle, dict[str, Any]]] = []
    high_pool_all: list[tuple[MatchPredictionBundle, dict[str, Any]]] = []
    for b in scheduled:
        cands = cands_by_fixture.get(b.fixture.fixture_id)
        if not cands:
            continue
        leg_h = _best_leg_for_slot(cands, "high_odds")
        if leg_h is None:
            continue
        high_pool_all.append((b, leg_h))
        if b.fixture.fixture_id not in used_fixture_ids:
            high_pool_disjoint.append((b, leg_h))

    chosen_high_pool = high_pool_disjoint if len(high_pool_disjoint) >= 4 else high_pool_all
    slot2 = _pick_best_4_combo(chosen_high_pool, target_min=8.0, target_max=18.0, slot_mode="high_odds")
    if slot2 is not None:
        combo2, total_odd2, comb_prob2 = slot2
        coupons.append(
            {
                "coupon_id": f"cpn_{analysis_day_tr}_2_{uuid.uuid4().hex[:8]}",
                "analysis_day_tr": analysis_day_tr,
                "run_id": run_id,
                "coupon_slot": 2,
                "coupon_type": "high_odds",
                "title_tr": "Yüksek Oran 4'lü Kupon",
                "total_odd": total_odd2,
                "combined_probability": comb_prob2,
                "legs": [_format_leg(b, leg) for b, leg in combo2],
                "status": "pending",
                "is_demo": 0,
                "created_at_utc": now_utc,
            }
        )

    return coupons
