-- AyzEla Football AI - Seed Defaults (18 Whitelist Leagues, Open Sources, Jobs, Limits)
-- Note: Sources start as 'untested' (except football_data_co_uk which is 'disabled').
-- They are ONLY marked 'healthy' after real live connection tests pass.

INSERT OR IGNORE INTO leagues (organization_id, name_tr, country, country_code, tier, category, enabled, iddaa_comp_ids_json, external_ids_json, aliases_json) VALUES
('tr_super_lig', 'Türkiye Süper Lig', 'Türkiye', 'TR', 1, 'domestic_league', 1, '[584]', '{"openfootball":"europe:turkey","tff":"198","thesportsdb":"4339"}', '["Trendyol Süper Lig","Türkiye Süper Lig","Süper Lig"]'),
('eng_premier_league', 'İngiltere Premier League', 'İngiltere', 'GB', 1, 'domestic_league', 1, '[43]', '{"openfootball":"en.1","thesportsdb":"4328"}', '["Premier League","İngiltere Premier Lig","EPL"]'),
('esp_la_liga', 'İspanya La Liga', 'İspanya', 'ES', 1, 'domestic_league', 1, '[129]', '{"openfootball":"es.1","thesportsdb":"4335"}', '["La Liga","LaLiga","İspanya La Liga"]'),
('ger_bundesliga', 'Almanya Bundesliga', 'Almanya', 'DE', 1, 'domestic_league', 1, '[45]', '{"openfootball":"de.1","openligadb":"bl1","thesportsdb":"4331"}', '["Bundesliga","1. Bundesliga","Almanya Bundesliga"]'),
('ita_serie_a', 'İtalya Serie A', 'İtalya', 'IT', 1, 'domestic_league', 1, '[143]', '{"openfootball":"it.1","thesportsdb":"4332"}', '["Serie A","İtalya Serie A"]'),
('fra_ligue_1', 'Fransa Ligue 1', 'Fransa', 'FR', 1, 'domestic_league', 1, '[381]', '{"openfootball":"fr.1","thesportsdb":"4334"}', '["Ligue 1","Fransa Ligue 1"]'),
('ned_eredivisie', 'Hollanda Eredivisie', 'Hollanda', 'NL', 1, 'domestic_league', 1, '[322]', '{"openfootball":"nl.1","thesportsdb":"4337"}', '["Eredivisie","Hollanda Eredivisie"]'),
('por_primeira_liga', 'Portekiz Primeira Liga', 'Portekiz', 'PT', 1, 'domestic_league', 1, '[566]', '{"openfootball":"pt.1","thesportsdb":"4344"}', '["Primeira Liga","Portekiz Premier Lig"]'),
('bel_pro_league', 'Belçika Pro League', 'Belçika', 'BE', 1, 'domestic_league', 1, '[1220]', '{"openfootball":"be.1","thesportsdb":"4338"}', '["Belçika Pro League","Belçika Pro Lig","Jupiler Pro League"]'),
('sco_premiership', 'İskoçya Premiership', 'İskoçya', 'SCO', 1, 'domestic_league', 1, '[19843]', '{"openfootball":"europe:scotland","thesportsdb":"4330"}', '["İskoçya Premiership","Scottish Premiership"]'),
('bra_serie_a', 'Brezilya Serie A', 'Brezilya', 'BR', 1, 'domestic_league', 1, '[348]', '{"openfootball":"world:south-america","thesportsdb":"4351"}', '["Brezilya Serie A","Brasileirao"]'),
('arg_primera', 'Arjantin Primera División', 'Arjantin', 'AR', 1, 'domestic_league', 1, '[49038,57500]', '{"openfootball":"world:south-america","thesportsdb":"4406"}', '["Arjantin Primera","Arjantin Primera LPF"]'),
('uefa_ucl', 'UEFA Şampiyonlar Ligi', 'Avrupa', 'INT', 1, 'continental_club', 1, '[126,46194]', '{"uefa":"1","thesportsdb":"4480"}', '["UEFA Şampiyonlar Ligi","Champions League"]'),
('uefa_uel', 'UEFA Avrupa Ligi', 'Avrupa', 'INT', 1, 'continental_club', 1, '[46195,588]', '{"uefa":"14","thesportsdb":"4481"}', '["UEFA Avrupa Ligi","Europa League"]'),
('fifa_world_cup', 'FIFA Dünya Kupası', 'Dünya', 'INT', 1, 'international', 1, '[]', '{"fifa":"17","thesportsdb":"4429"}', '["FIFA Dünya Kupası","World Cup"]'),
('uefa_euro', 'UEFA Avrupa Şampiyonası', 'Avrupa', 'INT', 1, 'international', 1, '[]', '{"uefa":"3","thesportsdb":"4502"}', '["UEFA Avrupa Şampiyonası","EURO"]'),
('uefa_nations_league', 'UEFA Uluslar Ligi', 'Avrupa', 'INT', 1, 'international', 1, '[1407]', '{"uefa":"2014","thesportsdb":"4490"}', '["UEFA Uluslar Ligi","Nations League"]'),
('intl_senior_qualifiers', 'Üst Düzey Millî Takım Elemeleri', 'Dünya', 'INT', 1, 'international_qualifiers', 1, '[]', '{"uefa":"2018","fifa":"qualifiers"}', '["Dünya Kupası Elemeleri","Avrupa Şampiyonası Elemeleri"]');

