"""Top-2 real-odd value picker, self-improving family weights, daily Top-15 selector, and outcome evaluator."""

from __future__ import annotations

import json
import math
from typing import Any

from backend.schemas import MarketCategoryProbability, MatchPredictionBundle

MIN_PICK_ODD = 1.30
MAX_PICK_ODD = 3.60
MIN_PICK_PROB = 0.34
MAX_PICKS_PER_MATCH = 2

PICK_METADATA: dict[str, tuple[str, str]] = {
    # Full-time 1X2 & Double Chance
    "ms_1": ("MS 1", "side"),
    "ms_x": ("MS X", "side"),
    "ms_2": ("MS 2", "side"),
    "dc_1x": ("1X Çifte Şans", "side"),
    "dc_x2": ("X2 Çifte Şans", "side"),
    "dc_12": ("12 Çifte Şans", "side"),
    # BTTS
    "kg_var": ("KG Var", "btts"),
    "kg_yok": ("KG Yok", "btts"),
    # Over/Under Total Goals
    "ust_1_5": ("1.5 Üst", "ou"),
    "alt_1_5": ("1.5 Alt", "ou"),
    "ust_2_5": ("2.5 Üst", "ou"),
    "alt_2_5": ("2.5 Alt", "ou"),
    "ust_3_5": ("3.5 Üst", "ou"),
    "alt_3_5": ("3.5 Alt", "ou"),
    "ust_4_5": ("4.5 Üst", "ou"),
    "alt_4_5": ("4.5 Alt", "ou"),
    # First Half
    "iy_1": ("İY 1", "ht"),
    "iy_x": ("İY X", "ht"),
    "iy_2": ("İY 2", "ht"),
    "iy_1x": ("İY 1X", "ht"),
    "iy_x2": ("İY X2", "ht"),
    "iy_12": ("İY 12", "ht"),
    "iy_ust_0_5": ("İY 0.5 Üst", "ht"),
    "iy_alt_0_5": ("İY 0.5 Alt", "ht"),
    "iy_ust_1_5": ("İY 1.5 Üst", "ht"),
    "iy_alt_1_5": ("İY 1.5 Alt", "ht"),
    "iy_kg_var": ("İY KG Var", "ht"),
    "iy_kg_yok": ("İY KG Yok", "ht"),
    # Second Half
    "2y_1": ("2. Yarı 1", "sh"),
    "2y_x": ("2. Yarı X", "sh"),
    "2y_2": ("2. Yarı 2", "sh"),
    # Home Team Goals
    "ev_ust_0_5": ("Ev 0.5 Üst", "home_goals"),
    "ev_alt_0_5": ("Ev 0.5 Alt", "home_goals"),
    "ev_ust_1_5": ("Ev 1.5 Üst", "home_goals"),
    "ev_alt_1_5": ("Ev 1.5 Alt", "home_goals"),
    "ev_ust_2_5": ("Ev 2.5 Üst", "home_goals"),
    "ev_alt_2_5": ("Ev 2.5 Alt", "home_goals"),
    # Away Team Goals
    "dep_ust_0_5": ("Dep 0.5 Üst", "away_goals"),
    "dep_alt_0_5": ("Dep 0.5 Alt", "away_goals"),
    "dep_ust_1_5": ("Dep 1.5 Üst", "away_goals"),
    "dep_alt_1_5": ("Dep 1.5 Alt", "away_goals"),
    "dep_ust_2_5": ("Dep 2.5 Üst", "away_goals"),
    "dep_alt_2_5": ("Dep 2.5 Alt", "away_goals"),
    # Combo: MS + Over/Under
    "ms1_ust_1_5": ("MS 1 & 1.5 Üst", "combo_ms_ou"),
    "ms1_alt_1_5": ("MS 1 & 1.5 Alt", "combo_ms_ou"),
    "ms2_ust_1_5": ("MS 2 & 1.5 Üst", "combo_ms_ou"),
    "ms2_alt_1_5": ("MS 2 & 1.5 Alt", "combo_ms_ou"),
    "ms1_ust_2_5": ("MS 1 & 2.5 Üst", "combo_ms_ou"),
    "ms1_alt_2_5": ("MS 1 & 2.5 Alt", "combo_ms_ou"),
    "ms2_ust_2_5": ("MS 2 & 2.5 Üst", "combo_ms_ou"),
    "ms2_alt_2_5": ("MS 2 & 2.5 Alt", "combo_ms_ou"),
    "ms1_ust_3_5": ("MS 1 & 3.5 Üst", "combo_ms_ou"),
    "ms1_alt_3_5": ("MS 1 & 3.5 Alt", "combo_ms_ou"),
    "ms2_ust_3_5": ("MS 2 & 3.5 Üst", "combo_ms_ou"),
    "ms2_alt_3_5": ("MS 2 & 3.5 Alt", "combo_ms_ou"),
    # Combo: OU 2.5 + BTTS
    "ust25_kg_var": ("2.5 Üst & KG Var", "combo_ou_btts"),
    "alt25_kg_yok": ("2.5 Alt & KG Yok", "combo_ou_btts"),
    "alt25_kg_var": ("2.5 Alt & KG Var", "combo_ou_btts"),
    "ust25_kg_yok": ("2.5 Üst & KG Yok", "combo_ou_btts"),
    # Combo: MS + BTTS
    "ms1_kg_var": ("MS 1 & KG Var", "combo_ms_btts"),
    "ms1_kg_yok": ("MS 1 & KG Yok", "combo_ms_btts"),
    "ms2_kg_var": ("MS 2 & KG Var", "combo_ms_btts"),
    "ms2_kg_yok": ("MS 2 & KG Yok", "combo_ms_btts"),
    # Handicap
    "hnd_m1_1": ("Ev -1 Handikap", "handicap"),
    "hnd_p1_2": ("Dep -1 Handikap", "handicap"),
    # Goal Range
    "gol_0_1": ("0-1 Gol", "goal_range"),
    "gol_2_3": ("2-3 Gol", "goal_range"),
    "gol_4_5": ("4-5 Gol", "goal_range"),
}

