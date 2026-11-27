"""Run chronological walk-forward backtest on real OpenFootball / OpenLigaDB data."""

from __future__ import annotations

import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.backtesting.version_manager import ModelVersionManager
from backend.backtesting.walk_forward import run_walk_forward_backtest
from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.config import get_settings
from backend.database.client import get_db_client
from backend.database.repositories import AyzelaRepository


def main() -> None:
    settings = get_settings()
    db = get_db_client()
    if settings.db_backend == "sqlite":
        db.init_schema(settings.migrations_dir)
    repo = AyzelaRepository(db)
    mgr = MultiSourceFailoverManager(repo=repo)

    print("Gerçek geçmiş maç verisi çekiliyor (OpenFootball eng_premier_league 2025-26 + 2026-27)...")
    matches = mgr.openfootball_json.fetch_historical_matches("eng_premier_league", seasons=["2025-26", "2026-27"])
    print(f"Toplam tamamlanmış maç: {len(matches)}")

    report = run_walk_forward_backtest(matches, min_train_matches=120, fold_size=25, max_eval_matches=100)
    print(f"Walk-forward fold sayısı: {report['total_folds']}")
    print(f"Eğitim aralığı: {report['train_start_date'][:10]} -> {report['train_end_date'][:10]}")
    print(f"Test aralığı:   {report['test_start_date'][:10]} -> {report['test_end_date'][:10]}")

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for model_name, m in report["models"].items():
        if m["evaluated_matches"] == 0:
            continue
        print(
            f"  [{model_name:10s}] maç={m['evaluated_matches']} | "
            f"Accuracy=%{m['accuracy']*100:.1f} | Brier={m['brier_score']:.4f} | LogLoss={m['log_loss']:.4f}"
        )
        repo.db.execute(
            """
            INSERT INTO backtest_results (
                backtest_id, model_name, model_version, dataset_source,
                train_start_date, train_end_date, test_start_date, test_end_date,
                total_folds, evaluated_matches, accuracy, brier_score, log_loss,
                calibration_json, confusion_matrix_json, promoted, notes_tr, created_at_utc
            ) VALUES (?, ?, 'v1.0.0-ensemble', 'openfootball_json:eng_premier_league', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            """,
            (
                f"bt_{model_name}_{uuid.uuid4().hex[:8]}",
                model_name,
                report["train_start_date"],
                report["train_end_date"],
                report["test_start_date"],
                report["test_end_date"],
                report["total_folds"],
                m["evaluated_matches"],
                m["accuracy"],
                m["brier_score"],
                m["log_loss"],
                json.dumps(m["calibration"], ensure_ascii=False),
                json.dumps(m["confusion_matrix"], ensure_ascii=False),
                "Gerçek OpenFootball verisi üzerinde kronolojik walk-forward testi",
                now,
            ),
        )

    ens_m = report["models"].get("ensemble")
    if ens_m and ens_m.get("evaluated_matches", 0) > 0:
        try:
            vm = ModelVersionManager(repo)
            promoted = vm.register_and_maybe_promote(
                version_id=f"v1.0.0-wf-{now[:10]}",
                model_name="Poisson + Dixon-Coles + Elo + Calibrated ML",
                parameters={"weights": {"poisson": 0.30, "dixon_coles": 0.35, "elo": 0.20, "ml": 0.15}},
                trained_matches_count=int(ens_m["evaluated_matches"]),
                validation_brier=float(ens_m["brier_score"]),
                validation_log_loss=float(ens_m["log_loss"]),
                validation_accuracy=float(ens_m["accuracy"]),
            )
            print(f"Model sürüm değerlendirmesi tamamlandı (promoted={promoted}).")
        except Exception as exc:
            repo.log("WARNING", "scripts.run_backtest", f"Model sürüm kaydı atlandı: {exc}")


if __name__ == "__main__":
    main()
