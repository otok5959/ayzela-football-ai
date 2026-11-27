import React, { useState } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  Gauge,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { CalibrationCurveChart, ModelPerformanceChart, ProbabilitySplitBar } from "../components/Charts";
import {
  BacktestRow,
  CouponRow,
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
  TopPickItem,
  UsageLimitRow,
} from "../services/api";

export type PanelTabId =
  | "dashboard"
  | "top15"
  | "coupons"
  | "live"
  | "fixtures"
  | "results"
  | "research"
  | "match_detail"
  | "lineups"
  | "leagues"
  | "history"
  | "performance"
  | "sources"
  | "agents"
  | "jobs"
  | "logs"
  | "limits"
  | "settings";

export const PANEL_SECTIONS: Array<{ id: PanelTabId; title: string; short: string }> = [
  { id: "dashboard", title: "1. Ana Kontrol Ekranı", short: "Özet" },
  { id: "top15", title: "2. Seçilen 15 Maç Takibi", short: "Seçilen 15" },
  { id: "coupons", title: "3. Kuponlarım (Günlük 2x4)", short: "Kuponlarım" },
  { id: "live", title: "4. Canlı Sonuçlar", short: "Canlı" },
  { id: "fixtures", title: "5. Tüm Bülten Maçları", short: "Bülten" },
  { id: "results", title: "6. Sonuç Takip Merkezi", short: "Sonuçlar" },
  { id: "research", title: "7. Araştırma Merkezi", short: "Araştır" },
  { id: "match_detail", title: "8. Karşılaşma Detayları", short: "Detay" },
  { id: "lineups", title: "9. Oyuncu ve Kadro Bilgileri", short: "Kadrolar" },
  { id: "leagues", title: "10. Lig Yönetimi", short: "Ligler" },
  { id: "history", title: "11. Geçmiş Analizler", short: "Geçmiş" },
  { id: "performance", title: "12. Model Performans Grafikleri", short: "Grafikler" },
  { id: "sources", title: "13. Veri Kaynakları & Sağlık", short: "Kaynaklar" },
  { id: "agents", title: "14. Araştırma Modülleri (12 Ajan)", short: "Ajanlar" },
  { id: "jobs", title: "15. Otomatik Görev Yönetimi", short: "Görevler" },
  { id: "logs", title: "16. Hata Kayıtları", short: "Kayıtlar" },
  { id: "limits", title: "17. Bulut Kullanım Limitleri", short: "Limitler" },
  { id: "settings", title: "18. Sistem & PWA Kurulumu", short: "Ayarlar" },
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

const MARKET_LABELS_TR: Record<string, string> = {
  match_result_1x2: "Maç Sonucu (1-X-2)",
  btts: "Karşılıklı Gol (KG)",
  over_under_lines: "Alt / Üst Gol Çizgileri",
  first_half_1x2: "İlk Yarı (1-X-2)",
  second_half_1x2: "İkinci Yarı (1-X-2)",
  total_goals_distribution: "Toplam Gol Dağılımı",
  team_goal_distributions: "Takım Gol Dağılımı",
  likely_scores: "Olası Skorlar",
  corners: "Korner İstatistikleri",
  cards: "Kart İstatistikleri",
  shots: "Şut İstatistikleri",
  shots_on_target: "İsabetli Şut",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    healthy: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    completed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    ok: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    degraded: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    partial: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    running: "bg-sky-500/20 text-sky-300 border-sky-500/40",
    queued: "bg-slate-600/30 text-slate-300 border-slate-500/40",
    down: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    failed: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    error: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    insufficient_data: "bg-slate-700/50 text-slate-300 border-slate-600",
    untested: "bg-slate-600/30 text-slate-300 border-slate-500/40",
    disabled: "bg-slate-800 text-slate-400 border-slate-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${map[status] || map.untested}`}>
      {status.toUpperCase()}
    </span>
  );
}

function MatchStatusPill({ f }: { f: FixtureRow }) {
  const st = f.effective_status || f.status || "scheduled";
  if (st === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/50 bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-200 animate-pulse">
        🔴 CANLI {f.live_minute || ""}
      </span>
    );
  }
  if (st === "finished") {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-700/70 px-2.5 py-0.5 text-[11px] font-semibold text-slate-200">
        🏁 {f.live_minute || "MS"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[11px] text-slate-300 tabular-nums">
      🕒 {String(f.kickoff_tr || "").slice(11, 16)} TRT
    </span>
  );
}

