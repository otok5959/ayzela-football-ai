-- Top-15 daily selection, top-3 picks per match, and live/finished match tracking columns.
ALTER TABLE match_predictions ADD COLUMN top_picks_json TEXT;
ALTER TABLE match_predictions ADD COLUMN is_selected_top15 INTEGER NOT NULL DEFAULT 0;
ALTER TABLE match_predictions ADD COLUMN selection_rank INTEGER;
ALTER TABLE match_predictions ADD COLUMN selection_score REAL;

ALTER TABLE fixtures ADD COLUMN live_home_goals INTEGER;
ALTER TABLE fixtures ADD COLUMN live_away_goals INTEGER;
ALTER TABLE fixtures ADD COLUMN live_ht_home_goals INTEGER;
ALTER TABLE fixtures ADD COLUMN live_ht_away_goals INTEGER;
ALTER TABLE fixtures ADD COLUMN live_minute TEXT;
ALTER TABLE fixtures ADD COLUMN live_status_label TEXT;
ALTER TABLE fixtures ADD COLUMN live_updated_at_utc TEXT;

CREATE INDEX IF NOT EXISTS idx_predictions_day_top15 ON match_predictions(analysis_day_tr, is_selected_top15, selection_rank);
