"""Ensemble combiner across active mathematical and ML models."""

from __future__ import annotations

from typing import Any

import numpy as np

from backend.models.dixon_coles import fit_and_predict_dixon_coles
from backend.models.elo import predict_from_elo
from backend.models.market_implied import predict_from_market_odds
from backend.models.ml_models import fit_and_predict_ml
from backend.models.poisson import fit_and_predict_poisson
from backend.schemas import HistoricalMatch

DEFAULT_WEIGHTS = {
    "poisson": 0.30,
    "dixon_coles": 0.35,
    "elo": 0.20,
    "ml": 0.15,
}


def run_ensemble(
    history: list[HistoricalMatch],
    home_team: str,
    away_team: str,
    weights: dict[str, float] | None = None,
    iddaa_odds: dict[str, Any] | None = None,
) -> dict[str, Any]:
    w_cfg = weights or DEFAULT_WEIGHTS
    models: dict[str, dict[str, Any]] = {
        "poisson": fit_and_predict_poisson(history, home_team, away_team),
        "dixon_coles": fit_and_predict_dixon_coles(history, home_team, away_team),
        "elo": predict_from_elo(history, home_team, away_team),
        "ml": fit_and_predict_ml(history, home_team, away_team),
    }

    active = {k: v for k, v in models.items() if v.get("enabled")}
    used_market_only = False
    if not active and iddaa_odds:
        mkt = predict_from_market_odds(iddaa_odds)
        models["market_implied"] = mkt
        if mkt.get("enabled"):
            active = {"market_implied": mkt}
            used_market_only = True

    if not active:
        return {
            "enabled": False,
            "reason": "Hiçbir matematiksel model veya piyasa oranı için yeterli doğrulanmış veri yok",
            "models": models,
        }

    total_w = sum(w_cfg.get(k, 0.25) for k in active)
    p_home = sum(active[k]["probs"]["home"] * (w_cfg.get(k, 0.25) / total_w) for k in active)
    p_draw = sum(active[k]["probs"]["draw"] * (w_cfg.get(k, 0.25) / total_w) for k in active)
    p_away = sum(active[k]["probs"]["away"] * (w_cfg.get(k, 0.25) / total_w) for k in active)
    norm = p_home + p_draw + p_away
    p_home, p_draw, p_away = p_home / norm, p_draw / norm, p_away / norm

    matrix = None
    lam_h = None
    lam_a = None
    if "dixon_coles" in active and "matrix" in active["dixon_coles"]:
        matrix = active["dixon_coles"]["matrix"]
        lam_h = active["dixon_coles"]["lambda_home"]
        lam_a = active["dixon_coles"]["lambda_away"]
    elif "poisson" in active and "matrix" in active["poisson"]:
        matrix = active["poisson"]["matrix"]
        lam_h = active["poisson"]["lambda_home"]
        lam_a = active["poisson"]["lambda_away"]
    elif "market_implied" in active and "matrix" in active["market_implied"]:
        matrix = active["market_implied"]["matrix"]
        lam_h = active["market_implied"]["lambda_home"]
        lam_a = active["market_implied"]["lambda_away"]

    breakdown = {
        k: (
            {
                "enabled": 1.0,
                "home": round(v["probs"]["home"], 4),
                "draw": round(v["probs"]["draw"], 4),
                "away": round(v["probs"]["away"], 4),
            }
            if v.get("enabled")
            else {"enabled": 0.0}
        )
        for k, v in models.items()
    }

    return {
        "enabled": True,
        "used_market_only": used_market_only,
        "active_models": list(active.keys()),
        "disabled_models": {k: v.get("reason") for k, v in models.items() if not v.get("enabled")},
        "probs": {"home": round(p_home, 4), "draw": round(p_draw, 4), "away": round(p_away, 4)},
        "matrix": matrix,
        "lambda_home": lam_h,
        "lambda_away": lam_a,
        "breakdown": breakdown,
    }
