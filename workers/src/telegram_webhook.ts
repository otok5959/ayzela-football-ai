import { Env } from "./auth";
import { dispatchGithubWorkflow } from "./github_dispatch";

interface TelegramUpdate {
  message?: {
    from?: { id?: number };
    chat?: { id?: number };
    text?: string;
  };
  callback_query?: {
    id: string;
    from?: { id?: number };
    message?: { chat?: { id?: number } };
    data?: string;
  };
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "⚡ Şimdi Analiz Et", callback_data: "/simdi_analiz" },
      ],
      [
        { text: "📊 Bugünkü Rapor", callback_data: "/bugun" },
        { text: "📅 Yarın Fikstürü", callback_data: "/yarin" },
      ],
      [
        { text: "🩺 Kaynak Sağlığı", callback_data: "/kaynaklar" },
        { text: "📈 Performans", callback_data: "/gunluk" },
      ],
      [
        { text: "🏆 Ligler", callback_data: "/ligler" },
        { text: "🖥️ Web Panel", callback_data: "/panel" },
      ],
    ],
  };
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
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
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
}

export async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  const secretHeader = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
  if (!env.TELEGRAM_WEBHOOK_SECRET || secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  const update = (await request.json()) as TelegramUpdate;
  const uid = update.message?.from?.id ?? update.callback_query?.from?.id;
  const cid = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  const rawText = (update.message?.text ?? update.callback_query?.data ?? "").trim();

  if (String(uid) !== String(env.TELEGRAM_ALLOWED_USER_ID) || String(cid) !== String(env.TELEGRAM_CHAT_ID)) {
    await env.DB.prepare(
      "INSERT INTO system_logs (level, module, message, details_json, created_at_utc) VALUES ('SECURITY', 'worker.telegram', 'Yetkisiz Telegram erişimi reddedildi', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    )
      .bind(JSON.stringify({ uid, cid }))
      .run();
    return new Response("Unauthorized", { status: 403 });
  }

  if (update.callback_query?.id) {
    await answerCallback(env, update.callback_query.id);
  }

  const [rawCmd, ...rest] = rawText.split(/\s+/);
  const cmd = (rawCmd || "/menu").split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();
  const chatStr = String(cid);

  let reply = "ℹ️ Komut listesi için /yardim yazabilirsiniz.";

  if (cmd === "/start" || cmd === "/menu") {
    reply = "⚽ *AyzEla Football AI* aktif.\nSabit 08:00 / 11:59 analizleri dışında istediğiniz an *⚡ Şimdi Analiz Et* butonuna basabilirsiniz.";
  } else if (cmd === "/simdi_analiz") {
    const jobId = `job_${crypto.randomUUID().slice(0, 10)}`;
    await env.DB.prepare(
      "INSERT INTO job_queue (job_id, job_type, payload_json, requested_by_telegram_id, status, created_at_utc) VALUES (?, 'manual_analysis', ?, ?, 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))"
    )
      .bind(jobId, JSON.stringify({ mode: "full_now" }), String(uid))
      .run();
    const disp = await dispatchGithubWorkflow(env, "manual_dispatch.yml", { job_id: jobId, task: "full_now" });
    reply = disp.ok
      ? `⚡ *Anlık analiz başlatıldı!*\nİş No: \`${jobId}\`\n1-2 dakika içinde tamamlandığında rapor buraya ve web paneline düşecektir.`
      : `⚠️ İş kuyruğa eklendi (\`${jobId}\`) ancak GitHub Actions tetiklenemedi: ${disp.detail}`;
  } else if (cmd === "/panel") {
    reply = `🖥️ *Web Yönetim Paneli*\n${env.PANEL_ORIGIN}`;
  } else if (cmd === "/ligler") {
    const res = await env.DB.prepare("SELECT name_tr FROM leagues WHERE enabled = 1 ORDER BY name_tr").all();
    const list = (res.results || []).map((r: any) => `- ${r.name_tr}`).join("\n");
    reply = `🏆 *Aktif Beyaz Liste Ligleri*\n${list || "Kayıt yok"}`;
  } else if (cmd === "/kaynaklar") {
    const res = await env.DB.prepare(
      "SELECT source_id, status, coverage_summary FROM source_health ORDER BY source_id"
    ).all();
    const list = (res.results || [])
      .map((r: any) => `- \`${r.source_id}\`: *${String(r.status).toUpperCase()}* | ${r.coverage_summary}`)
      .join("\n");
    reply = `🩺 *Veri Kaynakları Sağlık Durumu*\n${list}`;
  } else if (cmd === "/bugun") {
    const res = await env.DB.prepare(
      `SELECT f.iddaa_match_code, f.home_team_name, f.away_team_name, f.league_name, f.kickoff_tr,
              mp.prob_home, mp.prob_draw, mp.prob_away, mp.data_coverage_score
       FROM match_predictions mp
       JOIN fixtures f ON mp.fixture_id = f.fixture_id
       WHERE mp.is_demo = 0
         AND mp.created_at_utc = (
           SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = mp.fixture_id
         )
       ORDER BY f.league_name ASC, f.kickoff_tr ASC LIMIT 25`
    ).all();
    if (!res.results?.length) {
      reply = "📊 Henüz bugüne ait analiz kaydı bulunmuyor.";
    } else {
      let curLeague = "";
      const outLines: string[] = ["📊 *Güncel Analizler (Lig Lig)*"];
      res.results.forEach((r: any, i: number) => {
        if (r.league_name !== curLeague) {
          curLeague = r.league_name;
          outLines.push(`\n🏆 *${curLeague}*`);
        }
        const code = r.iddaa_match_code || "-";
        const timeStr = String(r.kickoff_tr || "").slice(11, 16);
        outLines.push(
          `${i + 1}. \`[Kod: ${code}]\` *${r.home_team_name} - ${r.away_team_name}* (${timeStr})\n` +
            `   1-X-2: \`%${Math.round(r.prob_home * 100)}/%${Math.round(r.prob_draw * 100)}/%${Math.round(
              r.prob_away * 100
            )}\` | Veri: \`%${Math.round(r.data_coverage_score * 100)}\``
        );
      });
      outLines.push(`\n🖥️ Tümü için panel: ${env.PANEL_ORIGIN}`);
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
        .bind(jobId, JSON.stringify({ query: arg }), String(uid))
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
      "ℹ️ *Komutlar*: /start /menu /bugun /yarin /analiz /kadro /haberler /sonuclar /gunluk /haftalik /aylik /rapor /ligler /kaynaklar /durum /panel /ayarlar /yardim";
  }

  await sendTelegramReply(env, chatStr, reply, true);
  return Response.json({ ok: true });
}
