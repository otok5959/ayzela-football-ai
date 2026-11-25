"""Independent Poisson goal distribution model with attack/defense strength estimation."""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from backend.collectors.team_matcher import teams_match
from backend.schemas import HistoricalMatch


def poisson_pmf(lam: float, k: int) -> float:
    if lam <= 0:
        return 1.0 if k == 0 else 0.0
    return math.exp(-lam) * (lam**k) / math.factorial(k)


def score_matrix(lambda_home: float, lambda_away: float, max_goals: int = 6) -> np.ndarray:
    mat = np.zeros((max_goals + 1, max_goals + 1), dtype=float)
    for i in range(max_goals + 1):
        pi = poisson_pmf(lambda_home, i)
        for j in range(max_goals + 1):
            mat[i, j] = pi * poisson_pmf(lambda_away, j)
    total = float(mat.sum())
    if total > 0:
        mat /= total
    return mat


def fit_and_predict_poisson(
    history: list[HistoricalMatch],
    home_team: str,
    away_team: str,
    min_matches: int = 20,
) -> dict[str, Any]:
    """Compute attack/defense strengths from chronological history and predict score matrix."""
    if len(history) < min_matches:
        return {
            "enabled": False,
            "reason": f"Yeterli lig geçmişi yok ({len(history)} < {min_matches})",
        }

    total_hg = sum(m.home_goals for m in history)
    total_ag = sum(m.away_goals for m in history)
    n = len(history)
    avg_home = max(total_hg / n, 0.4)
    avg_away = max(total_ag / n, 0.3)

    def team_rates(team: str) -> tuple[float, float, float, float, int]:
        hs_gf, hs_ga, hs_cnt = 0.0, 0.0, 0
        aw_gf, aw_ga, aw_cnt = 0.0, 0.0, 0
        for m in history:
            if teams_match(m.home_team, team):
                hs_gf += m.home_goals
                hs_ga += m.away_goals
                hs_cnt += 1
            elif teams_match(m.away_team, team):
                aw_gf += m.away_goals
                aw_ga += m.home_goals
                aw_cnt += 1
        # Empirical Bayes shrinkage toward league average
        prior_w = 4.0
        h_att = (hs_gf + prior_w * avg_home) / (hs_cnt + prior_w) / avg_home
        h_def = (hs_ga + prior_w * avg_away) / (hs_cnt + prior_w) / avg_away
        a_att = (aw_gf + prior_w * avg_away) / (aw_cnt + prior_w) / avg_away
        a_def = (aw_ga + prior_w * avg_home) / (aw_cnt + prior_w) / avg_home
        return h_att, h_def, a_att, a_def, hs_cnt + aw_cnt

    h_att, h_def, _, _, h_n = team_rates(home_team)
    _, _, a_att, a_def, a_n = team_rates(away_team)

    if h_n < 3 or a_n < 3:
        return {
            "enabled": False,
            "reason": f"Takım maç örneklemi yetersiz (ev={h_n}, dep={a_n})",
        }

    lam_home = float(np.clip(avg_home * h_att * a_def, 0.25, 4.2))
    lam_away = float(np.clip(avg_away * a_att * h_def, 0.20, 4.0))
    mat = score_matrix(lam_home, lam_away)

    p_home = float(np.tril(mat, k=-1).sum())
    p_draw = float(np.trace(mat))
    p_away = float(np.triu(mat, k=1).sum())
    return {
        "enabled": True,
        "lambda_home": round(lam_home, 4),
        "lambda_away": round(lam_away, 4),
        "matrix": mat,
        "probs": {"home": p_home, "draw": p_draw, "away": p_away},
    }
