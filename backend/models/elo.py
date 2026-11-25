"""Dynamic Elo rating model for football matches."""

from __future__ import annotations

import math
from typing import Any

from backend.collectors.team_matcher import normalize_team_name
from backend.schemas import HistoricalMatch


def compute_elo_ratings(
    history: list[HistoricalMatch],
    k_factor: float = 24.0,
    home_advantage: float = 65.0,
) -> dict[str, float]:
    ratings: dict[str, float] = {}
    ordered = sorted(history, key=lambda m: m.match_date_utc)
    for m in ordered:
        hk = normalize_team_name(m.home_team)
        ak = normalize_team_name(m.away_team)
        rh = ratings.get(hk, 1500.0)
        ra = ratings.get(ak, 1500.0)

        exp_h = 1.0 / (1.0 + 10.0 ** ((ra - (rh + home_advantage)) / 400.0))
        if m.home_goals > m.away_goals:
            actual_h = 1.0
        elif m.home_goals == m.away_goals:
            actual_h = 0.5
        else:
            actual_h = 0.0

        diff = abs(m.home_goals - m.away_goals)
        mult = 1.0 if diff <= 1 else (1.5 if diff == 2 else (1.75 + (diff - 3) / 8.0))
        delta = k_factor * mult * (actual_h - exp_h)
        ratings[hk] = rh + delta
        ratings[ak] = ra - delta
    return ratings


def predict_from_elo(
    history: list[HistoricalMatch],
    home_team: str,
    away_team: str,
    home_advantage: float = 65.0,
    min_matches: int = 15,
) -> dict[str, Any]:
    if len(history) < min_matches:
        return {"enabled": False, "reason": f"Elo için yeterli maç yok ({len(history)} < {min_matches})"}

    ratings = compute_elo_ratings(history, home_advantage=home_advantage)
    hk = normalize_team_name(home_team)
    ak = normalize_team_name(away_team)
    if hk not in ratings or ak not in ratings:
        return {"enabled": False, "reason": "Takımlardan biri Elo geçmişinde bulunamadı"}

    rh = ratings[hk]
    ra = ratings[ak]
    diff = (rh + home_advantage) - ra

    # Davidson-style three-way Elo probability conversion
    draw_base = 0.27 * math.exp(-((diff / 340.0) ** 2))
    win_exp = 1.0 / (1.0 + 10.0 ** (-diff / 400.0))
    p_home = max((1.0 - draw_base) * win_exp, 0.01)
    p_away = max((1.0 - draw_base) * (1.0 - win_exp), 0.01)
    total = p_home + draw_base + p_away
    return {
        "enabled": True,
        "elo_home": round(rh, 1),
        "elo_away": round(ra, 1),
        "probs": {
            "home": p_home / total,
            "draw": draw_base / total,
            "away": p_away / total,
        },
    }
