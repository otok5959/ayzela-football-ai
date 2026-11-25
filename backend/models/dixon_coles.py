"""Dixon-Coles time-decayed bivariate correction model using SciPy optimization."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import numpy as np
from scipy.optimize import minimize

from backend.collectors.team_matcher import normalize_team_name
from backend.models.poisson import poisson_pmf
from backend.schemas import HistoricalMatch


def _tau(x: int, y: int, lam: float, mu: float, rho: float) -> float:
    if x == 0 and y == 0:
        return max(1.0 - lam * mu * rho, 1e-6)
    if x == 0 and y == 1:
        return max(1.0 + lam * rho, 1e-6)
    if x == 1 and y == 0:
        return max(1.0 + mu * rho, 1e-6)
    if x == 1 and y == 1:
        return max(1.0 - rho, 1e-6)
    return 1.0


def _parse_days_ago(date_str: str, ref_dt: datetime) -> float:
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        if dt.tzinfo is not None and ref_dt.tzinfo is None:
            dt = dt.replace(tzinfo=None)
        elif dt.tzinfo is None and ref_dt.tzinfo is not None:
            ref_dt = ref_dt.replace(tzinfo=None)
        return max((ref_dt - dt).total_seconds() / 86400.0, 0.0)
    except Exception:
        return 30.0


def fit_and_predict_dixon_coles(
    history: list[HistoricalMatch],
    home_team: str,
    away_team: str,
    xi: float = 0.0035,
    min_matches: int = 40,
) -> dict[str, Any]:
    """Fit time-weighted Dixon-Coles parameters via MLE and return calibrated score matrix."""
    if len(history) < min_matches:
        return {
            "enabled": False,
            "reason": f"Dixon-Coles için yeterli maç yok ({len(history)} < {min_matches})",
        }

    recent = history[-300:]
    teams_set: list[str] = []
    idx_map: dict[str, int] = {}
    for m in recent:
        for t in (normalize_team_name(m.home_team), normalize_team_name(m.away_team)):
            if t not in idx_map:
                idx_map[t] = len(teams_set)
                teams_set.append(t)

    h_key = normalize_team_name(home_team)
    a_key = normalize_team_name(away_team)
    if h_key not in idx_map or a_key not in idx_map:
        return {"enabled": False, "reason": "Takımlardan biri lig geçmişinde bulunamadı"}

    n_teams = len(teams_set)
    try:
        ref_dt = datetime.fromisoformat(recent[-1].match_date_utc.replace("Z", "+00:00"))
    except Exception:
        ref_dt = datetime.utcnow()

    h_idx = np.array([idx_map[normalize_team_name(m.home_team)] for m in recent], dtype=int)
    a_idx = np.array([idx_map[normalize_team_name(m.away_team)] for m in recent], dtype=int)
    hg = np.array([m.home_goals for m in recent], dtype=int)
    ag = np.array([m.away_goals for m in recent], dtype=int)
    weights = np.array([np.exp(-xi * _parse_days_ago(m.match_date_utc, ref_dt)) for m in recent], dtype=float)

    # Parameters: [attack(0..n-1), defense(0..n-1), home_adv, rho]
    x0 = np.zeros(2 * n_teams + 2, dtype=float)
    x0[-2] = 0.25  # home advantage
    x0[-1] = -0.05  # rho

    def neg_log_lik(params: np.ndarray) -> float:
        att = params[:n_teams]
        dfn = params[n_teams : 2 * n_teams]
        home_adv = params[-2]
        rho = float(np.clip(params[-1], -0.25, 0.25))

        lam = np.exp(np.clip(att[h_idx] + dfn[a_idx] + home_adv, -2.5, 2.0))
        mu = np.exp(np.clip(att[a_idx] + dfn[h_idx], -2.5, 2.0))

        # Vectorized Poisson log-prob + low-score tau adjustment + L2 regularization
        ll = hg * np.log(lam) - lam + ag * np.log(mu) - mu
        tau_vals = np.ones_like(ll)
        for i in range(len(recent)):
            if hg[i] <= 1 and ag[i] <= 1:
                tau_vals[i] = _tau(int(hg[i]), int(ag[i]), float(lam[i]), float(mu[i]), rho)
        ll += np.log(tau_vals)
        reg = 0.05 * float(np.sum(att**2) + np.sum(dfn**2)) + 0.1 * (rho**2)
        return -float(np.sum(weights * ll)) + reg

    res = minimize(neg_log_lik, x0, method="L-BFGS-B", options={"maxiter": 60})
    params = res.x
    att = params[:n_teams] - np.mean(params[:n_teams])
    dfn = params[n_teams : 2 * n_teams] - np.mean(params[n_teams : 2 * n_teams])
    home_adv = float(params[-2])
    rho = float(np.clip(params[-1], -0.25, 0.25))

    lam_h = float(np.clip(np.exp(att[idx_map[h_key]] + dfn[idx_map[a_key]] + home_adv), 0.25, 4.2))
    lam_a = float(np.clip(np.exp(att[idx_map[a_key]] + dfn[idx_map[h_key]]), 0.20, 4.0))

    max_g = 6
    mat = np.zeros((max_g + 1, max_g + 1), dtype=float)
    for i in range(max_g + 1):
        for j in range(max_g + 1):
            base = poisson_pmf(lam_h, i) * poisson_pmf(lam_a, j)
            mat[i, j] = base * _tau(i, j, lam_h, lam_a, rho)
    mat /= float(mat.sum())

    return {
        "enabled": True,
        "lambda_home": round(lam_h, 4),
        "lambda_away": round(lam_a, 4),
        "rho": round(rho, 4),
        "home_advantage": round(home_adv, 4),
        "matrix": mat,
        "probs": {
            "home": float(np.tril(mat, k=-1).sum()),
            "draw": float(np.trace(mat)),
            "away": float(np.triu(mat, k=1).sum()),
        },
    }
