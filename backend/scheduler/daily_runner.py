"""Daily 08:00 and 11:59 independent analysis runner with 10-match cap, failover alert, and dedup."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from backend.agents.agent_01_bulletin import filter_and_dedup_bulletin
from backend.agents.orchestrator import analyze_single_fixture
from backend.analytics.report_formatter import format_daily_report_tr
from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.config import ISTANBUL_TZ, get_settings
from backend.database.repositories import AyzelaRepository
from backend.schemas import HistoricalMatch, MatchPredictionBundle, NewsItem, TeamStandingRow
from backend.scheduler.usage_guard import UsageLimitGuard
from backend.scheduler.windows import get_analysis_window
from backend.telegram.bot_client import TelegramBotClient
from backend.validation.league_filter import LeagueFilter


def run_daily_analysis(
    repo: AyzelaRepository,
    failover: MultiSourceFailoverManager,
    run_type: str = "morning_0800",
    now_tr: datetime | None = None,
    bot: TelegramBotClient | None = None,
    send_telegram: bool = True,
) -> dict[str, Any]:
    """
    Execute an independent daily analysis pass (08:00 or 11:59 TRT).
    11:59 never copies 08:00 results; it re-queries sources and re-computes models from scratch.
    """
    settings = get_settings()
    guard = UsageLimitGuard(repo)
    bot_client = bot or TelegramBotClient(repo)
    win = get_analysis_window(run_type, now_tr=now_tr)

    actual_start = (now_tr or datetime.now(ISTANBUL_TZ)).astimezone(ISTANBUL_TZ)
    delay_seconds = max(int((actual_start - win.scheduled_at_tr).total_seconds()), 0)
    run_id = f"run_{win.analysis_day_tr}_{run_type}_{uuid.uuid4().hex[:8]}"

    limit_res = guard.check_and_consume("github_actions_minutes_monthly", units=2, heavy_task=True)
    if not limit_res.allowed:
        repo.create_analysis_run(
            run_id=run_id,
            run_type=run_type,
            analysis_day_tr=win.analysis_day_tr,
            scheduled_at_tr=win.scheduled_at_tr.isoformat(),
            actual_started_at_tr=actual_start.isoformat(),
            delay_seconds=delay_seconds,
            bulletin_source="none",
        )
        repo.complete_analysis_run(
            run_id=run_id,
            status="skipped_limit",
            completed_at_tr=datetime.now(ISTANBUL_TZ).isoformat(),
            matches_analyzed=0,
            avg_data_coverage=0.0,
            notes_tr=limit_res.message_tr,
        )
        if send_telegram:
            bot_client.send_message(
                limit_res.message_tr,
                dedup_key=f"limit_stop_{win.analysis_day_tr}_{run_type}",
                notification_type="limit_alert",
            )
        return {"run_id": run_id, "status": "skipped_limit", "bundles": []}

    if limit_res.warning and send_telegram:
        bot_client.send_message(
            limit_res.message_tr,
            dedup_key=f"limit_warn_{win.analysis_day_tr}_{limit_res.resource_key}",
            notification_type="limit_alert",
        )

    # Load dynamic league whitelist from DB
    db_leagues = repo.list_leagues(enabled_only=False)
    league_filter = LeagueFilter.from_db_rows(db_leagues)
    failover.league_filter = league_filter
    failover.iddaa.league_filter = league_filter

    bulletin = failover.fetch_bulletin_with_failover()
    repo.create_analysis_run(
        run_id=run_id,
        run_type=run_type,
        analysis_day_tr=win.analysis_day_tr,
        scheduled_at_tr=win.scheduled_at_tr.isoformat(),
        actual_started_at_tr=actual_start.isoformat(),
        delay_seconds=delay_seconds,
        bulletin_source=bulletin.primary_source,
    )

    if bulletin.used_fallback and send_telegram:
        fb_msg = (
            f"⚠️ *Kaynak Değişikliği Bildirimi*\n"
            f"Ana kaynak İddaa.com erişilemediği için izinli yedek kaynaklara geçildi: "
            f"`{', '.join(bulletin.fallback_sources) or 'yok'}`.\n"
            f"Not: Bu veriler İddaa.com tarafından doğrulanmamıştır."
        )
        bot_client.send_message(
            fb_msg,
            dedup_key=f"source_failover_{win.analysis_day_tr}_{run_type}",
            notification_type="source_alert",
        )

    # Filter upcoming scheduled matches inside the [window_start, window_end) window
    candidates = filter_and_dedup_bulletin(
        bulletin.fixtures,
        league_filter=league_filter,
        window_start_tr=win.window_start_tr,
        window_end_tr=win.window_end_tr,
    )

    # Fetch news once per run (respectful rate limit)
    try:
        news_items: list[NewsItem] = failover.rss_news.fetch_all_news(limit_per_feed=10)
        repo.save_news_items(news_items)
    except Exception:
        news_items = []

    history_cache: dict[str, list[HistoricalMatch]] = {}
    standings_cache: dict[str, list[TeamStandingRow]] = {}
    bundles: list[MatchPredictionBundle] = []

    # Respect daily distinct match cap (max 10 distinct matches per analysis_day_tr)
    existing_day_fixtures = {
        r["fixture_id"]
        for r in repo.db.execute(
            "SELECT DISTINCT fixture_id FROM match_predictions WHERE analysis_day_tr = ? AND is_demo = 0",
            (win.analysis_day_tr,),
        )
    }

    for fx in candidates:
        repo.upsert_team(fx.home_team_id or fx.home_team, fx.home_team, organization_id=fx.organization_id)
        repo.upsert_team(fx.away_team_id or fx.away_team, fx.away_team, organization_id=fx.organization_id)
        repo.upsert_fixture(fx)

        if fx.organization_id not in history_cache:
            history_cache[fx.organization_id] = failover.fetch_historical_for_league(fx.organization_id)
        if fx.organization_id == "tr_super_lig" and "tr_super_lig" not in standings_cache:
            try:
                standings_cache["tr_super_lig"] = failover.tff.fetch_standings()
            except Exception:
                standings_cache["tr_super_lig"] = []
        elif fx.organization_id == "ger_bundesliga" and "ger_bundesliga" not in standings_cache:
            try:
                standings_cache["ger_bundesliga"] = failover.openligadb.fetch_standings()
            except Exception:
                standings_cache["ger_bundesliga"] = []

        weather = None
        try:
            country_code = (league_filter.by_org_id.get(fx.organization_id) or {}).get("country_code", "INT")
            weather = failover.open_meteo.fetch_match_weather(fx.home_team, country_code, fx.kickoff_utc)
        except Exception:
            weather = None

        bundle = analyze_single_fixture(
            fixture=fx,
            run_id=run_id,
            history=history_cache[fx.organization_id],
            news_items=news_items,
            standings=standings_cache.get(fx.organization_id),
            weather=weather,
        )
        if bundle is not None:
            bundles.append(bundle)

    # Sort by data_coverage_score & research_quality_score, enforce max 10 cap
    bundles.sort(key=lambda b: (b.data_coverage_score, b.research_quality_score), reverse=True)
    if run_type == "midday_1159" and existing_day_fixtures:
        # Midday 11:59 can re-analyze same day fixtures and add new ones up to total 10 distinct
        remaining_new = max(settings.daily_max_matches - len(existing_day_fixtures), 0)
        selected: list[MatchPredictionBundle] = []
        new_added = 0
        for b in bundles:
            if b.fixture.fixture_id in existing_day_fixtures:
                selected.append(b)
            elif new_added < remaining_new:
                selected.append(b)
                new_added += 1
        bundles = selected[: settings.daily_max_matches]
    else:
        bundles = bundles[: settings.daily_max_matches]

    for b in bundles:
        for out in b.agent_outputs:
            repo.save_research_record(out, is_demo=b.is_demo)
        repo.insert_immutable_prediction(b)

    avg_cov = round(sum(b.data_coverage_score for b in bundles) / len(bundles), 4) if bundles else 0.0
    repo.complete_analysis_run(
        run_id=run_id,
        status="completed",
        completed_at_tr=datetime.now(ISTANBUL_TZ).isoformat(),
        matches_analyzed=len(bundles),
        avg_data_coverage=avg_cov,
        notes_tr=f"{len(candidates)} aday içinden {len(bundles)} maç analiz edildi (gecikme={delay_seconds}s).",
    )

    if run_type == "morning_0800":
        label = "Sabah Analizi (08:00 TRT)"
        dedup_key = f"daily_report_{win.analysis_day_tr}_{run_type}"
    elif run_type == "midday_1159":
        label = "Öğle Bağımsız Analiz (11:59 TRT)"
        dedup_key = f"daily_report_{win.analysis_day_tr}_{run_type}"
    else:
        label = "Anlık Manuel Analiz (TRT)"
        dedup_key = f"manual_report_{run_id}"

    report_text = format_daily_report_tr(
        bundles=bundles,
        run_type_label=label,
        analysis_day_tr=win.analysis_day_tr,
        bulletin_source=bulletin.primary_source,
        panel_url=settings.panel_base_url,
        used_fallback=bulletin.used_fallback,
        max_matches=settings.daily_max_matches,
    )

    tg_result = None
    if send_telegram:
        tg_result = bot_client.send_message(
            text=report_text,
            dedup_key=dedup_key,
            notification_type="daily_report",
        )

    return {
        "run_id": run_id,
        "analysis_day_tr": win.analysis_day_tr,
        "status": "completed",
        "delay_seconds": delay_seconds,
        "bulletin_source": bulletin.primary_source,
        "used_fallback": bulletin.used_fallback,
        "candidates_count": len(candidates),
        "bundles": bundles,
        "report_text": report_text,
        "telegram": tg_result,
    }
