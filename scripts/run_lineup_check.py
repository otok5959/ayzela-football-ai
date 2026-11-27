"""CLI runner for lineup monitoring, live score sync, & queued manual analysis jobs."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.config import ISTANBUL_TZ, get_settings
from backend.database.client import get_db_client
from backend.database.repositories import AyzelaRepository
from backend.scheduler.daily_runner import run_daily_analysis
from backend.scheduler.results_sync import sync_results_and_compute_metrics
from backend.telegram.bot_client import TelegramBotClient


def _process_single_job(
    repo: AyzelaRepository,
    failover: MultiSourceFailoverManager,
    bot: TelegramBotClient,
    job: dict,
    telegram_enabled: bool,
) -> None:
    repo.update_job_status(job["job_id"], "running")
    payload = json.loads(job.get("payload_json") or "{}")
    job_type = job.get("job_type")

    if job_type == "source_health_check":
        statuses = failover.run_all_health_checks()
        healthy = sum(1 for s in statuses if s.status == "healthy")
        summary = f"Kaynak sağlık kontrolü tamamlandı: {healthy}/{len(statuses)} sağlıklı."
        repo.update_job_status(job["job_id"], "completed", summary)
        return

    if job_type == "manual_analysis":
        q = str(payload.get("query", "")).strip().lower()
        is_full_now = payload.get("mode") == "full_now" or not q
        if is_full_now:
            res = run_daily_analysis(
                repo=repo,
                failover=failover,
                run_type="manual",
                send_telegram=telegram_enabled,
            )
            summary = f"Anlık analiz tamamlandı ({len(res['bundles'])} maç)."
            repo.update_job_status(job["job_id"], "completed", summary)
        else:
            res = run_daily_analysis(
                repo=repo,
                failover=failover,
                run_type="manual",
                send_telegram=False,
            )
            matched = [
                b
                for b in res["bundles"]
                if q in b.fixture.home_team.lower() or q in b.fixture.away_team.lower()
            ]
            summary = f"Manuel analiz tamamlandı ({len(matched)} eşleşen maç)."
            repo.update_job_status(job["job_id"], "completed", summary)
            if telegram_enabled:
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
                    bot.send_message(
                        f"🔎 Bugünkü pencerede `{payload.get('query', '')}` için eşleşen maç bulunamadı.",
                        dedup_key=f"manual_job_{job['job_id']}_empty",
                        notification_type="manual_analysis",
                    )
        return

    repo.update_job_status(job["job_id"], "completed", "İşlendi")


def main() -> None:
    settings = get_settings()
    db = get_db_client()
    if settings.db_backend == "sqlite":
        db.init_schema(settings.migrations_dir)
    repo = AyzelaRepository(db)
    failover = MultiSourceFailoverManager(repo=repo)
    bot = TelegramBotClient(repo)

    dispatch_job_id = os.getenv("DISPATCH_JOB_ID", "").strip()
    dispatch_task = os.getenv("DISPATCH_TASK", "").strip()

    if dispatch_job_id:
        queued = repo.db.execute(
            "SELECT * FROM job_queue WHERE job_id = ? AND status = 'queued'",
            (dispatch_job_id,),
        )
        if not queued:
            queued = repo.db.execute(
                "SELECT * FROM job_queue WHERE status = 'queued' ORDER BY created_at_utc ASC LIMIT 5"
            )
    else:
        queued = repo.db.execute(
            "SELECT * FROM job_queue WHERE status = 'queued' ORDER BY created_at_utc ASC LIMIT 5"
        )

    processed = 0
    for job in queued:
        try:
            _process_single_job(repo, failover, bot, job, settings.telegram_enabled)
            processed += 1
        except Exception as exc:
            err_msg = f"Hata: {str(exc)[:280]}"
            repo.update_job_status(job["job_id"], "failed", err_msg)
            repo.log("ERROR", "scripts.run_lineup_check", f"İş başarısız ({job['job_id']}): {exc}")

    # Direct GitHub Actions manual trigger without pre-queued DB row
    if not queued and dispatch_task:
        try:
            if dispatch_task == "source_health_check":
                failover.run_all_health_checks()
                processed += 1
            elif dispatch_task in ("manual_analysis", "full_now"):
                run_daily_analysis(
                    repo=repo,
                    failover=failover,
                    run_type="manual",
                    send_telegram=settings.telegram_enabled,
                )
                processed += 1
        except Exception as exc:
            repo.log("ERROR", "scripts.run_lineup_check", f"Manuel dispatch ({dispatch_task}) başarısız: {exc}")

    # Silent live & finished score sync
    sync_summary = sync_results_and_compute_metrics(repo=repo, failover=failover)
    repo.update_scheduled_job_status(
        "lineup_monitor",
        "completed",
        datetime.now(ISTANBUL_TZ).isoformat(),
    )
    print(
        f"Kuyruk kontrolü tamamlandı: {processed}/{len(queued)} iş işlendi. "
        f"Sessiz skor güncelleme: {sync_summary.get('synced_results', 0)} biten maç."
    )


if __name__ == "__main__":
    main()
