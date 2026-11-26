-- Daily 2x4 auto-coupons, self-learning market family weights, and multi-user Telegram subscribers.
CREATE TABLE IF NOT EXISTS daily_coupons (
    coupon_id TEXT PRIMARY KEY,
    analysis_day_tr TEXT NOT NULL,
    run_id TEXT NOT NULL,
    coupon_slot INTEGER NOT NULL,
    coupon_type TEXT NOT NULL,
    title_tr TEXT NOT NULL,
    total_odd REAL NOT NULL,
    combined_probability REAL NOT NULL,
    legs_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at_utc TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_daily_coupons_day ON daily_coupons(analysis_day_tr, coupon_slot, created_at_utc DESC);

CREATE TABLE IF NOT EXISTS market_learning_weights (
    family TEXT PRIMARY KEY,
    sample_count INTEGER NOT NULL DEFAULT 0,
    hit_rate REAL NOT NULL DEFAULT 0.5,
    avg_odd REAL NOT NULL DEFAULT 1.7,
    roi REAL NOT NULL DEFAULT 0.0,
    weight REAL NOT NULL DEFAULT 1.0,
    updated_at_utc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS telegram_subscribers (
    telegram_user_id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at_utc TEXT NOT NULL
);
