# AyzEla Football AI – Proje Durum Raporu

Son Güncelleme: **2026-11-25** (`Europe/Istanbul`)

| Aşama | Açıklama | Durum |
|---|---|---|
| Aşama 1 | Ücretsiz servisler ve veri kaynakları canlı doğrulaması (`football-data.co.uk` kaldırıldı) | ✅ Tamamlandı |
| Aşama 2 | Klasör yapısı, `.venv`, 28 tablolu SQLite/D1 şeması ve seed verileri | ✅ Tamamlandı |
| Aşama 3 | İddaa.com + 11 açık veri adaptörü, otomatik yedekleme ve lig filtresi | ✅ Tamamlandı |
| Aşama 4 | 12 bağımsız Python araştırma modülü (harici LLM olmadan) | ✅ Tamamlandı |
| Aşama 5 | Poisson, Dixon-Coles (MLE), Elo, ML modelleri ve pazar olasılık hesaplayıcısı | ✅ Tamamlandı |
| Aşama 6 | PWA odaklı çalışma modu (Telegram opsiyonel/kapalı, çekirdek bildirim altyapısı testli) | ✅ Tamamlandı |
| Aşama 7 | Sonuç senkronizasyonu, metrikler, walk-forward backtest ve sürüm geri alma | ✅ Tamamlandı |
| Aşama 8 | 18 bölümlü koyu tema mobil uyumlu PWA yönetim paneli ve gelişmiş kontrol ekranı | ✅ Tamamlandı |
| Aşama 9 | Cloudflare Workers API, D1 bağlayıcıları ve 6 GitHub Actions iş akışı | ✅ Tamamlandı |
| Aşama 10 | Güvenlik, entegrasyon, canlı kaynak ve performans kabul testleri | ✅ Tamamlandı |

## Açıkça Belirtilen Kısıtlar ve Dikkat Edilecek Noktalar
- **Ücretsiz Kaynak Kapsam Sınırı:** Açık ve anahtarsız kaynakların birçoğu maç öncesi kesin ilk 11, korner, kart ve şut sayılarını her ligde sağlamaz. Sistem bu alanları **asla uydurmaz**, `available: false` / `insufficient_data` olarak bildirir.
- **OpenFootball Güncelleme Gecikmesi:** `openfootball/europe` içindeki `2026-27_tr1.txt` dosyası test anında henüz aktif sezon maç satırı içermiyordu; canlı Türkiye bülteni için `iddaa.com` ve puan durumu için `tff.org` aktif olarak kullanılmaktadır.
- **Bulut Yayını:** Kullanıcı kendi GitHub, Cloudflare ve Telegram hesap anahtarlarını (`SETUP_TR.md` ve `DEPLOYMENT_TR.md` adımlarıyla) tanımladıktan sonra bilgisayar kapalıyken bulut çalışması devreye girer; bu ortamda kullanıcının canlı Cloudflare/Telegram token'ları mevcut olmadığından buluta canlı deploy yapılmamıştır.
