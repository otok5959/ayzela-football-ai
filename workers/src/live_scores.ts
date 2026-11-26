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

function isSecondHalfOrHt(liveMinute?: string | null): boolean {
  if (!liveMinute) return false;
  const m = liveMinute.trim().toUpperCase();
  if (m === "İY" || m === "DEVRE ARASI" || m === "MS") return true;
  const digits = m.replace(/\D/g, "");
  return Boolean(digits && Number(digits) >= 46);
}

export function evaluatePick(
  pickKey: string,
  hg: number | null | undefined,
  ag: number | null | undefined,
  matchStatus: string,
  htHg?: number | null,
  htAg?: number | null,
  liveMinute?: string | null
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

  // First-half markets
  if (pickKey.startsWith("iy_")) {
    const htDone = finished || isSecondHalfOrHt(liveMinute);
    let hh: number;
    let ha: number;
    if (htHg !== null && htHg !== undefined && htAg !== null && htAg !== undefined) {
      hh = Number(htHg);
      ha = Number(htAg);
    } else if (!htDone && matchStatus === "live") {
      hh = h;
      ha = a;
    } else {
      return { state: "pending", locked: false };
    }

    const htTot = hh + ha;
    let htHit: boolean | null = null;
    switch (pickKey) {
      case "iy_1": htHit = hh > ha; break;
      case "iy_x": htHit = hh === ha; break;
      case "iy_2": htHit = ha > hh; break;
      case "iy_1x": htHit = hh >= ha; break;
      case "iy_x2": htHit = ha >= hh; break;
      case "iy_12": htHit = hh !== ha; break;
      case "iy_ust_0_5": htHit = htTot >= 1; break;
      case "iy_alt_0_5": htHit = htTot === 0; break;
      case "iy_ust_1_5": htHit = htTot >= 2; break;
      case "iy_alt_1_5": htHit = htTot <= 1; break;
      case "iy_kg_var": htHit = hh > 0 && ha > 0; break;
      case "iy_kg_yok": htHit = !(hh > 0 && ha > 0); break;
      default: return { state: "pending", locked: false };
    }
    if (htDone) {
      return {
        state: finished ? (htHit ? "won" : "lost") : htHit ? "live_won" : "live_lost",
        locked: true,
      };
    }
    const locked =
      ((pickKey === "iy_ust_0_5" || pickKey === "iy_alt_0_5") && htTot >= 1) ||
      ((pickKey === "iy_ust_1_5" || pickKey === "iy_alt_1_5") && htTot >= 2) ||
      ((pickKey === "iy_kg_var" || pickKey === "iy_kg_yok") && hh > 0 && ha > 0);
    return { state: htHit ? "live_won" : "live_lost", locked };
  }

  // Second-half markets
  if (pickKey.startsWith("2y_")) {
    if (htHg === null || htHg === undefined || htAg === null || htAg === undefined) {
      return { state: "pending", locked: false };
    }
    if (!finished && !isSecondHalfOrHt(liveMinute)) {
      return { state: "pending", locked: false };
    }
    const shH = h - Number(htHg);
    const shA = a - Number(htAg);
    let shHit: boolean | null = null;
    if (pickKey === "2y_1") shHit = shH > shA;
    else if (pickKey === "2y_x") shHit = shH === shA;
    else if (pickKey === "2y_2") shHit = shA > shH;
    if (shHit === null) return { state: "pending", locked: false };
    if (finished) return { state: shHit ? "won" : "lost", locked: true };
    return { state: shHit ? "live_won" : "live_lost", locked: false };
  }

  let hit: boolean | null = null;
  switch (pickKey) {
    case "ms_1": hit = h > a; break;
    case "ms_x": hit = h === a; break;
    case "ms_2": hit = a > h; break;
    case "dc_1x": hit = h >= a; break;
    case "dc_x2": hit = a >= h; break;
    case "dc_12": hit = h !== a; break;
    case "kg_var": hit = h > 0 && a > 0; break;
    case "kg_yok": hit = !(h > 0 && a > 0); break;
    case "ust_1_5": hit = tot >= 2; break;
    case "alt_1_5": hit = tot <= 1; break;
    case "ust_2_5": hit = tot >= 3; break;
    case "alt_2_5": hit = tot <= 2; break;
    case "ust_3_5": hit = tot >= 4; break;
    case "alt_3_5": hit = tot <= 3; break;
    case "ust_4_5": hit = tot >= 5; break;
    case "alt_4_5": hit = tot <= 4; break;
    case "ev_ust_0_5": hit = h >= 1; break;
    case "ev_alt_0_5": hit = h === 0; break;
    case "ev_ust_1_5": hit = h >= 2; break;
    case "ev_alt_1_5": hit = h <= 1; break;
    case "ev_ust_2_5": hit = h >= 3; break;
    case "ev_alt_2_5": hit = h <= 2; break;
    case "dep_ust_0_5": hit = a >= 1; break;
    case "dep_alt_0_5": hit = a === 0; break;
    case "dep_ust_1_5": hit = a >= 2; break;
    case "dep_alt_1_5": hit = a <= 1; break;
    case "dep_ust_2_5": hit = a >= 3; break;
    case "dep_alt_2_5": hit = a <= 2; break;
    case "ms1_ust_1_5": hit = h > a && tot >= 2; break;
    case "ms1_alt_1_5": hit = h > a && tot <= 1; break;
    case "ms2_ust_1_5": hit = a > h && tot >= 2; break;
    case "ms2_alt_1_5": hit = a > h && tot <= 1; break;
    case "ms1_ust_2_5": hit = h > a && tot >= 3; break;
    case "ms1_alt_2_5": hit = h > a && tot <= 2; break;
    case "ms2_ust_2_5": hit = a > h && tot >= 3; break;
    case "ms2_alt_2_5": hit = a > h && tot <= 2; break;
    case "ms1_ust_3_5": hit = h > a && tot >= 4; break;
    case "ms1_alt_3_5": hit = h > a && tot <= 3; break;
    case "ms2_ust_3_5": hit = a > h && tot >= 4; break;
    case "ms2_alt_3_5": hit = a > h && tot <= 3; break;
    case "ust25_kg_var": hit = tot >= 3 && h > 0 && a > 0; break;
    case "alt25_kg_yok": hit = tot <= 2 && !(h > 0 && a > 0); break;
    case "alt25_kg_var": hit = tot <= 2 && h > 0 && a > 0; break;
    case "ust25_kg_yok": hit = tot >= 3 && !(h > 0 && a > 0); break;
    case "ms1_kg_var": hit = h > a && h > 0 && a > 0; break;
    case "ms1_kg_yok": hit = h > a && !(h > 0 && a > 0); break;
    case "ms2_kg_var": hit = a > h && h > 0 && a > 0; break;
    case "ms2_kg_yok": hit = a > h && !(h > 0 && a > 0); break;
    case "hnd_m1_1": hit = h - a >= 2; break;
    case "hnd_p1_2": hit = a - h >= 2; break;
    case "gol_0_1": hit = tot <= 1; break;
    case "gol_2_3": hit = tot >= 2 && tot <= 3; break;
    case "gol_4_5": hit = tot >= 4 && tot <= 5; break;
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
  else if ((pickKey === "ust_4_5" || pickKey === "alt_4_5") && tot >= 5) locked = true;
  else if ((pickKey === "ev_ust_0_5" || pickKey === "ev_alt_0_5") && h >= 1) locked = true;
  else if ((pickKey === "ev_ust_1_5" || pickKey === "ev_alt_1_5") && h >= 2) locked = true;
  else if ((pickKey === "ev_ust_2_5" || pickKey === "ev_alt_2_5") && h >= 3) locked = true;
  else if ((pickKey === "dep_ust_0_5" || pickKey === "dep_alt_0_5") && a >= 1) locked = true;
  else if ((pickKey === "dep_ust_1_5" || pickKey === "dep_alt_1_5") && a >= 2) locked = true;
  else if ((pickKey === "dep_ust_2_5" || pickKey === "dep_alt_2_5") && a >= 3) locked = true;
  else if (pickKey === "gol_0_1" && tot >= 2) locked = true;
  else if (pickKey === "gol_2_3" && tot >= 4) locked = true;
  else if (pickKey === "gol_4_5" && tot >= 6) locked = true;

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
        return arr
          .filter((p: any) => typeof p?.iddaa_odd === "number" && p.iddaa_odd >= 1.3 && p.iddaa_odd <= 3.6)
          .slice(0, 2);
      }
    } catch {
      // Ignore malformed JSON
    }
  }
  return [];
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
      const ev = evaluatePick(p.key, scoreHome, scoreAway, effectiveStatus, htHome, htAway, minute);
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
      // Never break API read responses
    }
  }

  return enriched;
}

