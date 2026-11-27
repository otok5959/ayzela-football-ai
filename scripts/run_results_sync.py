"""CLI runner for syncing completed match results and updating metrics."""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.config import ISTANBUL_TZ, get_settings
from backend.database.client import get_db_client
from backend.database.repositories import AyzelaRepository
from backend.scheduler.results_sync import sync_results_and_compute_metrics


def main() -> None:
    settings = get_settings()
    db = get_db_client()
    if settings.db_backend == "sqlite":
        db.init_schema(settings.migrations_dir)
    repo = AyzelaRepository(db)
    failover = MultiSourceFailoverManager(repo=repo)
    res = sync_results_and_compute_metrics(repo, failover)
    repo.update_scheduled_job_status(
        "results_and_learning",
        "completed",
        datetime.now(ISTANBUL_TZ).isoformat(),
    )
    print(f"Sonuç senkronizasyonu: {res}")


if __name__ == "__main__":
    main()
