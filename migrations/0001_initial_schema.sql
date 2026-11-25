-- AyzEla Football AI - Initial Schema (SQLite & Cloudflare D1 Compatible)
-- 28 core tables with foreign keys, integrity checks, and indexes.
-- Note: Permanent data is stored in D1/SQLite, never left in ephemeral GitHub Actions temp dirs.

PRAGMA foreign_keys = ON;

-- 1. users (Single authorized personal user)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    telegram_user_id TEXT UNIQUE,
    telegram_chat_id TEXT,
    role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    last_login_at TEXT
);

-- 2. user_settings
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    UNIQUE(user_id, setting_key)
);

-- 3. leagues
CREATE TABLE IF NOT EXISTS leagues (
    organization_id TEXT PRIMARY KEY,
    name_tr TEXT NOT NULL,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    tier INTEGER NOT NULL DEFAULT 1 CHECK (tier >= 1),
    category TEXT NOT NULL CHECK (category IN ('domestic_league', 'continental_club', 'international', 'international_qualifiers')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    iddaa_comp_ids_json TEXT NOT NULL DEFAULT '[]',
    external_ids_json TEXT NOT NULL DEFAULT '{}',
    aliases_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 4. teams
CREATE TABLE IF NOT EXISTS teams (
    team_id TEXT PRIMARY KEY,
    canonical_name TEXT NOT NULL,
    short_name TEXT,
    country_code TEXT,
    organization_id TEXT REFERENCES leagues(organization_id) ON DELETE SET NULL,
    elo_rating REAL NOT NULL DEFAULT 1500.0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 5. team_aliases
CREATE TABLE IF NOT EXISTS team_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    alias_name TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    source_name TEXT NOT NULL,
    UNIQUE(normalized_alias)
);
CREATE INDEX IF NOT EXISTS idx_team_aliases_norm ON team_aliases(normalized_alias);

-- 6. players
CREATE TABLE IF NOT EXISTS players (
    player_id TEXT PRIMARY KEY,
    team_id TEXT REFERENCES teams(team_id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    position TEXT,
    shirt_number INTEGER,
    nationality TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);

-- 7. fixtures
CREATE TABLE IF NOT EXISTS fixtures (
    fixture_id TEXT PRIMARY KEY,
    iddaa_event_id TEXT,
    iddaa_match_code TEXT,
    organization_id TEXT NOT NULL REFERENCES leagues(organization_id) ON DELETE RESTRICT,
    league_name TEXT NOT NULL,
    country TEXT NOT NULL,
    home_team_id TEXT REFERENCES teams(team_id) ON DELETE SET NULL,
    away_team_id TEXT REFERENCES teams(team_id) ON DELETE SET NULL,
    home_team_name TEXT NOT NULL,
    away_team_name TEXT NOT NULL,
    kickoff_utc TEXT NOT NULL,
    kickoff_tr TEXT NOT NULL,
    analysis_day_tr TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
    bulletin_source TEXT NOT NULL,
    iddaa_verified INTEGER NOT NULL DEFAULT 0 CHECK (iddaa_verified IN (0, 1)),
    available_markets_json TEXT NOT NULL DEFAULT '[]',
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
    fetched_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_fixtures_day_status ON fixtures(analysis_day_tr, status);
CREATE INDEX IF NOT EXISTS idx_fixtures_org ON fixtures(organization_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_demo ON fixtures(is_demo);

-- 8. match_results
CREATE TABLE IF NOT EXISTS match_results (
    fixture_id TEXT PRIMARY KEY REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
    home_goals INTEGER NOT NULL CHECK (home_goals >= 0),
    away_goals INTEGER NOT NULL CHECK (away_goals >= 0),
    ht_home_goals INTEGER,
    ht_away_goals INTEGER,
    outcome_1x2 TEXT NOT NULL CHECK (outcome_1x2 IN ('1', 'X', '2')),
    btts INTEGER NOT NULL CHECK (btts IN (0, 1)),
    total_goals INTEGER NOT NULL CHECK (total_goals >= 0),
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
    recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 9. team_statistics
CREATE TABLE IF NOT EXISTS team_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_id TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES leagues(organization_id) ON DELETE CASCADE,
    season TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('overall', 'home', 'away', 'last_6')),
    matches_played INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    goals_for INTEGER NOT NULL DEFAULT 0,
    goals_against INTEGER NOT NULL DEFAULT 0,
    clean_sheets INTEGER NOT NULL DEFAULT 0,
    failed_to_score INTEGER NOT NULL DEFAULT 0,
    xg REAL,
    xga REAL,
    shots_pg REAL,
    shots_on_target_pg REAL,
    corners_pg REAL,
    cards_pg REAL,
    league_rank INTEGER,
    points INTEGER,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    UNIQUE(team_id, organization_id, season, scope)
);

-- 10. player_statistics
CREATE TABLE IF NOT EXISTS player_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
    team_id TEXT NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
    season TEXT NOT NULL,
    minutes_played INTEGER NOT NULL DEFAULT 0,
    goals INTEGER NOT NULL DEFAULT 0,
    assists INTEGER NOT NULL DEFAULT 0,
    rating REAL,
    clean_sheets INTEGER,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    UNIQUE(player_id, team_id, season)
);

-- 11. injuries
CREATE TABLE IF NOT EXISTS injuries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id TEXT REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(team_id) ON DELETE SET NULL,
    team_name TEXT NOT NULL,
    player_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('injured', 'doubtful', 'recovered')),
    reason TEXT,
    confirmation_status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (confirmation_status IN ('confirmed', 'unconfirmed')),
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_at TEXT,
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_injuries_fixture ON injuries(fixture_id);

-- 12. suspensions
CREATE TABLE IF NOT EXISTS suspensions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id TEXT REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(team_id) ON DELETE SET NULL,
    team_name TEXT NOT NULL,
    player_name TEXT NOT NULL,
    reason TEXT,
    confirmation_status TEXT NOT NULL DEFAULT 'unconfirmed' CHECK (confirmation_status IN ('confirmed', 'unconfirmed')),
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_at TEXT,
    fetched_at TEXT NOT NULL
);

-- 13. lineups
CREATE TABLE IF NOT EXISTS lineups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id TEXT NOT NULL REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
    team_side TEXT NOT NULL CHECK (team_side IN ('home', 'away')),
    lineup_type TEXT NOT NULL CHECK (lineup_type IN ('probable', 'confirmed')),
    formation TEXT,
    starters_json TEXT NOT NULL,
    substitutes_json TEXT NOT NULL DEFAULT '[]',
    diff_summary_tr TEXT,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lineups_fixture ON lineups(fixture_id, lineup_type);

-- 14. news
CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    team_tag TEXT,
    organization_id TEXT,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL UNIQUE,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'verified' CHECK (verification_status IN ('verified', 'unconfirmed'))
);
CREATE INDEX IF NOT EXISTS idx_news_published ON news(published_at DESC);

