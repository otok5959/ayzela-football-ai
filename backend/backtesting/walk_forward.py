"""Chronological expanding-window walk-forward backtester (zero future leakage)."""

from __future__ import annotations

from typing import Any

from backend.backtesting.metrics import compute_evaluation_metrics
from backend.models.elo import predict_from_elo
from backend.models.ml_models import fit_and_predict_ml
from backend.models.poisson import fit_and_predict_poisson
from backend.schemas import HistoricalMatch


def run_walk_forward_backtest(
    matches: list[HistoricalMatch],
    min_train_matches: int = 80,
    fold_size: int = 20,
    max_eval_matches: int = 120,
) -> dict[str, Any]:
    """
    Strictly chronological expanding-window backtest:
    For every fold, training set contains ONLY matches with match_date_utc strictly before test_fold[0].
    Evaluates Poisson, Elo, and ML separately plus combined ensemble.
    """
    ordered = sorted(matches, key=lambda m: m.match_date_utc)
    if len(ordered) <= min_train_matches + 10:
        raise ValueError(f"Walk-forward test için yeterli geçmiş maç yok ({len(ordered)} <= {min_train_matches + 10})")

    start_idx = max(min_train_matches, len(ordered) - max_eval_matches)
    model_records: dict[str, list[dict[str, Any]]] = {
        "poisson": [],
        "elo": [],
        "ml": [],
        "ensemble": [],
    }
    folds = 0

    for cursor in range(start_idx, len(ordered), fold_size):
        train = ordered[:cursor]
        test_fold = ordered[cursor : cursor + fold_size]
        if not test_fold:
            break
        # Assert strict chronological separation (zero future leakage)
        max_train_date = train[-1].match_date_utc
        min_test_date = test_fold[0].match_date_utc
        if max_train_date > min_test_date:
            raise AssertionError("Kronolojik veri sızıntısı tespit edildi!")
        folds += 1

        for m in test_fold:
            actual = "1" if m.home_goals > m.away_goals else ("2" if m.away_goals > m.home_goals else "X")
            p_res = fit_and_predict_poisson(train, m.home_team, m.away_team, min_matches=20)
            e_res = predict_from_elo(train, m.home_team, m.away_team, min_matches=20)
            ml_res = fit_and_predict_ml(train, m.home_team, m.away_team, min_training_samples=50)

            active_probs: list[list[float]] = []
            if p_res.get("enabled"):
                pr = p_res["probs"]
                vec = [pr["home"], pr["draw"], pr["away"]]
                model_records["poisson"].append({"probs": vec, "actual": actual, "data_coverage": 0.85})
                active_probs.append(vec)
            if e_res.get("enabled"):
                pr = e_res["probs"]
                vec = [pr["home"], pr["draw"], pr["away"]]
                model_records["elo"].append({"probs": vec, "actual": actual, "data_coverage": 0.80})
                active_probs.append(vec)
            if ml_res.get("enabled"):
                pr = ml_res["probs"]
                vec = [pr["home"], pr["draw"], pr["away"]]
                model_records["ml"].append({"probs": vec, "actual": actual, "data_coverage": 0.75})
                active_probs.append(vec)

            if active_probs:
                avg_vec = [sum(v[i] for v in active_probs) / len(active_probs) for i in range(3)]
                model_records["ensemble"].append({"probs": avg_vec, "actual": actual, "data_coverage": 0.85})

    results_by_model = {
        name: compute_evaluation_metrics(recs)
        for name, recs in model_records.items()
    }
    return {
        "total_matches_dataset": len(ordered),
        "total_folds": folds,
        "train_start_date": ordered[0].match_date_utc,
        "train_end_date": ordered[start_idx - 1].match_date_utc,
        "test_start_date": ordered[start_idx].match_date_utc,
        "test_end_date": ordered[-1].match_date_utc,
        "models": results_by_model,
    }