export async function enrichCouponsWithLiveScores(env: Env, couponRows: any[]): Promise<any[]> {
  if (!couponRows.length) return [];

  const parsedCoupons = couponRows.map((c) => {
    let legs: any[] = [];
    try {
      legs = typeof c.legs_json === "string" ? JSON.parse(c.legs_json) : c.legs_json || [];
    } catch {
      legs = [];
    }
    return { ...c, legs };
  });

  const fixtureIds = Array.from(
    new Set(parsedCoupons.flatMap((c) => c.legs.map((l: any) => l.fixture_id)).filter(Boolean))
  );
  const dateSet = new Set<string>([getIstanbulDates().todayTr, getIstanbulDates().yesterdayTr]);
  for (const c of parsedCoupons) {
    if (c.analysis_day_tr) dateSet.add(String(c.analysis_day_tr));
    for (const l of c.legs) {
      if (typeof l.kickoff_tr === "string" && l.kickoff_tr.length >= 10) {
        dateSet.add(l.kickoff_tr.slice(0, 10));
      }
    }
  }

  const dbFixtureMap = new Map<string, any>();
  if (fixtureIds.length > 0) {
    const placeholders = fixtureIds.map(() => "?").join(",");
    const dbRes = await env.DB.prepare(
      `SELECT f.fixture_id, f.iddaa_event_id, f.status, f.live_home_goals, f.live_away_goals,
              f.live_ht_home_goals, f.live_ht_away_goals, f.live_minute,
              mr.home_goals AS fin_home_goals, mr.away_goals AS fin_away_goals,
              mr.ht_home_goals AS fin_ht_home_goals, mr.ht_away_goals AS fin_ht_away_goals
       FROM fixtures f
       LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
       WHERE f.fixture_id IN (${placeholders})`
    )
      .bind(...fixtureIds)
      .all();
    for (const r of dbRes.results || []) {
      dbFixtureMap.set(String((r as any).fixture_id), r);
    }
  }

  const liveMap = await fetchIddaaLiveScores(Array.from(dateSet).slice(0, 5));

  return parsedCoupons.map((c) => {
    let wonLegs = 0;
    let lostLegs = 0;
    let liveWonLegs = 0;
    let liveLostLegs = 0;
    let pendingLegs = 0;

    const evaluatedLegs = c.legs.map((leg: any) => {
      const fx = dbFixtureMap.get(String(leg.fixture_id || ""));
      const eid = String(leg.iddaa_event_id || fx?.iddaa_event_id || "");
      const live = eid ? liveMap[eid] : undefined;

      const hasFin = fx?.fin_home_goals !== null && fx?.fin_home_goals !== undefined;
      let status: string = hasFin ? "finished" : fx?.status || "scheduled";
      let hg: number | null = hasFin ? Number(fx.fin_home_goals) : fx?.live_home_goals ?? null;
      let ag: number | null = hasFin ? Number(fx.fin_away_goals) : fx?.live_away_goals ?? null;
      let htH: number | null = hasFin ? fx?.fin_ht_home_goals ?? null : fx?.live_ht_home_goals ?? null;
      let htA: number | null = hasFin ? fx?.fin_ht_away_goals ?? null : fx?.live_ht_away_goals ?? null;
      let minute: string | null = hasFin ? "MS" : fx?.live_minute ?? null;

      if (live && live.home_goals !== null && live.away_goals !== null) {
        if (live.status === "finished") {
          status = "finished";
          hg = live.home_goals;
          ag = live.away_goals;
          htH = live.ht_home_goals ?? htH;
          htA = live.ht_away_goals ?? htA;
          minute = "MS";
        } else if (live.status === "live" && !hasFin) {
          status = "live";
          hg = live.home_goals;
          ag = live.away_goals;
          htH = live.ht_home_goals ?? htH;
          htA = live.ht_away_goals ?? htA;
          minute = live.minute;
        }
      }

      const ev = evaluatePick(String(leg.pick_key || ""), hg, ag, status, htH, htA, minute);
      if (ev.state === "won") wonLegs += 1;
      else if (ev.state === "lost") lostLegs += 1;
      else if (ev.state === "live_won") liveWonLegs += 1;
      else if (ev.state === "live_lost") liveLostLegs += 1;
      else pendingLegs += 1;

      return {
        ...leg,
        effective_status: status,
        score_home: hg,
        score_away: ag,
        ht_home: htH,
        ht_away: htA,
        live_minute: minute,
        eval_state: ev.state,
        locked: ev.locked,
      };
    });

    let couponStatus = "pending";
    if (lostLegs > 0) couponStatus = "lost";
    else if (wonLegs === evaluatedLegs.length && evaluatedLegs.length > 0) couponStatus = "won";
    else if (liveWonLegs > 0 || liveLostLegs > 0 || wonLegs > 0) couponStatus = "live";

    return {
      ...c,
      legs: evaluatedLegs,
      effective_status: couponStatus,
      won_legs: wonLegs,
      lost_legs: lostLegs,
      live_won_legs: liveWonLegs,
      live_lost_legs: liveLostLegs,
      pending_legs: pendingLegs,
    };
  });
}
