# AyzEla Football AI – Bulut Yayınlama Rehberi (Bilgisayar Kapalıyken Çalışma)

Bu mimaride bilgisayarınız kapalıyken bile sistem 7/24 bulut üzerinden çalışır.

## 1. Cloudflare D1 Veritabanını Oluşturma

```bash
cd workers
npx wrangler login
npx wrangler d1 create ayzela-football-db
```

Çıkan `database_id` değerini `workers/wrangler.toml` içindeki `database_id` alanına yazın, ardından tabloları ve başlangıç verilerini D1'e uygulayın:

```bash
npx wrangler d1 migrations apply ayzela-football-db --remote
```

## 2. Cloudflare Workers Gizli Değişkenlerini (Secrets) Tanımlama

Gizli anahtarlar koda veya GitHub'a yazılmaz, yalnızca `wrangler secret put` ile yüklenir:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_ALLOWED_USER_ID
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put ADMIN_SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put GITHUB_DISPATCH_TOKEN
```

Ardından Worker'ı yayınlayın:

```bash
npx wrangler deploy
```

## 3. Telegram Webhook Bağlama

Worker URL'niz örneğin `https://ayzela-football-ai-api.<hesabiniz>.workers.dev` ise:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://ayzela-football-ai-api.<hesabiniz>.workers.dev/webhook/telegram","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
```

## 4. Cloudflare Pages (PWA Yönetim Paneli)

```bash
cd ../frontend
npm run build
npx wrangler pages deploy dist --project-name ayzela-panel
```

Pages ortam değişkeni olarak `VITE_API_BASE_URL=https://ayzela-football-ai-api.<hesabiniz>.workers.dev` tanımlayın.

> **Önemli Not (Mobil / Türkiye ISS Erişimi):** PWA paneli ayrıca `workers/wrangler.toml` içindeki `[assets]` yapılandırmasıyla doğrudan Worker üzerinden (`https://ayzela-football-ai-api.<hesabiniz>.workers.dev`) de sunulmaktadır; böylece `*.pages.dev` engelli ağlarda da aynı alan adı üzerinden giriş yapılabilir.

## 5. GitHub Actions Gizli Değişkenleri

GitHub deponuzda **Settings → Secrets and variables → Actions** altına şu gizli anahtarları ekleyin:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_DATABASE_ID`
- `CLOUDFLARE_API_TOKEN` (D1 Edit yetkili)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_ID`
- `TELEGRAM_CHAT_ID`
- `PANEL_BASE_URL`

> Not: Ücretsiz GitHub Actions zamanlayıcıları yoğun saatlerde birkaç dakika gecikme yaşayabilir; sistem gecikmeyi otomatik kaydeder.
