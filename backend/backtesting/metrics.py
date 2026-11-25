"""Evaluation metrics: Accuracy, Multi-class Brier Score, Log Loss, Calibration Curve, Confusion Matrix."""

from __future__ import annotations

import math
from typing import Any


def compute_evaluation_metrics(records: list[dict[str, Any]]) -> dict[str, Any]:
    """
    Each record requires:
      - probs: [p_home, p_draw, p_away]
      - actual: '1' | 'X' | '2'
      - data_coverage (optional float 0..1)
    """
    if not records:
        return {
            "evaluated_matches": 0,
            "accuracy": 0.0,
            "brier_score": 0.0,
            "log_loss": 0.0,
            "calibration": [],
            "confusion_matrix": {"1": {"1": 0, "X": 0, "2": 0}, "X": {"1": 0, "X": 0, "2": 0}, "2": {"1": 0, "X": 0, "2": 0}},
            "coverage_breakdown": {},
        }

    labels = ["1", "X", "2"]
    cm = {a: {p: 0 for p in labels} for a in labels}
    correct = 0
    brier_sum = 0.0
    logloss_sum = 0.0
    bins: list[list[tuple[float, int]]] = [[] for _ in range(10)]
    cov_buckets: dict[str, list[int]] = {"yuksek_70_arti": [], "orta_40_70": [], "dusuk_40_alti": []}

    for r in records:
        p = r["probs"]
        s = sum(p)
        p_norm = [max(min(x / s, 0.999), 0.001) for x in p] if s > 0 else [1 / 3, 1 / 3, 1 / 3]
        actual = r["actual"]
        actual_idx = labels.index(actual)
        pred_idx = max(range(3), key=lambda i: p_norm[i])
        pred_label = labels[pred_idx]

        cm[actual][pred_label] += 1
        if pred_idx == actual_idx:
            correct += 1

        y_vec = [1.0 if i == actual_idx else 0.0 for i in range(3)]
        brier_sum += sum((p_norm[i] - y_vec[i]) ** 2 for i in range(3))
        logloss_sum += -math.log(p_norm[actual_idx])

        # Track top predicted probability calibration
        top_p = p_norm[pred_idx]
        bin_idx = min(int(top_p * 10), 9)
        bins[bin_idx].append((top_p, 1 if pred_idx == actual_idx else 0))

        cov = float(r.get("data_coverage", 0.5))
        hit = 1 if pred_idx == actual_idx else 0
        if cov >= 0.7:
            cov_buckets["yuksek_70_arti"].append(hit)
        elif cov >= 0.4:
            cov_buckets["orta_40_70"].append(hit)
        else:
            cov_buckets["dusuk_40_alti"].append(hit)

    n = len(records)
    calibration = []
    for b_idx, entries in enumerate(bins):
        if entries:
            mean_pred = sum(x[0] for x in entries) / len(entries)
            emp_freq = sum(x[1] for x in entries) / len(entries)
            calibration.append(
                {
                    "bin": f"%{b_idx*10}-{(b_idx+1)*10}",
                    "count": len(entries),
                    "predicted_avg": round(mean_pred, 4),
                    "actual_freq": round(emp_freq, 4),
                }
            )

    cov_summary = {
        k: {"count": len(v), "accuracy": round(sum(v) / len(v), 4) if v else 0.0}
        for k, v in cov_buckets.items()
    }

    return {
        "evaluated_matches": n,
        "accuracy": round(correct / n, 4),
        "brier_score": round(brier_sum / n, 4),
        "log_loss": round(logloss_sum / n, 4),
        "calibration": calibration,
        "confusion_matrix": cm,
        "coverage_breakdown": cov_summary,
    }
