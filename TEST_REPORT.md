# AyzEla Football AI – Test ve Doğrulama Raporu

Tarih: **2026-11-25** (`Europe/Istanbul`)

## 1. Veritabanı ve Şema Doğrulaması
- Komut: `.\.venv\Scripts\python.exe scripts\init_local_db.py`
- Sonuç: **BAŞARILI** — SQLite üzerinde 28 tablo (`users`, `user_settings`, `leagues`, `teams`, `team_aliases`, `players`, `fixtures`, `match_results`, `team_statistics`, `player_statistics`, `injuries`, `suspensions`, `lineups`, `news`, `research_sources`, `research_records`, `analysis_runs`, `match_predictions`, `prediction_revisions`, `model_versions`, `model_metrics`, `backtest_results`, `scheduled_jobs`, `job_queue`, `telegram_notifications`, `system_logs`, `source_health`, `usage_limits`) ve başlangıç kayıtları oluşturuldu.

## 2. Canlı Veri Kaynağı Fizibilite ve Sağlık Testleri
- Komut: `.\.venv\Scripts\python.exe scripts\check_sources_live.py`
- Sonuç: **BAŞARILI**
  - `iddaa`: `HEALTHY` (HTTP 200, 218 ms, 231 ham futbol etkinliği, 30 beyaz liste karşılaşması çekildi)
  - `openfootball_json`: `HEALTHY` (HTTP 200, 171 ms, 380 maç)
  - `openfootball_europe`: `HEALTHY` (HTTP 200, 219 ms)
  - `openfootball_world`: `HEALTHY` (HTTP 200, 359 ms, 6 bölge)
  - `openligadb`: `HEALTHY` (HTTP 200, 297 ms, 306 Bundesliga maçı)
  - `uefa`: `HEALTHY` (HTTP 200, 250 ms, 10 maç örneği)
  - `fifa`: `HEALTHY` (HTTP 200, 546 ms, 20 maç)
  - `tff`: `HEALTHY` (HTTP 200, 400 ms, 20 Süper Lig takımı)
  - `statsbomb_open`: `HEALTHY` (HTTP 200, 265 ms, 66 erkek sezon arşivi)
  - `thesportsdb_free`: `HEALTHY` (HTTP 200, 187 ms)
  - `open_meteo`: `HEALTHY` (HTTP 200, 156 ms, 24 saat tahmin)
  - `rss_news`: `HEALTHY` (HTTP 200, 4/4 akış aktif, 40 haber)
  - `football_data_co_uk`: `DISABLED` (Türkiye ağından erişim engelli — zorunlu bağımlılık kaldırıldı)

## 3. Kabul Testleri (`pytest`)
- Komut: `.\.venv\Scripts\python.exe -m pytest backend\tests -v`
- Sonuç: **12 / 12 PASSED** (`46.69s`)
  - Yetkili / yetkisiz Telegram kullanıcısı ve güvenlik kaydı
  - 18 Telegram komutu ve `/analiz` kuyruğu
  - Mükerrer Telegram bildirimi engelleme (`dedup_key`)
  - Yasaklı bahis ifadesi filtresi (`kesin kazanır`, `banko`, `kupon önerisi`, `bahis miktarı`)
  - 18 lig beyaz listesi + dışlama kuralları (kadın, yaş grubu, alt lig, e-futbol, sanal, hazırlık)
  - `Europe/Istanbul` saat dilimi ve gece yarısını geçen maçların doğru analiz gününe atanması
  - 08:00 görevi, gecikme kaydı, bağımsız 11:59 yeniden hesaplaması ve maksimum 10 maç sınırı
  - Canlı İddaa & açık kaynak bağlantısı + İddaa kesintisinde `iddaa_verified=False` failover koruması
  - 12 araştırma modülü şeması, sonuç güncelleme, model sürüm yükseltme ve rollback
  - Kronolojik walk-forward backtest (sıfır gelecek sızıntısı)
  - `FREE_ONLY_MODE` ihlal engeli ve %95 kota durdurma bekçisi

## 4. Gerçek Veri Üzerinde Geriye Dönük Test (`scripts/run_backtest.py`)
- Veri seti: OpenFootball `eng_premier_league` 2025-26 + 2026-27 (**430 tamamlanmış gerçek maç**)
- Walk-forward fold sayısı: 4 (Eğitim: `2025-08-15 -> 2026-04-21`, Test: `2026-04-22 -> 2026-09-20`)
  - `poisson`: 90 maç | Accuracy=%44.4 | Brier=0.6137 | LogLoss=1.0245
  - `elo`: 93 maç | Accuracy=%44.1 | Brier=0.6179 | LogLoss=1.0318
  - `ml`: 90 maç | Accuracy=%38.9 | Brier=0.6917 | LogLoss=1.1350
  - `ensemble`: 93 maç | Accuracy=%44.1 | Brier=0.6321 | LogLoss=1.0521

## 5. Cloudflare Workers & Frontend PWA Derlemesi
- `workers`: `npx.cmd tsc --noEmit` — **BAŞARILI (0 hata)**
- `frontend`: `npm.cmd run build` (`tsc && vite build`) — **BAŞARILI (446 modül dönüştürüldü, `dist/` 14.56s içinde üretildi)**