INSERT OR IGNORE INTO research_sources (source_id, name, role, priority, enabled, requires_api_key, base_url, license_note, expected_update_cadence) VALUES
('iddaa', 'İddaa.com Bülten', 'primary_bulletin', 1, 1, 0, 'https://sportsbookv2.iddaa.com', 'Kamuya açık bülten JSON ucu; robots.txt kurallarına uyulur.', 'gerçek zamanlı'),
('openfootball_json', 'OpenFootball football.json', 'secondary_fixtures_results', 2, 1, 0, 'https://raw.githubusercontent.com/openfootball/football.json/master', 'CC0-1.0 Kamu Malı', 'günlük/haftalık'),
('openfootball_europe', 'OpenFootball Europe', 'secondary_fixtures_results', 3, 1, 0, 'https://raw.githubusercontent.com/openfootball/europe/master', 'CC0-1.0 Kamu Malı', 'haftalık'),
('openfootball_world', 'OpenFootball World', 'secondary_fixtures_results', 4, 1, 0, 'https://raw.githubusercontent.com/openfootball/world/master', 'CC0-1.0 Kamu Malı', 'haftalık'),
('openligadb', 'OpenLigaDB', 'live_bundesliga_fixtures_results', 2, 1, 0, 'https://api.openligadb.de', 'ODbL Açık Veritabanı', 'maç günü gerçek zamanlı'),
('uefa', 'UEFA.com Maç Merkezi', 'official_continental_fixtures', 2, 1, 0, 'https://match.uefa.com', 'Kamuya açık v5 uç noktası, robots.txt uyumlu', 'maç günü'),
('fifa', 'FIFA.com Takvim API', 'official_international_fixtures', 2, 1, 0, 'https://api.fifa.com', 'Kamuya açık v3 takvim API, robots.txt uyumlu', 'günlük'),
('tff', 'TFF.org Süper Lig', 'official_turkey_standings', 2, 1, 0, 'https://www.tff.org', 'TFF resmi fikstür ve puan cetveli (windows-1254)', 'maç günü'),
('statsbomb_open', 'StatsBomb Open Data', 'historical_calibration_only', 5, 1, 0, 'https://raw.githubusercontent.com/statsbomb/open-data/master/data', 'Açık tarihsel olay/xG verisi (yalnızca kalibrasyon/backtest)', 'tarihsel arşiv'),
('thesportsdb_free', 'TheSportsDB (Ücretsiz)', 'tertiary_fixtures_results', 6, 1, 0, 'https://www.thesportsdb.com/api/v1/json/123', 'Ücretsiz genel test anahtarı (123)', 'günlük'),
('open_meteo', 'Open-Meteo Hava Durumu', 'weather_context', 3, 1, 0, 'https://api.open-meteo.com', 'CC-BY 4.0 ücretsiz hava tahmini API', 'saatlik'),
('rss_news', 'İzinli Spor RSS Akışları', 'injuries_and_news', 3, 1, 0, 'https://feeds.bbci.co.uk/sport/football/rss.xml', 'BBC, Guardian, TRT Spor, NTV Spor resmi RSS', 'saatlik'),
('football_data_co_uk', 'Football-Data.co.uk', 'disabled_legacy', 99, 0, 0, 'https://www.football-data.co.uk', 'KALDIRILDI: Türkiye ağından erişim engelli.', 'devre dışı');

