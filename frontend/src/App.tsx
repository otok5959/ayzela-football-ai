import React, { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  FileSearch,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Radio,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { PANEL_SECTIONS, PanelContent, PanelTabId } from "./pages/AllSections";
import {
  api,
  BacktestRow,
  CouponsResponse,
  DashboardResponse,
  FixtureDetailResponse,
  FixtureRow,
  ISOLATED_DEMO_PREVIEW,
  JobQueueRow,
  LeagueRow,
  LiveResponse,
  ScheduledJobRow,
  SourceHealthRow,
  Top15Response,
  UsageLimitRow,
} from "./services/api";

const TAB_ICONS: Record<PanelTabId, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  top15: Trophy,
  coupons: Ticket,
  live: Radio,
  fixtures: CalendarDays,
  results: CheckCircle2,
  research: FileSearch,
  match_detail: Activity,
  lineups: Users,
  leagues: ListChecks,
  history: History,
  performance: BarChart3,
  sources: Database,
  agents: Bot,
  jobs: Clock3,
  logs: ScrollText,
  limits: Gauge,
  settings: Settings,
};

const SIDEBAR_GROUPS: Array<{ title: string; ids: PanelTabId[] }> = [
  { title: "CANLI & SEÇİMLER", ids: ["dashboard", "top15", "coupons", "live", "results"] },
  { title: "BÜLTEN & ANALİZ", ids: ["fixtures", "match_detail", "lineups", "research", "history", "performance"] },
  { title: "SİSTEM & ALTYAPI", ids: ["leagues", "sources", "agents", "jobs", "limits", "logs", "settings"] },
];