-- 15. research_sources
CREATE TABLE IF NOT EXISTS research_sources (
    source_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 5,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    requires_api_key INTEGER NOT NULL DEFAULT 0 CHECK (requires_api_key IN (0, 1)),
    base_url TEXT NOT NULL,
    license_note TEXT NOT NULL,
    expected_update_cadence TEXT NOT NULL
);

-- 16. research_records
CREATE TABLE IF NOT EXISTS research_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fixture_id TEXT NOT NULL REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
    agent_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'insufficient_data', 'error')),
    data_coverage REAL NOT NULL CHECK (data_coverage >= 0.0 AND data_coverage <= 1.0),
    payload_json TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    verification_status TEXT NOT NULL CHECK (verification_status IN ('verified', 'unconfirmed', 'fallback')),
    data_type TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))
);
CREATE INDEX IF NOT EXISTS idx_research_fixture_agent ON research_records(fixture_id, agent_id);

-- 17. analysis_runs
CREATE TABLE IF NOT EXISTS analysis_runs (
    run_id TEXT PRIMARY KEY,
    run_type TEXT NOT NULL CHECK (run_type IN ('morning_0800', 'midday_1159', 'manual', 'lineup_recalc')),
    analysis_day_tr TEXT NOT NULL,
    scheduled_at_tr TEXT NOT NULL,
    actual_started_at_tr TEXT NOT NULL,
    completed_at_tr TEXT,
    delay_seconds INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'skipped_limit')),
    bulletin_source TEXT NOT NULL,
    matches_analyzed INTEGER NOT NULL DEFAULT 0 CHECK (matches_analyzed <= 30),
    avg_data_coverage REAL NOT NULL DEFAULT 0.0,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
    notes_tr TEXT
);

-- 18. match_predictions (IMMUTABLE once written; updates go to prediction_revisions)
CREATE TABLE IF NOT EXISTS match_predictions (
    prediction_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES analysis_runs(run_id) ON DELETE RESTRICT,
    fixture_id TEXT NOT NULL REFERENCES fixtures(fixture_id) ON DELETE RESTRICT,
    analysis_day_tr TEXT NOT NULL,
    model_version TEXT NOT NULL,
    prob_home REAL NOT NULL CHECK (prob_home >= 0.0 AND prob_home <= 1.0),
    prob_draw REAL NOT NULL CHECK (prob_draw >= 0.0 AND prob_draw <= 1.0),
    prob_away REAL NOT NULL CHECK (prob_away >= 0.0 AND prob_away <= 1.0),
    prob_btts_yes REAL,
    prob_over_25 REAL,
    markets_json TEXT NOT NULL,
    data_coverage_score REAL NOT NULL CHECK (data_coverage_score >= 0.0 AND data_coverage_score <= 1.0),
    research_quality_score REAL NOT NULL CHECK (research_quality_score >= 0.0 AND research_quality_score <= 1.0),
    iddaa_verified INTEGER NOT NULL DEFAULT 0 CHECK (iddaa_verified IN (0, 1)),
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
    created_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictions_fixture ON match_predictions(fixture_id);
CREATE INDEX IF NOT EXISTS idx_predictions_day ON match_predictions(analysis_day_tr);

-- 19. prediction_revisions
CREATE TABLE IF NOT EXISTS prediction_revisions (
    revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
    prediction_id TEXT NOT NULL REFERENCES match_predictions(prediction_id) ON DELETE CASCADE,
    fixture_id TEXT NOT NULL REFERENCES fixtures(fixture_id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    prob_home REAL NOT NULL,
    prob_draw REAL NOT NULL,
    prob_away REAL NOT NULL,
    markets_json TEXT NOT NULL,
    data_coverage_score REAL NOT NULL,
    created_at_utc TEXT NOT NULL
);

-- 20. model_versions
CREATE TABLE IF NOT EXISTS model_versions (
    version_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    trained_matches_count INTEGER NOT NULL DEFAULT 0,
    validation_brier REAL,
    validation_log_loss REAL,
    validation_accuracy REAL,
    created_at_utc TEXT NOT NULL
);

-- 21. model_metrics
CREATE TABLE IF NOT EXISTS model_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'all_time')),
    period_key TEXT NOT NULL,
    model_version TEXT NOT NULL,
    evaluated_matches INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    brier_score REAL NOT NULL,
    log_loss REAL NOT NULL,
    calibration_json TEXT NOT NULL,
    confusion_matrix_json TEXT NOT NULL,
    coverage_breakdown_json TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
    computed_at_utc TEXT NOT NULL,
    UNIQUE(period_type, period_key, model_version, is_demo)
);

