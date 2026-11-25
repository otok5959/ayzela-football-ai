import { Env } from "./auth";

export type PickEvalState = "pending" | "live_won" | "live_lost" | "won" | "lost";

export interface TopPickItem {
  key: string;
  label_tr: string;
  family: string;
  probability: number;
  iddaa_odd: number | null;
  eval_state: PickEvalState;
  locked: boolean;
}

export interface LiveScoreEntry {
  event_id: string;
  status: "scheduled" | "live" | "finished";
  home_goals: number | null;
  away_goals: number | null;
  ht_home_goals: number | null;
  ht_away_goals: number | null;
  minute: string | null;
  status_label: string;
}

const LIVE_STATUS_LABELS: Record<number, string> = {
  2: "1. Yarı",
  3: "2. Yarı",
  5: "Devre Arası",
  6: "MS",
  7: "Uzatma",
  12: "Penaltılar",
};

const _dateCache = new Map<string, { ts: number; data: Record<string, LiveScoreEntry> }>();

export function getIstanbulDates(): { todayTr: string; yesterdayTr: string } {
  const nowMs = Date.now() + 3 * 3600 * 1000;
  const todayTr = new Date(nowMs).toISOString().slice(0, 10);
  const yesterdayTr = new Date(nowMs - 24 * 3600 * 1000).toISOString().slice(0, 10);
  return { todayTr, yesterdayTr };
}

export function evaluatePick(
  pickKey: string,
  hg: number | null | undefined,
  ag: number | null | undefined,
  matchStatus: string
): { state: PickEvalState; locked: boolean } {
  if (
    hg === null ||
    hg === undefined ||
    ag === null ||
    ag === undefined ||
    (matchStatus !== "live" && matchStatus !== "finished")
  ) {
    return { state: "pending", locked: false };
  }

  const h = Number(hg);
  const a = Number(ag);
  const tot = h + a;
  const finished = matchStatus === "finished";

  let hit: boolean | null = null;
  switch (pickKey) {
    case "ms_1":
      hit = h > a;
      break;
    case "ms_x":
      hit = h === a;
      break;
    case "ms_2":
      hit = a > h;
      break;
    case "dc_1x":
      hit = h >= a;
      break;
    case "dc_x2":
      hit = a >= h;
      break;
    case "dc_12":
      hit = h !== a;
      break;
    case "kg_var":
      hit = h > 0 && a > 0;
      break;
    case "kg_yok":
      hit = !(h > 0 && a > 0);
      break;
    case "ust_1_5":
      hit = tot >= 2;
      break;
    case "alt_1_5":
      hit = tot <= 1;
      break;
    case "ust_2_5":
      hit = tot >= 3;
      break;
    case "alt_2_5":
      hit = tot <= 2;
      break;
    case "ust_3_5":
      hit = tot >= 4;
      break;
    case "alt_3_5":
      hit = tot <= 3;
      break;
    default:
      return { state: "pending", locked: false };
  }

  if (finished) {
    return { state: hit ? "won" : "lost", locked: true };
  }

  let locked = false;
  if ((pickKey === "kg_var" || pickKey === "kg_yok") && h > 0 && a > 0) locked = true;
  else if ((pickKey === "ust_1_5" || pickKey === "alt_1_5") && tot >= 2) locked = true;
  else if ((pickKey === "ust_2_5" || pickKey === "alt_2_5") && tot >= 3) locked = true;
  else if ((pickKey === "ust_3_5" || pickKey === "alt_3_5") && tot >= 4) locked = true;

  return { state: hit ? "live_won" : "live_lost", locked };
}

