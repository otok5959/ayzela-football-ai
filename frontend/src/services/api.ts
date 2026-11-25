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

export interface FixtureRow {
  fixture_id: string;
  organization_id: string;
  league_name: string;
  home_team_name: string;
  away_team_name: string;
  kickoff_tr: string;
  analysis_day_tr: string;
  status: string;
  bulletin_source: string;
  iddaa_verified: number;
  prob_home?: number;
  prob_draw?: number;
  prob_away?: number;
  prob_btts_yes?: number;
  prob_over_25?: number;
  data_coverage_score?: number;
  research_quality_score?: number;
  is_demo: number;
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

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const TOKEN_STORAGE_KEY = "ayzela_session_token";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
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
      sessionStorage.setItem(TOKEN_STORAGE_KEY, res.token);
    }
    return res;
  },
  logout: async () => {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    return requestJson<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
  },
  dashboard: () => requestJson<any>("/api/dashboard"),
  fixtures: () => requestJson<{ fixtures: FixtureRow[] }>("/api/fixtures"),
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
};

/**
 * Strictly isolated local preview/demo dataset.
 * Never mixed with real database records; always rendered with explicit DEMO badge.
 */
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
      last_success_at: "2026-11-25T08:30:00Z",
      last_error_at: null,
      last_error_message: null,
      latency_ms: 218,
      http_status: 200,
      records_fetched: 231,
      coverage_summary: "Canlı bülten erişildi (örnek önizleme)",
      updated_at: "2026-11-25T08:30:00Z",
    },
    {
      source_id: "openfootball_json",
      name: "OpenFootball football.json",
      role: "secondary_fixtures_results",
      enabled: 1,
      status: "healthy",
      last_success_at: "2026-11-25T08:30:01Z",
      last_error_at: null,
      last_error_message: null,
      latency_ms: 171,
      http_status: 200,
      records_fetched: 380,
      coverage_summary: "2026-27 8 Avrupa ligi mevcut",
      updated_at: "2026-11-25T08:30:01Z",
    },
    {
      source_id: "football_data_co_uk",
      name: "Football-Data.co.uk",
      role: "disabled_legacy",
      enabled: 0,
      status: "disabled",
      last_success_at: null,
      last_error_at: null,
      last_error_message: "Türkiye ağından erişim engelli — zorunlu bağımlılık kaldırıldı",
      latency_ms: null,
      http_status: null,
      records_fetched: 0,
      coverage_summary: "Devre dışı bırakıldı",
      updated_at: "2026-11-25T08:30:00Z",
    },
  ] as SourceHealthRow[],
  fixtures: [
    {
      fixture_id: "demo_sample_1",
      organization_id: "uefa_ucl",
      league_name: "UEFA Şampiyonlar Ligi",
      home_team_name: "Örnek Ev Takımı (DEMO)",
      away_team_name: "Örnek Deplasman Takımı (DEMO)",
      kickoff_tr: "2026-11-25T23:00:00+03:00",
      analysis_day_tr: "2026-11-25",
      status: "scheduled",
      bulletin_source: "demo_preview",
      iddaa_verified: 0,
      prob_home: 0.48,
      prob_draw: 0.27,
      prob_away: 0.25,
      prob_btts_yes: 0.56,
      prob_over_25: 0.54,
      data_coverage_score: 0.78,
      research_quality_score: 0.83,
      is_demo: 1,
    },
  ] as FixtureRow[],
  usageLimits: [
    { resource_key: "github_actions_minutes_monthly", label_tr: "GitHub Actions Dakika (Aylık)", period: "monthly", used_amount: 42, max_limit: 2000, unit: "dakika", warn_threshold_pct: 80, hard_stop_threshold_pct: 95 },
    { resource_key: "cloudflare_workers_requests_daily", label_tr: "Cloudflare Workers İstek (Günlük)", period: "daily", used_amount: 120, max_limit: 100000, unit: "istek", warn_threshold_pct: 80, hard_stop_threshold_pct: 95 },
    { resource_key: "cloudflare_d1_reads_daily", label_tr: "Cloudflare D1 Okuma (Günlük)", period: "daily", used_amount: 3400, max_limit: 5000000, unit: "satır", warn_threshold_pct: 80, hard_stop_threshold_pct: 95 },
    { resource_key: "cloudflare_d1_writes_daily", label_tr: "Cloudflare D1 Yazma (Günlük)", period: "daily", used_amount: 185, max_limit: 100000, unit: "satır", warn_threshold_pct: 80, hard_stop_threshold_pct: 95 },
  ] as UsageLimitRow[],
  performanceSeries: [
    { model: "Poisson", accuracy: 51.2, brier: 0.582, logLoss: 0.992 },
    { model: "Dixon-Coles", accuracy: 53.8, brier: 0.564, logLoss: 0.961 },
    { model: "Elo", accuracy: 50.4, brier: 0.591, logLoss: 1.005 },
    { model: "ML (LR+GB)", accuracy: 52.1, brier: 0.576, logLoss: 0.978 },
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
