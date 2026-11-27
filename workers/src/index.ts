import {
  Env,
  createSessionToken,
  verifyPbkdf2Password,
  verifySessionRequest,
} from "./auth";
import { dispatchGithubWorkflow } from "./github_dispatch";
import { enrichAndSilentPersist, enrichCouponsWithLiveScores, getIstanbulDates } from "./live_scores";
import { handleTelegramWebhook } from "./telegram_webhook";

function resolveAllowedOrigin(request: Request, env: Env): string {
  const reqOrigin = request.headers.get("Origin") || "";
  const primary = env.PANEL_ORIGIN || "https://ayzela-football-ai-api.otok5959.workers.dev";
  if (
    reqOrigin === primary ||
    reqOrigin === "https://ayzela-football-ai-api.otok5959.workers.dev" ||
    reqOrigin === "https://ayzela-panel.pages.dev" ||
    /^https:\/\/[a-z0-9-]+\.ayzela-panel\.pages\.dev$/.test(reqOrigin) ||
    reqOrigin === "http://localhost:5173"
  ) {
    return reqOrigin;
  }
  return primary;
}

function jsonResponse(data: unknown, status = 200, origin = "*", extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...extraHeaders,
    },
  });
}

async function parseJsonBody<T>(request: Request): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    const data = (await request.json()) as T;
    if (!data || typeof data !== "object") return { ok: false };
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = resolveAllowedOrigin(request, env);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Vary": "Origin",
        },
      });
    }

    if (url.pathname === "/health") {
      return jsonResponse(
        {
          ok: true,
          service: "ayzela-football-ai-api",
          tz: env.TZ,
          telegram_enabled: env.TELEGRAM_ENABLED === "true",
        },
        200,
        origin
      );
    }

    if (url.pathname === "/webhook/telegram" && request.method === "POST") {
      if (env.TELEGRAM_ENABLED !== "true") {
        return jsonResponse({ ok: false, disabled: true, message: "Telegram devre dışı (PWA modu)." }, 410, origin);
      }
      return handleTelegramWebhook(request, env);
    }

    // Auth endpoints
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      if (!env.ADMIN_SESSION_SECRET) {
        return jsonResponse({ error: "Sunucu yapılandırması eksik (ADMIN_SESSION_SECRET)." }, 500, origin);
      }
      const parsed = await parseJsonBody<{ username?: string; password?: string }>(request);
      if (!parsed.ok) {
        return jsonResponse({ error: "Geçersiz JSON gövdesi." }, 400, origin);
      }
      const body = parsed.data;
      const validUser = body.username === (env.ADMIN_USERNAME || "ayzela_admin");
      const validPass = await verifyPbkdf2Password(body.password || "", env.ADMIN_PASSWORD_HASH || "");
      if (!validUser || !validPass) {
        return jsonResponse({ error: "Kullanıcı adı veya parola hatalı." }, 401, origin);
      }
      const token = await createSessionToken(body.username!, env.ADMIN_SESSION_SECRET);
      return jsonResponse(
        { ok: true, username: body.username, token },
        200,
        origin,
        {
          "Set-Cookie": `ayzela_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=604800`,
        }
      );
    }

    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      return jsonResponse(
        { ok: true },
        200,
        origin,
        { "Set-Cookie": "ayzela_session=; HttpOnly; Secure; SameSite=None; Partitioned; Path=/; Max-Age=0" }
      );
    }

    // Require authenticated session for all /api/* routes below
    if (url.pathname.startsWith("/api/")) {
      const user = await verifySessionRequest(request, env.ADMIN_SESSION_SECRET || "");
      if (!user) {
        return jsonResponse({ error: "Yetkisiz erişim. Lütfen giriş yapın." }, 401, origin);
      }

      if (url.pathname === "/api/dashboard") {
        const [runs, preds, sources, limits, metrics, backtests, schedJobs] = await Promise.all([
          env.DB.prepare("SELECT * FROM analysis_runs ORDER BY actual_started_at_tr DESC LIMIT 6").all(),
          env.DB.prepare("SELECT COUNT(*) as cnt, AVG(data_coverage_score) as avg_cov FROM match_predictions WHERE is_demo = 0").first(),
          env.DB.prepare("SELECT status, COUNT(*) as cnt FROM source_health GROUP BY status").all(),
          env.DB.prepare("SELECT * FROM usage_limits ORDER BY resource_key").all(),
          env.DB.prepare("SELECT * FROM model_metrics WHERE is_demo = 0 ORDER BY computed_at_utc DESC LIMIT 8").all(),
          env.DB.prepare("SELECT * FROM backtest_results ORDER BY created_at_utc DESC LIMIT 12").all().catch(() => ({ results: [] })),
          env.DB.prepare("SELECT * FROM scheduled_jobs ORDER BY job_key").all().catch(() => ({ results: [] })),
        ]);
        return jsonResponse(
          {
            latest_runs: runs.results,
            predictions_summary: preds,
            source_summary: sources.results,
            usage_limits: limits.results,
            metrics: metrics.results,
            backtests: backtests.results || [],
            scheduled_jobs: schedJobs.results || [],
            free_only_mode: env.FREE_ONLY_MODE === "true",
            telegram_enabled: env.TELEGRAM_ENABLED === "true",
          },
          200,
          origin
        );
      }

      if (url.pathname === "/api/fixtures" && request.method === "GET") {
        const rows = await env.DB.prepare(
          `SELECT f.*, mp.prediction_id, mp.prob_home, mp.prob_draw, mp.prob_away,
                  mp.prob_btts_yes, mp.prob_over_25, mp.data_coverage_score, mp.research_quality_score,
                  mp.top_picks_json, mp.is_selected_top15, mp.selection_rank, mp.selection_score,
                  mr.home_goals AS fin_home_goals, mr.away_goals AS fin_away_goals,
                  mr.ht_home_goals AS fin_ht_home_goals, mr.ht_away_goals AS fin_ht_away_goals,
                  mr.outcome_1x2
           FROM fixtures f
           LEFT JOIN match_predictions mp
             ON f.fixture_id = mp.fixture_id
            AND mp.created_at_utc = (
              SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = f.fixture_id
            )
           LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
           WHERE f.is_demo = 0
           ORDER BY f.analysis_day_tr DESC, f.league_name ASC, f.kickoff_tr ASC LIMIT 300`
        ).all();
        const enriched = await enrichAndSilentPersist(env, rows.results || []);
        return jsonResponse({ fixtures: enriched }, 200, origin);
      }

      if (url.pathname.startsWith("/api/fixtures/") && request.method === "GET") {
        const fixtureId = decodeURIComponent(url.pathname.slice("/api/fixtures/".length)).trim();
        if (!fixtureId) {
          return jsonResponse({ error: "Karşılaşma kimliği geçersiz." }, 400, origin);
        }
        const fxRow = await env.DB.prepare(
          `SELECT f.*, mp.prediction_id, mp.model_version, mp.prob_home, mp.prob_draw, mp.prob_away,
                  mp.prob_btts_yes, mp.prob_over_25, mp.markets_json, mp.data_coverage_score, mp.research_quality_score,
                  mp.top_picks_json, mp.is_selected_top15, mp.selection_rank, mp.selection_score,
                  mr.home_goals AS fin_home_goals, mr.away_goals AS fin_away_goals,
                  mr.ht_home_goals AS fin_ht_home_goals, mr.ht_away_goals AS fin_ht_away_goals,
                  mr.outcome_1x2
           FROM fixtures f
           LEFT JOIN match_predictions mp
             ON f.fixture_id = mp.fixture_id
            AND mp.created_at_utc = (
              SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = f.fixture_id
            )
           LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
           WHERE f.fixture_id = ?
           LIMIT 1`
        )
          .bind(fixtureId)
          .first<any>();

        if (!fxRow) {
          return jsonResponse({ error: "Karşılaşma bulunamadı." }, 404, origin);
        }

        const [enrichedList, recordsRes, lineupsRes, revsRes] = await Promise.all([
          enrichAndSilentPersist(env, [fxRow]),
          env.DB.prepare(
            `SELECT rr.*
             FROM research_records rr
             WHERE rr.fixture_id = ?
               AND rr.id IN (
                 SELECT MAX(rr2.id) FROM research_records rr2 WHERE rr2.fixture_id = ? GROUP BY rr2.agent_id
               )
             ORDER BY rr.agent_id ASC`
          )
            .bind(fixtureId, fixtureId)
            .all(),
          env.DB.prepare(
            "SELECT * FROM lineups WHERE fixture_id = ? ORDER BY fetched_at DESC LIMIT 6"
          )
            .bind(fixtureId)
            .all(),
          env.DB.prepare(
            "SELECT * FROM prediction_revisions WHERE fixture_id = ? ORDER BY revision_id DESC LIMIT 10"
          )
            .bind(fixtureId)
            .all(),
        ]);

        let markets: Record<string, any> = {};
        try {
          markets = fxRow.markets_json ? JSON.parse(String(fxRow.markets_json)) : {};
        } catch {
          markets = {};
        }

        const enrichedFx = enrichedList[0] || fxRow;
        delete enrichedFx.markets_json;

        const researchRecords = (recordsRes.results || []).map((r: any) => {
          let payload: any = {};
          try {
            payload = r.payload_json ? JSON.parse(String(r.payload_json)) : {};
          } catch {
            payload = {};
          }
          return {
            agent_id: r.agent_id,
            agent_name: r.agent_name,
            status: r.status,
            data_coverage: r.data_coverage,
            summary_tr: payload.summary_tr || "",
            metrics: payload.metrics || {},
            warnings: payload.warnings || [],
            source_name: r.source_name,
            source_url: r.source_url,
            fetched_at: r.fetched_at,
            verification_status: r.verification_status,
          };
        });

        const lineups = (lineupsRes.results || []).map((l: any) => {
          let starters: string[] = [];
          try {
            starters = l.starters_json ? JSON.parse(String(l.starters_json)) : [];
          } catch {
            starters = [];
          }
          return {
            id: l.id,
            team_side: l.team_side,
            lineup_type: l.lineup_type,
            formation: l.formation,
            starters,
            diff_summary_tr: l.diff_summary_tr,
            source_name: l.source_name,
            fetched_at: l.fetched_at,
          };
        });

        return jsonResponse(
          {
            fixture: enrichedFx,
            markets,
            research_records: researchRecords,
            lineups,
            revisions: revsRes.results || [],
          },
          200,
          origin
        );
      }

      if (url.pathname === "/api/selected-top15") {
        const reqDay = url.searchParams.get("day");
        let targetDay = reqDay;
        if (!targetDay) {
          const latestDayRow = await env.DB.prepare(
            "SELECT analysis_day_tr FROM match_predictions WHERE is_demo = 0 AND is_selected_top15 = 1 ORDER BY analysis_day_tr DESC LIMIT 1"
          ).first<{ analysis_day_tr?: string }>();
          targetDay = latestDayRow?.analysis_day_tr || getIstanbulDates().todayTr;
        }
        const rows = await env.DB.prepare(
          `SELECT f.*, mp.prediction_id, mp.prob_home, mp.prob_draw, mp.prob_away,
                  mp.prob_btts_yes, mp.prob_over_25, mp.data_coverage_score, mp.research_quality_score,
                  mp.top_picks_json, mp.is_selected_top15, mp.selection_rank, mp.selection_score,
                  mr.home_goals AS fin_home_goals, mr.away_goals AS fin_away_goals,
                  mr.ht_home_goals AS fin_ht_home_goals, mr.ht_away_goals AS fin_ht_away_goals,
                  mr.outcome_1x2
           FROM match_predictions mp
           JOIN fixtures f ON f.fixture_id = mp.fixture_id
           LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
           WHERE mp.is_demo = 0
             AND mp.analysis_day_tr = ?
             AND mp.is_selected_top15 = 1
             AND mp.created_at_utc = (
               SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = f.fixture_id
             )
           ORDER BY f.league_name ASC, f.kickoff_tr ASC
           LIMIT 15`
        )
          .bind(targetDay)
          .all();

        const matches = await enrichAndSilentPersist(env, rows.results || []);
        let liveCount = 0;
        let finishedCount = 0;
        let scheduledCount = 0;
        let picksWon = 0;
        let picksLost = 0;
        let picksLiveWon = 0;
        let picksLiveLost = 0;
        let picksPending = 0;

        for (const m of matches) {
          if (m.effective_status === "live") liveCount += 1;
          else if (m.effective_status === "finished") finishedCount += 1;
          else scheduledCount += 1;

          for (const p of m.top_picks || []) {
            if (p.eval_state === "won") picksWon += 1;
            else if (p.eval_state === "lost") picksLost += 1;
            else if (p.eval_state === "live_won") picksLiveWon += 1;
            else if (p.eval_state === "live_lost") picksLiveLost += 1;
            else picksPending += 1;
          }
        }

        return jsonResponse(
          {
            analysis_day_tr: targetDay,
            summary: {
              total_matches: matches.length,
              live_count: liveCount,
              finished_count: finishedCount,
              scheduled_count: scheduledCount,
              picks_won: picksWon,
              picks_lost: picksLost,
              picks_live_won: picksLiveWon,
              picks_live_lost: picksLiveLost,
              picks_pending: picksPending,
            },
            matches,
          },
          200,
          origin
        );
      }

      if (url.pathname === "/api/live") {
        const { todayTr, yesterdayTr } = getIstanbulDates();
        const rows = await env.DB.prepare(
          `SELECT f.*, mp.prediction_id, mp.prob_home, mp.prob_draw, mp.prob_away,
                  mp.prob_btts_yes, mp.prob_over_25, mp.data_coverage_score, mp.research_quality_score,
                  mp.top_picks_json, mp.is_selected_top15, mp.selection_rank, mp.selection_score,
                  mr.home_goals AS fin_home_goals, mr.away_goals AS fin_away_goals,
                  mr.ht_home_goals AS fin_ht_home_goals, mr.ht_away_goals AS fin_ht_away_goals,
                  mr.outcome_1x2
           FROM fixtures f
           JOIN match_predictions mp ON f.fixture_id = mp.fixture_id
             AND mp.created_at_utc = (
               SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = f.fixture_id
             )
           LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
           WHERE f.is_demo = 0
             AND (f.analysis_day_tr IN (?, ?) OR f.status = 'live')
           ORDER BY COALESCE(mp.is_selected_top15, 0) DESC, f.league_name ASC, f.kickoff_tr ASC
           LIMIT 250`
        )
          .bind(todayTr, yesterdayTr)
          .all();

        const enriched = await enrichAndSilentPersist(env, rows.results || []);
        const liveMatches = enriched.filter((m) => m.effective_status === "live");
        const finishedToday = enriched.filter((m) => m.effective_status === "finished");
        return jsonResponse(
          {
            updated_at_utc: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
            live_matches: liveMatches,
            finished_today: finishedToday,
          },
          200,
          origin
        );
      }

      if (url.pathname === "/api/sources") {
        const rows = await env.DB.prepare(
          `SELECT rs.*, sh.status, sh.last_success_at, sh.last_error_at, sh.last_error_message,
                  sh.latency_ms, sh.http_status, sh.records_fetched, sh.coverage_summary, sh.updated_at
           FROM research_sources rs LEFT JOIN source_health sh ON rs.source_id = sh.source_id
           ORDER BY rs.priority ASC`
        ).all();
        return jsonResponse({ sources: rows.results }, 200, origin);
      }

      if (url.pathname === "/api/sources/check" && request.method === "POST") {
        const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
        await env.DB.prepare(
          "INSERT INTO job_queue (job_id, job_type, payload_json, status, created_at_utc) VALUES (?, 'source_health_check', '{}', 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        )
          .bind(jobId)
          .run();
        const disp = await dispatchGithubWorkflow(env, "manual_dispatch.yml", { job_id: jobId, task: "source_health_check" });
        return jsonResponse({ ok: disp.ok, job_id: jobId, dispatch: disp }, disp.ok ? 200 : 502, origin);
      }

      if (url.pathname === "/api/leagues" && request.method === "GET") {
        const rows = await env.DB.prepare("SELECT * FROM leagues ORDER BY enabled DESC, name_tr ASC").all();
        return jsonResponse({ leagues: rows.results }, 200, origin);
      }

      if (url.pathname === "/api/leagues" && request.method === "POST") {
        const parsed = await parseJsonBody<{
          organization_id: string;
          name_tr: string;
          country: string;
          country_code: string;
          category?: string;
        }>(request);
        if (!parsed.ok || !parsed.data.organization_id || !parsed.data.name_tr) {
          return jsonResponse({ error: "Geçersiz lig bilgisi." }, 400, origin);
        }
        const b = parsed.data;
        await env.DB.prepare(
          "INSERT INTO leagues (organization_id, name_tr, country, country_code, tier, category, enabled) VALUES (?, ?, ?, ?, 1, ?, 1)"
        )
          .bind(b.organization_id, b.name_tr, b.country || "Diğer", b.country_code || "INT", b.category || "domestic_league")
          .run();
        return jsonResponse({ ok: true }, 201, origin);
      }

      if (url.pathname.startsWith("/api/leagues/") && request.method === "PATCH") {
        const orgId = url.pathname.split("/").pop()!;
        const parsed = await parseJsonBody<{ enabled: boolean }>(request);
        if (!parsed.ok) {
          return jsonResponse({ error: "Geçersiz JSON gövdesi." }, 400, origin);
        }
        await env.DB.prepare("UPDATE leagues SET enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE organization_id = ?")
          .bind(parsed.data.enabled ? 1 : 0, orgId)
          .run();
        return jsonResponse({ ok: true }, 200, origin);
      }

      if (url.pathname === "/api/analysis/run-now" && request.method === "POST") {
        const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
        await env.DB.prepare(
          "INSERT INTO job_queue (job_id, job_type, payload_json, status, created_at_utc) VALUES (?, 'manual_analysis', ?, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        )
          .bind(jobId, JSON.stringify({ mode: "full_now" }))
          .run();
        const disp = await dispatchGithubWorkflow(env, "manual_dispatch.yml", { job_id: jobId, task: "full_now" });
        return jsonResponse({ ok: disp.ok, job_id: jobId, dispatch: disp }, disp.ok ? 200 : 502, origin);
      }

      if (url.pathname === "/api/jobs" && request.method === "GET") {
        const [queueRows, schedRows] = await Promise.all([
          env.DB.prepare("SELECT * FROM job_queue ORDER BY created_at_utc DESC LIMIT 20").all(),
          env.DB.prepare("SELECT * FROM scheduled_jobs ORDER BY job_key").all().catch(() => ({ results: [] })),
        ]);
        return jsonResponse(
          { jobs: queueRows.results || [], scheduled_jobs: schedRows.results || [] },
          200,
          origin
        );
      }

      if (url.pathname === "/api/jobs/dispatch" && request.method === "POST") {
        const parsed = await parseJsonBody<{ task?: string; query?: string }>(request);
        if (!parsed.ok) {
          return jsonResponse({ error: "Geçersiz JSON gövdesi." }, 400, origin);
        }
        const b = parsed.data;
        const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
        await env.DB.prepare(
          "INSERT INTO job_queue (job_id, job_type, payload_json, status, created_at_utc) VALUES (?, 'manual_analysis', ?, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        )
          .bind(jobId, JSON.stringify({ query: b.query || "" }))
          .run();
        const disp = await dispatchGithubWorkflow(env, "manual_dispatch.yml", { job_id: jobId, task: b.task || "manual_analysis" });
        return jsonResponse({ ok: disp.ok, job_id: jobId, dispatch: disp }, disp.ok ? 200 : 502, origin);
      }

      if (url.pathname === "/api/logs") {
        const rows = await env.DB.prepare("SELECT * FROM system_logs ORDER BY id DESC LIMIT 100").all();
        return jsonResponse({ logs: rows.results }, 200, origin);
      }

      if (url.pathname === "/api/backtests") {
        const rows = await env.DB.prepare("SELECT * FROM backtest_results ORDER BY created_at_utc DESC LIMIT 20").all();
        return jsonResponse({ backtests: rows.results }, 200, origin);
      }

      if (url.pathname === "/api/coupons" && request.method === "GET") {
        try {
          const rows = await env.DB.prepare(
            "SELECT * FROM daily_coupons WHERE is_demo = 0 ORDER BY analysis_day_tr DESC, coupon_slot ASC, created_at_utc DESC LIMIT 24"
          ).all();
          const enriched = await enrichCouponsWithLiveScores(env, rows.results || []);
          const latestDay = enriched[0]?.analysis_day_tr || getIstanbulDates().todayTr;
          const todayCoupons = enriched.filter((c) => c.analysis_day_tr === latestDay).slice(0, 2);
          const historyCoupons = enriched.filter((c) => c.analysis_day_tr !== latestDay);
          return jsonResponse(
            {
              analysis_day_tr: latestDay,
              today_coupons: todayCoupons,
              history_coupons: historyCoupons,
            },
            200,
            origin
          );
        } catch {
          return jsonResponse(
            { analysis_day_tr: getIstanbulDates().todayTr, today_coupons: [], history_coupons: [] },
            200,
            origin
          );
        }
      }

      if (url.pathname === "/api/telegram/subscribers" && request.method === "GET") {
        let subscribers: any[] = [];
        try {
          const subRes = await env.DB.prepare(
            "SELECT * FROM telegram_subscribers ORDER BY enabled DESC, created_at_utc ASC"
          ).all();
          subscribers = subRes.results || [];
        } catch {
          subscribers = [];
        }

        const allowed = new Set<string>(
          (env.TELEGRAM_ALLOWED_USER_ID || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        );
        for (const s of subscribers) {
          if (s.enabled) allowed.add(String(s.telegram_user_id));
        }

        const logRes = await env.DB.prepare(
          "SELECT details_json, created_at_utc FROM system_logs WHERE level = 'SECURITY' AND module = 'worker.telegram' ORDER BY id DESC LIMIT 20"
        ).all();
        const pendingMap = new Map<string, any>();
        for (const l of logRes.results || []) {
          try {
            const d = JSON.parse(String((l as any).details_json || "{}"));
            const uid = String(d.uid || "").trim();
            if (uid && !allowed.has(uid) && !pendingMap.has(uid)) {
              pendingMap.set(uid, {
                telegram_user_id: uid,
                chat_id: String(d.cid || uid),
                name: d.name || "",
                username: d.username || "",
                seen_at_utc: (l as any).created_at_utc,
              });
            }
          } catch {
            // Skip
          }
        }

        return jsonResponse(
          {
            primary_admin_ids: (env.TELEGRAM_ALLOWED_USER_ID || "").split(",").map((s) => s.trim()).filter(Boolean),
            subscribers,
            pending_requests: Array.from(pendingMap.values()),
          },
          200,
          origin
        );
      }

      if (url.pathname === "/api/telegram/subscribers" && request.method === "POST") {
        const parsed = await parseJsonBody<{
          telegram_user_id?: string;
          chat_id?: string;
          display_name?: string;
        }>(request);
        if (!parsed.ok) {
          return jsonResponse({ error: "Geçersiz JSON gövdesi." }, 400, origin);
        }
        const b = parsed.data;
        const uid = String(b.telegram_user_id || "").trim();
        if (!/^\d+$/.test(uid)) {
          return jsonResponse({ error: "Geçerli sayısal Telegram ID giriniz." }, 400, origin);
        }
        const cid = String(b.chat_id || uid).trim();
        const name = String(b.display_name || `Kullanıcı ${uid}`).trim();
        await env.DB.prepare(
          `INSERT INTO telegram_subscribers (telegram_user_id, chat_id, display_name, role, enabled, created_at_utc)
           VALUES (?, ?, ?, 'member', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
           ON CONFLICT(telegram_user_id) DO UPDATE SET
             chat_id = excluded.chat_id,
             display_name = excluded.display_name,
             enabled = 1`
        )
          .bind(uid, cid, name)
          .run();
        return jsonResponse({ ok: true, telegram_user_id: uid }, 201, origin);
      }

      if (url.pathname.startsWith("/api/telegram/subscribers/") && request.method === "DELETE") {
        const targetId = url.pathname.split("/").pop() || "";
        await env.DB.prepare("UPDATE telegram_subscribers SET enabled = 0 WHERE telegram_user_id = ?")
          .bind(targetId)
          .run();
        return jsonResponse({ ok: true }, 200, origin);
      }
    }

    if (
      env.ASSETS &&
      (request.method === "GET" || request.method === "HEAD") &&
      !url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/webhook/")
    ) {
      return env.ASSETS.fetch(new Request(new URL("/index.html", request.url), request));
    }

    return jsonResponse({ error: "Uç nokta bulunamadı." }, 404, origin);
  },
};
