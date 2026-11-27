import { Env, timingSafeEqual } from "./auth";
import { dispatchGithubWorkflow } from "./github_dispatch";
import { enrichAndSilentPersist, enrichCouponsWithLiveScores, getIstanbulDates, TopPickItem } from "./live_scores";

interface TelegramUpdate {
  message?: {
    from?: { id?: number; first_name?: string; username?: string };
    chat?: { id?: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from?: { id?: number; first_name?: string; username?: string };
    message?: { chat?: { id?: number } };
    data?: string;
  };
}

function splitIds(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "⚡ Şimdi Analiz Et", callback_data: "/simdi_analiz" }],
      [
        { text: "🎯 Seçilen 15 Maç", callback_data: "/bugun" },
        { text: "🎟️ Kuponlarım", callback_data: "/kuponlarim" },
      ],
      [
        { text: "🔴 Canlı Sonuçlar", callback_data: "/canli" },
        { text: "🏁 Sonuçlar", callback_data: "/sonuclar" },
      ],
      [
        { text: "📅 Yarın Fikstürü", callback_data: "/yarin" },
        { text: "🩺 Kaynak Sağlığı", callback_data: "/kaynaklar" },
      ],
      [{ text: "🖥️ Web Panel", callback_data: "/panel" }],
    ],
  };
}

function formatPicksLine(picks: TopPickItem[]): string {
  if (!picks?.length) return "-";
  return picks
    .slice(0, 2)
    .map((p) => {
      const icon =
        p.eval_state === "won" || p.eval_state === "live_won"
          ? "🟢"
          : p.eval_state === "lost" || p.eval_state === "live_lost"
          ? "🔴"
          : "⏳";
      const pct = Math.round((p.probability || 0) * 100);
      const oddStr = typeof p.iddaa_odd === "number" ? ` (${p.iddaa_odd.toFixed(2)})` : "";
      return `${icon} ${p.label_tr}: \`%${pct}\`${oddStr}`;
    })
    .join(" | ");
}

async function answerCallback(env: Env, callbackQueryId?: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !callbackQueryId) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

