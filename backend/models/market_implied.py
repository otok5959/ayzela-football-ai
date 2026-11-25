"""Market-implied probability model derived by removing bookmaker overround from real iddaa odds."""

from __future__ import annotations

import math
from typing import Any

import numpy as np

from backend.models.poisson import score_matrix


def predict_from_market_odds(iddaa_odds: dict[str, Any] | None) -> dict[str, Any]:
    """
    Convert real iddaa.com 1X2 (and optional O/U 2.5) odds into fair overround-removed probabilities.
    Never fabricates data: returns enabled=False when 1X2 odds are missing.
    """
    if not iddaa_odds or "1x2" not in iddaa_odds:
        return {"enabled": False, "reason": "İddaa 1X2 oranı mevcut değil"}

    o1x2 = iddaa_odds["1x2"]
    try:
        o_h = float(o1x2["home"])
        o_d = float(o1x2["draw"])
        o_a = float(o1x2["away"])
        if min(o_h, o_d, o_a) <= 1.0:
            raise ValueError("Geçersiz oran")
    except Exception:
        return {"enabled": False, "reason": "İddaa 1X2 oranı ayrıştırılamadı"}

    inv_h, inv_d, inv_a = 1.0 / o_h, 1.0 / o_d, 1.0 / o_a
    overround = inv_h + inv_d + inv_a
    p_h, p_d, p_a = inv_h / overround, inv_d / overround, inv_a / overround

    # Infer total expected goals from real O/U 2.5 odds if present, else conservative 2.65
    total_lam = 2.65
    if "ou_25" in iddaa_odds:
        try:
            u = float(iddaa_odds["ou_25"]["under"])
            ov = float(iddaa_odds["ou_25"]["over"])
            if u > 1.0 and ov > 1.0:
                p_over = (1.0 / ov) / ((1.0 / u) + (1.0 / ov))
                # Monotonic calibration mapping p_over(2.5) in [0.25, 0.80] -> total lambda in [1.85, 3.65]
                total_lam = float(np.clip(1.65 + 2.2 * p_over, 1.7, 3.8))
        except Exception:
            pass

    # Split total expected goals smoothly by relative 1X2 win strength
    share_home = float(np.clip((p_h + 0.5 * p_d), 0.25, 0.78))
    lam_h = round(total_lam * share_home, 4)
    lam_a = round(total_lam * (1.0 - share_home), 4)
    mat = score_matrix(lam_h, lam_a)

    return {
        "enabled": True,
        "overround": round(overround, 4),
        "lambda_home": lam_h,
        "lambda_away": lam_a,
        "matrix": mat,
        "probs": {"home": round(p_h, 4), "draw": round(p_d, 4), "away": round(p_a, 4)},
    }
