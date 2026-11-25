"""CLI runner for lineup monitoring & queued manual analysis jobs."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.config import get_settings
from backend.database.client import get_db_client
from backend.database.repositories import AyzelaRepository
from backend.scheduler.daily_runner import run_daily_analysis
from backend.telegram.bot_client import TelegramBotClient


def main() -> None:
    settings = get_settings()
    db = get_db_client()
    if settings.db_backend == "sqlite":
        db.init_schema(settings.migrations_dir)
    repo = AyzelaRepository(db)
    failover = MultiSourceFailoverManager(repo=repo)
    bot = TelegramBotClient(repo)

    queued = repo.db.execute("SELECT * FROM job_queue WHERE status = 'queued' ORDER BY created_at_utc ASC LIMIT 5")
    for job in queued:
        repo.update_job_status(job["job_id"], "running")
        payload = json.loads(job["payload_json"])
        if job["job_type"] == "source_health_check":
            statuses = failover.run_all_health_checks()
            healthy = sum(1 for s in statuses if s.status == "healthy")
            summary = f"Kaynak sağlık kontrolü tamamlandı: {healthy}/{len(statuses)} sağlıklı."
            repo.update_job_status(job["job_id"], "completed", summary)
        elif job["job_type"] == "manual_analysis":
            res = run_daily_analysis(repo=repo, failover=failover, run_type="manual", send_telegram=False)
            q = str(payload.get("query", "")).lower()
            matched = [b for b in res["bundles"] if q in b.fixture.home_team.lower() or q in b.fixture.away_team.lower()]
            summary = f"Manuel analiz tamamlandı ({len(matched)} eşleşen maç)."
            repo.update_job_status(job["job_id"], "completed", summary)
            if matched:
                b = matched[0]
                bot.send_message(
                    f"🔎 *Manuel Analiz Tamamlandı*\n*{b.fixture.home_team} - {b.fixture.away_team}*\n"
                    f"1-X-2: `%{int(b.prob_home*100)}/%{int(b.prob_draw*100)}/%{int(b.prob_away*100)}` | "
                    f"Veri Kapsamı: `%{int(b.data_coverage_score*100)}`",
                    dedup_key=f"manual_job_{job['job_id']}",
                    notification_type="manual_analysis",
                )
        else:
            repo.update_job_status(job["job_id"], "completed", "İşlendi")
    print(f"Kuyruk kontrolü tamamlandı: {len(queued)} iş işlendi.")


if __name__ == "__main__":
    main()
