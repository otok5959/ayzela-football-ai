"""Post-match results synchronization and daily/weekly/monthly model evaluation."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from backend.backtesting.metrics import compute_evaluation_metrics
from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.collectors.team_matcher import teams_match
from backend.config import ISTANBUL_TZ
from backend.database.repositories import AyzelaRepository
from backend.schemas import HistoricalMatch


def sync_results_and_compute_metrics(
    repo: AyzelaRepository,
    failover: MultiSourceFailoverManager,
) -> dict[str, Any]:
    pending_fixtures = repo.db.execute(
        """
        SELECT f.* FROM fixtures f
        LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
        WHERE mr.fixture_id IS NULL AND f.is_demo = 0
        ORDER BY f.kickoff_utc ASC
        """
    )

    history_by_org: dict[str, list[HistoricalMatch]] = {}
    synced_count = 0
    for fx in pending_fixtures:
        org_id = fx["organization_id"]
        if org_id not in history_by_org:
            history_by_org[org_id] = failover.fetch_historical_for_league(org_id)
        for hm in history_by_org[org_id]:
            if (
                teams_match(hm.home_team, fx["home_team_name"])
                and teams_match(hm.away_team, fx["away_team_name"])
                and hm.match_date_utc[:10] == fx["kickoff_utc"][:10]
            ):
                repo.upsert_match_result(
                    fixture_id=fx["fixture_id"],
                    home_goals=hm.home_goals,
                    away_goals=hm.away_goals,
                    ht_home_goals=hm.ht_home_goals,
                    ht_away_goals=hm.ht_away_goals,
                    source_name=hm.source_name,
                    source_url=hm.source_url,
                    is_demo=False,
                )
                synced_count += 1
                break

    metrics_updated = recompute_period_metrics(repo)
    return {"synced_results": synced_count, "metrics_periods_updated": metrics_updated}


def recompute_period_metrics(repo: AyzelaRepository, ref_dt_tr: datetime | None = None) -> int:
    ref = (ref_dt_tr or datetime.now(ISTANBUL_TZ)).astimezone(ISTANBUL_TZ)
    joined = repo.db.execute(
        """
        SELECT mp.analysis_day_tr, mp.model_version, mp.prob_home, mp.prob_draw, mp.prob_away,
               mp.data_coverage_score, mr.outcome_1x2
        FROM match_predictions mp
        JOIN match_results mr ON mp.fixture_id = mr.fixture_id
        WHERE mp.is_demo = 0 AND mr.is_demo = 0
        """
    )
    if not joined:
        return 0

    today_str = ref.date().isoformat()
    week_start = (ref.date() - timedelta(days=7)).isoformat()
    month_prefix = ref.strftime("%Y-%m")

    periods = [
        ("daily", today_str, [r for r in joined if r["analysis_day_tr"] == today_str]),
        ("weekly", f"{week_start}..{today_str}", [r for r in joined if r["analysis_day_tr"] >= week_start]),
        ("monthly", month_prefix, [r for r in joined if r["analysis_day_tr"].startswith(month_prefix)]),
        ("all_time", "all", joined),
    ]

    updated = 0
    now_utc = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    for p_type, p_key, rows in periods:
        if not rows:
            continue
        recs = [
            {
                "probs": [r["prob_home"], r["prob_draw"], r["prob_away"]],
                "actual": r["outcome_1x2"],
                "data_coverage": r["data_coverage_score"],
            }
            for r in rows
        ]
        m = compute_evaluation_metrics(recs)
        repo.db.execute(
            """
            INSERT INTO model_metrics (
                period_type, period_key, model_version, evaluated_matches,
                accuracy, brier_score, log_loss, calibration_json,
                confusion_matrix_json, coverage_breakdown_json, is_demo, computed_at_utc
            ) VALUES (?, ?, 'v1.0.0-ensemble', ?, ?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT(period_type, period_key, model_version, is_demo) DO UPDATE SET
                evaluated_matches = excluded.evaluated_matches,
                accuracy = excluded.accuracy,
                brier_score = excluded.brier_score,
                log_loss = excluded.log_loss,
                calibration_json = excluded.calibration_json,
                confusion_matrix_json = excluded.confusion_matrix_json,
                coverage_breakdown_json = excluded.coverage_breakdown_json,
                computed_at_utc = excluded.computed_at_utc
            """,
            (
                p_type,
                p_key,
                m["evaluated_matches"],
                m["accuracy"],
                m["brier_score"],
                m["log_loss"],
                json.dumps(m["calibration"], ensure_ascii=False),
                json.dumps(m["confusion_matrix"], ensure_ascii=False),
                json.dumps(m["coverage_breakdown"], ensure_ascii=False),
                now_utc,
            ),
        )
        updated += 1
    return updated
