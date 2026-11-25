# AyzEla Football AI – Sıfır Maliyet ve Ücretsiz Limit Politikası

`FREE_ONLY_MODE=true` varsayılan olarak aktiftir ve kod seviyesinde ücretli futbol API'leri ile ücretli LLM API'lerinin çağrılmasını `FreeOnlyModeViolation` istisnasıyla engeller.

## Doğrulanan Güncel Ücretsiz Katman Limitleri

| Servis | Ücretsiz Kota | Sistemdeki Koruma Eşiği |
|---|---|---|
| **GitHub Actions** | Public repo: Sınırsız; Private repo: Aylık 2.000 Linux dk, 500 MB artifact | %80'de (1.600 dk) Telegram uyarısı, %95'te (1.900 dk) ağır görev durdurma |
| **Cloudflare Workers** | Günlük 100.000 istek, çağrı başına 10 ms CPU, 128 MB RAM | Ağır Python işlemleri Workers'ta değil Actions'ta çalışır |
| **Cloudflare Pages** | Sınırsız statik istek & bant genişliği, aylık 500 build | Tek SPA + PWA paketi |
| **Cloudflare D1** | Günlük 5.000.000 satır okuma, 100.000 satır yazma, 500 MB/DB | Limit aşımında UTC 00:00'a kadar sert durma olduğu için %80 uyarı / %95 koruma uygulanır |

## Not
Ücretsiz katmanlarda zamanlanmış görevlerin tam saniyesinde başlama garantisi yoktur; `analysis_runs` tablosu planlanan saat ile gerçek başlangıç saatini ve gecikmeyi kaydeder.