# Semantic conflict tags so the 2 chosen picks for one match are non-redundant and non-contradictory
_CONFLICT_TAGS: dict[str, set[str]] = {
    "ms_1": {"side_home", "side_any"},
    "ms_x": {"side_draw", "side_any"},
    "ms_2": {"side_away", "side_any"},
    "dc_1x": {"side_home", "side_any"},
    "dc_x2": {"side_away", "side_any"},
    "dc_12": {"side_any"},
    "kg_var": {"btts_yes"},
    "kg_yok": {"btts_no"},
    "ust_1_5": {"goals_total", "goals_over"},
    "alt_1_5": {"goals_total", "goals_under"},
    "ust_2_5": {"goals_total", "goals_over"},
    "alt_2_5": {"goals_total", "goals_under"},
    "ust_3_5": {"goals_total", "goals_over"},
    "alt_3_5": {"goals_total", "goals_under"},
    "ust_4_5": {"goals_total", "goals_over"},
    "alt_4_5": {"goals_total", "goals_under"},
    "gol_0_1": {"goals_total", "goals_under"},
    "gol_2_3": {"goals_total"},
    "gol_4_5": {"goals_total", "goals_over"},
    "hnd_m1_1": {"side_home", "side_any"},
    "hnd_p1_2": {"side_away", "side_any"},
    "ust25_kg_var": {"goals_total", "goals_over", "btts_yes"},
    "alt25_kg_yok": {"goals_total", "goals_under", "btts_no"},
    "alt25_kg_var": {"goals_total", "goals_under", "btts_yes"},
    "ust25_kg_yok": {"goals_total", "goals_over", "btts_no"},
    "ms1_kg_var": {"side_home", "side_any", "btts_yes"},
    "ms1_kg_yok": {"side_home", "side_any", "btts_no"},
    "ms2_kg_var": {"side_away", "side_any", "btts_yes"},
    "ms2_kg_yok": {"side_away", "side_any", "btts_no"},
}
for _lk in ("1_5", "2_5", "3_5"):
    _CONFLICT_TAGS[f"ms1_ust_{_lk}"] = {"side_home", "side_any", "goals_total", "goals_over"}
    _CONFLICT_TAGS[f"ms1_alt_{_lk}"] = {"side_home", "side_any", "goals_total", "goals_under"}
    _CONFLICT_TAGS[f"ms2_ust_{_lk}"] = {"side_away", "side_any", "goals_total", "goals_over"}
    _CONFLICT_TAGS[f"ms2_alt_{_lk}"] = {"side_away", "side_any", "goals_total", "goals_under"}


