import {
  Env,
  createSessionToken,
  verifyPbkdf2Password,
  verifySessionRequest,
} from "./auth";
import { dispatchGithubWorkflow } from "./github_dispatch";
import { enrichAndSilentPersist, getIstanbulDates } from "./live_scores";
import { handleTelegramWebhook } from "./telegram_webhook";

function resolveAllowedOrigin(request: Request, env: Env): string {
  const reqOrigin = request.headers.get("Origin") || "";
  const primary = env.PANEL_ORIGIN || "https://ayzela-panel.pages.dev";
  if (
    reqOrigin === primary ||
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
      return jsonResponse({ ok: true, service: "ayzela-football-ai-api", tz: env.TZ }, 200, origin);
    }

    if (url.pathname === "/webhook/telegram" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    // Auth endpoints
    if (url.pathname === "/api/auth/login" && request.method === "POST") {
      const body = (await request.json()) as { username?: string; password?: string };
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
        const [runs, preds, sources, limits, metrics] = await Promise.all([
          env.DB.prepare("SELECT * FROM analysis_runs ORDER BY actual_started_at_tr DESC LIMIT 5").all(),
          env.DB.prepare("SELECT COUNT(*) as cnt, AVG(data_coverage_score) as avg_cov FROM match_predictions WHERE is_demo = 0").first(),
          env.DB.prepare("SELECT status, COUNT(*) as cnt FROM source_health GROUP BY status").all(),
          env.DB.prepare("SELECT * FROM usage_limits ORDER BY resource_key").all(),
          env.DB.prepare("SELECT * FROM model_metrics WHERE is_demo = 0 ORDER BY computed_at_utc DESC LIMIT 6").all(),
        ]);
        return jsonResponse(
          {
            latest_runs: runs.results,
            predictions_summary: preds,
            source_summary: sources.results,
            usage_limits: limits.results,
            metrics: metrics.results,
            free_only_mode: env.FREE_ONLY_MODE === "true",
          },
          200,
          origin
        );
      }

      if (url.pathname === "/api/fixtures") {
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
        return jsonResponse({ ok: true, job_id: jobId, dispatch: disp }, 200, origin);
      }

      if (url.pathname === "/api/leagues" && request.method === "GET") {
        const rows = await env.DB.prepare("SELECT * FROM leagues ORDER BY enabled DESC, name_tr ASC").all();
        return jsonResponse({ leagues: rows.results }, 200, origin);
      }

      if (url.pathname === "/api/leagues" && request.method === "POST") {
        const b = (await request.json()) as {
          organization_id: string;
          name_tr: string;
          country: string;
          country_code: string;
          category?: string;
        };
        await env.DB.prepare(
          "INSERT INTO leagues (organization_id, name_tr, country, country_code, tier, category, enabled) VALUES (?, ?, ?, ?, 1, ?, 1)"
        )
          .bind(b.organization_id, b.name_tr, b.country, b.country_code, b.category || "domestic_league")
          .run();
        return jsonResponse({ ok: true }, 201, origin);
      }

      if (url.pathname.startsWith("/api/leagues/") && request.method === "PATCH") {
        const orgId = url.pathname.split("/").pop()!;
        const b = (await request.json()) as { enabled: boolean };
        await env.DB.prepare("UPDATE leagues SET enabled = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE organization_id = ?")
          .bind(b.enabled ? 1 : 0, orgId)
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
        const rows = await env.DB.prepare("SELECT * FROM job_queue ORDER BY created_at_utc DESC LIMIT 15").all();
        return jsonResponse({ jobs: rows.results }, 200, origin);
      }

      if (url.pathname === "/api/jobs/dispatch" && request.method === "POST") {
        const b = (await request.json()) as { task: string; query?: string };
        const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
        await env.DB.prepare(
          "INSERT INTO job_queue (job_id, job_type, payload_json, status, created_at_utc) VALUES (?, 'manual_analysis', ?, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
        )
          .bind(jobId, JSON.stringify({ query: b.query || "" }))
          .run();
        const disp = await dispatchGithubWorkflow(env, "manual_dispatch.yml", { job_id: jobId, task: b.task });
        return jsonResponse({ ok: true, job_id: jobId, dispatch: disp }, 200, origin);
      }

      if (url.pathname === "/api/logs") {
        const rows = await env.DB.prepare("SELECT * FROM system_logs ORDER BY id DESC LIMIT 100").all();
        return jsonResponse({ logs: rows.results }, 200, origin);
      }

      if (url.pathname === "/api/backtests") {
        const rows = await env.DB.prepare("SELECT * FROM backtest_results ORDER BY created_at_utc DESC LIMIT 20").all();
        return jsonResponse({ backtests: rows.results }, 200, origin);
      }
    }

    return jsonResponse({ error: "Uç nokta bulunamadı." }, 404, origin);
  },
};
