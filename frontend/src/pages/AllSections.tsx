import React, { useState } from "react";
import { CalibrationCurveChart, ModelPerformanceChart } from "../components/Charts";
import { FixtureRow, ISOLATED_DEMO_PREVIEW, LeagueRow, SourceHealthRow, UsageLimitRow } from "../services/api";

export type PanelTabId =
  | "dashboard"
  | "fixtures"
  | "research"
  | "match_detail"
  | "lineups"
  | "leagues"
  | "history"
  | "results"
  | "performance"
  | "sources"
  | "agents"
  | "jobs"
  | "logs"
  | "limits"
  | "telegram"
  | "settings";

export const PANEL_SECTIONS: Array<{ id: PanelTabId; title: string; short: string }> = [
  { id: "dashboard", title: "1. Ana Kontrol Ekranı", short: "Panel" },
  { id: "fixtures", title: "2. Günlük Karşılaşmalar", short: "Maçlar" },
  { id: "research", title: "3. Araştırma Merkezi", short: "Araştır" },
  { id: "match_detail", title: "4. Karşılaşma Detayları", short: "Detay" },
  { id: "lineups", title: "5. Oyuncu ve Kadro Bilgileri", short: "Kadrolar" },
  { id: "leagues", title: "6. Lig Yönetimi", short: "Ligler" },
  { id: "history", title: "7. Geçmiş Analizler", short: "Geçmiş" },
  { id: "results", title: "8. Sonuç Takip Merkezi", short: "Sonuçlar" },
  { id: "performance", title: "9. Model Performans Grafikleri", short: "Grafikler" },
  { id: "sources", title: "10. Veri Kaynakları & Sağlık", short: "Kaynaklar" },
  { id: "agents", title: "11. Araştırma Modülleri (12 Ajan)", short: "Ajanlar" },
  { id: "jobs", title: "12. Otomatik Görev Yönetimi", short: "Görevler" },
  { id: "logs", title: "13. Hata Kayıtları", short: "Kayıtlar" },
  { id: "limits", title: "14. Bulut Kullanım Limitleri", short: "Limitler" },
  { id: "telegram", title: "15. Telegram Ayarları", short: "Telegram" },
  { id: "settings", title: "16. Genel Sistem Ayarları", short: "Ayarlar" },
];

const AGENT_LIST = [
  ["Agent 01", "Bülten Araştırmacısı", "Fikstür doğrulama, saat & lig filtresi"],
  ["Agent 02", "Form Analisti", "Son 6 maç + sezon geneli shrinkage"],
  ["Agent 03", "Ev / Deplasman Analisti", "Son 6 iç saha / dış saha ayrımı"],
  ["Agent 04", "Oyuncu Performans Analisti", "Süre, gol/asist, muhtemel/kesin ilk 11"],
  ["Agent 05", "Sakatlık & Ceza Araştırmacısı", "Kaynaklı ve tarihli sakat/cezalı taraması"],
  ["Agent 06", "Gol & Hücum Analisti", "Gol dağılımı, İY/2Y, xG/şut (varsa)"],
  ["Agent 07", "Geçmiş Karşılaşma (H2H)", "Son 6 H2H + zaman çürümesi uyarısı"],
  ["Agent 08", "Taktik Analisti", "Kaynaklı diziliş ve teknik ekip verisi"],
  ["Agent 09", "Motivasyon & Fikstür", "Sıralama, hedef baskısı, dinlenme günü"],
  ["Agent 10", "Çevresel Faktör Analisti", "Open-Meteo stadyum hava durumu"],
  ["Agent 11", "Matematiksel Analiz Uzmanı", "Poisson, Dixon-Coles, Elo, ML Ensemble"],
  ["Agent 12", "Veri Doğrulama & Denetim", "Tutarlılık, güncellik, kalibrasyon denetimi"],
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    healthy: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    degraded: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    down: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    untested: "bg-slate-600/30 text-slate-300 border-slate-500/40",
    disabled: "bg-slate-800 text-slate-400 border-slate-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${map[status] || map.untested}`}>
      {status.toUpperCase()}
    </span>
  );
}

