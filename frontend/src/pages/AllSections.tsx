import React, { useState } from "react";
import { CalibrationCurveChart, ModelPerformanceChart } from "../components/Charts";
import {
  CouponRow,
  CouponsResponse,
  FixtureRow,
  ISOLATED_DEMO_PREVIEW,
  LeagueRow,
  LiveResponse,
  SourceHealthRow,
  TelegramSubscribersResponse,
  Top15Response,
  TopPickItem,
  UsageLimitRow,
} from "../services/api";

export type PanelTabId =
  | "top15"
  | "coupons"
  | "live"
  | "fixtures"
  | "results"
  | "dashboard"
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
  | "telegram"
  | "settings";

export const PANEL_SECTIONS: Array<{ id: PanelTabId; title: string; short: string }> = [
  { id: "top15", title: "1. Seçilen 15 Maç Takibi", short: "Seçilen 15" },
  { id: "coupons", title: "2. Kuponlarım (Günlük 2x4)", short: "Kuponlarım" },
  { id: "live", title: "3. Canlı Sonuçlar", short: "Canlı" },
  { id: "fixtures", title: "4. Tüm Bülten Maçları", short: "Bülten" },
  { id: "results", title: "5. Sonuç Takip Merkezi", short: "Sonuçlar" },
  { id: "dashboard", title: "6. Ana Kontrol Ekranı", short: "Özet" },
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
  { id: "telegram", title: "18. Telegram & iPhone Erişimi", short: "Telegram" },
  { id: "settings", title: "19. Genel Sistem Ayarları", short: "Ayarlar" },
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
    <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-0.5 text-[11px] text-slate-300">
      🕒 {f.kickoff_tr.slice(11, 16)} TRT
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
          ? "border-emerald-500/70 bg-emerald-500/20 text-emerald-100"
          : isRed
          ? "border-rose-500/70 bg-rose-500/20 text-rose-100"
          : "border-slate-700 bg-pitch-900 text-slate-200";
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
          <div key={p.key} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${cardStyle}`}>
            <div>
              <div className="font-semibold">{p.label_tr}</div>
              <div className="text-[11px] opacity-90">
                Olasılık: %{Math.round((p.probability || 0) * 100)} • İddaa Oranı:{" "}
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
    <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {f.is_selected_top15 ? (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                ⭐ #{f.selection_rank || "•"} Seçilen 15
              </span>
            ) : null}
            {f.iddaa_match_code && (
              <span className="rounded bg-slate-700/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-300">
                Kod: {f.iddaa_match_code}
              </span>
            )}
            <MatchStatusPill f={f} />
            <span className="text-[11px] text-slate-400">{f.kickoff_tr.slice(0, 16).replace("T", " ")}</span>
          </div>
          <div className="mt-1.5 text-base font-semibold text-white">
            {f.home_team_name} - {f.away_team_name}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasScore && (
            <div className="rounded-lg border border-slate-700 bg-pitch-900 px-3 py-1.5 text-center">
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
            className="rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-600"
          >
            Detay
          </button>
        </div>
      </div>
      <TopPicksGrid picks={f.top_picks} />
    </div>
  );
}

function CouponTemplateCard({ coupon }: { coupon: CouponRow }) {
  const isBalanced = coupon.coupon_type === "balanced";
  const st = coupon.effective_status || "pending";
  const headerAccent = isBalanced
    ? "border-emerald-500/35 bg-emerald-500/10"
    : "border-amber-500/35 bg-amber-500/10";
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
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-pitch-800 shadow-lg">
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
        <div className="rounded-xl border border-amber-400/40 bg-pitch-900/90 px-3 py-1.5 text-right">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Toplam Oran</div>
          <div className="text-lg font-extrabold text-amber-300">{Number(coupon.total_odd).toFixed(2)}</div>
        </div>
      </div>

      <div className="divide-y divide-slate-800/80 p-3">
        {coupon.legs.map((leg, idx) => {
          const ev = leg.eval_state || "pending";
          const isGreen = ev === "won" || ev === "live_won";
          const isRed = ev === "lost" || ev === "live_lost";
          const rowBg = isGreen
            ? "bg-emerald-500/10"
            : isRed
            ? "bg-rose-500/10"
            : "bg-transparent";
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
                    <span className="rounded bg-slate-700/80 px-1.5 py-0.5 font-mono text-[10px] text-sky-300">
                      Kod: {leg.iddaa_match_code}
                    </span>
                  )}
                  <span className="truncate">{leg.league_name}</span>
                  <span>• {String(leg.kickoff_tr || "").slice(11, 16)}</span>
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-white">
                  {leg.home_team} - {leg.away_team}
                  {hasScore && (
                    <span className="ml-2 rounded bg-pitch-900 px-1.5 py-0.5 text-xs font-bold text-sky-300">
                      {leg.score_home}-{leg.score_away} {leg.live_minute || ""}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
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

export function PanelContent({
  tab,
  fixtures,
  top15Data,
  couponsData,
  liveData,
  sources,
  leagues,
  limits,
  logs,
  tgSubscribers,
  selectedFixture,
  onSelectFixture,
  onToggleLeague,
  onAddLeague,
  onDispatchQuery,
  onRunSourceCheck,
  onRunAnalysisNow,
  onRefreshScores,
  onAddSubscriber,
  onRemoveSubscriber,
  autoRefreshLive,
  onToggleAutoRefreshLive,
  runningNow,
  isDemoMode,
}: {
  tab: PanelTabId;
  fixtures: FixtureRow[];
  top15Data: Top15Response | null;
  couponsData: CouponsResponse | null;
  liveData: LiveResponse | null;
  sources: SourceHealthRow[];
  leagues: LeagueRow[];
  limits: UsageLimitRow[];
  logs: any[];
  tgSubscribers: TelegramSubscribersResponse | null;
  selectedFixture: FixtureRow | null;
  onSelectFixture: (f: FixtureRow) => void;
  onToggleLeague: (id: string, enabled: boolean) => void;
  onAddLeague: (p: { organization_id: string; name_tr: string; country: string; country_code: string }) => void;
  onDispatchQuery: (q: string) => void;
  onRunSourceCheck: () => void;
  onRunAnalysisNow: () => void;
  onRefreshScores: () => void;
  onAddSubscriber: (p: { telegram_user_id: string; chat_id?: string; display_name?: string }) => Promise<void>;
  onRemoveSubscriber: (uid: string) => Promise<void>;
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
  const [newSubId, setNewSubId] = useState("");
  const [newSubName, setNewSubName] = useState("");

  const healthyCount = sources.filter((s) => s.status === "healthy").length;
  const avgCov = fixtures.length
    ? Math.round((fixtures.reduce((acc, f) => acc + (f.data_coverage_score || 0), 0) / fixtures.length) * 100)
    : 0;

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
              🎯 Günün Seçilen 15 Maçı & En Değerli 2 Gerçek Oranlı Tercih
            </h2>
            <p className="text-xs text-slate-400">
              Tüm İddaa oranları (1.30–3.60) incelenerek seçildi ({top15Data?.analysis_day_tr || "Güncel"}) • Yalnızca gerçek oranı olan olasılıklar gösterilir
            </p>
          </div>
          <button
            onClick={onRefreshScores}
            className="rounded-lg border border-slate-700 bg-pitch-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            🔄 Skorları Güncelle
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-3">
            <div className="text-[11px] text-slate-400">Seçilen Maç</div>
            <div className="mt-1 text-xl font-bold text-white">{summary.total_matches}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-3">
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
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-3">
            <div className="text-[11px] text-slate-400">⏳ Bekleyen Tercih</div>
            <div className="mt-1 text-xl font-bold text-slate-200">{summary.picks_pending}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-3">
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
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                top15Filter === key
                  ? "bg-emerald-600 text-white"
                  : "border border-slate-700 bg-pitch-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {grouped.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-6 text-sm text-slate-400">
            Bu filtrede seçili maç bulunmuyor. Yeni analiz başlatmak için üstteki <b>⚡ Şimdi Analiz Et</b> butonunu kullanabilirsiniz.
          </div>
        ) : (
          grouped.map(([leagueName, leagueFixtures]) => (
            <div key={leagueName} className="space-y-2.5">
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
                <span className="text-sm font-semibold text-emerald-300">🏆 {leagueName}</span>
                <span className="text-xs text-emerald-200/80">{leagueFixtures.length} maç</span>
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
            <h2 className="text-lg font-bold text-white">🎟️ Kuponlarım — Günlük 2 x 4 Maçlık Özel Şablon</h2>
            <p className="text-xs text-slate-400">
              Gerçek İddaa bülteni oranlarından (1.30–3.60) farklı 4'er maç seçilerek otomatik hazırlanır ({couponsData?.analysis_day_tr || "Güncel"})
            </p>
          </div>
          <button
            onClick={onRefreshScores}
            className="rounded-lg border border-slate-700 bg-pitch-800 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-slate-700"
          >
            🔄 Kuponları Güncelle
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-3">
            <div className="text-[11px] text-slate-400">Analiz Günü</div>
            <div className="mt-1 text-base font-bold text-white">{couponsData?.analysis_day_tr || "-"}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-3">
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
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-6 text-sm text-slate-400">
            Henüz günlük kupon oluşturulmamış. Başlamamış maçlar için yeni kupon üretmek adına üstteki <b>⚡ Şimdi Analiz Et</b> butonuna basın.
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
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                autoRefreshLive
                  ? "border border-emerald-500/40 bg-emerald-500/20 text-emerald-200"
                  : "border border-slate-700 bg-pitch-800 text-slate-300"
              }`}
            >
              {autoRefreshLive ? "⏱️ 30sn Oto-Yenileme Açık" : "⏸️ Oto-Yenileme Kapalı"}
            </button>
            <button
              onClick={onRefreshScores}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
            >
              🔄 Şimdi Güncelle
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setLiveScope("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              liveScope === "all" ? "bg-emerald-600 text-white" : "border border-slate-700 bg-pitch-800 text-slate-300"
            }`}
          >
            Tüm Canlılar ({rawLive.length} canlı)
          </button>
          <button
            onClick={() => setLiveScope("top15")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              liveScope === "top15" ? "bg-emerald-600 text-white" : "border border-slate-700 bg-pitch-800 text-slate-300"
            }`}
          >
            ⭐ Sadece Seçilen 15 ({rawLive.filter((m) => m.is_selected_top15 === 1).length} canlı)
          </button>
        </div>

        {groupedLive.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-5 text-sm text-slate-400">
            Şu anda canlı oynanan analiz edilmiş maç bulunmuyor. Tamamlanan maçları <b>🏁 Sonuçlar</b> sekmesinden görebilirsiniz.
          </div>
        ) : (
          groupedLive.map(([leagueName, items]) => (
            <div key={leagueName} className="space-y-2.5">
              <div className="flex items-center justify-between rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2">
                <span className="text-sm font-semibold text-rose-200">🔴 {leagueName}</span>
                <span className="text-xs text-rose-200/80">{items.length} canlı</span>
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

  if (tab === "dashboard") {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-4">
            <div className="text-xs text-slate-400">Analiz Edilen Bülten</div>
            <div className="mt-1 text-2xl font-bold text-emerald-400">{fixtures.filter((f) => f.prob_home !== undefined && f.prob_home !== null).length} / {fixtures.length}</div>
            <div className="mt-1 text-xs text-slate-500">Seçilen ilk 15 ayrı sekmede</div>
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
          <h2 className="text-lg font-semibold text-slate-100">
            {tab === "fixtures"
              ? `Tüm Bülten – Başlamamış Maçlar (${sourceRows.length} maç, ${grouped.length} lig)`
              : tab === "history"
              ? "Değiştirilemez Geçmiş Analizler"
              : `Sonuç Takip Merkezi (${sourceRows.length} tamamlanan maç)`}
          </h2>
          <button
            onClick={onRefreshScores}
            className="rounded-lg border border-slate-700 bg-pitch-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            🔄 Skorları Yenile
          </button>
        </div>
        {grouped.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-pitch-800 p-5 text-sm text-slate-400">
            {tab === "fixtures" ? "Şu anda başlamamış bülten maçı bulunmuyor." : "Henüz gösterilecek kayıt bulunmuyor."}
          </div>
        ) : (
          grouped.map(([leagueName, leagueFixtures]) => (
            <div key={leagueName} className="space-y-2.5">
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
                <span className="text-sm font-semibold text-emerald-300">🏆 {leagueName}</span>
                <span className="text-xs text-emerald-200/80">{leagueFixtures.length} maç</span>
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
            <div className="flex flex-wrap items-center gap-2">
              {fx.iddaa_match_code && (
                <span className="rounded bg-slate-700 px-2 py-0.5 font-mono text-xs text-sky-300">
                  Kod: {fx.iddaa_match_code}
                </span>
              )}
              <MatchStatusPill f={fx} />
            </div>
            <div className="text-base font-bold text-emerald-300">{fx.home_team_name} - {fx.away_team_name}</div>
            <div className="text-xs text-slate-400">{fx.league_name} • {fx.kickoff_tr} • Kaynak: {fx.bulletin_source}</div>
            <TopPicksGrid picks={fx.top_picks} />
            {fx.prob_home !== undefined && fx.prob_home !== null && (
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 pt-2">
                <div className="rounded bg-pitch-900 p-2">1-X-2: %{Math.round(fx.prob_home * 100)} / %{Math.round((fx.prob_draw || 0) * 100)} / %{Math.round((fx.prob_away || 0) * 100)}</div>
                <div className="rounded bg-pitch-900 p-2">KG Var: %{Math.round((fx.prob_btts_yes || 0) * 100)}</div>
                <div className="rounded bg-pitch-900 p-2">2.5 Üst: %{Math.round((fx.prob_over_25 || 0) * 100)}</div>
                <div className="rounded bg-pitch-900 p-2 text-sky-300">Veri Kapsamı: %{Math.round((fx.data_coverage_score || 0) * 100)}</div>
              </div>
            )}
            <p className="text-sm text-slate-300">
              {tab === "lineups"
                ? "Kesin ilk 11 maçtan önce açık kaynaklardan taranır; doğrulanmayan muhtemel kadrolar kesinmiş gibi sunulmaz."
                : "12 bağımsız araştırma modülünün çıktıları, tüm İddaa piyasalarından türetilen olasılıklar ve 1.30–3.60 oranlı en değerli 2 seçim burada gösterilir."}
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
        <h2 className="text-lg font-semibold">Lig Yönetimi</h2>
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
          <li>• 30 dk aralık – Sessiz canlı/biten skor ve kuyruk senkronizasyonu (`lineup_monitor.yml`)</li>
          <li>• 02:30 TRT – Maç sonuçları ve kendini geliştiren piyasa ağırlıkları (`results_and_learning.yml`)</li>
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
    const subs = (tgSubscribers?.subscribers || []).filter((s) => s.enabled);
    const pending = tgSubscribers?.pending_requests || [];
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-slate-800 bg-pitch-800 p-5 space-y-4">
          <h2 className="text-lg font-semibold text-white">📱 Çoklu Telegram Kullanıcı Yönetimi</h2>
          <p className="text-xs text-slate-400">
            Günlük analiz raporları, 2 adet 4'lü kupon ve buton komutları onaylanan tüm kullanıcılara gider.
          </p>

          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={newSubId}
              onChange={(e) => setNewSubId(e.target.value)}
              placeholder="Telegram ID (ör: 987654321)"
              className="rounded-lg border border-slate-700 bg-pitch-900 px-3 py-2 text-xs text-white"
            />
            <input
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              placeholder="İsim (ör: Ahmet iPhone)"
              className="rounded-lg border border-slate-700 bg-pitch-900 px-3 py-2 text-xs text-white"
            />
            <button
              onClick={async () => {
                if (newSubId.trim()) {
                  await onAddSubscriber({ telegram_user_id: newSubId.trim(), display_name: newSubName.trim() });
                  setNewSubId("");
                  setNewSubName("");
                }
              }}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              ➕ Telegram Kullanıcısı Ekle
            </button>
          </div>

          {pending.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3">
              <div className="text-xs font-semibold text-amber-200">⏳ Bota Başlat Diyen Onay Bekleyenler</div>
              {pending.map((p) => (
                <div key={p.telegram_user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-pitch-900/80 px-3 py-2 text-xs">
                  <div>
                    <span className="font-mono font-bold text-white">{p.telegram_user_id}</span>
                    {p.name && <span className="ml-2 text-slate-300">{p.name}</span>}
                    {p.username && <span className="ml-1 text-sky-300">(@{p.username})</span>}
                  </div>
                  <button
                    onClick={() => onAddSubscriber({ telegram_user_id: p.telegram_user_id, chat_id: p.chat_id, display_name: p.name || p.username })}
                    className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    ✅ Onayla
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-300">Aktif Kullanıcılar</div>
            {(tgSubscribers?.primary_admin_ids || []).map((aid) => (
              <div key={aid} className="flex items-center justify-between rounded-lg bg-pitch-900 px-3 py-2 text-xs">
                <span>👑 Ana Yönetici • <span className="font-mono text-emerald-300">{aid}</span></span>
                <span className="text-emerald-400">Sabit Yetkili</span>
              </div>
            ))}
            {subs.map((s) => (
              <div key={s.telegram_user_id} className="flex items-center justify-between rounded-lg bg-pitch-900 px-3 py-2 text-xs">
                <span>
                  👤 {s.display_name || "Kullanıcı"} • <span className="font-mono text-sky-300">{s.telegram_user_id}</span>
                </span>
                <button
                  onClick={() => onRemoveSubscriber(s.telegram_user_id)}
                  className="rounded bg-rose-500/20 px-2.5 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/30"
                >
                  Kaldır
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-pitch-800 p-5 space-y-2 text-xs text-slate-300">
          <h3 className="text-sm font-semibold text-white">🍏 iPhone (iOS) Ana Ekrana Uygulama Olarak Ekleme</h3>
          <p>1. iPhone'da bağlantıyı <b>Safari</b> tarayıcısında açıp giriş yapın (oturum iPhone'da kalıcı hatırlanır).</p>
          <p>2. Alttaki <b>Paylaş (oklu kare)</b> simgesine dokunun.</p>
          <p>3. <b>Ana Ekrana Ekle</b> seçeneğine dokunun; AyzEla AI uygulama simgesiyle ana ekrana eklenecektir.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-pitch-800 p-5 text-sm text-slate-300">
      <h2 className="text-lg font-semibold text-white">Genel Sistem Ayarları</h2>
      <p>• Saat Dilimi: `Europe/Istanbul` (UTC+3)</p>
      <p>• Günlük Seçilen Maç: `15` (Tüm bülten oranları incelenir, 1.30–3.60 aralığındaki en değerli 2 olasılık seçilir)</p>
      <p>• Günlük Kuponlar: `2 adet 4'lü Kupon` (Dengeli + Yüksek Oran, farklı maçlardan)</p>
      <p>• `FREE_ONLY_MODE`: `Aktif` (Ücretli AI ve ücretli futbol API kullanımı engellidir)</p>
      <p>• `football-data.co.uk`: Kalıcı olarak devre dışı bırakıldı</p>
    </div>
  );
}
