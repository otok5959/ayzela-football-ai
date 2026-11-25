"""Confirmed lineup monitor: compares confirmed XI against probable XI, recalculates, and alerts."""

from __future__ import annotations

import json
from typing import Any

from backend.agents.orchestrator import analyze_single_fixture
from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.database.repositories import AyzelaRepository
from backend.schemas import FixtureRecord, SourceProvenance
from backend.telegram.bot_client import TelegramBotClient


def detect_lineup_diff(probable: list[str], confirmed: list[str]) -> tuple[list[str], list[str]]:
    prob_set = {p.strip().lower(): p.strip() for p in probable if p.strip()}
    conf_set = {c.strip().lower(): c.strip() for c in confirmed if c.strip()}
    added = [v for k, v in conf_set.items() if k not in prob_set]
    removed = [v for k, v in prob_set.items() if k not in conf_set]
    return added, removed


def process_confirmed_lineup_update(
    repo: AyzelaRepository,
    failover: MultiSourceFailoverManager,
    fixture: FixtureRecord,
    team_side: str,
    confirmed_starters: list[str],
    formation: str | None,
    source_name: str,
    source_url: str,
    bot: TelegramBotClient | None = None,
) -> dict[str, Any]:
    """Store confirmed lineup, diff vs probable lineup, recalculate prediction revision, and notify."""
    prob_rows = repo.db.execute(
        """
        SELECT starters_json FROM lineups
        WHERE fixture_id = ? AND team_side = ? AND lineup_type = 'probable'
        ORDER BY id DESC LIMIT 1
        """,
        (fixture.fixture_id, team_side),
    )
    probable_starters = json.loads(prob_rows[0]["starters_json"]) if prob_rows else []
    added, removed = detect_lineup_diff(probable_starters, confirmed_starters)
    significant_change = len(added) >= 1 or len(removed) >= 1

    diff_summary = (
        f"Eklenenler: {', '.join(added) or '-'}; Çıkanlar: {', '.join(removed) or '-'}"
        if probable_starters
        else "Önceki muhtemel kadro kaydı yoktu; kesin ilk 11 ilk kez kaydedildi."
    )

    repo.db.execute(
        """
        INSERT INTO lineups (
            fixture_id, team_side, lineup_type, formation, starters_json,
            diff_summary_tr, source_name, source_url, fetched_at
        ) VALUES (?, ?, 'confirmed', ?, ?, ?, ?, ?, ?)
        """,
        (
            fixture.fixture_id,
            team_side,
            formation,
            json.dumps(confirmed_starters, ensure_ascii=False),
            diff_summary,
            source_name,
            source_url,
            fixture.provenance.fetched_at,
        ),
    )

    pred_rows = repo.db.execute(
        """
        SELECT prediction_id FROM match_predictions
        WHERE fixture_id = ? ORDER BY created_at_utc DESC LIMIT 1
        """,
        (fixture.fixture_id,),
    )
    revision_created = False
    if pred_rows:
        history = failover.fetch_historical_for_league(fixture.organization_id)
        bundle = analyze_single_fixture(
            fixture=fixture,
            run_id=f"lineup_{fixture.fixture_id}",
            history=history,
            news_items=[],
            lineup_info={
                f"confirmed_{team_side}": confirmed_starters,
                f"{team_side}_formation": formation,
            },
        )
        if bundle is not None:
            markets_json = json.dumps({k: v.model_dump() for k, v in bundle.markets.items()}, ensure_ascii=False)
            repo.insert_prediction_revision(
                prediction_id=pred_rows[0]["prediction_id"],
                fixture_id=fixture.fixture_id,
                reason=f"Kesin ilk 11 ({team_side}) değişikliği: {diff_summary}",
                prob_home=bundle.prob_home,
                prob_draw=bundle.prob_draw,
                prob_away=bundle.prob_away,
                markets_json=markets_json,
                data_coverage_score=bundle.data_coverage_score,
            )
            revision_created = True

    notified = False
    if significant_change and bot:
        msg = (
            f"👥 *Kesin İlk 11 Güncellemesi*\n"
            f"⚽ {fixture.home_team} - {fixture.away_team} ({team_side})\n"
            f"📋 {diff_summary}\n"
            f"📡 Kaynak: {source_name}"
        )
        res = bot.send_message(
            msg,
            dedup_key=f"lineup_{fixture.fixture_id}_{team_side}_{len(confirmed_starters)}_{'_'.join(sorted(added))[:40]}",
            notification_type="lineup_alert",
        )
        notified = bool(res.get("sent"))

    return {
        "significant_change": significant_change,
        "added": added,
        "removed": removed,
        "revision_created": revision_created,
        "notified": notified,
    }
