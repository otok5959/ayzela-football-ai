"""Chronological scikit-learn ML models (Logistic Regression & Gradient Boosting) with strict zero-leakage."""

from __future__ import annotations

from typing import Any

import numpy as np
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

from backend.collectors.team_matcher import normalize_team_name
from backend.schemas import HistoricalMatch


def _build_chronological_features(history: list[HistoricalMatch], window: int = 6) -> tuple[np.ndarray, np.ndarray, dict[str, list[tuple[int, int, bool]]]]:
    """Build leakage-free pre-match rolling features strictly from matches prior to each kickoff."""
    ordered = sorted(history, key=lambda m: m.match_date_utc)
    team_logs: dict[str, list[tuple[int, int, bool]]] = {}
    X_rows: list[list[float]] = []
    y_rows: list[int] = []

    def summarize(logs: list[tuple[int, int, bool]]) -> list[float]:
        recent = logs[-window:]
        if not recent:
            return [1.2, 1.2, 1.0, 0.0]
        gf = sum(x[0] for x in recent) / len(recent)
        ga = sum(x[1] for x in recent) / len(recent)
        pts = sum(3 if x[0] > x[1] else (1 if x[0] == x[1] else 0) for x in recent) / len(recent)
        gd = gf - ga
        return [gf, ga, pts, gd]

    for m in ordered:
        hk = normalize_team_name(m.home_team)
        ak = normalize_team_name(m.away_team)
        h_logs = team_logs.get(hk, [])
        a_logs = team_logs.get(ak, [])

        if len(h_logs) >= 3 and len(a_logs) >= 3:
            hf = summarize(h_logs)
            af = summarize(a_logs)
            X_rows.append(hf + af + [hf[2] - af[2], hf[3] - af[3]])
            label = 0 if m.home_goals > m.away_goals else (1 if m.home_goals == m.away_goals else 2)
            y_rows.append(label)

        team_logs.setdefault(hk, []).append((m.home_goals, m.away_goals, True))
        team_logs.setdefault(ak, []).append((m.away_goals, m.home_goals, False))

    return np.array(X_rows, dtype=float), np.array(y_rows, dtype=int), team_logs


def fit_and_predict_ml(
    history: list[HistoricalMatch],
    home_team: str,
    away_team: str,
    min_training_samples: int = 60,
) -> dict[str, Any]:
    X, y, team_logs = _build_chronological_features(history)
    if len(X) < min_training_samples or len(np.unique(y)) < 3:
        return {
            "enabled": False,
            "reason": f"ML eğitimi için yeterli örneklem yok ({len(X)} < {min_training_samples})",
        }

    hk = normalize_team_name(home_team)
    ak = normalize_team_name(away_team)
    h_logs = team_logs.get(hk, [])
    a_logs = team_logs.get(ak, [])
    if len(h_logs) < 3 or len(a_logs) < 3:
        return {"enabled": False, "reason": "Takımlardan biri için son maç verisi yetersiz"}

    def summarize(logs: list[tuple[int, int, bool]]) -> list[float]:
        recent = logs[-6:]
        gf = sum(x[0] for x in recent) / len(recent)
        ga = sum(x[1] for x in recent) / len(recent)
        pts = sum(3 if x[0] > x[1] else (1 if x[0] == x[1] else 0) for x in recent) / len(recent)
        return [gf, ga, pts, gf - ga]

    hf = summarize(h_logs)
    af = summarize(a_logs)
    x_pred = np.array([hf + af + [hf[2] - af[2], hf[3] - af[3]]], dtype=float)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    x_pred_scaled = scaler.transform(x_pred)

    lr = LogisticRegression(max_iter=500, C=0.8)
    lr.fit(X_scaled, y)
    p_lr = lr.predict_proba(x_pred_scaled)[0]

    gb = HistGradientBoostingClassifier(max_depth=3, max_iter=60, learning_rate=0.06, random_state=42)
    gb.fit(X, y)
    p_gb = gb.predict_proba(x_pred)[0]

    p_blend = 0.55 * p_lr + 0.45 * p_gb
    p_blend = p_blend / np.sum(p_blend)
    return {
        "enabled": True,
        "samples_used": int(len(X)),
        "logistic_probs": {"home": float(p_lr[0]), "draw": float(p_lr[1]), "away": float(p_lr[2])},
        "gb_probs": {"home": float(p_gb[0]), "draw": float(p_gb[1]), "away": float(p_gb[2])},
        "probs": {"home": float(p_blend[0]), "draw": float(p_blend[1]), "away": float(p_blend[2])},
    }
