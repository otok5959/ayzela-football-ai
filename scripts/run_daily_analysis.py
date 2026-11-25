"""CLI runner for 08:00 and 11:59 scheduled analyses."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.config import get_settings
from backend.database.client import get_db_client
from backend.database.repositories import AyzelaRepository
from backend.scheduler.daily_runner import run_daily_analysis


def main() -> None:
    parser = argparse.ArgumentParser(description="AyzEla günlük analiz çalıştırıcısı")
    parser.add_argument("--run-type", choices=["morning_0800", "midday_1159", "manual"], default="morning_0800")
    parser.add_argument("--no-telegram", action="store_true")
    args = parser.parse_args()

    settings = get_settings()
    db = get_db_client()
    if settings.db_backend == "sqlite":
        db.init_schema(settings.migrations_dir)
    repo = AyzelaRepository(db)
    failover = MultiSourceFailoverManager(repo=repo)
    res = run_daily_analysis(repo=repo, failover=failover, run_type=args.run_type, send_telegram=not args.no_telegram)
    print(f"Tamamlandı: run_id={res['run_id']}, maç={len(res.get('bundles', []))}, kaynak={res.get('bulletin_source')}")


if __name__ == "__main__":
    main()