function TopPicksGrid({ picks }: { picks: TopPickItem[] | undefined }) {
  const realOddPicks = (picks || [])
    .filter((p) => typeof p.iddaa_odd === "number" && p.iddaa_odd >= 1.3 && p.iddaa_odd <= 3.6)
    .slice(0, 2);
  if (realOddPicks.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {realOddPicks.map((p) => {
        const isGreen = p.eval_state === "won" || p.eval_state === "live_won";
        const isRed = p.eval_state === "lost" || p.eval_state === "live_lost";
        const cardStyle = isGreen
          ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-100"
          : isRed
          ? "border-rose-500/70 bg-rose-500/15 text-rose-100"
          : "border-slate-700/80 bg-pitch-900/90 text-slate-200";
        const badgeIcon =
          p.eval_state === "won"
            ? "✅ Tuttu"
            : p.eval_state === "live_won"
            ? "🟢 Tutuyor"
            : p.eval_state === "lost"
            ? "❌ Tutmadı"
            : p.eval_state === "live_lost"
            ? "🔴 Tutmuyor"
            : "⏳ Bekliyor";
        return (
          <div key={p.key} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${cardStyle}`}>
            <div>
              <div className="font-semibold">{p.label_tr}</div>
              <div className="text-[11px] opacity-90 tabular-nums">
                Olasılık: %{Math.round((p.probability || 0) * 100)} • Oran:{" "}
                <span className="font-bold text-amber-300">{Number(p.iddaa_odd).toFixed(2)}</span>
              </div>
            </div>
            <div className="text-right font-semibold whitespace-nowrap">
              <div>{badgeIcon}</div>
              {p.locked && p.eval_state.startsWith("live_") && (
                <div className="text-[10px] opacity-90">🔒 Kesinleşti</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchTrackingCard({ f, onSelectFixture }: { f: FixtureRow; onSelectFixture: (f: FixtureRow) => void }) {
  const hasScore = f.score_home !== null && f.score_home !== undefined && f.score_away !== null && f.score_away !== undefined;
  return (
    <div className="rounded-2xl border border-slate-800/90 bg-pitch-850 p-4 shadow-sm transition hover:border-slate-700">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {f.is_selected_top15 ? (
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                ⭐ #{f.selection_rank || "•"} Seçilen 15
              </span>
            ) : null}
            {f.iddaa_match_code && (
              <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
                Kod: {f.iddaa_match_code}
              </span>
            )}
            <MatchStatusPill f={f} />
            <span className="text-[11px] text-slate-400 tabular-nums">{String(f.kickoff_tr || "").slice(0, 16).replace("T", " ")}</span>
          </div>
          <div className="mt-1.5 text-base font-bold text-white">
            {f.home_team_name} <span className="text-slate-500 font-normal">vs</span> {f.away_team_name}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasScore && (
            <div className="rounded-xl border border-slate-700 bg-pitch-900 px-3 py-1.5 text-center tabular-nums">
              <div className="text-base font-extrabold tracking-wide text-white">
                {f.score_home} - {f.score_away}
              </div>
              {f.ht_home !== null && f.ht_home !== undefined && (
                <div className="text-[10px] text-slate-400">İY: {f.ht_home}-{f.ht_away}</div>
              )}
            </div>
          )}
          <button
            onClick={() => onSelectFixture(f)}
            className="rounded-xl border border-slate-700 bg-pitch-800 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:bg-slate-700 hover:text-white"
          >
            Detay
          </button>
        </div>
      </div>
      <ProbabilitySplitBar probHome={f.prob_home} probDraw={f.prob_draw} probAway={f.prob_away} />
      <TopPicksGrid picks={f.top_picks} />
    </div>
  );
}

function CouponTemplateCard({ coupon }: { coupon: CouponRow }) {
  const isBalanced = coupon.coupon_type === "balanced";
  const st = coupon.effective_status || "pending";
  const headerAccent = isBalanced
    ? "border-emerald-500/30 bg-emerald-500/10"
    : "border-amber-500/30 bg-amber-500/10";
  const badgeText =
    st === "won"
      ? "✅ Kupon Tuttu"
      : st === "lost"
      ? "❌ Kupon Tutmadı"
      : st === "live"
      ? `🟡 ${(coupon.won_legs || 0) + (coupon.live_won_legs || 0)}/${coupon.legs.length} Tutuyor`
      : "⏳ Bekliyor";
  const badgeCls =
    st === "won"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
      : st === "lost"
      ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
      : st === "live"
      ? "bg-amber-500/20 text-amber-200 border-amber-500/50"
      : "bg-slate-800 text-slate-300 border-slate-700";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-pitch-850 shadow-lg">
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 ${headerAccent}`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base font-bold text-white">
              {isBalanced ? "🛡️" : "🚀"} {coupon.title_tr}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badgeCls}`}>
              {badgeText}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-slate-300">
            {coupon.analysis_day_tr} • {coupon.legs.length} Maç •{" "}
            {isBalanced ? "Dengeli Tutma Odağı (Hedef 4-7 Oran)" : "Yüksek Oran Odağı (Hedef 8-18 Oran)"}
          </div>
        </div>
        <div className="rounded-xl border border-amber-400/40 bg-pitch-900/90 px-3 py-1.5 text-right tabular-nums">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Toplam Oran</div>
          <div className="text-lg font-extrabold text-amber-300">{Number(coupon.total_odd).toFixed(2)}</div>
        </div>
      </div>

      <div className="divide-y divide-slate-800/80 p-3">
        {coupon.legs.map((leg, idx) => {
          const ev = leg.eval_state || "pending";
          const isGreen = ev === "won" || ev === "live_won";
          const isRed = ev === "lost" || ev === "live_lost";
          const rowBg = isGreen ? "bg-emerald-500/10" : isRed ? "bg-rose-500/10" : "bg-transparent";
          const legBadge =
            ev === "won"
              ? "✅ Tuttu"
              : ev === "live_won"
              ? "🟢 Tutuyor"
              : ev === "lost"
              ? "❌ Tutmadı"
              : ev === "live_lost"
              ? "🔴 Tutmuyor"
              : "⏳";
          const hasScore =
            leg.score_home !== null &&
            leg.score_home !== undefined &&
            leg.score_away !== null &&
            leg.score_away !== undefined;

          return (
            <div key={`${leg.fixture_id}_${idx}`} className={`flex items-center justify-between gap-3 rounded-xl px-2.5 py-2.5 ${rowBg}`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="font-bold text-slate-200">{idx + 1}.</span>
                  {leg.iddaa_match_code && (
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                      Kod: {leg.iddaa_match_code}
                    </span>
                  )}
                  <span className="truncate">{leg.league_name}</span>
                  <span className="tabular-nums">• {String(leg.kickoff_tr || "").slice(11, 16)}</span>
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-white">
                  {leg.home_team} - {leg.away_team}
                  {hasScore && (
                    <span className="ml-2 rounded bg-pitch-900 px-1.5 py-0.5 text-xs font-bold text-sky-300 tabular-nums">
                      {leg.score_home}-{leg.score_away} {leg.live_minute || ""}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs tabular-nums">
                  <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300">
                    {leg.label_tr}
                  </span>
                  <span className="font-bold text-amber-300">Oran: {Number(leg.iddaa_odd).toFixed(2)}</span>
                  <span className="text-[11px] text-slate-400">Olasılık: %{Math.round((leg.probability || 0) * 100)}</span>
                </div>
              </div>
              <div className="text-right text-xs font-semibold whitespace-nowrap">{legBadge}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupByLeague(items: FixtureRow[]): Array<[string, FixtureRow[]]> {
  const map = new Map<string, FixtureRow[]>();
  const sorted = [...items].sort(
    (a, b) => a.league_name.localeCompare(b.league_name, "tr") || a.kickoff_tr.localeCompare(b.kickoff_tr)
  );
  for (const f of sorted) {
    const arr = map.get(f.league_name) || [];
    arr.push(f);
    map.set(f.league_name, arr);
  }
  return [...map.entries()];
}

function buildRealChartSeries(
  backtests: BacktestRow[],
  dashboardData: DashboardResponse | null,
  isDemoMode: boolean
): {
  perfSeries: Array<{ model: string; accuracy: number; brier: number; logLoss: number }>;
  calSeries: Array<{ bin: string; predicted: number; actual: number }>;
} {
  if (isDemoMode) {
    return {
      perfSeries: ISOLATED_DEMO_PREVIEW.performanceSeries,
      calSeries: ISOLATED_DEMO_PREVIEW.calibrationSeries,
    };
  }

  const btList = backtests.length > 0 ? backtests : dashboardData?.backtests || [];
  const byModel = new Map<string, BacktestRow>();
  for (const b of btList) {
    if (!byModel.has(b.model_name)) {
      byModel.set(b.model_name, b);
    }
  }

  let perfSeries: Array<{ model: string; accuracy: number; brier: number; logLoss: number }> = [];
  if (byModel.size > 0) {
    perfSeries = Array.from(byModel.values()).map((b) => ({
      model: b.model_name.toUpperCase(),
      accuracy: Number((b.accuracy * 100).toFixed(1)),
      brier: Number(b.brier_score.toFixed(4)),
      logLoss: Number(b.log_loss.toFixed(4)),
    }));
  } else if (dashboardData?.metrics && dashboardData.metrics.length > 0) {
    const m = dashboardData.metrics[0];
    perfSeries = [
      {
        model: m.period_key || m.period_type,
        accuracy: Number((m.accuracy * 100).toFixed(1)),
        brier: Number(m.brier_score.toFixed(4)),
        logLoss: Number(m.log_loss.toFixed(4)),
      },
    ];
  }

  let calSeries: Array<{ bin: string; predicted: number; actual: number }> = [];
  const calSource =
    dashboardData?.metrics?.find((m) => m.calibration_json)?.calibration_json ||
    btList.find((b) => b.model_name === "ensemble" && b.calibration_json)?.calibration_json ||
    btList.find((b) => b.calibration_json)?.calibration_json;

  if (calSource) {
    try {
      const parsed = JSON.parse(calSource);
      if (Array.isArray(parsed)) {
        calSeries = parsed
          .filter((item: any) => item && typeof item.predicted === "number" && typeof item.actual === "number")
          .map((item: any) => ({
            bin: String(item.bin || item.bucket || ""),
            predicted: item.predicted <= 1 ? Math.round(item.predicted * 100) : Math.round(item.predicted),
            actual: item.actual <= 1 ? Math.round(item.actual * 100) : Math.round(item.actual),
          }));
      }
    } catch {
      calSeries = [];
    }
  }

  return { perfSeries, calSeries };
}

export function PanelContent({
  tab,
  onNavigate,
  dashboardData,
  fixtures,
  top15Data,
  couponsData,
  liveData,
  sources,
  leagues,
  limits,
  logs,
  backtests,
  jobs,
  scheduledJobs,
  selectedFixture,
  fixtureDetail,
  detailLoading,
  onSelectFixture,
  onSelectLineup,
  onToggleLeague,
  onAddLeague,
  onDispatchQuery,
  onRunSourceCheck,
  onRunAnalysisNow,
  onRefreshScores,
  autoRefreshLive,
  onToggleAutoRefreshLive,
  runningNow,
  isDemoMode,
}: {
  tab: PanelTabId;
  onNavigate: (tab: PanelTabId) => void;
  dashboardData: DashboardResponse | null;
  fixtures: FixtureRow[];
  top15Data: Top15Response | null;
  couponsData: CouponsResponse | null;
  liveData: LiveResponse | null;
  sources: SourceHealthRow[];
  leagues: LeagueRow[];
  limits: UsageLimitRow[];
  logs: any[];
  backtests: BacktestRow[];
  jobs: JobQueueRow[];
  scheduledJobs: ScheduledJobRow[];
  selectedFixture: FixtureRow | null;
  fixtureDetail: FixtureDetailResponse | null;
  detailLoading: boolean;
  onSelectFixture: (f: FixtureRow) => void;
  onSelectLineup: (f: FixtureRow) => void;
  onToggleLeague: (id: string, enabled: boolean) => void;
  onAddLeague: (p: { organization_id: string; name_tr: string; country: string; country_code: string }) => void;
  onDispatchQuery: (q: string) => void;
  onRunSourceCheck: () => void;
  onRunAnalysisNow: () => void;
  onRefreshScores: () => void;
  autoRefreshLive: boolean;
  onToggleAutoRefreshLive: () => void;
  runningNow: boolean;
  isDemoMode: boolean;
}) {
  const [query, setQuery] = useState("");
  const [top15Filter, setTop15Filter] = useState<"all" | "live" | "finished" | "scheduled">("all");
  const [liveScope, setLiveScope] = useState<"all" | "top15">("all");
  const [newLeagueId, setNewLeagueId] = useState("");
  const [newLeagueName, setNewLeagueName] = useState("");
  const [newLeagueCountry, setNewLeagueCountry] = useState("");
  const [newLeagueCode, setNewLeagueCode] = useState("");

  const healthyCount = sources.filter((s) => s.status === "healthy").length;
  const analyzedCount = fixtures.filter((f) => f.prob_home !== undefined && f.prob_home !== null).length;
  const avgCov = fixtures.length
    ? Math.round((fixtures.reduce((acc, f) => acc + (f.data_coverage_score || 0), 0) / fixtures.length) * 100)
    : 0;
  const { perfSeries, calSeries } = buildRealChartSeries(backtests, dashboardData, isDemoMode);
  const visibleLimits = limits.filter((l) => l.resource_key !== "telegram_messages_daily");

  if (tab === "dashboard") {
    const top15Matches = top15Data?.matches || fixtures.filter((f) => f.is_selected_top15 === 1).slice(0, 15);
    const t15Sum = top15Data?.summary || {
      total_matches: top15Matches.length,
      live_count: top15Matches.filter((m) => (m.effective_status || m.status) === "live").length,
      finished_count: top15Matches.filter((m) => (m.effective_status || m.status) === "finished").length,
      scheduled_count: top15Matches.filter((m) => (m.effective_status || m.status) === "scheduled").length,
      picks_won: top15Matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "won").length,
      picks_lost: top15Matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "lost").length,
      picks_live_won: top15Matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "live_won").length,
      picks_live_lost: top15Matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "live_lost").length,
      picks_pending: top15Matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "pending").length,
    };
    const decidedPicks = t15Sum.picks_won + t15Sum.picks_lost;
    const hitRate = decidedPicks > 0 ? Math.round((t15Sum.picks_won / decidedPicks) * 100) : null;
    const todayCoupons = couponsData?.today_coupons || [];
    const balancedCpn = todayCoupons.find((c) => c.coupon_type === "balanced") || todayCoupons[0];
    const highCpn = todayCoupons.find((c) => c.coupon_type === "high_odds") || todayCoupons[1];
    const liveMatches = liveData?.live_matches || fixtures.filter((f) => (f.effective_status || f.status) === "live");
    const ghLimit = visibleLimits.find((l) => l.resource_key === "github_actions_minutes_monthly");
    const ghPct = ghLimit?.max_limit ? Math.min(100, Math.round((ghLimit.used_amount / ghLimit.max_limit) * 100)) : 0;
    const latestRun = dashboardData?.latest_runs?.[0];

    return (
      <div className="space-y-6">
        {/* Hero Status Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-pitch-850 via-pitch-900 to-emerald-950/30 p-5 shadow-lg">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  PWA Canlı Kontrol Merkezi
                </span>
                <span className="rounded-full border border-slate-700 bg-pitch-950/70 px-2.5 py-0.5 text-slate-300 tabular-nums">
                  Gün: {top15Data?.analysis_day_tr || latestRun?.analysis_day_tr || "Güncel"}
                </span>
                {liveMatches.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/15 px-2.5 py-0.5 text-rose-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping" />
                    {liveMatches.length} Canlı Maç
                  </span>
                )}
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-white">
                Günlük Bülten, Seçilen 15 Maç &amp; 2×4 Kupon Özeti
              </h2>
              <p className="text-xs text-slate-400">
                {latestRun
                  ? `Son koşu: ${latestRun.run_type} (${latestRun.bulletin_source}) • ${latestRun.matches_analyzed} maç • Durum: ${latestRun.status.toUpperCase()}`
                  : "Sabah 08:00 & Öğle 11:59 TRT otomatik tarama • 1.30–3.60 gerçek İddaa oranlı seçimler"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onNavigate("top15")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                <Trophy className="h-3.5 w-3.5" />
                Seçilen 15
              </button>
              <button
                onClick={() => onNavigate("coupons")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
              >
                <Ticket className="h-3.5 w-3.5" />
                Kuponlarım
              </button>
              <button
                onClick={() => onNavigate("live")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-pitch-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                <Radio className="h-3.5 w-3.5 text-rose-400" />
                Canlı Takip
              </button>
            </div>
          </div>
        </div>

        {/* 4 KPI Cards */}
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-800/90 bg-pitch-850 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Seçilen 15 Başarısı</span>
              <span className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-400">
                <Trophy className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-white">
                {hitRate !== null ? `%${hitRate}` : `${t15Sum.total_matches} Maç`}
              </span>
              <span className="text-xs text-slate-400">
                {hitRate !== null ? `${t15Sum.picks_won}/${decidedPicks} tuttu` : `${t15Sum.picks_pending} bekliyor`}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-[11px] tabular-nums">
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">
                🟢 {t15Sum.picks_won + t15Sum.picks_live_won}
              </span>
              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-rose-300">
                🔴 {t15Sum.picks_lost + t15Sum.picks_live_lost}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">
                ⏳ {t15Sum.picks_pending}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-pitch-850 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Günlük 2×4 Kuponlar</span>
              <span className="rounded-lg bg-amber-500/15 p-1.5 text-amber-400">
                <Ticket className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-amber-300">
                {todayCoupons.length} / 2
              </span>
              <span className="text-xs text-slate-400">aktif kupon</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] tabular-nums text-slate-300">
              <span>🛡️ {balancedCpn ? `${Number(balancedCpn.total_odd).toFixed(2)}x` : "-"}</span>
              <span>🚀 {highCpn ? `${Number(highCpn.total_odd).toFixed(2)}x` : "-"}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-pitch-850 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Bülten &amp; Veri Kapsamı</span>
              <span className="rounded-lg bg-sky-500/15 p-1.5 text-sky-400">
                <Activity className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-sky-300">%{avgCov}</span>
              <span className="text-xs text-slate-400">
                {analyzedCount} / {fixtures.length} maç
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${avgCov}%` }} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-pitch-850 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Kaynaklar &amp; Aylık Kota</span>
              <span className="rounded-lg bg-emerald-500/15 p-1.5 text-emerald-400">
                <Database className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2 tabular-nums">
              <span className="text-2xl font-extrabold text-emerald-300">
                {healthyCount} / {sources.length}
              </span>
              <span className="text-xs text-slate-400">sağlıklı kaynak</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full ${ghPct >= 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${ghPct}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 tabular-nums">Actions %{ghPct}</span>
            </div>
          </div>
        </div>

        {/* Actionable Mid Grid: Top-15 Highlights + Today's Coupons */}
        <div className="grid gap-5 lg:grid-cols-12">
          <div className="space-y-3 rounded-2xl border border-slate-800/90 bg-pitch-900/70 p-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">🎯 Günün Öne Çıkan Seçimleri</h3>
                <p className="text-[11px] text-slate-400">En yüksek değerli ilk 4 karşılaşma (1.30–3.60 oran)</p>
              </div>
              <button
                onClick={() => onNavigate("top15")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                Tüm 15 Maç <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {top15Matches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-pitch-950/60 p-6 text-center text-xs text-slate-400">
                Bugün için seçilmiş maç bulunmuyor. Üstteki <b>Şimdi Analiz Et</b> butonuyla taramayı başlatabilirsiniz.
              </div>
            ) : (
              <div className="space-y-2.5">
                {top15Matches.slice(0, 4).map((m) => (
                  <MatchTrackingCard key={m.fixture_id} f={m} onSelectFixture={onSelectFixture} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800/90 bg-pitch-900/70 p-4 lg:col-span-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">🎟️ Günün 2×4 Kupon Özeti</h3>
                <p className="text-[11px] text-slate-400">Dengeli ve Yüksek Oran şablonları</p>
              </div>
              <button
                onClick={() => onNavigate("coupons")}
                className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
              >
                Kuponları Aç <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {todayCoupons.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-pitch-950/60 p-6 text-center text-xs text-slate-400">
                Henüz günlük kupon oluşturulmadı. Başlamamış en az 4 uygun oranlı maç gerektiğinde otomatik üretilir.
              </div>
            ) : (
              <div className="space-y-3">
                {todayCoupons.map((c) => {
                  const isBal = c.coupon_type === "balanced";
                  const wonLegs = (c.won_legs || 0) + (c.live_won_legs || 0);
                  return (
                    <div
                      key={c.coupon_id}
                      onClick={() => onNavigate("coupons")}
                      className="cursor-pointer rounded-xl border border-slate-800 bg-pitch-850 p-3.5 transition hover:border-slate-700"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">
                          {isBal ? "🛡️" : "🚀"} {c.title_tr}
                        </span>
                        <span className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-2 py-0.5 text-xs font-extrabold text-amber-300 tabular-nums">
                          {Number(c.total_odd).toFixed(2)}x
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {c.legs.map((leg, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px] text-slate-300">
                            <span className="truncate pr-2">
                              {i + 1}. {leg.home_team} - {leg.away_team}
                            </span>
                            <span className="shrink-0 font-semibold text-emerald-300 tabular-nums">
                              {leg.label_tr} ({Number(leg.iddaa_odd).toFixed(2)})
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between border-t border-slate-800/80 pt-2 text-[11px] text-slate-400">
                        <span>Durum: {c.effective_status || "pending"}</span>
                        <span className="tabular-nums">{wonLegs}/{c.legs.length} tutuyor</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Analytics Charts (Real Data Only when authenticated, Demo only in DemoMode) */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800/90 bg-pitch-850 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Model Doğruluk Karşılaştırması</h3>
              </div>
              <span className="text-[11px] text-slate-400">
                {isDemoMode ? "Demo Serisi" : `${perfSeries.length} Gerçek Model`}
              </span>
            </div>
            <ModelPerformanceChart data={perfSeries} />
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-pitch-850 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-sky-400" />
                <h3 className="text-sm font-bold text-white">Olasılık Kalibrasyon Eğrisi</h3>
              </div>
              <span className="text-[11px] text-slate-400">
                {isDemoMode ? "Demo Kalibrasyon" : "Gerçek Brier Kalibrasyonu"}
              </span>
            </div>
            <CalibrationCurveChart data={calSeries} />
          </div>
        </div>

        {/* Latest Runs Strip */}
        {dashboardData?.latest_runs && dashboardData.latest_runs.length > 0 && (
          <div className="rounded-2xl border border-slate-800/90 bg-pitch-850 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">⏱️ Son Analiz Koşuları</h3>
              <button onClick={() => onNavigate("jobs")} className="text-xs text-sky-400 hover:text-sky-300">
                Tüm Görevler →
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {dashboardData.latest_runs.slice(0, 6).map((r) => (
                <div key={r.run_id} className="rounded-xl border border-slate-800 bg-pitch-900 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{r.run_type}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="mt-1.5 text-[11px] text-slate-400 tabular-nums">
                    {r.analysis_day_tr} • {r.matches_analyzed} maç • Kapsam %{Math.round((r.avg_data_coverage || 0) * 100)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === "top15") {
    const matches = top15Data?.matches || fixtures.filter((f) => f.is_selected_top15 === 1).slice(0, 15);
    const summary = top15Data?.summary || {
      total_matches: matches.length,
      live_count: matches.filter((m) => (m.effective_status || m.status) === "live").length,
      finished_count: matches.filter((m) => (m.effective_status || m.status) === "finished").length,
      scheduled_count: matches.filter((m) => (m.effective_status || m.status) === "scheduled").length,
      picks_won: matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "won").length,
      picks_lost: matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "lost").length,
      picks_live_won: matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "live_won").length,
      picks_live_lost: matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "live_lost").length,
      picks_pending: matches.flatMap((m) => m.top_picks || []).filter((p) => p.eval_state === "pending").length,
    };
    const filtered = matches.filter((m) => {
      if (top15Filter === "all") return true;
      return (m.effective_status || m.status) === top15Filter;
    });
    const grouped = groupByLeague(filtered);
    const totalDecided = summary.picks_won + summary.picks_lost;
    const hitRate = totalDecided > 0 ? Math.round((summary.picks_won / totalDecided) * 100) : null;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">
              🎯 Günün Seçilen 15 Maçı &amp; En Değerli 2 Gerçek Oranlı Tercih
            </h2>
            <p className="text-xs text-slate-400">
              Tüm İddaa oranları (1.30–3.60) incelenerek seçildi ({top15Data?.analysis_day_tr || "Güncel"}) • Yalnızca gerçek oranı olan olasılıklar gösterilir
            </p>
          </div>
          <button
            onClick={onRefreshScores}
            className="rounded-xl border border-slate-700 bg-pitch-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            🔄 Skorları Güncelle
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 tabular-nums">
          <div className="rounded-xl border border-slate-800 bg-pitch-850 p-3">
            <div className="text-[11px] text-slate-400">Seçilen Maç</div>
            <div className="mt-1 text-xl font-bold text-white">{summary.total_matches}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-850 p-3">
            <div className="text-[11px] text-slate-400">Canlı / Biten</div>
            <div className="mt-1 text-xl font-bold text-sky-300">
              {summary.live_count} / {summary.finished_count}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <div className="text-[11px] text-emerald-300">🟢 Tuttu (Biten+Canlı)</div>
            <div className="mt-1 text-xl font-bold text-emerald-300">
              {summary.picks_won + summary.picks_live_won}
            </div>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3">
            <div className="text-[11px] text-rose-300">🔴 Tutmadı</div>
            <div className="mt-1 text-xl font-bold text-rose-300">
              {summary.picks_lost + summary.picks_live_lost}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-850 p-3">
            <div className="text-[11px] text-slate-400">⏳ Bekleyen Tercih</div>
            <div className="mt-1 text-xl font-bold text-slate-200">{summary.picks_pending}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-850 p-3">
            <div className="text-[11px] text-slate-400">Biten Başarı Oranı</div>
            <div className="mt-1 text-xl font-bold text-amber-300">
              {hitRate !== null ? `%${hitRate}` : "-"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {([
            ["all", `Tümü (${matches.length})`],
            ["live", `🔴 Canlı (${summary.live_count})`],
            ["finished", `🏁 Biten (${summary.finished_count})`],
            ["scheduled", `🕒 Başlamadı (${summary.scheduled_count})`],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTop15Filter(key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                top15Filter === key
                  ? "bg-emerald-600 text-white"
                  : "border border-slate-700 bg-pitch-850 text-slate-300 hover:bg-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-6 text-sm text-slate-400">
            Bu filtrede seçili maç bulunmuyor. Yeni analiz başlatmak için üstteki <b>Şimdi Analiz Et</b> butonunu kullanabilirsiniz.
          </div>
        ) : (
          grouped.map(([leagueName, leagueFixtures]) => (
            <div key={leagueName} className="space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2">
                <span className="text-sm font-semibold text-emerald-300">🏆 {leagueName}</span>
                <span className="text-xs text-emerald-200/80 tabular-nums">{leagueFixtures.length} maç</span>
              </div>
              <div className="grid gap-3">
                {leagueFixtures.map((f) => (
                  <MatchTrackingCard key={f.fixture_id} f={f} onSelectFixture={onSelectFixture} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (tab === "coupons") {
    const todayCoupons = couponsData?.today_coupons || [];
    const historyCoupons = couponsData?.history_coupons || [];
    const balanced = todayCoupons.find((c) => c.coupon_type === "balanced") || todayCoupons[0];
    const highOdds = todayCoupons.find((c) => c.coupon_type === "high_odds") || todayCoupons[1];

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">🎟️ Kuponlarım — Günlük 2 × 4 Maçlık Özel Şablon</h2>
            <p className="text-xs text-slate-400">
              Gerçek İddaa bülteni oranlarından (1.30–3.60) farklı 4'er maç seçilerek otomatik hazırlanır ({couponsData?.analysis_day_tr || "Güncel"})
            </p>
          </div>
          <button
            onClick={onRefreshScores}
            className="rounded-xl border border-slate-700 bg-pitch-850 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-800"
          >
            🔄 Kuponları Güncelle
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 tabular-nums">
          <div className="rounded-xl border border-slate-800 bg-pitch-850 p-3">
            <div className="text-[11px] text-slate-400">Analiz Günü</div>
            <div className="mt-1 text-base font-bold text-white">{couponsData?.analysis_day_tr || "-"}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-850 p-3">
            <div className="text-[11px] text-slate-400">Günlük Kupon</div>
            <div className="mt-1 text-xl font-bold text-sky-300">{todayCoupons.length} / 2</div>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
            <div className="text-[11px] text-emerald-300">🛡️ Dengeli Toplam Oran</div>
            <div className="mt-1 text-xl font-bold text-emerald-300">
              {balanced ? `${Number(balanced.total_odd).toFixed(2)}x` : "-"}
            </div>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="text-[11px] text-amber-300">🚀 Yüksek Toplam Oran</div>
            <div className="mt-1 text-xl font-bold text-amber-300">
              {highOdds ? `${Number(highOdds.total_odd).toFixed(2)}x` : "-"}
            </div>
          </div>
        </div>

        {todayCoupons.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-6 text-sm text-slate-400">
            Henüz günlük kupon oluşturulmamış. Başlamamış maçlar için yeni kupon üretmek adına üstteki <b>Şimdi Analiz Et</b> butonuna basın.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {todayCoupons.map((c) => (
              <CouponTemplateCard key={c.coupon_id} coupon={c} />
            ))}
          </div>
        )}

        {historyCoupons.length > 0 && (
          <div className="space-y-3 border-t border-slate-800 pt-4">
            <h3 className="text-base font-semibold text-slate-200">📜 Geçmiş Günlerin Kuponları</h3>
            <div className="grid gap-4 lg:grid-cols-2">
              {historyCoupons.map((c) => (
                <CouponTemplateCard key={c.coupon_id} coupon={c} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab === "live") {
    const rawLive = (liveData?.live_matches || fixtures).filter(
      (f) => (f.effective_status || f.status) === "live"
    );
    const liveList = liveScope === "top15" ? rawLive.filter((m) => m.is_selected_top15 === 1) : rawLive;
    const groupedLive = groupByLeague(liveList);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">
              🔴 Canlı Sonuçlar ({liveList.length} canlı maç)
            </h2>
            <p className="text-xs text-slate-400">
              Yalnızca şu anda canlı oynanan karşılaşmalar • Biten maçlar Sonuçlar sekmesinde görünür
              {liveData?.updated_at_utc ? ` • Son güncelleme: ${liveData.updated_at_utc.slice(11, 19)} UTC` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onToggleAutoRefreshLive}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                autoRefreshLive
                  ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
                  : "border border-slate-700 bg-pitch-850 text-slate-300"
              }`}
            >
              {autoRefreshLive ? "⏱️ 30sn Oto-Yenileme Açık" : "⏸️ Oto-Yenileme Kapalı"}
            </button>
            <button
              onClick={onRefreshScores}
              className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
            >
              🔄 Şimdi Güncelle
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setLiveScope("all")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              liveScope === "all" ? "bg-emerald-600 text-white" : "border border-slate-700 bg-pitch-850 text-slate-300"
            }`}
          >
            Tüm Canlılar ({rawLive.length} canlı)
          </button>
          <button
            onClick={() => setLiveScope("top15")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
              liveScope === "top15" ? "bg-emerald-600 text-white" : "border border-slate-700 bg-pitch-850 text-slate-300"
            }`}
          >
            ⭐ Sadece Seçilen 15 ({rawLive.filter((m) => m.is_selected_top15 === 1).length} canlı)
          </button>
        </div>

        {groupedLive.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-5 text-sm text-slate-400">
            Şu anda canlı oynanan analiz edilmiş maç bulunmuyor. Tamamlanan maçları <b>🏁 Sonuçlar</b> sekmesinden görebilirsiniz.
          </div>
        ) : (
          groupedLive.map(([leagueName, items]) => (
            <div key={leagueName} className="space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-rose-500/25 bg-rose-500/10 px-3.5 py-2">
                <span className="text-sm font-semibold text-rose-200">🔴 {leagueName}</span>
                <span className="text-xs text-rose-200/80 tabular-nums">{items.length} canlı</span>
              </div>
              <div className="grid gap-3">
                {items.map((f) => (
                  <MatchTrackingCard key={f.fixture_id} f={f} onSelectFixture={onSelectFixture} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (tab === "fixtures" || tab === "history" || tab === "results") {
    const nowMs = Date.now();
    const sourceRows =
      tab === "results"
        ? fixtures.filter((f) => (f.effective_status || f.status) === "finished")
        : tab === "fixtures"
        ? fixtures.filter((f) => {
            const st = f.effective_status || f.status;
            if (st !== "scheduled") return false;
            if (f.score_home !== null && f.score_home !== undefined) return false;
            if (!isDemoMode && f.kickoff_tr) {
              const koMs = new Date(f.kickoff_tr).getTime();
              if (!Number.isNaN(koMs) && koMs <= nowMs) return false;
            }
            return true;
          })
        : fixtures;
    const grouped = groupByLeague(sourceRows);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-100">
            {tab === "fixtures"
              ? `Tüm Bülten – Başlamamış Maçlar (${sourceRows.length} maç, ${grouped.length} lig)`
              : tab === "history"
              ? `Değiştirilemez Geçmiş Analizler (${sourceRows.length} maç)`
              : `Sonuç Takip Merkezi (${sourceRows.length} tamamlanan maç)`}
          </h2>
          <button
            onClick={onRefreshScores}
            className="rounded-xl border border-slate-700 bg-pitch-850 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800"
          >
            🔄 Skorları Yenile
          </button>
        </div>
        {grouped.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-5 text-sm text-slate-400">
            {tab === "fixtures" ? "Şu anda başlamamış bülten maçı bulunmuyor." : "Henüz gösterilecek kayıt bulunmuyor."}
          </div>
        ) : (
          grouped.map(([leagueName, leagueFixtures]) => (
            <div key={leagueName} className="space-y-2.5">
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-2">
                <span className="text-sm font-semibold text-emerald-300">🏆 {leagueName}</span>
                <span className="text-xs text-emerald-200/80 tabular-nums">{leagueFixtures.length} maç</span>
              </div>
              <div className="grid gap-3">
                {leagueFixtures.map((f) => (
                  <MatchTrackingCard key={f.fixture_id} f={f} onSelectFixture={onSelectFixture} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (tab === "research") {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-pitch-850 p-5">
        <h2 className="text-lg font-bold text-white">Araştırma Merkezi (Manuel Analiz Kuyruğu)</h2>
        <p className="text-sm text-slate-400">
          Takım veya karşılaşma adı girerek GitHub Actions kuyruğuna gerçek araştırma görevi ekleyin. Tamamlandığında sonuçlar panelde görünür.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Örn: Galatasaray, Real Madrid..."
            className="flex-1 rounded-xl border border-slate-700 bg-pitch-900 px-3.5 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
          />
          <button
            onClick={() => {
              if (query.trim()) {
                onDispatchQuery(query.trim());
                setQuery("");
              }
            }}
            className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Araştırmayı Kuyruğa Ekle
          </button>
        </div>
      </div>
    );
  }

  if (tab === "match_detail" || tab === "lineups") {
    const fx = fixtureDetail?.fixture || selectedFixture || fixtures[0];
    const records = fixtureDetail?.research_records || [];
    const lineups = fixtureDetail?.lineups || [];
    const markets = fixtureDetail?.markets || {};
    const revisions = fixtureDetail?.revisions || [];

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-white">
              {tab === "lineups" ? "Oyuncu ve Kadro Bilgileri" : "Karşılaşma Detayları & 12 Ajan Analizi"}
            </h2>
            {fx && (
              <div className="flex gap-2">
                <button
                  onClick={() => onSelectFixture(fx)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab === "match_detail" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
                >
                  Analiz Detayı
                </button>
                <button
                  onClick={() => onSelectLineup(fx)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab === "lineups" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-300"}`}
                >
                  Kadro &amp; Revizyonlar
                </button>
              </div>
            )}
          </div>

          {fx ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {fx.iddaa_match_code && (
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-sky-300">
                    Kod: {fx.iddaa_match_code}
                  </span>
                )}
                <MatchStatusPill f={fx} />
                {fx.model_version && (
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                    Model: {fx.model_version}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xl font-extrabold text-emerald-300">
                    {fx.home_team_name} - {fx.away_team_name}
                  </div>
                  <div className="text-xs text-slate-400">
                    {fx.league_name} • {fx.kickoff_tr} • Kaynak: {fx.bulletin_source}
                  </div>
                </div>
                {fx.score_home !== null && fx.score_home !== undefined && (
                  <div className="rounded-xl border border-slate-700 bg-pitch-900 px-4 py-2 text-center tabular-nums">
                    <div className="text-2xl font-black text-white">
                      {fx.score_home} - {fx.score_away}
                    </div>
                    {fx.ht_home !== null && fx.ht_home !== undefined && (
                      <div className="text-[11px] text-slate-400">İY: {fx.ht_home}-{fx.ht_away}</div>
                    )}
                  </div>
                )}
              </div>

              <ProbabilitySplitBar probHome={fx.prob_home} probDraw={fx.prob_draw} probAway={fx.prob_away} />
              <TopPicksGrid picks={fx.top_picks} />

              {fx.prob_home !== undefined && fx.prob_home !== null && (
                <div className="grid grid-cols-2 gap-2.5 pt-2 text-xs sm:grid-cols-4 tabular-nums">
                  <div className="rounded-xl bg-pitch-900 p-3">
                    <div className="text-[11px] text-slate-400">1 - X - 2</div>
                    <div className="mt-1 font-bold text-white">
                      %{Math.round(fx.prob_home * 100)} / %{Math.round((fx.prob_draw || 0) * 100)} / %{Math.round((fx.prob_away || 0) * 100)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-pitch-900 p-3">
                    <div className="text-[11px] text-slate-400">KG Var</div>
                    <div className="mt-1 font-bold text-white">%{Math.round((fx.prob_btts_yes || 0) * 100)}</div>
                  </div>
                  <div className="rounded-xl bg-pitch-900 p-3">
                    <div className="text-[11px] text-slate-400">2.5 Üst</div>
                    <div className="mt-1 font-bold text-white">%{Math.round((fx.prob_over_25 || 0) * 100)}</div>
                  </div>
                  <div className="rounded-xl bg-pitch-900 p-3">
                    <div className="text-[11px] text-slate-400">Veri Kapsamı</div>
                    <div className="mt-1 font-bold text-sky-300">%{Math.round((fx.data_coverage_score || 0) * 100)}</div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-slate-400">Seçili karşılaşma bulunmuyor.</div>
          )}
        </div>

        {detailLoading && (
          <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-5 text-xs text-slate-400">
            ⏳ Karşılaşma araştırma modülleri ve pazar detayları yükleniyor...
          </div>
        )}

        {fx && !detailLoading && tab === "match_detail" && (
          <>
            {Object.keys(markets).length > 0 && (
              <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-5 space-y-3">
                <h3 className="text-sm font-bold text-white">📊 Pazar Olasılıkları &amp; Veri Durumu</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(markets)
                    .filter(([k]) => k !== "extended_pick_probs")
                    .map(([k, m]) => (
                      <div key={k} className="rounded-xl border border-slate-800 bg-pitch-900 p-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-white">{MARKET_LABELS_TR[k] || k}</span>
                          <span className={`text-[10px] font-bold ${m.available ? "text-emerald-400" : "text-slate-500"}`}>
                            {m.available ? "MEVCUT" : "VERİ YOK"}
                          </span>
                        </div>
                        {m.available && m.probabilities ? (
                          <div className="mt-2 flex flex-wrap gap-1.5 tabular-nums">
                            {Object.entries(m.probabilities).slice(0, 6).map(([pk, pv]) => (
                              <span key={pk} className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
                                {pk}: %{Math.round(Number(pv) * 100)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-1.5 text-[11px] text-slate-400">{m.reason || "Açık kaynaklarda veri bulunamadı"}</div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">🤖 12 Araştırma Modülü Çıktıları</h3>
              {records.length === 0 ? (
                <div className="text-xs text-slate-400">
                  Bu karşılaşma için veritabanında kayıtlı ajan raporu henüz çekilmedi veya yalnızca özet istatistikler saklandı.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {records.map((r) => (
                    <div key={r.agent_id} className="rounded-xl border border-slate-800 bg-pitch-900 p-3.5 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-400">{r.agent_id.toUpperCase()}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <div className="font-semibold text-white">{r.agent_name}</div>
                      <div className="text-slate-300">{r.summary_tr}</div>
                      <div className="text-[10px] text-slate-500 tabular-nums">
                        Kapsam: %{Math.round((r.data_coverage || 0) * 100)} • {r.source_name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {fx && !detailLoading && tab === "lineups" && (
          <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">👥 Kesin / Muhtemel İlk 11 &amp; Tahmin Revizyonları</h3>
            {lineups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-800 bg-pitch-900/60 p-4 text-xs text-slate-400">
                Bu karşılaşma için açık kaynaklardan alınmış doğrulanmış kadro kaydı bulunmuyor. Sistem doğrulanmayan muhtemel kadroları kesinmiş gibi sunmaz.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {lineups.map((l) => (
                  <div key={l.id} className="rounded-xl border border-slate-800 bg-pitch-900 p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white">
                        {l.team_side === "home" ? fx.home_team_name : fx.away_team_name} ({l.lineup_type})
                      </span>
                      {l.formation && <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">{l.formation}</span>}
                    </div>
                    <div className="text-slate-300">{l.starters.join(", ") || "-"}</div>
                    {l.diff_summary_tr && <div className="text-[11px] text-amber-300">{l.diff_summary_tr}</div>}
                    <div className="text-[10px] text-slate-500">{l.source_name} • {l.fetched_at}</div>
                  </div>
                ))}
              </div>
            )}

            {revisions.length > 0 && (
              <div className="space-y-2 border-t border-slate-800 pt-3">
                <h4 className="text-xs font-semibold text-slate-300">Kadro Revizyon Geçmişi</h4>
                {revisions.map((rev) => (
                  <div key={rev.revision_id} className="rounded-lg bg-pitch-900 p-2.5 text-xs text-slate-300">
                    <div className="font-medium text-white">{rev.reason}</div>
                    <div className="text-[11px] text-slate-400 tabular-nums">
                      Revize 1-X-2: %{Math.round(rev.prob_home * 100)} / %{Math.round(rev.prob_draw * 100)} / %{Math.round(rev.prob_away * 100)} • {rev.created_at_utc}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (tab === "leagues") {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white">Lig Yönetimi</h2>
        <div className="grid gap-2 rounded-2xl border border-slate-800 bg-pitch-850 p-4 sm:grid-cols-5">
          <input value={newLeagueId} onChange={(e) => setNewLeagueId(e.target.value)} placeholder="org_id (örn: tr_kupa)" className="rounded-lg border border-slate-700 bg-pitch-900 px-2.5 py-2 text-xs text-white" />
          <input value={newLeagueName} onChange={(e) => setNewLeagueName(e.target.value)} placeholder="Lig Adı (TR)" className="rounded-lg border border-slate-700 bg-pitch-900 px-2.5 py-2 text-xs text-white" />
          <input value={newLeagueCountry} onChange={(e) => setNewLeagueCountry(e.target.value)} placeholder="Ülke" className="rounded-lg border border-slate-700 bg-pitch-900 px-2.5 py-2 text-xs text-white" />
          <input value={newLeagueCode} onChange={(e) => setNewLeagueCode(e.target.value)} placeholder="Ülke Kodu (TR)" className="rounded-lg border border-slate-700 bg-pitch-900 px-2.5 py-2 text-xs text-white" />
          <button
            onClick={() => {
              if (newLeagueId && newLeagueName) {
                onAddLeague({ organization_id: newLeagueId, name_tr: newLeagueName, country: newLeagueCountry || "Diğer", country_code: newLeagueCode || "INT" });
                setNewLeagueId(""); setNewLeagueName("");
              }
            }}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            Lig Ekle
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((lg) => (
            <div key={lg.organization_id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-pitch-850 p-3">
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
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">Model Performans &amp; Kalibrasyon Grafikleri</h2>
            <p className="text-xs text-slate-400">
              Kronolojik walk-forward backtest sonuçları ve canlı Brier/Log-Loss metrikleri (sıfır gelecek sızıntısı)
            </p>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Doğruluk Karşılaştırması</h3>
            <ModelPerformanceChart data={perfSeries} />
          </div>
          <div className="rounded-2xl border border-slate-800 bg-pitch-850 p-4">
            <h3 className="mb-3 text-sm font-semibold text-white">Kalibrasyon Eğrisi</h3>
            <CalibrationCurveChart data={calSeries} />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-pitch-850">
          <div className="border-b border-slate-800 px-4 py-3 text-sm font-bold text-white">
            📊 Walk-Forward Backtest Geçmişi ({backtests.length})
          </div>
          {backtests.length === 0 ? (
            <div className="p-4 text-xs text-slate-400">
              Henüz kayıtlı walk-forward backtest sonucu yok. Gece 02:30 TRT işi veya <code>scripts/run_backtest.py</code> çalıştırıldığında burada görünür.
            </div>
          ) : (
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="p-3">Model</th>
                  <th className="p-3">Kaynak</th>
                  <th className="p-3">Maç</th>
                  <th className="p-3">Doğruluk</th>
                  <th className="p-3">Brier</th>
                  <th className="p-3">LogLoss</th>
                  <th className="p-3">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {backtests.map((bt) => (
                  <tr key={bt.backtest_id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-semibold text-emerald-300">{bt.model_name}</td>
                    <td className="p-3 text-slate-300">{bt.dataset_source}</td>
                    <td className="p-3 text-white">{bt.evaluated_matches}</td>
                    <td className="p-3 font-bold text-white">%{(bt.accuracy * 100).toFixed(1)}</td>
                    <td className="p-3 text-sky-300">{bt.brier_score.toFixed(4)}</td>
                    <td className="p-3 text-slate-300">{bt.log_loss.toFixed(4)}</td>
                    <td className="p-3 text-slate-400">{bt.created_at_utc.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (tab === "sources") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">Veri Kaynakları Sağlık Kontrol Ekranı</h2>
            <p className="text-xs text-slate-400">Her kaynağın son başarılı bağlantısı, veri kapsamı, hata durumu ve gecikmesi.</p>
          </div>
          <button
            onClick={onRunSourceCheck}
            className="rounded-xl bg-sky-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-500"
          >
            Canlı Bağlantı Testi Başlat
          </button>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-pitch-850">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400">
              <tr>
                <th className="p-3">Kaynak</th>
                <th className="p-3">Durum</th>
                <th className="p-3">Son Başarılı Bağlantı</th>
                <th className="p-3">Gecikme</th>
                <th className="p-3">Kapsam / Hata Özeti</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {sources.map((s) => (
                <tr key={s.source_id} className="hover:bg-slate-800/40">
                  <td className="p-3 font-medium text-white">
                    {s.name}
                    <div className="text-[11px] text-slate-400">{s.source_id}</div>
                  </td>
                  <td className="p-3"><StatusBadge status={s.status || "untested"} /></td>
                  <td className="p-3 text-slate-300 tabular-nums">{s.last_success_at || "-"}</td>
                  <td className="p-3 text-slate-300 tabular-nums">{s.latency_ms !== null ? `${s.latency_ms} ms` : "-"}</td>
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
        <h2 className="text-lg font-bold text-white">Araştırma Modüllerinin Durum Ekranı (Harici LLM Bağımsız)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_LIST.map(([id, name, desc]) => (
            <div key={id} className="rounded-2xl border border-slate-800 bg-pitch-850 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400">{id}</span>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">Hazır</span>
              </div>
              <div className="mt-1.5 font-semibold text-white">{name}</div>
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-white">Bulut Kullanım Limitleri (FREE_ONLY_MODE: Aktif)</h2>
          <span className="rounded-full border border-emerald-500/35 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
            Sıfır Maliyet Koruması Açık
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {visibleLimits.map((lim) => {
            const pct = lim.max_limit ? Math.min(100, (lim.used_amount / lim.max_limit) * 100) : 0;
            const barColor =
              pct >= lim.hard_stop_threshold_pct
                ? "bg-rose-500"
                : pct >= lim.warn_threshold_pct
                ? "bg-amber-500"
                : "bg-emerald-500";
            return (
              <div key={lim.resource_key} className="rounded-2xl border border-slate-800 bg-pitch-850 p-4 tabular-nums">
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-white">{lim.label_tr}</span>
                  <span className="text-slate-300">{lim.used_amount} / {lim.max_limit} {lim.unit}</span>
                </div>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
                  <span>Uyarı: %{lim.warn_threshold_pct} • Durdurma: %{lim.hard_stop_threshold_pct}</span>
                  <span>%{pct.toFixed(1)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (tab === "jobs") {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-pitch-850 p-5">
          <div>
            <h2 className="text-lg font-bold text-white">Otomatik Görev Yönetimi (GitHub Actions)</h2>
            <p className="text-xs text-slate-400">Zamanlanmış işler ve kuyrukta bekleyen/tamamlanan manuel tetiklemeler</p>
          </div>
          <button
            onClick={onRunAnalysisNow}
            disabled={runningNow}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Zap className="h-3.5 w-3.5" />
            {runningNow ? "Analiz Başlatılıyor..." : "Şimdi Analiz Et"}
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {(scheduledJobs.length > 0
            ? scheduledJobs
            : [
                { job_key: "morning_0800", name_tr: "Sabah Kapsamlı Analiz (08:00 TRT)", schedule_tr: "Her gün 08:00 TRT", cron_utc: "0 5 * * *", enabled: 1, last_status: "never" },
                { job_key: "midday_1159", name_tr: "Öğle Bağımsız Analiz (11:59 TRT)", schedule_tr: "Her gün 11:59 TRT", cron_utc: "59 8 * * *", enabled: 1, last_status: "never" },
                { job_key: "lineup_monitor", name_tr: "Canlı Skor & Kuyruk Takibi", schedule_tr: "30 dk aralık", cron_utc: "*/30 9-23 * * *", enabled: 1, last_status: "never" },
                { job_key: "results_and_learning", name_tr: "Sonuç Çekme & Model Öğrenmesi", schedule_tr: "Her gün 02:30 TRT", cron_utc: "30 23 * * *", enabled: 1, last_status: "never" },
              ] as ScheduledJobRow[]
          ).map((sj) => (
            <div key={sj.job_key} className="rounded-2xl border border-slate-800 bg-pitch-850 p-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">{sj.name_tr}</span>
                <StatusBadge status={sj.last_status || "never"} />
              </div>
              <div className="mt-1.5 text-slate-400">
                {sj.schedule_tr} • Cron UTC: <code>{sj.cron_utc}</code>
              </div>
              {sj.last_run_at_tr && (
                <div className="mt-1 text-[11px] text-sky-300 tabular-nums">Son çalışma: {sj.last_run_at_tr}</div>
              )}
            </div>
          ))}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-pitch-850">
          <div className="border-b border-slate-800 px-4 py-3 text-sm font-bold text-white">
            📋 Manuel İş Kuyruğu ({jobs.length})
          </div>
          {jobs.length === 0 ? (
            <div className="p-4 text-xs text-slate-400">Henüz manuel tetiklenmiş iş kaydı yok.</div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="p-3">İş ID</th>
                  <th className="p-3">Tip</th>
                  <th className="p-3">Durum</th>
                  <th className="p-3">Oluşturulma</th>
                  <th className="p-3">Sonuç Özeti</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {jobs.map((j) => (
                  <tr key={j.job_id} className="hover:bg-slate-800/40">
                    <td className="p-3 font-mono text-sky-300">{j.job_id}</td>
                    <td className="p-3 text-white">{j.job_type}</td>
                    <td className="p-3"><StatusBadge status={j.status} /></td>
                    <td className="p-3 text-slate-400 tabular-nums">{j.created_at_utc}</td>
                    <td className="p-3 text-slate-300">{j.result_summary_tr || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (tab === "logs") {
    return (
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-pitch-850 p-5">
        <h2 className="text-lg font-bold text-white">Hata ve Güvenlik Kayıtları</h2>
        {logs.length === 0 ? (
          <div className="text-sm text-slate-400">Kayıtlı hata yok. {isDemoMode ? "(Önizleme modu)" : ""}</div>
        ) : (
          <div className="space-y-2 text-xs">
            {logs.map((l, idx) => (
              <div key={idx} className="rounded-xl bg-pitch-900 p-2.5 font-mono text-slate-300">
                [{l.level}] {l.created_at_utc} • {l.module}: {l.message}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-pitch-850 p-5 text-sm text-slate-300">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-white">Genel Sistem Ayarları (PWA-Only Modu)</h2>
        </div>
        <p>• Çalışma Modu: <code>PWA Panel (Telegram Devre Dışı)</code></p>
        <p>• Saat Dilimi: <code>Europe/Istanbul</code> (UTC+3)</p>
        <p>• Günlük Bülten &amp; Seçim: <code>250 maça kadar tarama</code> → <code>Seçilen 15 Maç</code> (1.30–3.60 oranlı en değerli 2 olasılık)</p>
        <p>• Günlük Kuponlar: <code>2 adet 4'lü Kupon</code> (Dengeli + Yüksek Oran, farklı maçlardan)</p>
        <p>• <code>FREE_ONLY_MODE</code>: <code>Aktif</code> (Ücretli AI ve ücretli futbol API kullanımı engellidir)</p>
        <p>• <code>football-data.co.uk</code>: Kalıcı olarak devre dışı bırakıldı</p>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-800 bg-pitch-850 p-5 text-xs text-slate-300">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Smartphone className="h-4 w-4 text-sky-400" />
          <h3>iPhone (iOS) &amp; Android Ana Ekrana Uygulama Olarak Ekleme</h3>
        </div>
        <p>1. iPhone'da panel bağlantısını <b>Safari</b>, Android'de <b>Chrome</b> tarayıcısında açıp giriş yapın (oturum 7 gün hatırlanır).</p>
        <p>2. Safari'de alttaki <b>Paylaş (oklu kare)</b> simgesine, Chrome'da sağ üst menüye dokunun.</p>
        <p>3. <b>Ana Ekrana Ekle</b> seçeneğine dokunun; AyzEla AI tam ekran PWA uygulaması olarak ana ekrana eklenecektir.</p>
      </div>
    </div>
  );
}
