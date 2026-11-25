"""Model version registry, controlled promotion, and rollback support."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from backend.database.repositories import AyzelaRepository


class ModelVersionManager:
    def __init__(self, repo: AyzelaRepository) -> None:
        self.repo = repo

    def get_active_version(self) -> dict[str, Any] | None:
        rows = self.repo.db.execute("SELECT * FROM model_versions WHERE is_active = 1 LIMIT 1")
        return rows[0] if rows else None

    def register_and_maybe_promote(
        self,
        version_id: str,
        model_name: str,
        parameters: dict[str, Any],
        trained_matches_count: int,
        validation_brier: float,
        validation_log_loss: float,
        validation_accuracy: float,
        min_test_matches: int = 30,
    ) -> bool:
        """Promote a candidate version only if it beats the active version's Brier & LogLoss."""
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        current = self.get_active_version()
        should_promote = False
        if trained_matches_count >= min_test_matches:
            if current is None or current.get("validation_brier") is None:
                should_promote = True
            elif (
                validation_brier < float(current["validation_brier"])
                and validation_log_loss <= float(current["validation_log_loss"]) + 0.01
            ):
                should_promote = True

        if should_promote:
            self.repo.db.execute("UPDATE model_versions SET is_active = 0")

        self.repo.db.execute(
            """
            INSERT INTO model_versions (
                version_id, model_name, parameters_json, is_active, trained_matches_count,
                validation_brier, validation_log_loss, validation_accuracy, created_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(version_id) DO UPDATE SET
                is_active = excluded.is_active,
                validation_brier = excluded.validation_brier,
                validation_log_loss = excluded.validation_log_loss,
                validation_accuracy = excluded.validation_accuracy
            """,
            (
                version_id,
                model_name,
                json.dumps(parameters),
                1 if should_promote else 0,
                trained_matches_count,
                validation_brier,
                validation_log_loss,
                validation_accuracy,
                now,
            ),
        )
        return should_promote

    def rollback_to_version(self, version_id: str) -> None:
        rows = self.repo.db.execute("SELECT version_id FROM model_versions WHERE version_id = ?", (version_id,))
        if not rows:
            raise ValueError(f"Model sürümü bulunamadı: {version_id}")
        self.repo.db.execute("UPDATE model_versions SET is_active = 0")
        self.repo.db.execute("UPDATE model_versions SET is_active = 1 WHERE version_id = ?", (version_id,))
