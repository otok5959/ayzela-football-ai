"""Parameterized repository methods covering all 28 tables."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from backend.database.client import DatabaseClient
from backend.schemas import (
    AgentOutput,
    FixtureRecord,
    MatchPredictionBundle,
    NewsItem,
    SourceHealthStatus,
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class AyzelaRepository:
    def __init__(self, db: DatabaseClient) -> None:
        self.db = db

    # --- Source Health ---
    def upsert_source_health(self, health: SourceHealthStatus) -> None:
        self.db.execute(
            """
            INSERT INTO source_health (
                source_id, status, last_success_at, last_error_at, last_error_message,
                latency_ms, http_status, records_fetched, coverage_summary, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_id) DO UPDATE SET
                status = excluded.status,
                last_success_at = COALESCE(excluded.last_success_at, source_health.last_success_at),
                last_error_at = COALESCE(excluded.last_error_at, source_health.last_error_at),
                last_error_message = excluded.last_error_message,
                latency_ms = excluded.latency_ms,
                http_status = excluded.http_status,
                records_fetched = excluded.records_fetched,
                coverage_summary = excluded.coverage_summary,
                updated_at = excluded.updated_at
            """,
            (
                health.source_id,
                health.status,
                health.last_success_at,
                health.last_error_at,
                health.last_error_message,
                health.latency_ms,
                health.http_status,
                health.records_fetched,
                health.coverage_summary,
                health.updated_at,
            ),
        )

    def list_source_health(self) -> list[dict[str, Any]]:
        return self.db.execute(
            """
            SELECT rs.source_id, rs.name, rs.role, rs.priority, rs.enabled,
                   rs.requires_api_key, rs.base_url, rs.license_note, rs.expected_update_cadence,
                   sh.status, sh.last_success_at, sh.last_error_at, sh.last_error_message,
                   sh.latency_ms, sh.http_status, sh.records_fetched, sh.coverage_summary, sh.updated_at
            FROM research_sources rs
            LEFT JOIN source_health sh ON rs.source_id = sh.source_id
            ORDER BY rs.priority ASC, rs.source_id ASC
            """
        )

    # --- Leagues ---
    def list_leagues(self, enabled_only: bool = False) -> list[dict[str, Any]]:
        if enabled_only:
            return self.db.execute("SELECT * FROM leagues WHERE enabled = 1 ORDER BY name_tr")
        return self.db.execute("SELECT * FROM leagues ORDER BY enabled DESC, name_tr")

    def set_league_enabled(self, organization_id: str, enabled: bool) -> None:
        self.db.execute(
            "UPDATE leagues SET enabled = ?, updated_at = ? WHERE organization_id = ?",
            (1 if enabled else 0, utc_now_iso(), organization_id),
        )

    def add_league(
        self,
        organization_id: str,
        name_tr: str,
        country: str,
        country_code: str,
        category: str = "domestic_league",
        iddaa_comp_ids: list[int] | None = None,
        aliases: list[str] | None = None,
    ) -> None:
        self.db.execute(
            """
            INSERT INTO leagues (
                organization_id, name_tr, country, country_code, tier, category, enabled,
                iddaa_comp_ids_json, external_ids_json, aliases_json, updated_at
            ) VALUES (?, ?, ?, ?, 1, ?, 1, ?, '{}', ?, ?)
            ON CONFLICT(organization_id) DO UPDATE SET
                name_tr = excluded.name_tr,
                enabled = 1,
                updated_at = excluded.updated_at
            """,
            (
                organization_id,
                name_tr,
                country,
                country_code,
                category,
                json.dumps(iddaa_comp_ids or []),
                json.dumps(aliases or [name_tr], ensure_ascii=False),
                utc_now_iso(),
            ),
        )

    # --- Teams & Fixtures ---
    def upsert_team(self, team_id: str, canonical_name: str, country_code: str | None = None, organization_id: str | None = None) -> None:
        self.db.execute(
            """
            INSERT INTO teams (team_id, canonical_name, country_code, organization_id, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(team_id) DO UPDATE SET
                canonical_name = excluded.canonical_name,
                updated_at = excluded.updated_at
            """,
            (team_id, canonical_name, country_code, organization_id, utc_now_iso()),
        )

    def upsert_fixture(self, f: FixtureRecord) -> None:
        if f.home_team_id:
            self.upsert_team(f.home_team_id, f.home_team, organization_id=f.organization_id)
        if f.away_team_id:
            self.upsert_team(f.away_team_id, f.away_team, organization_id=f.organization_id)
        self.db.execute(
            """
            INSERT INTO fixtures (
                fixture_id, iddaa_event_id, iddaa_match_code, organization_id, league_name,
                country, home_team_id, away_team_id, home_team_name, away_team_name,
                kickoff_utc, kickoff_tr, analysis_day_tr, status, bulletin_source,
                iddaa_verified, available_markets_json, is_demo, fetched_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fixture_id) DO UPDATE SET
                status = excluded.status,
                kickoff_utc = excluded.kickoff_utc,
                kickoff_tr = excluded.kickoff_tr,
                analysis_day_tr = excluded.analysis_day_tr,
                bulletin_source = excluded.bulletin_source,
                iddaa_verified = excluded.iddaa_verified,
                available_markets_json = excluded.available_markets_json,
                fetched_at = excluded.fetched_at,
                updated_at = excluded.updated_at
            """,
            (
                f.fixture_id,
                f.iddaa_event_id,
                f.iddaa_match_code,
                f.organization_id,
                f.league_name,
                f.country,
                f.home_team_id,
                f.away_team_id,
                f.home_team,
                f.away_team,
                f.kickoff_utc,
                f.kickoff_tr,
                f.analysis_day_tr,
                f.status,
                f.bulletin_source,
                1 if f.iddaa_verified else 0,
                json.dumps(f.available_markets, ensure_ascii=False),
                1 if f.is_demo else 0,
                f.provenance.fetched_at,
                utc_now_iso(),
            ),
        )

    def list_fixtures_for_day(self, analysis_day_tr: str, include_demo: bool = False) -> list[dict[str, Any]]:
        if include_demo:
            return self.db.execute(
                "SELECT * FROM fixtures WHERE analysis_day_tr = ? ORDER BY kickoff_tr ASC",
                (analysis_day_tr,),
            )
        return self.db.execute(
            "SELECT * FROM fixtures WHERE analysis_day_tr = ? AND is_demo = 0 ORDER BY kickoff_tr ASC",
            (analysis_day_tr,),
        )

    def save_research_record(self, out: AgentOutput, is_demo: bool = False) -> None:
        prov = out.provenance[0] if out.provenance else None
        self.db.execute(
            """
            INSERT INTO research_records (
                fixture_id, agent_id, agent_name, status, data_coverage, payload_json,
                source_name, source_url, published_at, fetched_at, verification_status,
                data_type, is_demo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                out.fixture_id,
                out.agent_id,
                out.agent_name,
                out.status,
                out.data_coverage,
                json.dumps({"summary_tr": out.summary_tr, "metrics": out.metrics, "warnings": out.warnings}, ensure_ascii=False),
                prov.source_name if prov else "internal_model",
                prov.source_url if prov else "internal://ayzela",
                prov.published_at if prov else None,
                prov.fetched_at if prov else utc_now_iso(),
                prov.verification_status if prov else "verified",
                prov.data_type if prov else "agent_analysis",
                1 if is_demo else 0,
            ),
        )

    # --- Analysis Runs & Immutable Predictions ---
    def create_analysis_run(
        self,
        run_id: str,
        run_type: str,
        analysis_day_tr: str,
        scheduled_at_tr: str,
        actual_started_at_tr: str,
        delay_seconds: int,
        bulletin_source: str,
        is_demo: bool = False,
    ) -> None:
        self.db.execute(
            """
            INSERT INTO analysis_runs (
                run_id, run_type, analysis_day_tr, scheduled_at_tr, actual_started_at_tr,
                delay_seconds, status, bulletin_source, is_demo
            ) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)
            """,
            (
                run_id,
                run_type,
                analysis_day_tr,
                scheduled_at_tr,
                actual_started_at_tr,
                delay_seconds,
                bulletin_source,
                1 if is_demo else 0,
            ),
        )

    def complete_analysis_run(
        self,
        run_id: str,
        status: str,
        completed_at_tr: str,
        matches_analyzed: int,
        avg_data_coverage: float,
        notes_tr: str = "",
    ) -> None:
        self.db.execute(
            """
            UPDATE analysis_runs
            SET status = ?, completed_at_tr = ?, matches_analyzed = ?, avg_data_coverage = ?, notes_tr = ?
            WHERE run_id = ?
            """,
            (status, completed_at_tr, matches_analyzed, avg_data_coverage, notes_tr, run_id),
        )

    def insert_immutable_prediction(self, bundle: MatchPredictionBundle) -> None:
        """Insert a new immutable prediction row. Never overwrites existing predictions."""
        markets_dict = {k: v.model_dump() for k, v in bundle.markets.items()}
        self.db.execute(
            """
            INSERT INTO match_predictions (
                prediction_id, run_id, fixture_id, analysis_day_tr, model_version,
                prob_home, prob_draw, prob_away, prob_btts_yes, prob_over_25,
                markets_json, data_coverage_score, research_quality_score,
                iddaa_verified, is_demo, created_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                bundle.prediction_id,
                bundle.run_id,
                bundle.fixture.fixture_id,
                bundle.fixture.analysis_day_tr,
                bundle.model_version,
                bundle.prob_home,
                bundle.prob_draw,
                bundle.prob_away,
                bundle.prob_btts_yes,
                bundle.prob_over_25,
                json.dumps(markets_dict, ensure_ascii=False),
                bundle.data_coverage_score,
                bundle.research_quality_score,
                1 if bundle.fixture.iddaa_verified else 0,
                1 if bundle.is_demo else 0,
                bundle.created_at_utc,
            ),
        )

    def insert_prediction_revision(
        self,
        prediction_id: str,
        fixture_id: str,
        reason: str,
        prob_home: float,
        prob_draw: float,
        prob_away: float,
        markets_json: str,
        data_coverage_score: float,
    ) -> None:
        self.db.execute(
            """
            INSERT INTO prediction_revisions (
                prediction_id, fixture_id, reason, prob_home, prob_draw, prob_away,
                markets_json, data_coverage_score, created_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                prediction_id,
                fixture_id,
                reason,
                prob_home,
                prob_draw,
                prob_away,
                markets_json,
                data_coverage_score,
                utc_now_iso(),
            ),
        )

    # --- Match Results ---
    def upsert_match_result(
        self,
        fixture_id: str,
        home_goals: int,
        away_goals: int,
        source_name: str,
        source_url: str,
        ht_home_goals: int | None = None,
        ht_away_goals: int | None = None,
        is_demo: bool = False,
    ) -> None:
        outcome = "1" if home_goals > away_goals else ("2" if away_goals > home_goals else "X")
        btts = 1 if (home_goals > 0 and away_goals > 0) else 0
        total = home_goals + away_goals
        self.db.execute(
            """
            INSERT INTO match_results (
                fixture_id, home_goals, away_goals, ht_home_goals, ht_away_goals,
                outcome_1x2, btts, total_goals, source_name, source_url, is_demo, recorded_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fixture_id) DO UPDATE SET
                home_goals = excluded.home_goals,
                away_goals = excluded.away_goals,
                outcome_1x2 = excluded.outcome_1x2,
                btts = excluded.btts,
                total_goals = excluded.total_goals,
                recorded_at = excluded.recorded_at
            """,
            (
                fixture_id,
                home_goals,
                away_goals,
                ht_home_goals,
                ht_away_goals,
                outcome,
                btts,
                total,
                source_name,
                source_url,
                1 if is_demo else 0,
                utc_now_iso(),
            ),
        )
        self.db.execute(
            "UPDATE fixtures SET status = 'finished', updated_at = ? WHERE fixture_id = ?",
            (utc_now_iso(), fixture_id),
        )

    # --- News ---
    def save_news_items(self, items: list[NewsItem]) -> int:
        inserted = 0
        for item in items:
            existing = self.db.execute("SELECT id FROM news WHERE source_url = ?", (item.source_url,))
            if existing:
                continue
            self.db.execute(
                """
                INSERT INTO news (
                    title, summary, team_tag, organization_id, source_name, source_url,
                    published_at, fetched_at, verification_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item.title,
                    item.summary,
                    item.team_tag,
                    item.organization_id,
                    item.source_name,
                    item.source_url,
                    item.published_at,
                    item.fetched_at,
                    item.verification_status,
                ),
            )
            inserted += 1
        return inserted

    # --- Telegram Notifications (Idempotency / Dedup) ---
    def was_notification_sent(self, dedup_key: str) -> bool:
        rows = self.db.execute(
            "SELECT id FROM telegram_notifications WHERE dedup_key = ?",
            (dedup_key,),
        )
        return len(rows) > 0

    def record_telegram_notification(
        self,
        dedup_key: str,
        chat_id: str,
        notification_type: str,
        message_text: str,
        sent_status: str,
        telegram_message_id: str | None = None,
    ) -> bool:
        if self.was_notification_sent(dedup_key):
            return False
        self.db.execute(
            """
            INSERT INTO telegram_notifications (
                dedup_key, chat_id, notification_type, message_text,
                sent_status, telegram_message_id, created_at_utc
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                dedup_key,
                chat_id,
                notification_type,
                message_text,
                sent_status,
                telegram_message_id,
                utc_now_iso(),
            ),
        )
        return True

    # --- Job Queue ---
    def enqueue_job(
        self,
        job_type: str,
        payload: dict[str, Any],
        requested_by_telegram_id: str | None = None,
    ) -> str:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        self.db.execute(
            """
            INSERT INTO job_queue (
                job_id, job_type, payload_json, requested_by_telegram_id, status, created_at_utc
            ) VALUES (?, ?, ?, ?, 'queued', ?)
            """,
            (
                job_id,
                job_type,
                json.dumps(payload, ensure_ascii=False),
                requested_by_telegram_id,
                utc_now_iso(),
            ),
        )
        return job_id

    def update_job_status(self, job_id: str, status: str, result_summary_tr: str | None = None) -> None:
        now = utc_now_iso()
        if status == "running":
            self.db.execute(
                "UPDATE job_queue SET status = ?, started_at_utc = ? WHERE job_id = ?",
                (status, now, job_id),
            )
        else:
            self.db.execute(
                "UPDATE job_queue SET status = ?, completed_at_utc = ?, result_summary_tr = ? WHERE job_id = ?",
                (status, now, result_summary_tr, job_id),
            )

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        rows = self.db.execute("SELECT * FROM job_queue WHERE job_id = ?", (job_id,))
        return rows[0] if rows else None

    # --- System Logs ---
    def log(self, level: str, module: str, message: str, details: dict[str, Any] | None = None) -> None:
        self.db.execute(
            """
            INSERT INTO system_logs (level, module, message, details_json, created_at_utc)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                level,
                module,
                message,
                json.dumps(details, ensure_ascii=False) if details else None,
                utc_now_iso(),
            ),
        )

    # --- Usage Limits ---
    def list_usage_limits(self) -> list[dict[str, Any]]:
        return self.db.execute("SELECT * FROM usage_limits ORDER BY resource_key")

    def increment_usage(self, resource_key: str, amount: int = 1) -> dict[str, Any] | None:
        self.db.execute(
            """
            UPDATE usage_limits
            SET used_amount = used_amount + ?, updated_at = ?
            WHERE resource_key = ?
            """,
            (amount, utc_now_iso(), resource_key),
        )
        rows = self.db.execute("SELECT * FROM usage_limits WHERE resource_key = ?", (resource_key,))
        return rows[0] if rows else None
