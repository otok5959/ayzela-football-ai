# Cloudflare Workers API Referansı

- `GET /health` – Genel servis sağlık kontrolü
- `POST /webhook/telegram` – `X-Telegram-Bot-Api-Secret-Token` ve tek kullanıcı doğrulamalı Telegram webhook ucu
- `POST /api/auth/login` – PBKDF2 parola doğrulaması ile `HttpOnly` oturum çerezi üretir
- `POST /api/auth/logout` – Oturum çerezini temizler
- `GET /api/dashboard` – Analiz özeti, limitler ve model metrikleri
- `GET /api/fixtures` – Gerçek günlük karşılaşmalar (`is_demo = 0`)
- `GET /api/sources` – Veri kaynakları sağlık kontrol ekranı verileri
- `POST /api/sources/check` – GitHub Actions üzerinden canlı kaynak testi kuyruğa alır
- `GET /api/leagues`, `POST /api/leagues`, `PATCH /api/leagues/:orgId` – Düzenlenebilir lig beyaz listesi
- `POST /api/jobs/dispatch` – Manuel analiz kuyruğu ve GitHub Actions tetikleme
- `GET /api/logs` – Sistem ve güvenlik kayıtları
- `GET /api/backtests` – Walk-forward geriye dönük test sonuçları
