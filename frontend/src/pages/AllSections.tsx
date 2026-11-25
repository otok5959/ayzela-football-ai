import React, { useState } from "react";
import { CalibrationCurveChart, ModelPerformanceChart } from "../components/Charts";
import {
  FixtureRow,
  ISOLATED_DEMO_PREVIEW,
  LeagueRow,
  LiveResponse,
  SourceHealthRow,
  Top15Response,
  TopPickItem,
  UsageLimitRow,
} from "../services/api";

export type PanelTabId =
  | "top15"
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
  { id: "live", title: "2. Canlı Sonuçlar", short: "Canlı" },
  { id: "fixtures", title: "3. Tüm Bülten Maçları", short: "Bülten" },
  { id: "results", title: "4. Sonuç Takip Merkezi", short: "Sonuçlar" },
  { id: "dashboard", title: "5. Ana Kontrol Ekranı", short: "Özet" },
  { id: "research", title: "6. Araştırma Merkezi", short: "Araştır" },
  { id: "match_detail", title: "7. Karşılaşma Detayları", short: "Detay" },
  { id: "lineups", title: "8. Oyuncu ve Kadro Bilgileri", short: "Kadrolar" },
  { id: "leagues", title: "9. Lig Yönetimi", short: "Ligler" },
  { id: "history", title: "10. Geçmiş Analizler", short: "Geçmiş" },
  { id: "performance", title: "11. Model Performans Grafikleri", short: "Grafikler" },
  { id: "sources", title: "12. Veri Kaynakları & Sağlık", short: "Kaynaklar" },
  { id: "agents", title: "13. Araştırma Modülleri (12 Ajan)", short: "Ajanlar" },
  { id: "jobs", title: "14. Otomatik Görev Yönetimi", short: "Görevler" },
  { id: "logs", title: "15. Hata Kayıtları", short: "Kayıtlar" },
  { id: "limits", title: "16. Bulut Kullanım Limitleri", short: "Limitler" },
  { id: "telegram", title: "17. Telegram Ayarları", short: "Telegram" },
  { id: "settings", title: "18. Genel Sistem Ayarları", short: "Ayarlar" },
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
  if (!picks || picks.length === 0) return null;
  return (
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {picks.slice(0, 3).map((p) => {
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
              <div className="text-[11px] opacity-85">
                Olasılık: %{Math.round((p.probability || 0) * 100)}
                {typeof p.iddaa_odd === "number" ? ` • Oran: ${p.iddaa_odd.toFixed(2)}` : ""}
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
  liveData,
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
  onRefreshScores,
  autoRefreshLive,
  onToggleAutoRefreshLive,
  runningNow,
  isDemoMode,
}: {
  tab: PanelTabId;
  fixtures: FixtureRow[];
  top15Data: Top15Response | null;
  liveData: LiveResponse | null;
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
              🎯 Günün Seçilen 15 Maçı & 3 Yüksek Olasılıklı Tercih Takibi
            </h2>
            <p className="text-xs text-slate-400">
              Tüm İddaa bülteninden seçildi ({top15Data?.analysis_day_tr || "Güncel"}) • Maç başladığında ve bittiğinde tercihler otomatik 🟢 Yeşil / 🔴 Kırmızı olur
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

  if (tab === "live") {
    const rawLive = liveData?.live_matches || fixtures.filter((f) => (f.effective_status || f.status) === "live");
    const rawFinished = liveData?.finished_today || fixtures.filter((f) => (f.effective_status || f.status) === "finished");
    const liveList = liveScope === "top15" ? rawLive.filter((m) => m.is_selected_top15 === 1) : rawLive;
    const finishedList = liveScope === "top15" ? rawFinished.filter((m) => m.is_selected_top15 === 1) : rawFinished;
    const groupedLive = groupByLeague(liveList);
    const groupedFinished = groupByLeague(finishedList);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">
              🔴 Canlı Sonuçlar ({liveList.length} canlı maç)
            </h2>
            <p className="text-xs text-slate-400">
              Başlamış maçların anlık skoru, dakikası ve tercihlerin canlı 🟢 Tutuyor / 🔴 Tutmuyor durumu
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
            Tüm Bülten ({rawLive.length} canlı)
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
            Şu anda başlayan / canlı devam eden analiz edilmiş maç bulunmuyor.
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

        {groupedFinished.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <h3 className="text-base font-semibold text-slate-200">
              🏁 Bugün / Dün Tamamlananlar ({finishedList.length} maç)
            </h3>
            {groupedFinished.map(([leagueName, items]) => (
              <div key={leagueName} className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-pitch-800 px-3 py-1.5">
                  <span className="text-xs font-semibold text-emerald-300">🏆 {leagueName}</span>
                  <span className="text-[11px] text-slate-400">{items.length} maç</span>
                </div>
                <div className="grid gap-2.5">
                  {items.map((f) => (
                    <MatchTrackingCard key={f.fixture_id} f={f} onSelectFixture={onSelectFixture} />
                  ))}
                </div>
              </div>
            ))}
          </div>
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
    const sourceRows =
      tab === "results"
        ? fixtures.filter((f) => (f.effective_status || f.status) === "finished")
        : fixtures;
    const grouped = groupByLeague(sourceRows);

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-100">
            {tab === "fixtures"
              ? `Tüm Bülten Maçları (${sourceRows.length} maç, ${grouped.length} lig)`
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
            Henüz gösterilecek kayıt bulunmuyor.
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
                : "12 bağımsız araştırma modülünün çıktıları, gol matrisi olasılıkları ve en yüksek 3 olasılık burada gösterilir."}
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
        <p>• Maç bitimlerinde otomatik bildirim atılmaz; `/canli` veya `/sonuclar` ile istediğiniz an görüntüleyebilirsiniz.</p>
        <p>• Webhook gizli anahtarı (`X-Telegram-Bot-Api-Secret-Token`) ile korunur.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-pitch-800 p-5 text-sm text-slate-300">
      <h2 className="text-lg font-semibold text-white">Genel Sistem Ayarları</h2>
      <p>• Saat Dilimi: `Europe/Istanbul` (UTC+3)</p>
      <p>• Günlük Seçilen Maç: `15` (Tüm bülten taranır, en yüksek 3 olasılık seçilir)</p>
      <p>• `FREE_ONLY_MODE`: `Aktif` (Ücretli AI ve ücretli futbol API kullanımı engellidir)</p>
      <p>• `football-data.co.uk`: Kalıcı olarak devre dışı bırakıldı</p>
    </div>
  );
}
