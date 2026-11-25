# Güvenlik Mimarisi

- **Tek Kullanıcılı Telegram Koruması:** `TELEGRAM_ALLOWED_USER_ID`, `TELEGRAM_CHAT_ID` ve `X-Telegram-Bot-Api-Secret-Token` başlığı her webhook isteğinde doğrulanır. Yetkisiz girişimler 403 ile reddedilir ve `system_logs` tablosuna `SECURITY` seviyesinde yazılır.
- **Yönetim Paneli Kimlik Doğrulaması:** PBKDF2-SHA256 parola doğrulaması + HMAC-SHA256 imzalı `HttpOnly; Secure; SameSite=Strict` oturum çerezi.
- **Sırlar ve En Az Yetki:** Hiçbir gizli anahtar frontend koduna, `wrangler.toml` içine veya git deposuna yazılmaz.
- **Erişim Kuralları:** CAPTCHA, anti-bot veya ücretli duvarlar asla aşılmaz.