def _safe_float(val: Any) -> float | None:
    try:
        if val is None:
            return None
        return float(val)
    except (TypeError, ValueError):
        return None


def _get_market_probs(
    markets: dict[str, MarketCategoryProbability] | dict[str, Any],
    key: str,
) -> dict[str, float]:
    val = markets.get(key)
    if val is None:
        return {}
    if isinstance(val, MarketCategoryProbability):
        return val.probabilities if val.available else {}
    if isinstance(val, dict):
        if val.get("available") is False:
            return {}
        return val.get("probabilities") or {}
    return {}


def _extract_flat_and_groups(iddaa_odds: dict[str, Any] | None) -> tuple[dict[str, float], dict[str, dict[str, float]]]:
    odds = iddaa_odds or {}
    flat: dict[str, float] = {}
    groups: dict[str, dict[str, float]] = {}

    if isinstance(odds.get("flat_odds"), dict):
        for k, v in odds["flat_odds"].items():
            fv = _safe_float(v)
            if fv is not None and fv > 1.0:
                flat[str(k)] = round(fv, 2)

    if isinstance(odds.get("market_groups"), dict):
        for gname, gmap in odds["market_groups"].items():
            if isinstance(gmap, dict):
                clean = {str(k): float(v) for k, v in gmap.items() if _safe_float(v) and float(v) > 1.0}
                if clean:
                    groups[str(gname)] = clean

    # Legacy nested key support (used by fixtures/tests created with nested dict)
    o1x2 = odds.get("1x2") if isinstance(odds.get("1x2"), dict) else {}
    if o1x2:
        g = {}
        for rk, pk in (("home", "ms_1"), ("draw", "ms_x"), ("away", "ms_2")):
            fv = _safe_float(o1x2.get(rk))
            if fv and fv > 1.0:
                flat.setdefault(pk, round(fv, 2))
                g[pk] = fv
        if g and "1x2" not in groups:
            groups["1x2"] = g

    odc = odds.get("dc") if isinstance(odds.get("dc"), dict) else {}
    if odc:
        g = {}
        for rk, pk in (("1x", "dc_1x"), ("x2", "dc_x2"), ("12", "dc_12")):
            fv = _safe_float(odc.get(rk))
            if fv and fv > 1.0:
                flat.setdefault(pk, round(fv, 2))
                g[pk] = fv
        if g and "dc" not in groups:
            groups["dc"] = g

    obtts = odds.get("btts") if isinstance(odds.get("btts"), dict) else {}
    if obtts:
        g = {}
        for rk, pk in (("yes", "kg_var"), ("no", "kg_yok")):
            fv = _safe_float(obtts.get(rk))
            if fv and fv > 1.0:
                flat.setdefault(pk, round(fv, 2))
                g[pk] = fv
        if g and "btts" not in groups:
            groups["btts"] = g

    for legacy_k, line_k in (("ou_15", "1_5"), ("ou_25", "2_5"), ("ou_35", "3_5"), ("ou_45", "4_5")):
        ou = odds.get(legacy_k) if isinstance(odds.get(legacy_k), dict) else {}
        if ou:
            g = {}
            for rk, pk in (("over", f"ust_{line_k}"), ("under", f"alt_{line_k}")):
                fv = _safe_float(ou.get(rk))
                if fv and fv > 1.0:
                    flat.setdefault(pk, round(fv, 2))
                    g[pk] = fv
            if g and f"ou_{line_k}" not in groups:
                groups[f"ou_{line_k}"] = g

    return flat, groups


