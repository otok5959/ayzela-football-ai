"""Football market probability derivation from score matrices and verified stats."""

from __future__ import annotations

from typing import Any

import numpy as np

from backend.models.poisson import score_matrix
from backend.schemas import HistoricalMatch, MarketCategoryProbability


def compute_all_markets(
    matrix: np.ndarray | None,
    probs_1x2: dict[str, float] | None,
    lambda_home: float | None,
    lambda_away: float | None,
    history: list[HistoricalMatch] | None = None,
    team_stats: dict[str, Any] | None = None,
) -> dict[str, MarketCategoryProbability]:
    """Compute probabilities for every requested category, marking unavailable ones honestly."""
    markets: dict[str, MarketCategoryProbability] = {}

    if probs_1x2:
        markets["match_result_1x2"] = MarketCategoryProbability(
            available=True,
            probabilities={
                "1": round(probs_1x2["home"], 4),
                "X": round(probs_1x2["draw"], 4),
                "2": round(probs_1x2["away"], 4),
            },
        )
    else:
        markets["match_result_1x2"] = MarketCategoryProbability(
            available=False, reason="Yeterli veri yok"
        )

    if matrix is not None:
        max_g = matrix.shape[0] - 1
        p_btts_yes = float(matrix[1:, 1:].sum())
        p_btts_no = float(1.0 - p_btts_yes)
        markets["btts"] = MarketCategoryProbability(
            available=True,
            probabilities={"kg_var": round(p_btts_yes, 4), "kg_yok": round(p_btts_no, 4)},
        )

        # Total goals distribution (0..6+)
        total_dist: dict[str, float] = {}
        for k in range(7):
            p_k = 0.0
            for i in range(max_g + 1):
                for j in range(max_g + 1):
                    if (k < 6 and i + j == k) or (k == 6 and i + j >= 6):
                        p_k += float(matrix[i, j])
            total_dist[f"{k}_gol" if k < 6 else "6_arti_gol"] = round(p_k, 4)
        markets["total_goals_distribution"] = MarketCategoryProbability(
            available=True, probabilities=total_dist
        )

        # Over/Under 0.5, 1.5, 2.5, 3.5, 4.5
        ou_probs: dict[str, float] = {}
        for line in (0.5, 1.5, 2.5, 3.5, 4.5):
            over = 0.0
            for i in range(max_g + 1):
                for j in range(max_g + 1):
                    if i + j > line:
                        over += float(matrix[i, j])
            key = str(line).replace(".", "_")
            ou_probs[f"ust_{key}"] = round(over, 4)
            ou_probs[f"alt_{key}"] = round(1.0 - over, 4)
        markets["over_under_lines"] = MarketCategoryProbability(available=True, probabilities=ou_probs)

        # Team goal distributions (Home / Away 0, 1, 2, 3+)
        home_marg = matrix.sum(axis=1)
        away_marg = matrix.sum(axis=0)
        markets["team_goal_distributions"] = MarketCategoryProbability(
            available=True,
            probabilities={
                "ev_0": round(float(home_marg[0]), 4),
                "ev_1": round(float(home_marg[1]), 4),
                "ev_2": round(float(home_marg[2]), 4),
                "ev_3_arti": round(float(home_marg[3:].sum()), 4),
                "dep_0": round(float(away_marg[0]), 4),
                "dep_1": round(float(away_marg[1]), 4),
                "dep_2": round(float(away_marg[2]), 4),
                "dep_3_arti": round(float(away_marg[3:].sum()), 4),
            },
        )

        # Top exact scorelines
        flat_scores: list[tuple[str, float]] = []
        for i in range(max_g + 1):
            for j in range(max_g + 1):
                flat_scores.append((f"{i}-{j}", float(matrix[i, j])))
        flat_scores.sort(key=lambda x: x[1], reverse=True)
        markets["likely_scores"] = MarketCategoryProbability(
            available=True,
            probabilities={s: round(p, 4) for s, p in flat_scores[:8]},
        )
    else:
        for k in (
            "btts",
            "total_goals_distribution",
            "over_under_lines",
            "team_goal_distributions",
            "likely_scores",
        ):
            markets[k] = MarketCategoryProbability(available=False, reason="Gol dağılım matrisi için yeterli veri yok")

    # First-half / Second-half splits (empirical 44% / 56% or historical HT ratio when available)
    mat_ht = None
    mat_sh = None
    if lambda_home is not None and lambda_away is not None:
        ht_ratio = 0.44
        if history:
            ht_matches = [m for m in history if m.ht_home_goals is not None and m.ht_away_goals is not None]
            if len(ht_matches) >= 15:
                tot_ft = sum(m.home_goals + m.away_goals for m in ht_matches)
                tot_ht = sum((m.ht_home_goals or 0) + (m.ht_away_goals or 0) for m in ht_matches)
                if tot_ft > 0:
                    ht_ratio = float(np.clip(tot_ht / tot_ft, 0.35, 0.52))
        mat_ht = score_matrix(lambda_home * ht_ratio, lambda_away * ht_ratio, max_goals=4)
        mat_sh = score_matrix(lambda_home * (1.0 - ht_ratio), lambda_away * (1.0 - ht_ratio), max_goals=4)
        markets["first_half_1x2"] = MarketCategoryProbability(
            available=True,
            probabilities={
                "1": round(float(np.tril(mat_ht, k=-1).sum()), 4),
                "X": round(float(np.trace(mat_ht)), 4),
                "2": round(float(np.triu(mat_ht, k=1).sum()), 4),
            },
            extra={"iy_gol_orani": round(ht_ratio, 3)},
        )
        markets["second_half_1x2"] = MarketCategoryProbability(
            available=True,
            probabilities={
                "1": round(float(np.tril(mat_sh, k=-1).sum()), 4),
                "X": round(float(np.trace(mat_sh)), 4),
                "2": round(float(np.triu(mat_sh, k=1).sum()), 4),
            },
        )
    else:
        markets["first_half_1x2"] = MarketCategoryProbability(available=False, reason="İlk yarı gol verisi yetersiz")
        markets["second_half_1x2"] = MarketCategoryProbability(available=False, reason="İkinci yarı gol verisi yetersiz")

    # Extended pick probabilities across all live-trackable markets
    ext_probs: dict[str, float] = {}
    if probs_1x2:
        p1 = float(probs_1x2.get("home", 0.0))
        px = float(probs_1x2.get("draw", 0.0))
        p2 = float(probs_1x2.get("away", 0.0))
        ext_probs["ms_1"] = round(p1, 4)
        ext_probs["ms_x"] = round(px, 4)
        ext_probs["ms_2"] = round(p2, 4)
        ext_probs["dc_1x"] = round(min(0.99, p1 + px), 4)
        ext_probs["dc_x2"] = round(min(0.99, p2 + px), 4)
        ext_probs["dc_12"] = round(min(0.99, p1 + p2), 4)

    if matrix is not None:
        max_g = matrix.shape[0] - 1
        p_kg_v = float(matrix[1:, 1:].sum())
        ext_probs["kg_var"] = round(p_kg_v, 4)
        ext_probs["kg_yok"] = round(1.0 - p_kg_v, 4)

        for line in (1.5, 2.5, 3.5, 4.5):
            lk = str(line).replace(".", "_")
            ov = float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i + j > line))
            ext_probs[f"ust_{lk}"] = round(ov, 4)
            ext_probs[f"alt_{lk}"] = round(1.0 - ov, 4)

        for line in (0.5, 1.5, 2.5):
            lk = str(line).replace(".", "_")
            ev_ov = float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i > line))
            dep_ov = float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if j > line))
            ext_probs[f"ev_ust_{lk}"] = round(ev_ov, 4)
            ext_probs[f"ev_alt_{lk}"] = round(1.0 - ev_ov, 4)
            ext_probs[f"dep_ust_{lk}"] = round(dep_ov, 4)
            ext_probs[f"dep_alt_{lk}"] = round(1.0 - dep_ov, 4)

        for line in (1.5, 2.5, 3.5):
            lk = str(line).replace(".", "_")
            ext_probs[f"ms1_ust_{lk}"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i > j and i + j > line)), 4)
            ext_probs[f"ms1_alt_{lk}"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i > j and i + j < line)), 4)
            ext_probs[f"ms2_ust_{lk}"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if j > i and i + j > line)), 4)
            ext_probs[f"ms2_alt_{lk}"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if j > i and i + j < line)), 4)

        ext_probs["ust25_kg_var"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i + j > 2.5 and i > 0 and j > 0)), 4)
        ext_probs["alt25_kg_yok"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i + j < 2.5 and not (i > 0 and j > 0))), 4)
        ext_probs["alt25_kg_var"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i + j < 2.5 and i > 0 and j > 0)), 4)
        ext_probs["ust25_kg_yok"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i + j > 2.5 and not (i > 0 and j > 0))), 4)

        ext_probs["ms1_kg_var"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i > j and i > 0 and j > 0)), 4)
        ext_probs["ms1_kg_yok"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i > j and not (i > 0 and j > 0))), 4)
        ext_probs["ms2_kg_var"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if j > i and i > 0 and j > 0)), 4)
        ext_probs["ms2_kg_yok"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if j > i and not (i > 0 and j > 0))), 4)

        ext_probs["hnd_m1_1"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i - j >= 2)), 4)
        ext_probs["hnd_p1_2"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if j - i >= 2)), 4)

        ext_probs["gol_0_1"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if i + j <= 1)), 4)
        ext_probs["gol_2_3"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if 2 <= i + j <= 3)), 4)
        ext_probs["gol_4_5"] = round(float(sum(matrix[i, j] for i in range(max_g + 1) for j in range(max_g + 1) if 4 <= i + j <= 5)), 4)

    if mat_ht is not None:
        ht_g = mat_ht.shape[0] - 1
        iy1 = float(np.tril(mat_ht, k=-1).sum())
        iyx = float(np.trace(mat_ht))
        iy2 = float(np.triu(mat_ht, k=1).sum())
        ext_probs["iy_1"] = round(iy1, 4)
        ext_probs["iy_x"] = round(iyx, 4)
        ext_probs["iy_2"] = round(iy2, 4)
        ext_probs["iy_1x"] = round(min(0.99, iy1 + iyx), 4)
        ext_probs["iy_x2"] = round(min(0.99, iy2 + iyx), 4)
        ext_probs["iy_12"] = round(min(0.99, iy1 + iy2), 4)
        for line in (0.5, 1.5):
            lk = str(line).replace(".", "_")
            ov_ht = float(sum(mat_ht[i, j] for i in range(ht_g + 1) for j in range(ht_g + 1) if i + j > line))
            ext_probs[f"iy_ust_{lk}"] = round(ov_ht, 4)
            ext_probs[f"iy_alt_{lk}"] = round(1.0 - ov_ht, 4)
        iy_kg_v = float(mat_ht[1:, 1:].sum())
        ext_probs["iy_kg_var"] = round(iy_kg_v, 4)
        ext_probs["iy_kg_yok"] = round(1.0 - iy_kg_v, 4)

    if mat_sh is not None:
        ext_probs["2y_1"] = round(float(np.tril(mat_sh, k=-1).sum()), 4)
        ext_probs["2y_x"] = round(float(np.trace(mat_sh)), 4)
        ext_probs["2y_2"] = round(float(np.triu(mat_sh, k=1).sum()), 4)

    if ext_probs:
        markets["extended_pick_probs"] = MarketCategoryProbability(available=True, probabilities=ext_probs)
    else:
        markets["extended_pick_probs"] = MarketCategoryProbability(available=False, reason="Genişletilmiş olasılıklar için yeterli veri yok")

    # Shots, On-Target Shots, Corners, Cards — strictly data-gated (no fabrication!)
    stats = team_stats or {}
    for stat_key, label in (
        ("corners", "Korner istatistikleri açık kaynaklarda bulunamadı"),
        ("cards", "Kart istatistikleri açık kaynaklarda bulunamadı"),
        ("shots", "Şut istatistikleri açık kaynaklarda bulunamadı"),
        ("shots_on_target", "İsabetli şut istatistikleri açık kaynaklarda bulunamadı"),
    ):
        if stat_key in stats and stats[stat_key]:
            markets[stat_key] = MarketCategoryProbability(available=True, probabilities=stats[stat_key])
        else:
            markets[stat_key] = MarketCategoryProbability(available=False, reason=label)

    return markets
