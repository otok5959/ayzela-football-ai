"""Top-3 probability market picker, daily Top-15 selector, and live/final outcome evaluator."""

from __future__ import annotations

from typing import Any

from backend.schemas import MarketCategoryProbability, MatchPredictionBundle


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


def compute_top3_picks(
    markets: dict[str, MarketCategoryProbability] | dict[str, Any],
    probs_1x2: dict[str, float],
    iddaa_odds: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """
    Pick ONLY the 3 highest-probability non-redundant options across 4 distinct market families:
      1. side (MS 1 / MS X / MS 2 or 1X / X2 Çifte Şans)
      2. btts (KG Var / KG Yok)
      3. ou_15 (1.5 Üst / 1.5 Alt)
      4. ou_25 (2.5 Üst / 2.5 Alt)
    """
    odds = iddaa_odds or {}
    candidates: list[dict[str, Any]] = []

    # 1. Family: side (1-X-2 / Double Chance)
    p1 = _safe_float(probs_1x2.get("home")) or 0.0
    px = _safe_float(probs_1x2.get("draw")) or 0.0
    p2 = _safe_float(probs_1x2.get("away")) or 0.0
    p1x = min(0.99, p1 + px)
    px2 = min(0.99, p2 + px)

    odds_1x2 = odds.get("1x2") if isinstance(odds.get("1x2"), dict) else {}
    odds_dc = odds.get("dc") if isinstance(odds.get("dc"), dict) else {}

    if max(p1, p2) >= 0.58:
        if p1 >= p2:
            candidates.append(
                {
                    "key": "ms_1",
                    "label_tr": "MS 1",
                    "family": "side",
                    "probability": round(p1, 4),
                    "iddaa_odd": _safe_float(odds_1x2.get("home")),
                }
            )
        else:
            candidates.append(
                {
                    "key": "ms_2",
                    "label_tr": "MS 2",
                    "family": "side",
                    "probability": round(p2, 4),
                    "iddaa_odd": _safe_float(odds_1x2.get("away")),
                }
            )
    elif max(p1x, px2) >= 0.65:
        if p1x >= px2:
            candidates.append(
                {
                    "key": "dc_1x",
                    "label_tr": "1X Çifte Şans",
                    "family": "side",
                    "probability": round(p1x, 4),
                    "iddaa_odd": _safe_float(odds_dc.get("1x")),
                }
            )
        else:
            candidates.append(
                {
                    "key": "dc_x2",
                    "label_tr": "X2 Çifte Şans",
                    "family": "side",
                    "probability": round(px2, 4),
                    "iddaa_odd": _safe_float(odds_dc.get("x2")),
                }
            )
    else:
        best_key, best_label, best_prob, best_odd = max(
            [
                ("ms_1", "MS 1", p1, _safe_float(odds_1x2.get("home"))),
                ("ms_x", "MS X", px, _safe_float(odds_1x2.get("draw"))),
                ("ms_2", "MS 2", p2, _safe_float(odds_1x2.get("away"))),
            ],
            key=lambda x: x[2],
        )
        candidates.append(
            {
                "key": best_key,
                "label_tr": best_label,
                "family": "side",
                "probability": round(best_prob, 4),
                "iddaa_odd": best_odd,
            }
        )

    # 2. Family: btts (KG Var / KG Yok)
    btts_probs = _get_market_probs(markets, "btts")
    odds_btts = odds.get("btts") if isinstance(odds.get("btts"), dict) else {}
    p_kg_var = _safe_float(btts_probs.get("kg_var"))
    p_kg_yok = _safe_float(btts_probs.get("kg_yok"))
    if p_kg_var is not None and p_kg_yok is not None:
        if p_kg_var >= p_kg_yok:
            candidates.append(
                {
                    "key": "kg_var",
                    "label_tr": "KG Var",
                    "family": "btts",
                    "probability": round(p_kg_var, 4),
                    "iddaa_odd": _safe_float(odds_btts.get("yes")),
                }
            )
        else:
            candidates.append(
                {
                    "key": "kg_yok",
                    "label_tr": "KG Yok",
                    "family": "btts",
                    "probability": round(p_kg_yok, 4),
                    "iddaa_odd": _safe_float(odds_btts.get("no")),
                }
            )

    # 3. Family: ou_15 (1.5 Üst / 1.5 Alt)
    ou_probs = _get_market_probs(markets, "over_under_lines")
    odds_ou15 = odds.get("ou_15") if isinstance(odds.get("ou_15"), dict) else {}
    p_u15 = _safe_float(ou_probs.get("ust_1_5"))
    p_a15 = _safe_float(ou_probs.get("alt_1_5"))
    if p_u15 is not None and p_a15 is not None:
        if p_u15 >= p_a15:
            candidates.append(
                {
                    "key": "ust_1_5",
                    "label_tr": "1.5 Üst",
                    "family": "ou_15",
                    "probability": round(p_u15, 4),
                    "iddaa_odd": _safe_float(odds_ou15.get("over")),
                }
            )
        else:
            candidates.append(
                {
                    "key": "alt_1_5",
                    "label_tr": "1.5 Alt",
                    "family": "ou_15",
                    "probability": round(p_a15, 4),
                    "iddaa_odd": _safe_float(odds_ou15.get("under")),
                }
            )

    # 4. Family: ou_25 (2.5 Üst / 2.5 Alt)
    odds_ou25 = odds.get("ou_25") if isinstance(odds.get("ou_25"), dict) else {}
    p_u25 = _safe_float(ou_probs.get("ust_2_5"))
    p_a25 = _safe_float(ou_probs.get("alt_2_5"))
    if p_u25 is not None and p_a25 is not None:
        if p_u25 >= p_a25:
            candidates.append(
                {
                    "key": "ust_2_5",
                    "label_tr": "2.5 Üst",
                    "family": "ou_25",
                    "probability": round(p_u25, 4),
                    "iddaa_odd": _safe_float(odds_ou25.get("over")),
                }
            )
        else:
            candidates.append(
                {
                    "key": "alt_2_5",
                    "label_tr": "2.5 Alt",
                    "family": "ou_25",
                    "probability": round(p_a25, 4),
                    "iddaa_odd": _safe_float(odds_ou25.get("under")),
                }
            )

    candidates.sort(key=lambda item: item["probability"], reverse=True)
    return candidates[:3]


def select_daily_top15(
    bundles: list[MatchPredictionBundle],
    limit: int = 15,
) -> list[MatchPredictionBundle]:
    """
    Score all analyzed bulletin bundles by average Top-3 confidence + slight data coverage bonus,
    then mark the top `limit` (default 15) with `is_selected_top15=True` and `selection_rank=1..N`.
    Returns the full list of bundles (with flags updated).
    """
    if not bundles:
        return bundles

    scored: list[tuple[float, float, float, MatchPredictionBundle]] = []
    for b in bundles:
        if not b.top_picks:
            b.top_picks = compute_top3_picks(
                markets=b.markets,
                probs_1x2={"home": b.prob_home, "draw": b.prob_draw, "away": b.prob_away},
                iddaa_odds=b.fixture.iddaa_odds,
            )
        b.is_selected_top15 = False
        b.selection_rank = None

        avg_top = sum(float(p["probability"]) for p in b.top_picks) / max(len(b.top_picks), 1)
        max_top = max((float(p["probability"]) for p in b.top_picks), default=0.0)
        sel_score = round(avg_top + 0.05 * b.data_coverage_score, 4)
        b.selection_score = sel_score
        scored.append((sel_score, max_top, b.data_coverage_score, b))

    scored.sort(key=lambda t: (t[0], t[1], t[2]), reverse=True)
    for rank, (_, _, _, b) in enumerate(scored[:limit], start=1):
        b.is_selected_top15 = True
        b.selection_rank = rank

    return bundles


def evaluate_pick_outcome(
    pick_key: str,
    home_goals: int | None,
    away_goals: int | None,
    match_status: str,
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

    # Evaluate condition truth at current score
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
    }
    hit = cond_map.get(pick_key)
    if hit is None:
        return {"status": "pending", "locked": False}

    if is_finished:
        return {"status": "won" if hit else "lost", "locked": True}

    # Live play monotonic lock detection
    locked = False
    if pick_key == "kg_var" and hg > 0 and ag > 0:
        locked = True
    elif pick_key == "kg_yok" and hg > 0 and ag > 0:
        locked = True
    elif pick_key == "ust_1_5" and tot >= 2:
        locked = True
    elif pick_key == "alt_1_5" and tot >= 2:
        locked = True
    elif pick_key == "ust_2_5" and tot >= 3:
        locked = True
    elif pick_key == "alt_2_5" and tot >= 3:
        locked = True
    elif pick_key == "ust_3_5" and tot >= 4:
        locked = True
    elif pick_key == "alt_3_5" and tot >= 4:
        locked = True

    return {"status": "live_won" if hit else "live_lost", "locked": locked}