def _devig_market_probs(groups: dict[str, dict[str, float]]) -> dict[str, float]:
    out: dict[str, float] = {}
    for gmap in groups.values():
        inv = {k: 1.0 / v for k, v in gmap.items() if v > 1.0}
        tot = sum(inv.values())
        if tot <= 0:
            continue
        # For DC (3 outcomes sum to ~200% in fair probability) scale by 2.0/tot; otherwise 1.0/tot
        is_dc = any(k.endswith("_1x") or k.endswith("_x2") or k.endswith("_12") for k in gmap)
        target_sum = 2.0 if is_dc and len(gmap) == 3 else 1.0
        for k, iv in inv.items():
            if not k.startswith("_"):
                out[k] = min(0.96, (iv / tot) * target_sum)
    return out


def extract_all_eligible_candidates(
    markets: dict[str, MarketCategoryProbability] | dict[str, Any],
    probs_1x2: dict[str, float] | None,
    iddaa_odds: dict[str, Any] | None = None,
    used_market_only: bool = False,
    family_weights: dict[str, float] | None = None,
    min_odd: float = MIN_PICK_ODD,
    max_odd: float = MAX_PICK_ODD,
    min_prob: float = MIN_PICK_PROB,
) -> list[dict[str, Any]]:
    """
    Scan EVERY available real iddaa market for a match and score eligible picks.
    Strictly ignores any option that has no real iddaa odd or falls outside [min_odd, max_odd].
    """
    flat_odds, groups = _extract_flat_and_groups(iddaa_odds)
    if not flat_odds:
        return []

    mkt_probs = _devig_market_probs(groups)
    ext_probs = _get_market_probs(markets, "extended_pick_probs")
    btts_probs = _get_market_probs(markets, "btts")
    ou_probs = _get_market_probs(markets, "over_under_lines")
    p1x2 = probs_1x2 or {}

    fallback_model_probs: dict[str, float] = {}
    if p1x2:
        p1 = _safe_float(p1x2.get("home")) or 0.0
        px = _safe_float(p1x2.get("draw")) or 0.0
        p2 = _safe_float(p1x2.get("away")) or 0.0
        fallback_model_probs.update(
            {
                "ms_1": p1,
                "ms_x": px,
                "ms_2": p2,
                "dc_1x": min(0.99, p1 + px),
                "dc_x2": min(0.99, p2 + px),
                "dc_12": min(0.99, p1 + p2),
            }
        )
    fallback_model_probs.update({k: float(v) for k, v in btts_probs.items()})
    fallback_model_probs.update({k: float(v) for k, v in ou_probs.items()})

    weights = family_weights or {}
    candidates: list[dict[str, Any]] = []

    for key, (label_tr, family) in PICK_METADATA.items():
        odd = flat_odds.get(key)
        if odd is None or odd < min_odd or odd > max_odd:
            continue

        p_model = _safe_float(ext_probs.get(key))
        if p_model is None:
            p_model = _safe_float(fallback_model_probs.get(key))
        p_mkt = _safe_float(mkt_probs.get(key))
        if p_mkt is None:
            p_mkt = min(0.92, (1.0 / odd) * 0.92)

        if p_model is not None:
            p_final = (0.35 * p_model + 0.65 * p_mkt) if used_market_only else (0.55 * p_model + 0.45 * p_mkt)
        else:
            p_final = p_mkt

        p_final = min(0.95, max(0.01, float(p_final)))
        if p_final < min_prob:
            continue

        ev = p_final * odd
        odd_bonus = min(0.14, max(0.0, 0.14 * math.log(odd / 1.25) / math.log(2.35 / 1.25)))
        if odd > 2.85 and p_final < 0.42:
            odd_bonus -= 0.06

        fam_w = min(1.15, max(0.85, float(weights.get(family, 1.0))))
        value_score = round((0.56 * p_final + 0.24 * min(ev, 1.25) + odd_bonus) * fam_w, 4)

        candidates.append(
            {
                "key": key,
                "label_tr": label_tr,
                "family": family,
                "probability": round(p_final, 4),
                "iddaa_odd": round(odd, 2),
                "expected_value": round(ev, 4),
                "value_score": value_score,
            }
        )

    candidates.sort(key=lambda item: (item["value_score"], item["probability"], item["iddaa_odd"]), reverse=True)
    return candidates


