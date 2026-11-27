# AyzEla Football AI

Türkçe çalışan, kişisel kullanıma yönelik, **sıfır maliyetli** ve **harici LLM API bağımlılığı olmayan** otomatik futbol araştırma ve istatistiksel analiz platformu.

## Temel Özellikler

- **Ücretsiz ve Modüler Bulut Mimarisi:** Ağır Python analizleri GitHub Actions üzerinde çalışır; hafif API, kimlik doğrulama, görev tetikleme ve Telegram webhook işlemleri Cloudflare Workers + Cloudflare D1 üzerinde yürütülür; PWA arayüzü Cloudflare Pages üzerinde barınır.
- **Çok Kaynaklı Otomatik Yedeklemeli Veri Motoru:** Ana bülten kaynağı `iddaa.com`, başarısızlıkta `OpenFootball (football.json / europe / world)`, `OpenLigaDB`, `UEFA.com`, `FIFA.com`, `TFF.org`, `TheSportsDB (ücretsiz)`, `Open-Meteo`, `StatsBomb Open Data` (yalnız tarihsel kalibrasyon) ve izinli RSS kaynaklarına otomatik geçer. `football-data.co.uk` zorunlu bağımlılığı kaldırılmıştır.
- **12 Bağımsız Python Araştırma Modülü:** Hiçbiri harici ücretli LLM kullanmaz; ortak Pydantic şemasına uyar, veri yoksa uydurmaz.
- **Matematiksel Motor & Geriye Dönük Test:** Poisson, Dixon-Coles (MLE), dinamik Elo ve kronolojik scikit-learn modelleri; sıfır sızıntılı walk-forward doğrulama.
- **Türkiye Saati (`Europe/Istanbul`) Zamanlama:** Her gün `08:00` ve `11:59` bağımsız analiz (günde en fazla 250 bülten maçı taranır, en değerli 15 maç ve günlük 2x4 kupon seçilir), gece yarısı geçiş desteği ve canlı skor takibi.
- **PWA Yönetim Paneli (Mobil & Masaüstü):** Sunucu taraflı oturumlu 18 bölümlü koyu tema PWA panel (Cloudflare Workers + D1 + Assets üzerinde tek noktadan çalışır; Telegram varsayılan olarak kapalıdır).
