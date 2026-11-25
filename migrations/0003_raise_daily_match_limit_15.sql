-- Relax CHECK constraint on analysis_runs.matches_analyzed to support DAILY_MAX_MATCHES=15 (up to 30)
PRAGMA defer_foreign_keys = ON;

CREATE TABLE analysis_runs_new (
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

INSERT INTO analysis_runs_new SELECT * FROM analysis_runs;
DROP TABLE analysis_runs;
ALTER TABLE analysis_runs_new RENAME TO analysis_runs;
