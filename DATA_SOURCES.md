# AyzEla Football AI – Veri Kaynakları ve Canlı Fizibilite Raporu

Son Canlı Doğrulama Tarihi: **2026-11-25** (`scripts/check_sources_live.py`)

## Kaldırılan Zorunlu Bağımlılık
- **football-data.co.uk:** Türkiye ağından erişime engelli olduğu doğrulandı (HTTP yanıtında `.erisime_engellenmis`, HTTPS bağlantısında self-signed sertifika kesintisi). Zorunlu bağımlılık tamamen kaldırıldı ve `source_health` tablosunda `disabled` olarak işaretlendi.

## Doğrulanan Ücretsiz ve İzinli Veri Kaynakları

| Kaynak ID | Adı | Durum (Canlı) | Erişim / Lisans | Güncelleme Sıklığı | Veri Kapsamı |
|---|---|---|---|---|---|
| `iddaa` | İddaa.com Bülten | `HEALTHY` (200) | Kamuya açık JSON (`robots.txt` uyumlu; `*/mac-detay/*` hariç) | Gerçek zamanlı | Ana bülten (231 ham futbol etkinliği, 127 futbol ligi) |
| `openfootball_json` | OpenFootball football.json | `HEALTHY` (200) | CC0-1.0 Kamu Malı | Günlük/Haftalık | 8 Avrupa üst ligi (`en.1`, `de.1`, `es.1`, `fr.1`, `it.1`, `nl.1`, `pt.1`, `be.1`) 2025-26 & 2026-27 |
| `openfootball_europe` | OpenFootball Europe | `HEALTHY` (200) | CC0-1.0 Kamu Malı | Haftalık | Türkiye (`tr1`), İskoçya (`sco1`), Belçika vb. Football.TXT arşivi |
| `openfootball_world` | OpenFootball World | `HEALTHY` (200) | CC0-1.0 Kamu Malı | Haftalık | Afrika, Asya, Amerika bölgeleri (TR/Avrupa dışı tamamlayıcı) |
| `openligadb` | OpenLigaDB | `HEALTHY` (200) | ODbL Açık Veritabanı | Maç günü gerçek zamanlı | Bundesliga 2026/27 tam fikstür, canlı skorlar ve puan cetveli (306 maç) |
| `uefa` | UEFA.com Maç Merkezi | `HEALTHY` (200) | Kamuya açık v5 API (`robots.txt` uyumlu) | Maç günü | UEFA Şampiyonlar Ligi, Avrupa Ligi, EURO, Uluslar Ligi |
| `fifa` | FIFA.com Takvim API | `HEALTHY` (200) | Kamuya açık v3 API (`robots.txt` uyumlu) | Günlük | Dünya Kupası ve uluslararası millî maç takvimi |
| `tff` | TFF.org Süper Lig | `HEALTHY` (200) | Resmi TFF (`windows-1254` HTML) | Maç günü | Trendyol Süper Lig resmi puan cetveli (20 takım) |
| `statsbomb_open` | StatsBomb Open Data | `HEALTHY` (200) | Açık tarihsel veri | Tarihsel arşiv | 66 erkek turnuva/sezon xG & olay verisi (**yalnız kalibrasyon/backtest**) |
| `thesportsdb_free` | TheSportsDB (key=123) | `HEALTHY` (200) | Ücretsiz genel test anahtarı | Günlük | Yedek fikstür ve sonuçlar |
| `open_meteo` | Open-Meteo | `HEALTHY` (200) | CC-BY 4.0 | Saatlik | Stadyum koordinatlarına göre maç saati hava tahmini |
| `rss_news` | Spor RSS Akışları | `HEALTHY` (200) | Resmi RSS/Atom (BBC, Guardian, TRT, NTV) | Saatlik | Sakatlık, ceza, teknik direktör haberleri (40 güncel haber) |

## Kesin Kural
Kaynakların sağlamadığı istatistikler (ör. korner, kart, şut veya kesin ilk 11 yoksa) **asla uydurulmaz**; ilgili alan `available: false` / `insufficient_data` olarak işaretlenir. Alternatif kaynaklardan gelen fikstürler `iddaa_verified = false` etiketi taşır.