INSERT OR IGNORE INTO source_health (source_id, status, coverage_summary) VALUES
('iddaa', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('openfootball_json', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('openfootball_europe', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('openfootball_world', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('openligadb', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('uefa', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('fifa', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('tff', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('statsbomb_open', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('thesportsdb_free', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('open_meteo', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('rss_news', 'untested', 'Henüz canlı bağlantı testi yapılmadı'),
('football_data_co_uk', 'disabled', 'Zorunlu bağımlılık kaldırıldı (kullanıcı erişemiyor)');

INSERT OR IGNORE INTO scheduled_jobs (job_key, name_tr, cron_utc, schedule_tr, enabled, last_status) VALUES
('morning_0800', 'Sabah Kapsamlı Analiz (08:00 TRT)', '0 5 * * *', 'Her gün 08:00 TRT', 1, 'never'),
('midday_1159', 'Öğle Bağımsız Analiz (11:59 TRT)', '59 8 * * *', 'Her gün 11:59 TRT', 1, 'never'),
('lineup_monitor', 'Kesin İlk 11 Takibi', '*/30 9-21 * * *', 'Maç günleri 30 dk arayla', 1, 'never'),
('results_and_learning', 'Sonuç Çekme & Model Öğrenmesi', '30 23 * * *', 'Her gün 02:30 TRT', 1, 'never');

INSERT OR IGNORE INTO usage_limits (resource_key, label_tr, period, used_amount, max_limit, unit, warn_threshold_pct, hard_stop_threshold_pct, reset_at_utc) VALUES
('github_actions_minutes_monthly', 'GitHub Actions Dakika (Aylık)', 'monthly', 0, 2000, 'dakika', 80, 95, strftime('%Y-%m-01T00:00:00Z', 'now', '+1 month')),
('cloudflare_workers_requests_daily', 'Cloudflare Workers İstek (Günlük)', 'daily', 0, 100000, 'istek', 80, 95, strftime('%Y-%m-%dT00:00:00Z', 'now', '+1 day')),
('cloudflare_d1_reads_daily', 'Cloudflare D1 Okuma (Günlük)', 'daily', 0, 5000000, 'satır', 80, 95, strftime('%Y-%m-%dT00:00:00Z', 'now', '+1 day')),
('cloudflare_d1_writes_daily', 'Cloudflare D1 Yazma (Günlük)', 'daily', 0, 100000, 'satır', 80, 95, strftime('%Y-%m-%dT00:00:00Z', 'now', '+1 day')),
('cloudflare_pages_builds_monthly', 'Cloudflare Pages Build (Aylık)', 'monthly', 0, 500, 'build', 80, 95, strftime('%Y-%m-01T00:00:00Z', 'now', '+1 month')),
('telegram_messages_daily', 'Telegram Mesaj Kotası (Günlük)', 'daily', 0, 200, 'mesaj', 80, 95, strftime('%Y-%m-%dT00:00:00Z', 'now', '+1 day'));

INSERT OR IGNORE INTO model_versions (version_id, model_name, parameters_json, is_active, trained_matches_count, created_at_utc) VALUES
('v1.0.0-ensemble', 'Poisson + Dixon-Coles + Elo + Calibrated ML', '{"weights":{"poisson":0.30,"dixon_coles":0.35,"elo":0.20,"ml":0.15}}', 1, 0, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
