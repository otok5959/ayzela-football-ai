# AyzEla Football AI – Adım Adım Türkçe Kurulum Rehberi

## 1. Gereken Ücretsiz Hesaplar

1. **GitHub** (ücretsiz hesap — depo ve GitHub Actions zamanlanmış görevler için)
2. **Cloudflare** (ücretsiz hesap — Workers, Pages ve D1 veritabanı için)
3. **Telegram** (bot oluşturma ve kişisel ID öğrenme için):
   - Bot oluşturmak için Telegram BotFather adresini açın:
     https://t.me/BotFather
   - Kişisel User ID ve Chat ID öğrenmek için userinfobot adresini açın:
     https://t.me/userinfobot

## 2. Telegram Botunu Oluşturma

1. `https://t.me/BotFather` üzerinden `/newbot` komutunu gönderin, bot adını ve kullanıcı adını belirleyin.
2. Verilen `TELEGRAM_BOT_TOKEN` değerini kopyalayın.
3. `https://t.me/userinfobot` üzerinden kendi sayısal `Id` bilginizi alın (`TELEGRAM_ALLOWED_USER_ID` ve `TELEGRAM_CHAT_ID` olarak kullanacaksınız).
4. Botunuza en az bir kez `/start` mesajı atın ki bot size mesaj gönderebilsin.

## 3. Yerel Kurulum ve Doğrulama

```powershell
cd Projeler\ayzela-football-ai
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe scripts\init_local_db.py
.\.venv\Scripts\python.exe scripts\check_sources_live.py
.\.venv\Scripts\python.exe -m pytest backend\tests -v
```

## 4. Yönetim Paneli Parola Hash'i Üretme

Aşağıdaki tek satırlık Python komutu ile `.env` ve Cloudflare secret için `ADMIN_PASSWORD_HASH` üretin:

```powershell
.\.venv\Scripts\python.exe -c "import hashlib, os; salt=os.urandom(16).hex(); dk=hashlib.pbkdf2_hmac('sha256', b'GUCLU_PAROLANIZ', salt.encode(), 100000); print(f'pbkdf2_sha256$100000${salt}${dk.hex()}')"
```