export async function fetchIddaaLiveScores(dates: string[]): Promise<Record<string, LiveScoreEntry>> {
  const merged: Record<string, LiveScoreEntry> = {};
  const now = Date.now();
  const uniqueDates = Array.from(new Set(dates.filter(Boolean)));

  await Promise.all(
    uniqueDates.map(async (dt) => {
      const cached = _dateCache.get(dt);
      if (cached && now - cached.ts < 20_000) {
        Object.assign(merged, cached.data);
        return;
      }

      try {
        const resp = await fetch(
          `https://statisticsv2.iddaa.com/live-results?sportId=1&date=${encodeURIComponent(dt)}`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              Accept: "application/json",
            },
          }
        );
        if (!resp.ok) return;
        const json = (await resp.json()) as any;
        if (!json?.isSuccess || !json?.data) return;
        const events = Array.isArray(json.data.events) ? json.data.events : [];
        const scMap = json.data.sc && typeof json.data.sc === "object" ? json.data.sc : {};

        const dayData: Record<string, LiveScoreEntry> = {};
        for (const ev of events) {
          const eid = String(ev?.eventId || "");
          if (!eid) continue;
          const phase = ev?.phase;
          const sc = scMap[eid];
          const status: "scheduled" | "live" | "finished" =
            phase === 1 ? "live" : phase === 2 ? "finished" : "scheduled";

          const ht = sc?.ht || {};
          const at = sc?.at || {};
          const scS = typeof sc?.s === "number" ? sc.s : undefined;
          const rawMin = sc?.min;

          let minute: string | null = null;
          let statusLabel = "Başlamadı";
          if (status === "finished") {
            minute = "MS";
            statusLabel = (scS !== undefined && LIVE_STATUS_LABELS[scS]) || "MS";
          } else if (scS === 5) {
            minute = "İY";
            statusLabel = "Devre Arası";
          } else if (status === "live") {
            minute = rawMin !== undefined && rawMin !== null ? `${rawMin}'` : "Canlı";
            statusLabel = (scS !== undefined && LIVE_STATUS_LABELS[scS]) || "Canlı";
          }

          dayData[eid] = {
            event_id: eid,
            status,
            home_goals: ht.r !== undefined && ht.r !== null ? Number(ht.r) : null,
            away_goals: at.r !== undefined && at.r !== null ? Number(at.r) : null,
            ht_home_goals: ht.ht !== undefined && ht.ht !== null ? Number(ht.ht) : null,
            ht_away_goals: at.ht !== undefined && at.ht !== null ? Number(at.ht) : null,
            minute,
            status_label: statusLabel,
          };
        }
        _dateCache.set(dt, { ts: Date.now(), data: dayData });
        Object.assign(merged, dayData);
      } catch {
        // Fallback gracefully to D1 stored scores if live endpoint is unreachable
      }
    })
  );

  return merged;
}

function parseTopPicksRow(row: any): Array<{ key: string; label_tr: string; family: string; probability: number; iddaa_odd: number | null }> {
  if (row.top_picks_json) {
    try {
      const arr = typeof row.top_picks_json === "string" ? JSON.parse(row.top_picks_json) : row.top_picks_json;
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.slice(0, 3);
      }
    } catch {
      // Fallback below
    }
  }

  // Fallback for older rows recorded before migration 0005
  const cands: Array<{ key: string; label_tr: string; family: string; probability: number; iddaa_odd: number | null }> = [];
  const p1 = Number(row.prob_home ?? 0);
  const px = Number(row.prob_draw ?? 0);
  const p2 = Number(row.prob_away ?? 0);
  if (p1 + px + p2 > 0) {
    if (Math.max(p1, p2) >= 0.58) {
      cands.push(
        p1 >= p2
          ? { key: "ms_1", label_tr: "MS 1", family: "side", probability: p1, iddaa_odd: null }
          : { key: "ms_2", label_tr: "MS 2", family: "side", probability: p2, iddaa_odd: null }
      );
    } else if (Math.max(p1 + px, p2 + px) >= 0.65) {
      cands.push(
        p1 >= p2
          ? { key: "dc_1x", label_tr: "1X Çifte Şans", family: "side", probability: Math.min(0.99, p1 + px), iddaa_odd: null }
          : { key: "dc_x2", label_tr: "X2 Çifte Şans", family: "side", probability: Math.min(0.99, p2 + px), iddaa_odd: null }
      );
    } else {
      cands.push(
        p1 >= p2 && p1 >= px
          ? { key: "ms_1", label_tr: "MS 1", family: "side", probability: p1, iddaa_odd: null }
          : p2 >= p1 && p2 >= px
          ? { key: "ms_2", label_tr: "MS 2", family: "side", probability: p2, iddaa_odd: null }
          : { key: "ms_x", label_tr: "MS X", family: "side", probability: px, iddaa_odd: null }
      );
    }
  }
  if (row.prob_btts_yes !== null && row.prob_btts_yes !== undefined) {
    const pYes = Number(row.prob_btts_yes);
    const pNo = 1 - pYes;
    cands.push(
      pYes >= pNo
        ? { key: "kg_var", label_tr: "KG Var", family: "btts", probability: pYes, iddaa_odd: null }
        : { key: "kg_yok", label_tr: "KG Yok", family: "btts", probability: pNo, iddaa_odd: null }
    );
  }
  if (row.prob_over_25 !== null && row.prob_over_25 !== undefined) {
    const pO = Number(row.prob_over_25);
    const pU = 1 - pO;
    cands.push(
      pO >= pU
        ? { key: "ust_2_5", label_tr: "2.5 Üst", family: "ou_25", probability: pO, iddaa_odd: null }
        : { key: "alt_2_5", label_tr: "2.5 Alt", family: "ou_25", probability: pU, iddaa_odd: null }
    );
  }
  cands.sort((a, b) => b.probability - a.probability);
  return cands.slice(0, 3);
}