-- 22. backtest_results
CREATE TABLE IF NOT EXISTS backtest_results (
    backtest_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    dataset_source TEXT NOT NULL,
    train_start_date TEXT NOT NULL,
    train_end_date TEXT NOT NULL,
    test_start_date TEXT NOT NULL,
    test_end_date TEXT NOT NULL,
    total_folds INTEGER NOT NULL,
    evaluated_matches INTEGER NOT NULL,
    accuracy REAL NOT NULL,
    brier_score REAL NOT NULL,
    log_loss REAL NOT NULL,
    calibration_json TEXT NOT NULL,
    confusion_matrix_json TEXT NOT NULL,
    promoted INTEGER NOT NULL DEFAULT 0 CHECK (promoted IN (0, 1)),
    notes_tr TEXT,
    created_at_utc TEXT NOT NULL
);

-- 23. scheduled_jobs
CREATE TABLE IF NOT EXISTS scheduled_jobs (
    job_key TEXT PRIMARY KEY,
    name_tr TEXT NOT NULL,
    cron_utc TEXT NOT NULL,
    schedule_tr TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    last_run_at_tr TEXT,
    last_status TEXT CHECK (last_status IN ('never', 'running', 'completed', 'failed', 'skipped_limit')),
    next_run_at_tr TEXT
);

-- 24. job_queue
CREATE TABLE IF NOT EXISTS job_queue (
    job_id TEXT PRIMARY KEY,
    job_type TEXT NOT NULL CHECK (job_type IN ('manual_analysis', 'source_health_check', 'backtest', 'lineup_check')),
    payload_json TEXT NOT NULL,
    requested_by_telegram_id TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    result_summary_tr TEXT,
    created_at_utc TEXT NOT NULL,
    started_at_utc TEXT,
    completed_at_utc TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status);

-- 25. telegram_notifications
CREATE TABLE IF NOT EXISTS telegram_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dedup_key TEXT NOT NULL UNIQUE,
    chat_id TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    message_text TEXT NOT NULL,
    sent_status TEXT NOT NULL CHECK (sent_status IN ('sent', 'dry_run', 'failed', 'blocked_limit')),
    telegram_message_id TEXT,
    created_at_utc TEXT NOT NULL
);

-- 26. system_logs
CREATE TABLE IF NOT EXISTS system_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL CHECK (level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'SECURITY')),
    module TEXT NOT NULL,
    message TEXT NOT NULL,
    details_json TEXT,
    created_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_system_logs_level_time ON system_logs(level, created_at_utc DESC);

-- 27. source_health
CREATE TABLE IF NOT EXISTS source_health (
    source_id TEXT PRIMARY KEY REFERENCES research_sources(source_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'untested' CHECK (status IN ('healthy', 'degraded', 'down', 'untested', 'disabled')),
    last_success_at TEXT,
    last_error_at TEXT,
    last_error_message TEXT,
    latency_ms INTEGER,
    http_status INTEGER,
    records_fetched INTEGER NOT NULL DEFAULT 0,
    coverage_summary TEXT NOT NULL DEFAULT 'Henüz test edilmedi',
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- 28. usage_limits
CREATE TABLE IF NOT EXISTS usage_limits (
    resource_key TEXT PRIMARY KEY,
    label_tr TEXT NOT NULL,
    period TEXT NOT NULL CHECK (period IN ('daily', 'monthly')),
    used_amount INTEGER NOT NULL DEFAULT 0,
    max_limit INTEGER NOT NULL,
    unit TEXT NOT NULL,
    warn_threshold_pct INTEGER NOT NULL DEFAULT 80,
    hard_stop_threshold_pct INTEGER NOT NULL DEFAULT 95,
    reset_at_utc TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