async function sendTelegramReply(env: Env, chatId: string, text: string, withMenu = true): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: withMenu ? mainKeyboard() : undefined,
    }),
  });
  if (!resp.ok && resp.status === 400) {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: withMenu ? mainKeyboard() : undefined,
      }),
    });
  }
}

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || !timingSafeEqual(secretHeader, env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const fromObj = update.message?.from ?? update.callback_query?.from;
  const uid = fromObj?.id;
  const cid = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  const rawText = (update.message?.text ?? update.callback_query?.data ?? "").trim();

  const uidStr = uid !== undefined ? String(uid) : "";
  const cidStr = cid !== undefined ? String(cid) : "";

  const allowedUsers = splitIds(env.TELEGRAM_ALLOWED_USER_ID);
  const allowedChats = splitIds(env.TELEGRAM_CHAT_ID);
  const primaryAdminId = allowedUsers[0] || "";

  let isAuthorized = Boolean(uidStr && cidStr && allowedUsers.includes(uidStr) && allowedChats.includes(cidStr));
  if (!isAuthorized && uidStr && cidStr) {
    try {
      const subRow = await env.DB.prepare(
        "SELECT telegram_user_id, chat_id FROM telegram_subscribers WHERE telegram_user_id = ? AND enabled = 1"
      )
        .bind(uidStr)
        .first<{ telegram_user_id?: string; chat_id?: string }>();
      if (subRow?.telegram_user_id && (subRow.chat_id === cidStr || uidStr === cidStr)) {
        isAuthorized = true;
      }
    } catch {
      // Migration 0006 may not be applied yet
    }
  }

  if (!isAuthorized) {
    await env.DB.prepare(
      "INSERT INTO system_logs (level, module, message, details_json, created_at_utc) VALUES ('SECURITY', 'worker.telegram', 'Yetkisiz Telegram erişimi reddedildi', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    )
      .bind(
        JSON.stringify({
          uid: uidStr,
          cid: cidStr,
          name: fromObj?.first_name || "",
          username: fromObj?.username || "",
        })
      )
      .run();

    if (cidStr) {
      await sendTelegramReply(
        env,
        cidStr,
        `⛔ Erişim izniniz henüz tanımlı değil.\nYöneticiye iletmeniz gereken Telegram ID: \`${uidStr || "-"}\``,
        false
      );
    }
    return Response.json({ ok: false, unauthorized: true });
  }

  if (update.callback_query?.id) {
    await answerCallback(env, update.callback_query.id);
  }

  const [rawCmd, ...rest] = rawText.split(/\s+/);
  const cmd = (rawCmd || "/menu").split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();
  const chatStr = cidStr;

  let reply = "ℹ️ Komut listesi için /yardim yazabilirsiniz.";

  if (cmd === "/start" || cmd === "/menu") {
    reply =
      "⚽ *AyzEla Football AI* aktif.\n" +
      "Günlük seçilen 15 maç (gerçek 1.30-3.60 oranlı en değerli 2 olasılık), günlük 2 adet 4'lü kupon ve canlı skor takibi hazır.";
  } else if (cmd === "/kullanici_ekle") {
    if (uidStr !== primaryAdminId) {
      reply = "⛔ Bu komutu yalnızca ana yönetici kullanabilir.";
    } else if (!rest[0] || !/^\d+$/.test(rest[0])) {
      reply = "Kullanım: `/kullanici_ekle 123456789 İsim`";
    } else {
      const targetId = rest[0];
      const dispName = rest.slice(1).join(" ").trim() || `Kullanıcı ${targetId}`;
      await env.DB.prepare(
        `INSERT INTO telegram_subscribers (telegram_user_id, chat_id, display_name, role, enabled, created_at_utc)
         VALUES (?, ?, ?, 'member', 1, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
         ON CONFLICT(telegram_user_id) DO UPDATE SET enabled = 1, chat_id = excluded.chat_id, display_name = excluded.display_name`
      )
        .bind(targetId, targetId, dispName)
        .run();
      reply = `✅ *Telegram kullanıcısı eklendi:* \`${targetId}\` (${dispName})`;
    }
  } else if (cmd === "/kullanici_sil") {
    if (uidStr !== primaryAdminId) {
      reply = "⛔ Bu komutu yalnızca ana yönetici kullanabilir.";
    } else if (!rest[0]) {
      reply = "Kullanım: `/kullanici_sil 123456789`";
    } else {
      await env.DB.prepare("UPDATE telegram_subscribers SET enabled = 0 WHERE telegram_user_id = ?")
        .bind(rest[0].trim())
        .run();
      reply = `🗑️ Kullanıcı erişimi kaldırıldı: \`${rest[0].trim()}\``;
    }
  } else if (cmd === "/simdi_analiz") {
    const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
    await env.DB.prepare(
      "INSERT INTO job_queue (job_id, job_type, payload_json, requested_by_telegram_id, status, created_at_utc) VALUES (?, 'manual_analysis', ?, ?, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    )
      .bind(jobId, JSON.stringify({ mode: "full_now" }), uidStr)
      .run();
    const disp = await dispatchGithubWorkflow(env, "manual_dispatch.yml", { job_id: jobId, task: "full_now" });
    reply = disp.ok
      ? `⚡ *Anlık analiz başlatıldı!*\nİş No: \`${jobId}\`\nTüm İddaa bülteni taranıp seçilen 15 maç ve kuponlar hazırlanacaktır.`
      : `⚠️ İş kuyruğa eklendi (\`${jobId}\`) ancak GitHub Actions tetiklenemedi: ${disp.detail}`;
  } else if (cmd === "/kuponlarim" || cmd === "/kupon") {
    try {
      const cRows = await env.DB.prepare(
        "SELECT * FROM daily_coupons WHERE is_demo = 0 ORDER BY analysis_day_tr DESC, coupon_slot ASC, created_at_utc DESC LIMIT 6"
      ).all();
      const rawList = cRows.results || [];
      if (!rawList.length) {
        reply = "🎟️ Henüz oluşturulmuş günlük kupon yok. *⚡ Şimdi Analiz Et* butonuna basabilirsiniz.";
      } else {
        const latestDay = String((rawList[0] as any).analysis_day_tr || "");
        const dayRows = rawList.filter((r: any) => String(r.analysis_day_tr) === latestDay).slice(0, 2);
        const enriched = await enrichCouponsWithLiveScores(env, dayRows);
        const outLines: string[] = [`🎟️ *Kuponlarım (${latestDay})*`];
        for (const c of enriched) {
          const icon = c.coupon_type === "balanced" ? "🛡️" : "🚀";
          const stLabel =
            c.effective_status === "won"
              ? "✅ Tuttu"
              : c.effective_status === "lost"
              ? "❌ Tutmadı"
              : c.effective_status === "live"
              ? `🟡 ${c.won_legs + c.live_won_legs}/${c.legs?.length || 4}`
              : "⏳ Bekliyor";
          outLines.push(`\n${icon} *${c.title_tr}* — Oran: *${Number(c.total_odd).toFixed(2)}* (${stLabel})`);
          for (let i = 0; i < (c.legs || []).length; i++) {
            const leg = c.legs[i];
            const legIcon =
              leg.eval_state === "won" || leg.eval_state === "live_won"
                ? "🟢"
                : leg.eval_state === "lost" || leg.eval_state === "live_lost"
                ? "🔴"
                : "⏳";
            const sc =
              leg.score_home !== null && leg.score_home !== undefined
                ? ` (${leg.score_home}-${leg.score_away})`
                : "";
            outLines.push(
              `  ${i + 1}. ${legIcon} \`[${leg.iddaa_match_code || "-"}]\` ${leg.home_team} - ${leg.away_team}${sc}\n     → *${leg.label_tr}* (${Number(leg.iddaa_odd).toFixed(2)})`
            );
          }
        }
        outLines.push(`\n🖥️ Detaylı Kupon Takibi: ${env.PANEL_ORIGIN}`);
        reply = outLines.join("\n").slice(0, 3850);
      }
    } catch {
      reply = "🎟️ Kupon tablosu henüz hazırlanmadı. Lütfen güncel analizi bekleyin.";
    }
  } else if (cmd === "/panel") {
    reply = `🖥️ *Web Yönetim Paneli*\n${env.PANEL_ORIGIN}`;
  } else if (cmd === "/ligler") {
    const res = await env.DB.prepare("SELECT name_tr FROM leagues WHERE enabled = 1 ORDER BY name_tr LIMIT 40").all();
    const list = (res.results || []).map((r: any) => `- ${r.name_tr}`).join("\n");
    reply = `🏆 *Aktif Ligler*\n${list || "Kayıt yok"}`;
  } else if (cmd === "/kaynaklar") {
    const res = await env.DB.prepare("SELECT source_id, status, coverage_summary FROM source_health ORDER BY source_id").all();
    const list = (res.results || [])
      .map((r: any) => `- \`${r.source_id}\`: *${String(r.status).toUpperCase()}* | ${r.coverage_summary}`)
      .join("\n");
    reply = `🩺 *Veri Kaynakları Sağlık Durumu*\n${list}`;
  } else if (cmd === "/bugun" || cmd === "/top15") {
    const dayRow = await env.DB.prepare(
      "SELECT analysis_day_tr FROM match_predictions WHERE is_demo = 0 AND is_selected_top15 = 1 ORDER BY analysis_day_tr DESC LIMIT 1"
    ).first<{ analysis_day_tr?: string }>();
    const targetDay = dayRow?.analysis_day_tr || getIstanbulDates().todayTr;
    const res = await env.DB.prepare(
      `SELECT f.*, mp.prob_home, mp.prob_draw, mp.prob_away, mp.prob_btts_yes, mp.prob_over_25,
              mp.top_picks_json, mp.is_selected_top15, mp.selection_rank,
              mr.home_goals AS fin_home_goals, mr.away_goals AS fin_away_goals,
              mr.ht_home_goals AS fin_ht_home_goals, mr.ht_away_goals AS fin_ht_away_goals
       FROM match_predictions mp
       JOIN fixtures f ON mp.fixture_id = f.fixture_id
       LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
       WHERE mp.is_demo = 0
         AND mp.analysis_day_tr = ?
         AND mp.is_selected_top15 = 1
         AND mp.created_at_utc = (
           SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = f.fixture_id
         )
       ORDER BY f.league_name ASC, f.kickoff_tr ASC LIMIT 15`
    )
      .bind(targetDay)
      .all();
    const matches = await enrichAndSilentPersist(env, res.results || []);
    if (!matches.length) {
      reply = "🎯 Henüz seçilmiş 15 maç kaydı bulunmuyor. *⚡ Şimdi Analiz Et* butonuna basabilirsiniz.";
    } else {
      let curLeague = "";
      const outLines: string[] = [`🎯 *Günün Seçilen ${matches.length} Maçı (${targetDay})*`];
      matches.forEach((r: any, i: number) => {
        if (r.league_name !== curLeague) {
          curLeague = r.league_name;
          outLines.push(`\n🏆 *${curLeague}*`);
        }
        const code = r.iddaa_match_code || "-";
        const timeStr = String(r.kickoff_tr || "").slice(11, 16);
        const scorePart =
          r.score_home !== null && r.score_home !== undefined
            ? ` | *${r.score_home}-${r.score_away}* (${r.live_minute || r.live_status_label || ""})`
            : "";
        outLines.push(
          `${i + 1}. \`[Kod: ${code}]\` *${r.home_team_name} - ${r.away_team_name}* (${timeStr}${scorePart})\n` +
            `   ${formatPicksLine(r.top_picks || [])}`
        );
      });
      outLines.push(`\n🖥️ Canlı Takip: ${env.PANEL_ORIGIN}`);
      reply = outLines.join("\n").slice(0, 3850);
    }
  } else if (cmd === "/canli") {
    const { todayTr, yesterdayTr } = getIstanbulDates();
    const res = await env.DB.prepare(
      `SELECT f.*, mp.prob_home, mp.prob_draw, mp.prob_away, mp.prob_btts_yes, mp.prob_over_25,
              mp.top_picks_json, mp.is_selected_top15,
              mr.home_goals AS fin_home_goals, mr.away_goals AS fin_away_goals,
              mr.ht_home_goals AS fin_ht_home_goals, mr.ht_away_goals AS fin_ht_away_goals
       FROM fixtures f
       JOIN match_predictions mp ON f.fixture_id = mp.fixture_id
         AND mp.created_at_utc = (
           SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = f.fixture_id
         )
       LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
       WHERE f.is_demo = 0 AND (f.analysis_day_tr IN (?, ?) OR f.status = 'live')
       ORDER BY COALESCE(mp.is_selected_top15, 0) DESC, f.league_name ASC, f.kickoff_tr ASC LIMIT 120`
    )
      .bind(todayTr, yesterdayTr)
      .all();
    const enriched = await enrichAndSilentPersist(env, res.results || []);
    const liveMatches = enriched.filter((m: any) => m.effective_status === "live");
    if (!liveMatches.length) {
      reply = "🔴 Şu anda devam eden canlı maç bulunmuyor. Biten maçlar için *🏁 Sonuçlar* butonuna bakabilirsiniz.";
    } else {
      const outLines: string[] = [`🔴 *Canlı Maçlar (${liveMatches.length})*`];
      let curLeague = "";
      liveMatches.slice(0, 20).forEach((m: any) => {
        if (m.league_name !== curLeague) {
          curLeague = m.league_name;
          outLines.push(`\n🏆 *${curLeague}*`);
        }
        const star = m.is_selected_top15 ? "⭐ " : "";
        const code = m.iddaa_match_code || "-";
        outLines.push(
          `${star}\`[Kod: ${code}]\` *${m.home_team_name} ${m.score_home ?? 0}-${m.score_away ?? 0} ${m.away_team_name}* (${m.live_minute || "Canlı"})\n` +
            `   ${formatPicksLine(m.top_picks || [])}`
        );
      });
      reply = outLines.join("\n").slice(0, 3850);
    }
  } else if (cmd === "/sonuclar") {
    const { todayTr, yesterdayTr } = getIstanbulDates();
    const recentRes = await env.DB.prepare(
      `SELECT f.*, mp.prob_home, mp.prob_draw, mp.prob_away, mp.prob_btts_yes, mp.prob_over_25,
              mp.top_picks_json, mp.is_selected_top15,
              mr.home_goals AS fin_home_goals, mr.away_goals AS fin_away_goals,
              mr.ht_home_goals AS fin_ht_home_goals, mr.ht_away_goals AS fin_ht_away_goals
       FROM fixtures f
       JOIN match_predictions mp ON f.fixture_id = mp.fixture_id
         AND mp.created_at_utc = (
           SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = f.fixture_id
         )
       LEFT JOIN match_results mr ON f.fixture_id = mr.fixture_id
       WHERE f.is_demo = 0 AND f.analysis_day_tr IN (?, ?)
       ORDER BY COALESCE(mp.is_selected_top15, 0) DESC, f.kickoff_tr DESC LIMIT 120`
    )
      .bind(todayTr, yesterdayTr)
      .all();
    const enriched = await enrichAndSilentPersist(env, recentRes.results || []);
    const finished = enriched.filter((m: any) => m.effective_status === "finished");
    if (!finished.length) {
      reply = "🏁 Henüz tamamlanmış maç sonucu bulunmuyor.";
    } else {
      let won = 0;
      let lost = 0;
      const outLines: string[] = [`🏁 *Tamamlanan Maç Sonuçları (${finished.length})*`];
      finished.slice(0, 18).forEach((m: any) => {
        const picks: TopPickItem[] = m.top_picks || [];
        picks.forEach((p) => {
          if (p.eval_state === "won") won += 1;
          else if (p.eval_state === "lost") lost += 1;
        });
        const star = m.is_selected_top15 ? "⭐ " : "";
        const code = m.iddaa_match_code || "-";
        outLines.push(
          `${star}\`[Kod: ${code}]\` *${m.home_team_name} ${m.score_home}-${m.score_away} ${m.away_team_name}*\n` +
            `   ${formatPicksLine(picks)}`
        );
      });
      outLines.push(`\nÖzet (Gösterilen): 🟢 ${won} Tuttu | 🔴 ${lost} Tutmadı`);
      reply = outLines.join("\n").slice(0, 3850);
    }
  } else if (cmd === "/yarin") {
    const nowMs = Date.now() + 27 * 3600 * 1000;
    const tomorrowTr = new Date(nowMs).toISOString().slice(0, 10);
    const res = await env.DB.prepare(
      "SELECT iddaa_match_code, league_name, home_team_name, away_team_name, kickoff_tr FROM fixtures WHERE analysis_day_tr = ? AND is_demo = 0 ORDER BY league_name ASC, kickoff_tr ASC LIMIT 30"
    )
      .bind(tomorrowTr)
      .all();
    if (!res.results?.length) {
      reply = `📅 \`${tomorrowTr}\` için henüz kayıtlı fikstür yok.`;
    } else {
      let curLeague = "";
      const outLines: string[] = [`📅 *Yarının Fikstürü (${tomorrowTr})*`];
      res.results.forEach((r: any) => {
        if (r.league_name !== curLeague) {
          curLeague = r.league_name;
          outLines.push(`\n🏆 *${curLeague}*`);
        }
        outLines.push(`- \`[Kod: ${r.iddaa_match_code || "-"}]\` ${String(r.kickoff_tr || "").slice(11, 16)} | *${r.home_team_name} - ${r.away_team_name}*`);
      });
      reply = outLines.join("\n").slice(0, 3850);
    }
  } else if (cmd === "/analiz") {
    if (!arg) {
      reply = "🔎 Kullanım: `/analiz Galatasaray`";
    } else {
      const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
      await env.DB.prepare(
        "INSERT INTO job_queue (job_id, job_type, payload_json, requested_by_telegram_id, status, created_at_utc) VALUES (?, 'manual_analysis', ?, ?, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
      )
        .bind(jobId, JSON.stringify({ query: arg }), uidStr)
        .run();
      await dispatchGithubWorkflow(env, "manual_dispatch.yml", { job_id: jobId, task: "manual_analysis" });
      reply = `⏳ *Manuel araştırma kuyruğa eklendi*\nSorgu: \`${arg}\`\nİş No: \`${jobId}\`\nTamamlandığında sonuç gönderilecektir.`;
    }
  } else if (cmd === "/durum") {
    const lims = await env.DB.prepare("SELECT label_tr, used_amount, max_limit FROM usage_limits").all();
    reply =
      `⚙️ *Sistem Durumu*\n- FREE_ONLY_MODE: \`${env.FREE_ONLY_MODE}\`\n` +
      (lims.results || []).map((l: any) => `- ${l.label_tr}: \`${l.used_amount}/${l.max_limit}\``).join("\n");
  } else if (cmd === "/yardim") {
    reply =
      "ℹ️ *Komutlar*: /start /menu /bugun /top15 /kuponlarim /canli /sonuclar /yarin /analiz /simdi_analiz /ligler /kaynaklar /durum /panel /kullanici_ekle /kullanici_sil /yardim";
  }

  await sendTelegramReply(env, chatStr, reply, true);
  return Response.json({ ok: true });
}