export async function enrichAndSilentPersist(env: Env, rows: any[]): Promise<any[]> {
  if (!rows.length) return [];

  const { todayTr, yesterdayTr } = getIstanbulDates();
  const dateSet = new Set<string>([todayTr, yesterdayTr]);
  for (const r of rows) {
    if (typeof r.kickoff_tr === "string" && r.kickoff_tr.length >= 10) {
      dateSet.add(r.kickoff_tr.slice(0, 10));
    }
  }
  const liveMap = await fetchIddaaLiveScores(Array.from(dateSet).slice(0, 4));
  const nowUtc = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const dbStatements: D1PreparedStatement[] = [];

  const enriched = rows.map((row) => {
    const eid = row.iddaa_event_id ? String(row.iddaa_event_id) : "";
    const live = eid ? liveMap[eid] : undefined;

    const hasFinResult = row.fin_home_goals !== null && row.fin_home_goals !== undefined;
    let effectiveStatus: string = hasFinResult ? "finished" : row.status || "scheduled";
    let scoreHome: number | null = hasFinResult ? Number(row.fin_home_goals) : row.live_home_goals ?? null;
    let scoreAway: number | null = hasFinResult ? Number(row.fin_away_goals) : row.live_away_goals ?? null;
    let htHome: number | null = hasFinResult ? row.fin_ht_home_goals ?? null : row.live_ht_home_goals ?? null;
    let htAway: number | null = hasFinResult ? row.fin_ht_away_goals ?? null : row.live_ht_away_goals ?? null;
    let minute: string | null = hasFinResult ? "MS" : row.live_minute ?? null;
    let statusLabel: string = hasFinResult ? "MS" : row.live_status_label || "Başlamadı";

    if (live && live.home_goals !== null && live.away_goals !== null) {
      if (live.status === "finished") {
        effectiveStatus = "finished";
        scoreHome = live.home_goals;
        scoreAway = live.away_goals;
        htHome = live.ht_home_goals ?? htHome;
        htAway = live.ht_away_goals ?? htAway;
        minute = "MS";
        statusLabel = live.status_label;

        // Silently persist newly finished match_results without sending Telegram notifications
        if (!hasFinResult && row.fixture_id) {
          const outcome = scoreHome > scoreAway ? "1" : scoreAway > scoreHome ? "2" : "X";
          const btts = scoreHome > 0 && scoreAway > 0 ? 1 : 0;
          const total = scoreHome + scoreAway;
          dbStatements.push(
            env.DB.prepare(
              `INSERT INTO match_results (
                fixture_id, home_goals, away_goals, ht_home_goals, ht_away_goals,
                outcome_1x2, btts, total_goals, source_name, source_url, is_demo, recorded_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'İddaa.com Canlı Sonuçlar', 'https://statisticsv2.iddaa.com/live-results', 0, ?)
              ON CONFLICT(fixture_id) DO UPDATE SET
                home_goals = excluded.home_goals,
                away_goals = excluded.away_goals,
                outcome_1x2 = excluded.outcome_1x2,
                btts = excluded.btts,
                total_goals = excluded.total_goals,
                recorded_at = excluded.recorded_at`
            ).bind(row.fixture_id, scoreHome, scoreAway, htHome, htAway, outcome, btts, total, nowUtc)
          );
          dbStatements.push(
            env.DB.prepare(
              `UPDATE fixtures
               SET status = 'finished', live_home_goals = ?, live_away_goals = ?,
                   live_ht_home_goals = COALESCE(?, live_ht_home_goals),
                   live_ht_away_goals = COALESCE(?, live_ht_away_goals),
                   live_minute = 'MS', live_status_label = 'MS', live_updated_at_utc = ?, updated_at = ?
               WHERE fixture_id = ?`
            ).bind(scoreHome, scoreAway, htHome, htAway, nowUtc, nowUtc, row.fixture_id)
          );
        }
      } else if (live.status === "live" && !hasFinResult) {
        effectiveStatus = "live";
        scoreHome = live.home_goals;
        scoreAway = live.away_goals;
        htHome = live.ht_home_goals ?? htHome;
        htAway = live.ht_away_goals ?? htAway;
        minute = live.minute;
        statusLabel = live.status_label;
      }
    }

    const basePicks = parseTopPicksRow(row);
    const evaluatedPicks: TopPickItem[] = basePicks.map((p) => {
      const ev = evaluatePick(p.key, scoreHome, scoreAway, effectiveStatus);
      return {
        ...p,
        eval_state: ev.state,
        locked: ev.locked,
      };
    });

    return {
      ...row,
      effective_status: effectiveStatus,
      score_home: scoreHome,
      score_away: scoreAway,
      ht_home: htHome,
      ht_away: htAway,
      live_minute: minute,
      live_status_label: statusLabel,
      top_picks: evaluatedPicks,
    };
  });

  if (dbStatements.length > 0) {
    try {
      await env.DB.batch(dbStatements.slice(0, 40));
    } catch {
      // Never break API read responses if silent persistence hits a transient conflict
    }
  }

  return enriched;
}