export function PanelContent({
  tab,
  fixtures,
  sources,
  leagues,
  limits,
  logs,
  selectedFixture,
  onSelectFixture,
  onToggleLeague,
  onAddLeague,
  onDispatchQuery,
  onRunSourceCheck,
  onRunAnalysisNow,
  runningNow,
  isDemoMode,
}: {
  tab: PanelTabId;
  fixtures: FixtureRow[];
  sources: SourceHealthRow[];
  leagues: LeagueRow[];
  limits: UsageLimitRow[];
  logs: any[];
  selectedFixture: FixtureRow | null;
  onSelectFixture: (f: FixtureRow) => void;
  onToggleLeague: (id: string, enabled: boolean) => void;
  onAddLeague: (p: { organization_id: string; name_tr: string; country: string; country_code: string }) => void;
  onDispatchQuery: (q: string) => void;
  onRunSourceCheck: () => void;
  onRunAnalysisNow: () => void;
  runningNow: boolean;
  isDemoMode: boolean;
}) {
  const [query, setQuery] = useState("");
  const [newLeagueId, setNewLeagueId] = useState("");
  const [newLeagueName, setNewLeagueName] = useState("");
  const [newLeagueCountry, setNewLeagueCountry] = useState("");
  const [newLeagueCode, setNewLeagueCode] = useState("");

  const healthyCount = sources.filter((s) => s.status === "healthy").length;
  const avgCov = fixtures.length
    ? Math.round((fixtures.reduce((acc, f) => acc + (f.data_coverage_score || 0), 0) / fixtures.length) * 100)
    : 0;

  if (tab === "dashboard") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <div className="text-xs text-slate-400">Analiz Edilen Maç</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400">{fixtures.length} / 15</div>
            <div className="mt-1 text-xs text-slate-500">Günlük üst sınır aktif</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <div className="text-xs text-slate-400">Ort. Veri Kapsamı</div>
            <div className="mt-1 text-2xl font-bold text-sky-400">%{avgCov}</div>
            <div className="mt-1 text-xs text-slate-500">Olasılık değildir</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <div className="text-xs text-slate-400">Sağlıklı Veri Kaynağı</div>
            <div className="mt-1 text-2xl font-bold text-emerald-300">{healthyCount} / {sources.length}</div>
            <div className="mt-1 text-xs text-slate-500">Ücretsiz açık kaynaklar</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <div className="text-xs text-slate-400">Sonraki Görev (TRT)</div>
            <div className="mt-1 text-2xl font-bold text-amber-300">11:59 / 08:00</div>
            <div className="mt-1 text-xs text-slate-500">Europe/Istanbul</div>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Model Doğruluk Karşılaştırması</h3>
            <ModelPerformanceChart data={ISOLATED_DEMO_PREVIEW.performanceSeries} />
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-200">Olasılık Kalibrasyon Eğrisi</h3>
            <CalibrationCurveChart data={ISOLATED_DEMO_PREVIEW.calibrationSeries} />
          </div>
        </div>
      </div>
    );
  }

  if (tab === "fixtures" || tab === "history" || tab === "results") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-100">
          {tab === "fixtures" ? "Günlük Karşılaşmalar (Maks. 15)" : tab === "history" ? "Değiştirilemez Geçmiş Analizler" : "Sonuç Takip Merkezi"}
        </h2>
        <div className="grid gap-3">
          {fixtures.map((f) => (
            <div key={f.fixture_id} className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-emerald-400">{f.league_name} • {f.kickoff_tr.slice(0, 16).replace("T", " ")} TRT</div>
                  <div className="text-base font-semibold text-white">{f.home_team_name} - {f.away_team_name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs ${f.iddaa_verified ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                    {f.iddaa_verified ? "İddaa Onaylı" : `Yedek (${f.bulletin_source})`}
                  </span>
                  <button
                    onClick={() => onSelectFixture(f)}
                    className="rounded-lg bg-slate-700 px-3 py-1 text-xs font-medium text-white hover:bg-slate-600"
                  >
                    Detay
                  </button>
                </div>
              </div>
              {f.prob_home !== undefined && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded bg-pitch-900 p-2">1-X-2: %{Math.round(f.prob_home * 100)} / %{Math.round((f.prob_draw || 0) * 100)} / %{Math.round((f.prob_away || 0) * 100)}</div>
                  <div className="rounded bg-pitch-900 p-2">KG Var: %{Math.round((f.prob_btts_yes || 0) * 100)}</div>
                  <div className="rounded bg-pitch-900 p-2">2.5 Üst: %{Math.round((f.prob_over_25 || 0) * 100)}</div>
                  <div className="rounded bg-pitch-900 p-2 text-sky-300">Veri Kapsamı: %{Math.round((f.data_coverage_score || 0) * 100)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "research") {
    return (
      <div className="rounded-xl border border-slate-800 bg-pitch-800 p-5 space-y-4">
        <h2 className="text-lg font-semibold">Araştırma Merkezi (Manuel Analiz Kuyruğu)</h2>
        <p className="text-sm text-slate-400">Takım veya karşılaşma adı girerek GitHub Actions kuyruğuna gerçek araştırma görevi ekleyin.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Örn: Galatasaray, Real Madrid..."
            className="flex-1 rounded-lg border border-slate-700 bg-pitch-900 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => { if (query.trim()) { onDispatchQuery(query.trim()); setQuery(""); } }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Araştırmayı Kuyruğa Ekle
          </button>
        </div>
      </div>
    );
  }

  if (tab === "match_detail" || tab === "lineups") {
    const fx = selectedFixture || fixtures[0];
    return (
      <div className="space-y-4 rounded-xl border border-slate-800 bg-pitch-800 p-5">
        <h2 className="text-lg font-semibold">{tab === "lineups" ? "Oyuncu ve Kadro Bilgileri" : "Karşılaşma Detayları"}</h2>
        {fx ? (
          <>
            <div className="text-base font-bold text-emerald-300">{fx.home_team_name} - {fx.away_team_name}</div>
            <div className="text-xs text-slate-400">{fx.league_name} • {fx.kickoff_tr} • Kaynak: {fx.bulletin_source}</div>
            <p className="text-sm text-slate-300">
              {tab === "lineups"
                ? "Kesin ilk 11 maçtan önce açık kaynaklardan taranır; doğrulanmayan muhtemel kadrolar kesinmiş gibi sunulmaz."
                : "12 bağımsız araştırma modülünün çıktıları, gol matrisi olasılıkları ve veri kapsam skoru burada ayrı ayrı gösterilir."}
            </p>
          </>
        ) : (
          <div className="text-sm text-slate-400">Seçili karşılaşma bulunmuyor.</div>
        )}
      </div>
    );
  }

  if (tab === "leagues") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Lig Yönetimi (Düzenlenebilir Beyaz Liste)</h2>
        <div className="grid gap-2 rounded-xl border border-slate-800 bg-pitch-800 p-4 sm:grid-cols-5">
          <input value={newLeagueId} onChange={(e) => setNewLeagueId(e.target.value)} placeholder="org_id (örn: tr_kupa)" className="rounded border border-slate-700 bg-pitch-900 px-2 py-1.5 text-xs" />
          <input value={newLeagueName} onChange={(e) => setNewLeagueName(e.target.value)} placeholder="Lig Adı (TR)" className="rounded border border-slate-700 bg-pitch-900 px-2 py-1.5 text-xs" />
          <input value={newLeagueCountry} onChange={(e) => setNewLeagueCountry(e.target.value)} placeholder="Ülke" className="rounded border border-slate-700 bg-pitch-900 px-2 py-1.5 text-xs" />
          <input value={newLeagueCode} onChange={(e) => setNewLeagueCode(e.target.value)} placeholder="Ülke Kodu (TR)" className="rounded border border-slate-700 bg-pitch-900 px-2 py-1.5 text-xs" />
          <button
            onClick={() => {
              if (newLeagueId && newLeagueName) {
                onAddLeague({ organization_id: newLeagueId, name_tr: newLeagueName, country: newLeagueCountry || "Diğer", country_code: newLeagueCode || "INT" });
                setNewLeagueId(""); setNewLeagueName("");
              }
            }}
            className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Lig Ekle
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((lg) => (
            <div key={lg.organization_id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-pitch-800 p-3">
              <div>
                <div className="text-sm font-medium text-white">{lg.name_tr}</div>
                <div className="text-xs text-slate-400">{lg.country} • `{lg.organization_id}`</div>
              </div>
              <button
                onClick={() => onToggleLeague(lg.organization_id, !lg.enabled)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${lg.enabled ? "bg-emerald-600/30 text-emerald-300" : "bg-slate-700 text-slate-300"}`}
              >
                {lg.enabled ? "Aktif" : "Pasif"}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "performance") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Model Performans & Kalibrasyon Grafikleri</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <ModelPerformanceChart data={ISOLATED_DEMO_PREVIEW.performanceSeries} />
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <CalibrationCurveChart data={ISOLATED_DEMO_PREVIEW.calibrationSeries} />
          </div>
        </div>
      </div>
    );
  }

  if (tab === "sources") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Veri Kaynakları Sağlık Kontrol Ekranı</h2>
            <p className="text-xs text-slate-400">Her kaynağın son başarılı bağlantısı, veri kapsamı, hata durumu ve gecikmesi.</p>
          </div>
          <button
            onClick={onRunSourceCheck}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
          >
            Canlı Bağlantı Testi Başlat
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-pitch-800">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-700 text-slate-400">
              <tr>
                <th className="p-3">Kaynak</th>
                <th className="p-3">Durum</th>
                <th className="p-3">Son Başarılı Bağlantı</th>
                <th className="p-3">Gecikme</th>
                <th className="p-3">Kapsam / Hata Özeti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sources.map((s) => (
                <tr key={s.source_id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-medium text-white">
                    {s.name}
                    <div className="text-[11px] text-slate-400">{s.source_id}</div>
                  </td>
                  <td className="p-3"><StatusBadge status={s.status || "untested"} /></td>
                  <td className="p-3 text-slate-300">{s.last_success_at || "-"}</td>
                  <td className="p-3 text-slate-300">{s.latency_ms !== null ? `${s.latency_ms} ms` : "-"}</td>
                  <td className="p-3 text-slate-300">
                    {s.coverage_summary}
                    {s.last_error_message && <div className="mt-1 text-rose-400">Hata: {s.last_error_message}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tab === "agents") {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Araştırma Modüllerinin Durum Ekranı (Harici LLM Bağımsız)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_LIST.map(([id, name, desc]) => (
            <div key={id} className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400">{id}</span>
                <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] text-emerald-300">Hazır</span>
              </div>
              <div className="mt-1 font-semibold text-white">{name}</div>
              <div className="mt-1 text-xs text-slate-400">{desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tab === "limits") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Bulut Kullanım Limitleri (FREE_ONLY_MODE: Aktif)</h2>
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">Sıfır Maliyet Koruması Açık</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {limits.map((lim) => {
            const pct = lim.max_limit ? Math.min(100, (lim.used_amount / lim.max_limit) * 100) : 0;
            return (
              <div key={lim.resource_key} className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
                <div className="flex justify-between text-sm font-medium">
                  <span>{lim.label_tr}</span>
                  <span className="text-slate-300">{lim.used_amount} / {lim.max_limit} {lim.unit}</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-slate-400">Uyarı: %{lim.warn_threshold_pct} • Durdurma: %{lim.hard_stop_threshold_pct}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (tab === "jobs") {
    return (
      <div className="space-y-4 rounded-xl border border-slate-800 bg-pitch-800 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Otomatik Görev Yönetimi (GitHub Actions)</h2>
          <button
            onClick={onRunAnalysisNow}
            disabled={runningNow}
            className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {runningNow ? "⏳ Analiz Başlatılıyor..." : "⚡ Şimdi Analiz Et"}
          </button>
        </div>
        <ul className="space-y-2 text-sm text-slate-300">
          <li>• 08:00 TRT – Birinci kapsamlı analiz (`daily_0800_analysis.yml`)</li>
          <li>• 11:59 TRT – İkinci bağımsız analiz (`daily_1159_analysis.yml`)</li>
          <li>• 30 dk aralık – Kesin ilk 11 ve kuyruk takibi (`lineup_monitor.yml`)</li>
          <li>• 02:30 TRT – Maç sonuçları ve walk-forward öğrenme (`results_and_learning.yml`)</li>
        </ul>
      </div>
    );
  }

  if (tab === "logs") {
    return (
      <div className="space-y-3 rounded-xl border border-slate-800 bg-pitch-800 p-5">
        <h2 className="text-lg font-semibold">Hata ve Güvenlik Kayıtları</h2>
        {logs.length === 0 ? (
          <div className="text-sm text-slate-400">Kayıtlı hata yok. {isDemoMode ? "(Önizleme modu)" : ""}</div>
        ) : (
          <div className="space-y-2 text-xs">
            {logs.map((l, idx) => (
              <div key={idx} className="rounded bg-pitch-900 p-2 font-mono text-slate-300">
                [{l.level}] {l.created_at_utc} • {l.module}: {l.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tab === "telegram") {
    return (
      <div className="space-y-3 rounded-xl border border-slate-800 bg-pitch-800 p-5 text-sm text-slate-300">
        <h2 className="text-lg font-semibold text-white">Telegram Bot Ayarları</h2>
        <p>• Tek yetkili User ID + Chat ID doğrulaması aktif.</p>
        <p>• Webhook gizli anahtarı (`X-Telegram-Bot-Api-Secret-Token`) ile korunur.</p>
        <p>• Tüm 18 komut ve dokunulabilir inline menü aktif.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-pitch-800 p-5 text-sm text-slate-300">
      <h2 className="text-lg font-semibold text-white">Genel Sistem Ayarları</h2>
      <p>• Saat Dilimi: `Europe/Istanbul` (UTC+3)</p>
      <p>• Günlük Maksimum Maç: `15`</p>
      <p>• `FREE_ONLY_MODE`: `Aktif` (Ücretli AI ve ücretli futbol API kullanımı engellidir)</p>
      <p>• `football-data.co.uk`: Kalıcı olarak devre dışı bırakıldı</p>
    </div>
  );
}
