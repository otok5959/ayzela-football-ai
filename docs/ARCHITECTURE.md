# Mimari Genel Bakış

1. **Veri Toplama (`backend/providers/`, `backend/collectors/`):**
   Her kaynak bağımsız modüldür; `RespectfulHttpClient` domain bazlı hız sınırı, TTL önbellek ve `robots.txt` denetimi uygular. `MultiSourceFailoverManager` İddaa kesintisinde izinli açık kaynaklara geçer.
2. **Araştırma & Modeller (`backend/agents/`, `backend/models/`):**
   12 ajan ortak `AgentOutput` Pydantic şemasına uyar. Harici LLM kullanılmaz. Matematiksel motor Poisson, Dixon-Coles (MLE), Elo ve kronolojik scikit-learn modellerini birleştirir.
3. **Kalıcı Depolama (`migrations/`, `backend/database/`):**
   28 tablo SQLite ve Cloudflare D1 uyumludur. `match_predictions` satırları değiştirilemez; güncellemeler `prediction_revisions` tablosuna yazılır.
4. **Sunucu ve Arayüz (`workers/`, `frontend/`):**
   Cloudflare Workers tek kullanıcı oturum doğrulaması ve Telegram webhook'unu yürütür; React/Tailwind/Recharts PWA arayüzü Cloudflare Pages'ten sunulur.