export default function App() {
  const [tab, setTab] = useState<PanelTabId>("dashboard");
  const [authenticated, setAuthenticated] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [username, setUsername] = useState("ayzela_admin");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [toast, setToast] = useState("");
  const [runningNow, setRunningNow] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefreshLive, setAutoRefreshLive] = useState(true);

  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [fixtures, setFixtures] = useState<FixtureRow[]>([]);
  const [top15Data, setTop15Data] = useState<Top15Response | null>(null);
  const [couponsData, setCouponsData] = useState<CouponsResponse | null>(null);
  const [liveData, setLiveData] = useState<LiveResponse | null>(null);
  const [sources, setSources] = useState<SourceHealthRow[]>([]);
  const [leagues, setLeagues] = useState<LeagueRow[]>([]);
  const [limits, setLimits] = useState<UsageLimitRow[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [backtests, setBacktests] = useState<BacktestRow[]>([]);
  const [jobs, setJobs] = useState<JobQueueRow[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJobRow[]>([]);

  const [selectedFixture, setSelectedFixture] = useState<FixtureRow | null>(null);
  const [fixtureDetail, setFixtureDetail] = useState<FixtureDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function refreshLiveAndTop15() {
    if (demoMode) return;
    setRefreshing(true);
    try {
      const [t15, lv, cpn, fx] = await Promise.all([
        api.selectedTop15(),
        api.live(),
        api.coupons(),
        api.fixtures(),
      ]);
      setTop15Data(t15);
      setLiveData(lv);
      setCouponsData(cpn);
      setFixtures(fx.fixtures || []);
    } catch {
      // Silent retry on next cycle
    } finally {
      setRefreshing(false);
    }
  }

  async function loadRealData(throwOnAuthFail = false) {
    setRefreshing(true);
    try {
      const [dash, fx, t15, cpn, lv, src, lgs, lgRows, btRes, jobRes] = await Promise.all([
        api.dashboard(),
        api.fixtures(),
        api.selectedTop15(),
        api.coupons().catch(() => ({ analysis_day_tr: "", today_coupons: [], history_coupons: [] })),
        api.live(),
        api.sources(),
        api.leagues(),
        api.logs(),
        api.backtests().catch(() => ({ backtests: [] })),
        api.jobs().catch(() => ({ jobs: [], scheduled_jobs: [] })),
      ]);
      setDashboardData(dash);
      setFixtures(fx.fixtures || []);
      setTop15Data(t15);
      setCouponsData(cpn);
      setLiveData(lv);
      setSources(src.sources || []);
      setLeagues(lgs.leagues || []);
      setLimits(dash.usage_limits || []);
      setLogs(lgRows.logs || []);
      setBacktests((btRes.backtests?.length ? btRes.backtests : dash.backtests) || []);
      setJobs(jobRes.jobs || []);
      setScheduledJobs(jobRes.scheduled_jobs || dash.scheduled_jobs || []);
      setAuthenticated(true);
      setDemoMode(false);
    } catch (err) {
      setAuthenticated(false);
      if (throwOnAuthFail) throw err;
    } finally {
      setRefreshing(false);
    }
  }

  async function openFixtureDetail(fx: FixtureRow, targetTab: PanelTabId = "match_detail") {
    setSelectedFixture(fx);
    setTab(targetTab);
    if (demoMode) {
      setFixtureDetail({
        fixture: fx,
        markets: {
          match_result_1x2: {
            available: true,
            probabilities: { "1": fx.prob_home || 0.5, X: fx.prob_draw || 0.25, "2": fx.prob_away || 0.25 },
          },
          btts: {
            available: true,
            probabilities: { kg_var: fx.prob_btts_yes || 0.5, kg_yok: 1 - (fx.prob_btts_yes || 0.5) },
          },
          over_under_lines: {
            available: true,
            probabilities: { ust_2_5: fx.prob_over_25 || 0.5, alt_2_5: 1 - (fx.prob_over_25 || 0.5) },
          },
          corners: { available: false, reason: "Korner istatistikleri açık kaynaklarda bulunamadı" },
          cards: { available: false, reason: "Kart istatistikleri açık kaynaklarda bulunamadı" },
        },
        research_records: [],
        lineups: [],
        revisions: [],
      });
      return;
    }
    setDetailLoading(true);
    setFixtureDetail(null);
    try {
      const detail = await api.fixtureDetail(fx.fixture_id);
      setFixtureDetail(detail);
    } catch {
      setFixtureDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadRealData(false);
  }, []);

  useEffect(() => {
    if (!authenticated || demoMode || !autoRefreshLive) return;
    if (tab !== "dashboard" && tab !== "live" && tab !== "top15" && tab !== "coupons" && tab !== "results") return;
    const id = window.setInterval(() => {
      refreshLiveAndTop15();
    }, 30_000);
    return () => window.clearInterval(id);
  }, [authenticated, demoMode, autoRefreshLive, tab]);

  function enterDemoPreview() {
    setDemoMode(true);
    setAuthenticated(true);
    setFixtures(ISOLATED_DEMO_PREVIEW.fixtures);
    setDashboardData({
      latest_runs: [
        {
          run_id: "demo_run_0800",
          run_type: "morning_0800",
          analysis_day_tr: "2026-11-26",
          scheduled_at_tr: "2026-11-26T08:00:00+03:00",
          actual_started_at_tr: "2026-11-26T08:00:12+03:00",
          completed_at_tr: "2026-11-26T08:02:18+03:00",
          delay_seconds: 12,
          status: "completed",
          bulletin_source: "iddaa",
          matches_analyzed: 231,
          avg_data_coverage: 0.81,
          notes_tr: "Örnek önizleme koşusu",
        },
      ],
      predictions_summary: { cnt: 231, avg_cov: 0.81 },
      source_summary: [{ status: "healthy", cnt: 1 }],
      usage_limits: ISOLATED_DEMO_PREVIEW.usageLimits,
      metrics: [],
      backtests: [],
      scheduled_jobs: [],
      free_only_mode: true,
      telegram_enabled: false,
    });
    setTop15Data({
      analysis_day_tr: "2026-11-26",
      summary: {
        total_matches: 2,
        live_count: 0,
        finished_count: 1,
        scheduled_count: 1,
        picks_won: 1,
        picks_lost: 1,
        picks_live_won: 0,
        picks_live_lost: 0,
        picks_pending: 2,
      },
      matches: ISOLATED_DEMO_PREVIEW.fixtures,
    });
    setCouponsData(ISOLATED_DEMO_PREVIEW.coupons);
    setLiveData({
      updated_at_utc: "2026-11-26T11:30:00Z",
      live_matches: [],
      finished_today: [ISOLATED_DEMO_PREVIEW.fixtures[1]],
    });
    setSources(ISOLATED_DEMO_PREVIEW.sources);
    setLimits(ISOLATED_DEMO_PREVIEW.usageLimits);
    setBacktests([]);
    setJobs([]);
    setScheduledJobs([]);
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

  async function handleLogout() {
    if (!demoMode) {
      await api.logout();
    }
    setAuthenticated(false);
    setDemoMode(false);
    setPassword("");
    setDashboardData(null);
    setFixtures([]);
    setTop15Data(null);
    setCouponsData(null);
    setLiveData(null);
    setFixtureDetail(null);
    setSelectedFixture(null);
    setToast("");
  }

  async function handleRunNow() {
    if (demoMode) {
      setToast("Önizleme modunda canlı bulut analizi başlatılamaz.");
      return;
    }
    setRunningNow(true);
    try {
      const res = await api.runAnalysisNow();
      setToast(`⚡ Anlık analiz başlatıldı (İş: ${res.job_id}). Tüm bülten taranıp Seçilen 15 Maç ve Kuponlarım hazırlanacaktır.`);
    } catch (err: any) {
      setToast(`⚠️ Anlık analiz başlatılamadı: ${err.message || "Bilinmeyen hata"}`);
    } finally {
      setRunningNow(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-pitch-950 p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative w-full max-w-md rounded-2xl border border-slate-800/90 bg-pitch-850/95 p-7 shadow-2xl backdrop-blur">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
              PWA Araştırma Platformu
            </div>
            <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white">AyzEla Football AI</h1>
            <p className="mt-1 text-xs text-slate-400">
              Sıfır maliyetli • 12 bağımsız ajan • Dixon-Coles &amp; Ensemble
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-400">Kullanıcı Adı</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ayzela_admin"
                autoComplete="username"
                className="w-full rounded-xl border border-slate-700/80 bg-pitch-900 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-400">Parola</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-700/80 bg-pitch-900 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40"
              />
            </div>
            {authError && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                {authError}
              </div>
            )}
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-500"
            >
              <ShieldCheck className="h-4 w-4" />
              Güvenli Giriş Yap
            </button>
          </form>
          <button
            onClick={enterDemoPreview}
            className="mt-3.5 w-full rounded-xl border border-amber-500/35 bg-amber-500/10 py-2 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20"
          >
            Çevrimdışı Önizleme (Yalnızca Demo Verisi)
          </button>
        </div>
      </div>
    );
  }

  const liveBadgeCount = (liveData?.live_matches || fixtures.filter((f) => (f.effective_status || f.status) === "live")).length;
  const top15BadgeCount = top15Data?.matches?.length || 0;
  const activeTabMeta = PANEL_SECTIONS.find((s) => s.id === tab);

  return (
    <div className="min-h-screen bg-pitch-950 pt-[env(safe-area-inset-top)] pb-24 text-slate-100 md:flex md:pb-0">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800/80 bg-pitch-900/95 md:flex">
        <div className="border-b border-slate-800/80 px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-extrabold tracking-tight text-white">AyzEla AI</div>
              <div className="text-[10px] font-medium text-emerald-400">PWA • FREE_ONLY • TRT</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {SIDEBAR_GROUPS.map((grp) => (
            <div key={grp.title}>
              <div className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {grp.title}
              </div>
              <div className="space-y-0.5">
                {grp.ids.map((id) => {
                  const sec = PANEL_SECTIONS.find((s) => s.id === id);
                  if (!sec) return null;
                  const Icon = TAB_ICONS[id];
                  const isActive = tab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setTab(id)}
                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium transition ${
                        isActive
                          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                          : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2.5 truncate">
                        <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
                        <span className="truncate">{sec.short}</span>
                      </span>
                      {id === "live" && liveBadgeCount > 0 && (
                        <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 tabular-nums">
                          {liveBadgeCount}
                        </span>
                      )}
                      {id === "top15" && top15BadgeCount > 0 && (
                        <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-300 tabular-nums">
                          {top15BadgeCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800/80 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-pitch-950 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-200"
          >
            <LogOut className="h-3.5 w-3.5" />
            Güvenli Çıkış
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-4 md:p-6">
        {demoMode && (
          <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-200">
            ⚠️ {ISOLATED_DEMO_PREVIEW.banner_tr}
          </div>
        )}
        {toast && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-xs text-sky-200">
            <span>{toast}</span>
            <button onClick={() => setToast("")} className="text-sky-300 hover:text-white">
              ✕
            </button>
          </div>
        )}

        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-pitch-900/80 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 md:hidden">
              <Cpu className="h-4 w-4" />
            </div>
            <select
              value={tab}
              onChange={(e) => setTab(e.target.value as PanelTabId)}
              className="rounded-lg border border-slate-700 bg-pitch-850 px-2.5 py-1.5 text-xs font-medium text-white md:hidden"
            >
              {PANEL_SECTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <div className="hidden md:block">
              <div className="text-sm font-bold text-white">{activeTabMeta?.title || "AyzEla Panel"}</div>
              <div className="text-[11px] text-slate-400">
                08:00 &amp; 11:59 TRT • 1.30–3.60 Gerçek Oran • Günlük 2×4 Kupon • PWA Modu
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {liveBadgeCount > 0 && (
              <button
                onClick={() => setTab("live")}
                className="hidden items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-200 sm:inline-flex"
              >
                <span className="h-2 w-2 rounded-full bg-rose-400 animate-ping" />
                {liveBadgeCount} Canlı
              </button>
            )}
            <button
              onClick={handleRunNow}
              disabled={runningNow}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
            >
              <Zap className="h-3.5 w-3.5" />
              {runningNow ? "Başlatılıyor..." : "Şimdi Analiz Et"}
            </button>
            {!demoMode && (
              <button
                onClick={() => loadRealData(false)}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-pitch-850 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Yenile</span>
              </button>
            )}
            <button
              onClick={handleLogout}
              title="Güvenli Çıkış"
              className="inline-flex items-center rounded-xl border border-slate-700/80 bg-pitch-850 p-2 text-slate-300 transition hover:border-rose-500/40 hover:text-rose-300 md:hidden"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <PanelContent
          tab={tab}
          onNavigate={setTab}
          dashboardData={dashboardData}
          fixtures={fixtures}
          top15Data={top15Data}
          couponsData={couponsData}
          liveData={liveData}
          sources={sources}
          leagues={leagues}
          limits={limits}
          logs={logs}
          backtests={backtests}
          jobs={jobs}
          scheduledJobs={scheduledJobs}
          selectedFixture={selectedFixture}
          fixtureDetail={fixtureDetail}
          detailLoading={detailLoading}
          onSelectFixture={(fx) => openFixtureDetail(fx, "match_detail")}
          onSelectLineup={(fx) => openFixtureDetail(fx, "lineups")}
          onToggleLeague={async (id, enabled) => {
            if (!demoMode) await api.toggleLeague(id, enabled);
            setLeagues((prev) => prev.map((l) => (l.organization_id === id ? { ...l, enabled: enabled ? 1 : 0 } : l)));
          }}
          onAddLeague={async (payload) => {
            if (!demoMode) await api.addLeague(payload);
            setLeagues((prev) => [...prev, { ...payload, category: "domestic_league", enabled: 1 }]);
          }}
          onDispatchQuery={async (q) => {
            if (demoMode) {
              setToast(`Önizleme: '${q}' kuyruk komutu simüle edildi.`);
              return;
            }
            const res = await api.dispatchAnalysis(q);
            setToast(`Araştırma kuyruğa alındı: ${res.job_id}`);
          }}
          onRunSourceCheck={async () => {
            if (demoMode) {
              setToast("Önizleme modunda canlı bulut testi tetiklenemez.");
              return;
            }
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

      <nav className="fixed bottom-0 left-0 right-0 z-30 flex justify-around border-t border-slate-800 bg-pitch-950/95 pt-1.5 pb-[calc(0.45rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {(["dashboard", "top15", "coupons", "live", "results"] as PanelTabId[]).map((id) => {
          const item = PANEL_SECTIONS.find((s) => s.id === id)!;
          const Icon = TAB_ICONS[id];
          const isActive = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${
                isActive ? "text-emerald-400" : "text-slate-400"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{item.short}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
