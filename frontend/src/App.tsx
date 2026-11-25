import React, { useEffect, useState } from "react";
import { PANEL_SECTIONS, PanelContent, PanelTabId } from "./pages/AllSections";
import {
  api,
  FixtureRow,
  ISOLATED_DEMO_PREVIEW,
  LeagueRow,
  LiveResponse,
  SourceHealthRow,
  Top15Response,
  UsageLimitRow,
} from "./services/api";

export default function App() {
  const [tab, setTab] = useState<PanelTabId>("top15");
  const [authenticated, setAuthenticated] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [username, setUsername] = useState("ayzela_admin");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");
  const [runningNow, setRunningNow] = useState(false);
  const [autoRefreshLive, setAutoRefreshLive] = useState(true);

  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [top15Data, setTop15Data] = useState<Top15Response | null>(null);
  const [liveData, setLiveData] = useState<LiveResponse | null>(null);
  const [sources, setSources] = useState<SourceHealthRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [limits, setLimits] = useState<UsageLimitRow[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedFixture, setSelectedFixture] = useState<FixtureRow | null>(null);

  async function refreshLiveAndTop15() {
    if (demoMode) return;
    try {
      const [t15, lv] = await Promise.all([api.selectedTop15(), api.live()]);
      setTop15Data(t15);
      setLiveData(lv);
    } catch {
      // Silent retry on next cycle
    }
  }

  async function loadRealData(throwOnAuthFail = false) {
    try {
      const [dash, fx, t15, lv, src, lgs, lgRows] = await Promise.all([
        api.dashboard(),
        api.fixtures(),
        api.selectedTop15(),
        api.live(),
        api.sources(),
        api.leagues(),
        api.logs(),
      ]);
      setFixtures(fx.fixtures || []);
      setTop15Data(t15);
      setLiveData(lv);
      setSources(src.sources || []);
      setLeagues(lgs.leagues || []);
      setLimits(dash.usage_limits || []);
      setLogs(lgRows.logs || []);
      setAuthenticated(true);
      setDemoMode(false);
    } catch (err) {
      setAuthenticated(false);
      if (throwOnAuthFail) throw err;
    }
  }

  useEffect(() => {
    loadRealData(false);
  }, []);

  useEffect(() => {
    if (!authenticated || demoMode || !autoRefreshLive) return;
    if (tab !== "live" && tab !== "top15" && tab !== "results") return;
    const id = window.setInterval(() => {
      refreshLiveAndTop15();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [authenticated, demoMode, autoRefreshLive, tab]);

  function enterDemoPreview() {
    setDemoMode(true);
    setAuthenticated(true);
    setFixtures(ISOLATED_DEMO_PREVIEW.fixtures);
    setTop15Data({
      analysis_day_tr: "2026-11-25",
      summary: {
        total_matches: 1,
        live_count: 0,
        finished_count: 1,
        scheduled_count: 0,
        picks_won: 2,
        picks_lost: 1,
        picks_live_won: 0,
        picks_live_lost: 0,
        picks_pending: 0,
      },
      matches: ISOLATED_DEMO_PREVIEW.fixtures,
    });
    setLiveData({
      updated_at_utc: "2026-11-25T11:30:00Z",
      live_matches: [],
      finished_today: ISOLATED_DEMO_PREVIEW.fixtures,
    });
    setSources(ISOLATED_DEMO_PREVIEW.sources);
    setLimits(ISOLATED_DEMO_PREVIEW.usageLimits);
    setLeagues([
      { organization_id: "tr_super_lig", name_tr: "Türkiye Süper Lig", country: "Türkiye", country_code: "TR", category: "domestic_league", enabled: 1 },
      { organization_id: "eng_premier_league", name_tr: "İngiltere Premier League", country: "İngiltere", country_code: "GB", category: "domestic_league", enabled: 1 },
      { organization_id: "uefa_ucl", name_tr: "UEFA Şampiyonlar Ligi", country: "Avrupa", country_code: "INT", category: "continental_club", enabled: 1 },
    ]);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError("");
    try {
      await api.login(username, password);
      await loadRealData(true);
    } catch (err: any) {
      setAuthError(err.message || "Giriş başarısız");
    }
  }

  async function handleRunNow() {
    if (demoMode) {
      setToast("Önizleme modunda canlı bulut analizi başlatılamaz.");
      return;
    }
    setRunningNow(true);
    try {
      const res = await api.runAnalysisNow();
      setToast(`⚡ Anlık analiz başlatıldı (İş: ${res.job_id}). Tüm bülten taranıp Seçilen 15 Maç hazırlanacaktır.`);
    } catch (err: any) {
      setToast(`⚠️ Anlık analiz başlatılamadı: ${err.message || "Bilinmeyen hata"}`);
    } finally {
      setRunningNow(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pitch-900 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-pitch-800 p-6 shadow-2xl">
          <div className="mb-4 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Kişisel Araştırma Platformu</div>
            <h1 className="mt-1 text-2xl font-bold text-white">AyzEla Football AI</h1>
          </div>
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanıcı adı"
              className="w-full rounded-lg border border-slate-700 bg-pitch-900 px-3 py-2 text-sm text-white"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Parola"
              className="w-full rounded-lg border border-slate-700 bg-pitch-900 px-3 py-2 text-sm text-white"
            />
            {authError && <div className="text-xs text-rose-400">{authError}</div>}
            <button type="submit" className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500">
              Güvenli Giriş Yap
            </button>
          </form>
          <button
            onClick={enterDemoPreview}
            className="mt-3 w-full rounded-lg border border-amber-500/40 bg-amber-500/10 py-2 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
          >
            Çevrimdışı Önizleme (Yalnızca Demo Verisi)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pitch-900 pb-20 md:flex md:pb-0">
      <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-pitch-950 p-4 md:block">
        <div className="mb-4 px-2">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">AyzEla Football AI</div>
          <div className="text-[11px] text-slate-400">Europe/Istanbul • FREE_ONLY</div>
        </div>
        <nav className="space-y-1">
          {PANEL_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setTab(s.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition ${
                tab === s.id ? "bg-emerald-600/20 text-emerald-300" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {s.title}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 p-4 md:p-6">
        {demoMode && (
          <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-200">
            ⚠️ {ISOLATED_DEMO_PREVIEW.banner_tr}
          </div>
        )}
        {toast && (
          <div className="mb-4 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-xs text-sky-200">
            {toast}
          </div>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="text-sm font-bold text-emerald-400 md:hidden">AyzEla AI</div>
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as PanelTabId)}
              className="rounded-lg border border-slate-700 bg-pitch-800 px-2 py-1 text-xs text-white md:hidden"
            >
              {PANEL_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <div className="hidden text-xs text-slate-400 md:block">
              Sabit analiz: 08:00 & 11:59 TRT • Seçilen 15 Maç & Canlı Sonuç Takibi
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunNow}
              disabled={runningNow}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-500 disabled:opacity-50"
            >
              {runningNow ? "⏳ Başlatılıyor..." : "⚡ Şimdi Analiz Et"}
            </button>
            {!demoMode && (
              <button
                onClick={() => loadRealData(false)}
                className="rounded-lg border border-slate-700 bg-pitch-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                Yenile
              </button>
            )}
          </div>
        </div>

        <PanelContent
          tab={tab}
          fixtures={fixtures}
          top15Data={top15Data}
          liveData={liveData}
          sources={sources}
          leagues={leagues}
          limits={limits}
          logs={logs}
          selectedFixture={selectedFixture}
          onSelectFixture={(fx) => { setSelectedFixture(fx); setTab("match_detail"); }}
          onToggleLeague={async (id, enabled) => {
            if (!demoMode) await api.toggleLeague(id, enabled);
            setLeagues((prev) => prev.map((l) => (l.organization_id === id ? { ...l, enabled: enabled ? 1 : 0 } : l)));
          }}
          onAddLeague={async (payload) => {
            if (!demoMode) await api.addLeague(payload);
            setLeagues((prev) => [...prev, { ...payload, category: "domestic_league", enabled: 1 }]);
          }}
          onDispatchQuery={async (q) => {
            if (demoMode) { setToast(`Önizleme: '${q}' kuyruk komutu simüle edildi.`); return; }
            const res = await api.dispatchAnalysis(q);
            setToast(`Araştırma kuyruğa alındı: ${res.job_id}`);
          }}
          onRunSourceCheck={async () => {
            if (demoMode) { setToast("Önizleme modunda canlı bulut testi tetiklenemez."); return; }
            const res = await api.triggerSourceCheck();
            setToast(`Canlı kaynak sağlık kontrolü başlatıldı: ${res.job_id}`);
          }}
          onRunAnalysisNow={handleRunNow}
          onRefreshScores={refreshLiveAndTop15}
          autoRefreshLive={autoRefreshLive}
          onToggleAutoRefreshLive={() => setAutoRefreshLive((v) => !v)}
          runningNow={runningNow}
          isDemoMode={demoMode}
        />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 flex justify-around border-t border-slate-800 bg-pitch-950 py-2 md:hidden">
        {(["top15", "live", "fixtures", "results", "dashboard"] as PanelTabId[]).map((id) => {
          const item = PANEL_SECTIONS.find((s) => s.id === id)!;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-2 py-1 text-[11px] font-medium ${tab === id ? "text-emerald-400" : "text-slate-400"}`}
            >
              {item.short}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
