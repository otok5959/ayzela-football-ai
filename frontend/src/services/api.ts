export interface SourceHealthRow {
  source_id: string;
  name: string;
  role: string;
  enabled: number;
  status: "healthy" | "degraded" | "down" | "untested" | "disabled";
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  latency_ms: number | null;
  http_status: number | null;
  records_fetched: number;
  coverage_summary: string;
  updated_at: string;
}

export type PickEvalState = "pending" | "live_won" | "live_lost" | "won" | "lost";

export interface TopPickItem {
  key: string;
  label_tr: string;
  family: string;
  probability: number;
  iddaa_odd: number | null;
  expected_value?: number;
  eval_state: PickEvalState;
  locked: boolean;
}

export interface CouponLeg {
  fixture_id: string;
  iddaa_event_id?: string | null;
  iddaa_match_code?: string | null;
  league_name: string;
  home_team: string;
  away_team: string;
  kickoff_tr: string;
  pick_key: string;
  label_tr: string;
  family: string;
  probability: number;
  iddaa_odd: number;
  effective_status?: string;
  score_home?: number | null;
  score_away?: number | null;
  ht_home?: number | null;
  ht_away?: number | null;
  live_minute?: string | null;
  eval_state?: PickEvalState;
  locked?: boolean;
}

export interface CouponRow {
  coupon_id: string;
  analysis_day_tr: string;
  run_id: string;
  coupon_slot: number;
  coupon_type: "balanced" | "high_odds" | string;
  title_tr: string;
  total_odd: number;
  combined_probability: number;
  legs: CouponLeg[];
  effective_status?: "pending" | "live" | "won" | "lost" | string;
  won_legs?: number;
  lost_legs?: number;
  live_won_legs?: number;
  live_lost_legs?: number;
  pending_legs?: number;
  created_at_utc: string;
}

export interface CouponsResponse {
  analysis_day_tr: string;
  today_coupons: CouponRow[];
  history_coupons: CouponRow[];
}

export interface TelegramSubscriberRow {
  telegram_user_id: string;
  chat_id: string;
  display_name: string;
  role: string;
  enabled: number;
  created_at_utc: string;
}

export interface PendingTelegramRequest {
  telegram_user_id: string;
  chat_id: string;
  name: string;
  username: string;
  seen_at_utc: string;
}

export interface TelegramSubscribersResponse {
  primary_admin_ids: string[];
  subscribers: TelegramSubscriberRow[];
  pending_requests: PendingTelegramRequest[];
}

export interface FixtureRow {
  fixture_id: string;
  iddaa_match_code?: string | null;
  organization_id: string;
  league_name: string;
  home_team_name: string;
  away_team_name: string;
  kickoff_tr: string;
  analysis_day_tr: string;
  status: string;
  effective_status?: "scheduled" | "live" | "finished" | string;
  score_home?: number | null;
  score_away?: number | null;
  ht_home?: number | null;
  ht_away?: number | null;
  live_minute?: string | null;
  live_status_label?: string | null;
  bulletin_source: string;
  iddaa_verified: number;
  prob_home?: number;
  prob_draw?: number;
  prob_away?: number;
  prob_btts_yes?: number;
  prob_over_25?: number;
  data_coverage_score?: number;
  research_quality_score?: number;
  is_selected_top15?: number;
  selection_rank?: number | null;
  selection_score?: number | null;
  top_picks?: TopPickItem[];
  is_demo: number;
}

export interface Top15Summary {
  total_matches: number;
  live_count: number;
  finished_count: number;
  scheduled_count: number;
  picks_won: number;
  picks_lost: number;
  picks_live_won: number;
  picks_live_lost: number;
  picks_pending: number;
}

export interface Top15Response {
  analysis_day_tr: string;
  summary: Top15Summary;
  matches: FixtureRow[];
}

export interface LiveResponse {
  updated_at_utc: string;
  live_matches: FixtureRow[];
  finished_today: FixtureRow[];
}

export interface LeagueRow {
  organization_id: string;
  name_tr: string;
  country: string;
  country_code: string;
  category: string;
  enabled: number;
}

export interface UsageLimitRow {
  resource_key: string;
  label_tr: string;
  period: string;
  used_amount: number;
  max_limit: number;
  unit: string;
  warn_threshold_pct: number;
  hard_stop_threshold_pct: number;
}