def compute_top2_picks(
    markets: dict[str, MarketCategoryProbability] | dict[str, Any],
    probs_1x2: dict[str, float] | None,
    iddaa_odds: dict[str, Any] | None = None,
    used_market_only: bool = False,
    family_weights: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """
    Select AT MOST 2 non-conflicting picks from distinct market families that BOTH have real iddaa odds
    in [1.30, 3.60]. Never returns picks without real odds.
    """
    candidates = extract_all_eligible_candidates(
        markets=markets,
        probs_1x2=probs_1x2,
        iddaa_odds=iddaa_odds,
        used_market_only=used_market_only,
        family_weights=family_weights,
    )
    selected: list[dict[str, Any]] = []
    used_families: set[str] = set()
    used_tags: set[str] = set()

    for c in candidates:
        fam = c["family"]
        if fam in used_families:
            continue
        tags = _CONFLICT_TAGS.get(c["key"], set())
        if tags & used_tags:
            continue
        selected.append(c)
        used_families.add(fam)
        used_tags.update(tags)
        if len(selected) >= MAX_PICKS_PER_MATCH:
            break

    return selected


# Backward-compatible alias for external imports if any
compute_top3_picks = compute_top2_picks


def select_daily_top15(
    bundles: list[MatchPredictionBundle],
    limit: int = 15,
    family_weights: dict[str, float] | None = None,
) -> list[MatchPredictionBundle]:
    """
    Rank analyzed bulletin bundles prioritizing matches that have 2 real-odd value picks
    in [1.30, 3.60], then mark top `limit` (default 15) with `is_selected_top15=True`.
    """
    if not bundles:
        return bundles

    scored: list[tuple[int, float, float, float, MatchPredictionBundle]] = []
    for b in bundles:
        if not b.top_picks:
            b.top_picks = compute_top2_picks(
                markets=b.markets,
                probs_1x2={"home": b.prob_home, "draw": b.prob_draw, "away": b.prob_away},
                iddaa_odds=b.fixture.iddaa_odds,
                family_weights=family_weights,
            )
        b.is_selected_top15 = False
        b.selection_rank = None

        picks = [p for p in b.top_picks if isinstance(p.get("iddaa_odd"), (int, float))]
        if not picks:
            b.selection_score = 0.0
            scored.append((0, 0.0, 0.0, b.data_coverage_score, b))
            continue

        avg_val = sum(float(p.get("value_score") or p["probability"]) for p in picks) / len(picks)
        max_val = max(float(p.get("value_score") or p["probability"]) for p in picks)
        sel_score = round(avg_val + 0.05 * b.data_coverage_score, 4)
        b.selection_score = sel_score
        scored.append((1 if len(picks) >= 2 else 0, sel_score, max_val, b.data_coverage_score, b))

    scored.sort(key=lambda t: (t[0], t[1], t[2], t[3]), reverse=True)
    for rank, (_, _, _, _, b) in enumerate(scored[:limit], start=1):
        b.is_selected_top15 = True
        b.selection_rank = rank

    return bundles


def _is_second_half_or_ht(live_minute: str | None) -> bool:
    if not live_minute:
        return False
    m = live_minute.strip().upper()
    if m in ("İY", "DEVRE ARASI", "MS"):
        return True
    digits = "".join(ch for ch in m if ch.isdigit())
    return bool(digits and int(digits) >= 46)


def evaluate_pick_outcome(
    pick_key: str,
    home_goals: int | None,
    away_goals: int | None,
    match_status: str,
    ht_home_goals: int | None = None,
    ht_away_goals: int | None = None,
    live_minute: str | None = None,
) -> dict[str, Any]:
    """
    Evaluate whether a predicted pick is currently winning/won (green) or losing/lost (red).
    Returns {"status": "pending"|"live_won"|"live_lost"|"won"|"lost", "locked": bool}.
    """
    if home_goals is None or away_goals is None or match_status not in ("live", "finished"):
        return {"status": "pending", "locked": False}

    hg = int(home_goals)
    ag = int(away_goals)
    tot = hg + ag
    is_finished = match_status == "finished"

    # First-half markets
    if pick_key.startswith("iy_"):
        ht_done = is_finished or _is_second_half_or_ht(live_minute)
        if ht_home_goals is not None and ht_away_goals is not None:
            hh, ha = int(ht_home_goals), int(ht_away_goals)
        elif not ht_done and match_status == "live":
            hh, ha = hg, ag
        else:
            return {"status": "pending", "locked": False}

        ht_tot = hh + ha
        ht_map = {
            "iy_1": hh > ha,
            "iy_x": hh == ha,
            "iy_2": ha > hh,
            "iy_1x": hh >= ha,
            "iy_x2": ha >= hh,
            "iy_12": hh != ha,
            "iy_ust_0_5": ht_tot >= 1,
            "iy_alt_0_5": ht_tot == 0,
            "iy_ust_1_5": ht_tot >= 2,
            "iy_alt_1_5": ht_tot <= 1,
            "iy_kg_var": hh > 0 and ha > 0,
            "iy_kg_yok": not (hh > 0 and ha > 0),
        }
        hit = ht_map.get(pick_key)
        if hit is None:
            return {"status": "pending", "locked": False}
        if ht_done:
            return {"status": "won" if is_finished and hit else ("lost" if is_finished else ("live_won" if hit else "live_lost")), "locked": True}
        locked = (
            (pick_key in ("iy_ust_0_5", "iy_alt_0_5") and ht_tot >= 1)
            or (pick_key in ("iy_ust_1_5", "iy_alt_1_5") and ht_tot >= 2)
            or (pick_key in ("iy_kg_var", "iy_kg_yok") and hh > 0 and ha > 0)
        )
        return {"status": "live_won" if hit else "live_lost", "locked": locked}

    # Second-half markets
    if pick_key.startswith("2y_"):
        if ht_home_goals is None or ht_away_goals is None:
            return {"status": "pending", "locked": False}
        if not is_finished and not _is_second_half_or_ht(live_minute):
            return {"status": "pending", "locked": False}
        sh_h = hg - int(ht_home_goals)
        sh_a = ag - int(ht_away_goals)
        sh_map = {"2y_1": sh_h > sh_a, "2y_x": sh_h == sh_a, "2y_2": sh_a > sh_h}
        hit = sh_map.get(pick_key)
        if hit is None:
            return {"status": "pending", "locked": False}
        if is_finished:
            return {"status": "won" if hit else "lost", "locked": True}
        return {"status": "live_won" if hit else "live_lost", "locked": False}

    # Full-time markets
    cond_map = {
        "ms_1": hg > ag,
        "ms_x": hg == ag,
        "ms_2": ag > hg,
        "dc_1x": hg >= ag,
        "dc_x2": ag >= hg,
        "dc_12": hg != ag,
        "kg_var": hg > 0 and ag > 0,
        "kg_yok": not (hg > 0 and ag > 0),
        "ust_1_5": tot >= 2,
        "alt_1_5": tot <= 1,
        "ust_2_5": tot >= 3,
        "alt_2_5": tot <= 2,
        "ust_3_5": tot >= 4,
        "alt_3_5": tot <= 3,
        "ust_4_5": tot >= 5,
        "alt_4_5": tot <= 4,
        "ev_ust_0_5": hg >= 1,
        "ev_alt_0_5": hg == 0,
        "ev_ust_1_5": hg >= 2,
        "ev_alt_1_5": hg <= 1,
        "ev_ust_2_5": hg >= 3,
        "ev_alt_2_5": hg <= 2,
        "dep_ust_0_5": ag >= 1,
        "dep_alt_0_5": ag == 0,
        "dep_ust_1_5": ag >= 2,
        "dep_alt_1_5": ag <= 1,
        "dep_ust_2_5": ag >= 3,
        "dep_alt_2_5": ag <= 2,
        "ms1_ust_1_5": hg > ag and tot >= 2,
        "ms1_alt_1_5": hg > ag and tot <= 1,
        "ms2_ust_1_5": ag > hg and tot >= 2,
        "ms2_alt_1_5": ag > hg and tot <= 1,
        "ms1_ust_2_5": hg > ag and tot >= 3,
        "ms1_alt_2_5": hg > ag and tot <= 2,
        "ms2_ust_2_5": ag > hg and tot >= 3,
        "ms2_alt_2_5": ag > hg and tot <= 2,
        "ms1_ust_3_5": hg > ag and tot >= 4,
        "ms1_alt_3_5": hg > ag and tot <= 3,
        "ms2_ust_3_5": ag > hg and tot >= 4,
        "ms2_alt_3_5": ag > hg and tot <= 3,
        "ust25_kg_var": tot >= 3 and hg > 0 and ag > 0,
        "alt25_kg_yok": tot <= 2 and not (hg > 0 and ag > 0),
        "alt25_kg_var": tot <= 2 and hg > 0 and ag > 0,
        "ust25_kg_yok": tot >= 3 and not (hg > 0 and ag > 0),
        "ms1_kg_var": hg > ag and hg > 0 and ag > 0,
        "ms1_kg_yok": hg > ag and not (hg > 0 and ag > 0),
        "ms2_kg_var": ag > hg and hg > 0 and ag > 0,
        "ms2_kg_yok": ag > hg and not (hg > 0 and ag > 0),
        "hnd_m1_1": (hg - ag) >= 2,
        "hnd_p1_2": (ag - hg) >= 2,
        "gol_0_1": tot <= 1,
        "gol_2_3": 2 <= tot <= 3,
        "gol_4_5": 4 <= tot <= 5,
    }
    hit = cond_map.get(pick_key)
    if hit is None:
        return {"status": "pending", "locked": False}

    if is_finished:
        return {"status": "won" if hit else "lost", "locked": True}

    locked = False
    if pick_key in ("kg_var", "kg_yok") and hg > 0 and ag > 0:
        locked = True
    elif pick_key in ("ust_1_5", "alt_1_5") and tot >= 2:
        locked = True
    elif pick_key in ("ust_2_5", "alt_2_5") and tot >= 3:
        locked = True
    elif pick_key in ("ust_3_5", "alt_3_5") and tot >= 4:
        locked = True
    elif pick_key in ("ust_4_5", "alt_4_5") and tot >= 5:
        locked = True
    elif pick_key in ("ev_ust_0_5", "ev_alt_0_5") and hg >= 1:
        locked = True
    elif pick_key in ("ev_ust_1_5", "ev_alt_1_5") and hg >= 2:
        locked = True
    elif pick_key in ("ev_ust_2_5", "ev_alt_2_5") and hg >= 3:
        locked = True
    elif pick_key in ("dep_ust_0_5", "dep_alt_0_5") and ag >= 1:
        locked = True
    elif pick_key in ("dep_ust_1_5", "dep_alt_1_5") and ag >= 2:
        locked = True
    elif pick_key in ("dep_ust_2_5", "dep_alt_2_5") and ag >= 3:
        locked = True
    elif pick_key == "gol_0_1" and tot >= 2:
        locked = True
    elif pick_key == "gol_2_3" and tot >= 4:
        locked = True
    elif pick_key == "gol_4_5" and tot >= 6:
        locked = True

    return {"status": "live_won" if hit else "live_lost", "locked": locked}


def compute_market_family_weights(repo: Any) -> dict[str, float]:
    """
    Self-learning loop: inspect finished real predictions + match results,
    compute smoothed hit rate and ROI per market family, persist weights into
    `market_learning_weights`, and return `{family: weight}` in [0.85, 1.15].
    """
    rows = repo.db.execute(
        """
        SELECT mp.top_picks_json, mr.home_goals, mr.away_goals, mr.ht_home_goals, mr.ht_away_goals
        FROM match_predictions mp
        JOIN match_results mr ON mp.fixture_id = mr.fixture_id
        WHERE mp.is_demo = 0 AND mr.is_demo = 0 AND mp.top_picks_json IS NOT NULL
        """
    )
    stats: dict[str, dict[str, float]] = {}
    for r in rows:
        try:
            picks = json.loads(r["top_picks_json"]) if isinstance(r["top_picks_json"], str) else r["top_picks_json"]
        except Exception:
            continue
        if not isinstance(picks, list):
            continue
        for p in picks:
            key = str(p.get("key") or "")
            fam = str(p.get("family") or (PICK_METADATA.get(key) or ("", ""))[1])
            odd = _safe_float(p.get("iddaa_odd"))
            prob = _safe_float(p.get("probability"))
            if not fam or odd is None or prob is None:
                continue
            ev = evaluate_pick_outcome(
                key,
                r.get("home_goals"),
                r.get("away_goals"),
                "finished",
                ht_home_goals=r.get("ht_home_goals"),
                ht_away_goals=r.get("ht_away_goals"),
            )
            if ev["status"] not in ("won", "lost"):
                continue
            s = stats.setdefault(fam, {"n": 0.0, "wins": 0.0, "ret": 0.0, "prob_sum": 0.0, "odd_sum": 0.0})
            s["n"] += 1.0
            s["prob_sum"] += prob
            s["odd_sum"] += odd
            if ev["status"] == "won":
                s["wins"] += 1.0
                s["ret"] += odd

    prior_n = 12.0
    weights_out: dict[str, float] = {}
    for fam, s in stats.items():
        n = s["n"]
        hit_rate = s["wins"] / n if n > 0 else 0.5
        avg_odd = s["odd_sum"] / n if n > 0 else 1.7
        roi = (s["ret"] / n) - 1.0 if n > 0 else 0.0
        pred_avg = s["prob_sum"] / n if n > 0 else 0.5

        smoothed_roi = (s["ret"] - n + 0.0 * prior_n) / (n + prior_n)
        smoothed_hit = (s["wins"] + 0.5 * prior_n) / (n + prior_n)
        smoothed_pred = (s["prob_sum"] + 0.5 * prior_n) / (n + prior_n)

        raw_w = 1.0 + 0.25 * smoothed_roi + 0.15 * (smoothed_hit - smoothed_pred)
        weight = round(min(1.15, max(0.85, raw_w)), 4)
        weights_out[fam] = weight
        if hasattr(repo, "upsert_market_learning_weight"):
            repo.upsert_market_learning_weight(
                family=fam,
                sample_count=int(n),
                hit_rate=round(hit_rate, 4),
                avg_odd=round(avg_odd, 2),
                roi=round(roi, 4),
                weight=weight,
            )
    return weights_out