const DEFAULT_API_BASE = "https://ayzela-football-ai-api.otok5959.workers.dev";
const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname.endsWith(".workers.dev")
    ? window.location.origin
    : DEFAULT_API_BASE)
).replace(/\/+$/, "");
const TOKEN_STORAGE_KEY = "ayzela_session_token";

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Fallback silently
  }
}

function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const resp = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders, ...(init?.headers || {}) },
    ...init,
  });
  if (!resp.ok) {
    const errBody = await resp.json().catch(() => ({}));
    throw new Error((errBody as { error?: string }).error || `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export const api = {
  login: async (username: string, password: string) => {
    const res = await requestJson<{ ok: boolean; username: string; token?: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: username.trim(), password: password.trim() }),
    });
    if (res.token) {
      setStoredToken(res.token);
    }
    return res;
  },
  logout: async () => {
    clearStoredToken();
    return requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },
  dashboard: () => requestJson<any>("/api/dashboard"),
  fixtures: () => requestJson<{ fixtures: FixtureRow[] }>("/api/fixtures"),
  selectedTop15: () => requestJson<Top15Response>("/api/selected-top15"),
  coupons: () => requestJson<CouponsResponse>("/api/coupons"),
  live: () => requestJson<LiveResponse>("/api/live"),
  sources: () => requestJson<{ sources: SourceHealthRow[] }>("/api/sources"),
  triggerSourceCheck: () => requestJson<{ ok: boolean; job_id: string }>("/api/sources/check", { method: "POST" }),
  leagues: () => requestJson<{ leagues: LeagueRow[] }>("/api/leagues"),
  toggleLeague: (orgId: string, enabled: boolean) =>
    requestJson<{ ok: boolean }>(`/api/leagues/${orgId}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
  addLeague: (payload: { organization_id: string; name_tr: string; country: string; country_code: string }) =>
    requestJson<{ ok: boolean }>("/api/leagues", { method: "POST", body: JSON.stringify(payload) }),
  dispatchAnalysis: (query: string) =>
    requestJson<{ ok: boolean; job_id: string }>("/api/jobs/dispatch", {
      method: "POST",
      body: JSON.stringify({ task: "manual_analysis", query }),
    }),
  runAnalysisNow: () =>
    requestJson<{ ok: boolean; job_id: string; dispatch?: { detail?: string } }>("/api/analysis/run-now", {
      method: "POST",
    }),
  jobs: () => requestJson<{ jobs: any[] }>("/api/jobs"),
  logs: () => requestJson<{ logs: any[] }>("/api/logs"),
  backtests: () => requestJson<{ backtests: any[] }>("/api/backtests"),
  telegramSubscribers: () => requestJson<TelegramSubscribersResponse>("/api/telegram/subscribers"),
  addTelegramSubscriber: (payload: { telegram_user_id: string; chat_id?: string; display_name?: string }) =>
    requestJson<{ ok: boolean; telegram_user_id: string }>("/api/telegram/subscribers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeTelegramSubscriber: (telegramUserId: string) =>
    requestJson<{ ok: boolean }>(`/api/telegram/subscribers/${encodeURIComponent(telegramUserId)}`, {
      method: "DELETE",
    }),
};

export const ISOLATED_DEMO_PREVIEW = {
  is_demo: true,
  banner_tr: "YEREL ÖNİZLEME / DEMO VERİSİ — CANLI BULUT OTURUMUNA BAĞLI DEĞİLDİR",
  sources: [
    {
      source_id: "iddaa",
      name: "İddaa.com Bülten",
      role: "primary_bulletin",
      enabled: 1,
      status: "healthy",
      last_success_at: "2026-11-26T08:30:00Z",
      last_error_at: null,
      last_error_message: null,
      latency_ms: 218,
      http_status: 200,
      records_fetched: 231,
      coverage_summary: "Canlı bülten erişildi (örnek önizleme)",
      updated_at: "2026-11-26T08:30:00Z",
    },
  ] as SourceHealthRow[],
  fixtures: [
    {
      fixture_id: "demo_sample_sched",
      iddaa_match_code: "999901",
      organization_id: "tr_super_lig",
      league_name: "Türkiye Süper Lig",
      home_team_name: "Örnek Ev (DEMO)",
      away_team_name: "Örnek Misafir (DEMO)",
      kickoff_tr: "2026-11-26T20:00:00+03:00",
      analysis_day_tr: "2026-11-26",
      status: "scheduled",
      effective_status: "scheduled",
      bulletin_source: "demo_preview",
      iddaa_verified: 0,
      prob_home: 0.61,
      prob_draw: 0.22,
      prob_away: 0.17,
      prob_btts_yes: 0.57,
      prob_over_25: 0.62,
      data_coverage_score: 0.82,
      research_quality_score: 0.85,
      is_selected_top15: 1,
      selection_rank: 1,
      top_picks: [
        { key: "ms1_ust_1_5", label_tr: "MS 1 & 1.5 Üst", family: "combo_ms_ou", probability: 0.56, iddaa_odd: 1.78, eval_state: "pending", locked: false },
        { key: "iy_ust_0_5", label_tr: "İY 0.5 Üst", family: "ht", probability: 0.72, iddaa_odd: 1.36, eval_state: "pending", locked: false },
      ],
      is_demo: 1,
    },
    {
      fixture_id: "demo_sample_fin",
      iddaa_match_code: "999999",
      organization_id: "uefa_ucl",
      league_name: "UEFA Şampiyonlar Ligi",
      home_team_name: "Örnek Ev Takımı (DEMO)",
      away_team_name: "Örnek Deplasman Takımı (DEMO)",
      kickoff_tr: "2026-11-25T23:00:00+03:00",
      analysis_day_tr: "2026-11-25",
      status: "finished",
      effective_status: "finished",
      score_home: 2,
      score_away: 1,
      ht_home: 1,
      ht_away: 0,
      live_minute: "MS",
      live_status_label: "MS",
      bulletin_source: "demo_preview",
      iddaa_verified: 0,
      prob_home: 0.64,
      prob_draw: 0.21,
      prob_away: 0.15,
      prob_btts_yes: 0.56,
      prob_over_25: 0.54,
      data_coverage_score: 0.78,
      research_quality_score: 0.83,
      is_selected_top15: 1,
      selection_rank: 2,
      top_picks: [
        { key: "ms_1", label_tr: "MS 1", family: "side", probability: 0.64, iddaa_odd: 1.48, eval_state: "won", locked: true },
        { key: "kg_yok", label_tr: "KG Yok", family: "btts", probability: 0.58, iddaa_odd: 1.85, eval_state: "lost", locked: true },
      ],
      is_demo: 1,
    },
  ] as FixtureRow[],
  coupons: {
    analysis_day_tr: "2026-11-26",
    today_coupons: [
      {
        coupon_id: "demo_cpn_1",
        analysis_day_tr: "2026-11-26",
        run_id: "demo_run",
        coupon_slot: 1,
        coupon_type: "balanced",
        title_tr: "Dengeli 4'lü Kupon",
        total_odd: 5.42,
        combined_probability: 0.18,
        effective_status: "pending",
        won_legs: 0,
        lost_legs: 0,
        live_won_legs: 0,
        live_lost_legs: 0,
        pending_legs: 4,
        created_at_utc: "2026-11-26T08:30:00Z",
        legs: [
          { fixture_id: "d1", iddaa_match_code: "1001", league_name: "Türkiye Süper Lig", home_team: "Ev 1 (DEMO)", away_team: "Dep 1", kickoff_tr: "2026-11-26T19:00:00+03:00", pick_key: "ms_1", label_tr: "MS 1", family: "side", probability: 0.67, iddaa_odd: 1.48, eval_state: "pending" },
          { fixture_id: "d2", iddaa_match_code: "1002", league_name: "İngiltere Premier League", home_team: "Ev 2 (DEMO)", away_team: "Dep 2", kickoff_tr: "2026-11-26T20:30:00+03:00", pick_key: "ust_2_5", label_tr: "2.5 Üst", family: "ou", probability: 0.64, iddaa_odd: 1.56, eval_state: "pending" },
          { fixture_id: "d3", iddaa_match_code: "1003", league_name: "Almanya Bundesliga", home_team: "Ev 3 (DEMO)", away_team: "Dep 3", kickoff_tr: "2026-11-26T21:00:00+03:00", pick_key: "kg_var", label_tr: "KG Var", family: "btts", probability: 0.62, iddaa_odd: 1.52, eval_state: "pending" },
          { fixture_id: "d4", iddaa_match_code: "1004", league_name: "İspanya LaLiga", home_team: "Ev 4 (DEMO)", away_team: "Dep 4", kickoff_tr: "2026-11-26T22:00:00+03:00", pick_key: "ev_ust_1_5", label_tr: "Ev 1.5 Üst", family: "home_goals", probability: 0.61, iddaa_odd: 1.54, eval_state: "pending" },
        ],
      },
      {
        coupon_id: "demo_cpn_2",
        analysis_day_tr: "2026-11-26",
        run_id: "demo_run",
        coupon_slot: 2,
        coupon_type: "high_odds",
        title_tr: "Yüksek Oran 4'lü Kupon",
        total_odd: 12.18,
        combined_probability: 0.08,
        effective_status: "pending",
        won_legs: 0,
        lost_legs: 0,
        live_won_legs: 0,
        live_lost_legs: 0,
        pending_legs: 4,
        created_at_utc: "2026-11-26T08:30:00Z",
        legs: [
          { fixture_id: "d5", iddaa_match_code: "2001", league_name: "İtalya Serie A", home_team: "Ev 5 (DEMO)", away_team: "Dep 5", kickoff_tr: "2026-11-26T19:30:00+03:00", pick_key: "ms1_ust_1_5", label_tr: "MS 1 & 1.5 Üst", family: "combo_ms_ou", probability: 0.54, iddaa_odd: 1.85, eval_state: "pending" },
          { fixture_id: "d6", iddaa_match_code: "2002", league_name: "Fransa Ligue 1", home_team: "Ev 6 (DEMO)", away_team: "Dep 6", kickoff_tr: "2026-11-26T21:00:00+03:00", pick_key: "ust25_kg_var", label_tr: "2.5 Üst & KG Var", family: "combo_ou_btts", probability: 0.52, iddaa_odd: 1.92, eval_state: "pending" },
          { fixture_id: "d7", iddaa_match_code: "2003", league_name: "Portekiz Liga", home_team: "Ev 7 (DEMO)", away_team: "Dep 7", kickoff_tr: "2026-11-26T21:45:00+03:00", pick_key: "hnd_m1_1", label_tr: "Ev -1 Handikap", family: "handicap", probability: 0.49, iddaa_odd: 1.95, eval_state: "pending" },
          { fixture_id: "d8", iddaa_match_code: "2004", league_name: "Hollanda Eredivisie", home_team: "Ev 8 (DEMO)", away_team: "Dep 8", kickoff_tr: "2026-11-26T22:00:00+03:00", pick_key: "iy_1", label_tr: "İY 1", family: "ht", probability: 0.51, iddaa_odd: 1.76, eval_state: "pending" },
        ],
      },
    ] as CouponRow[],
    history_coupons: [] as CouponRow[],
  } as CouponsResponse,
  usageLimits: [
    { resource_key: "github_actions_minutes_monthly", label_tr: "GitHub Actions Dakika (Aylık)", period: "monthly", used_amount: 42, max_limit: 2000, unit: "dakika", warn_threshold_pct: 80, hard_stop_threshold_pct: 95 },
    { resource_key: "cloudflare_workers_requests_daily", label_tr: "Cloudflare Workers İstek (Günlük)", period: "daily", used_amount: 120, max_limit: 100000, unit: "istek", warn_threshold_pct: 80, hard_stop_threshold_pct: 95 },
  ] as UsageLimitRow[],
  performanceSeries: [
    { model: "Poisson", accuracy: 51.2, brier: 0.582, logLoss: 0.992 },
    { model: "Dixon-Coles", accuracy: 53.8, brier: 0.564, logLoss: 0.961 },
    { model: "Elo", accuracy: 50.4, brier: 0.591, logLoss: 1.005 },
    { model: "Ensemble", accuracy: 55.0, brier: 0.551, logLoss: 0.944 },
  ],
  calibrationSeries: [
    { bin: "%30-40", predicted: 35, actual: 34 },
    { bin: "%40-50", predicted: 45, actual: 46 },
    { bin: "%50-60", predicted: 55, actual: 53 },
    { bin: "%60-70", predicted: 65, actual: 67 },
    { bin: "%70-80", predicted: 74, actual: 72 },
  ],
};
