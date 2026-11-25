"""Handlers for all 18 Telegram commands with single-user access control."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from backend.config import ISTANBUL_TZ, get_settings
from backend.database.repositories import AyzelaRepository
from backend.telegram.keyboards import main_menu_keyboard
from backend.telegram.security import extract_actor_from_update, is_authorized_telegram_actor

COMMAND_HELP = [
    ("/start", "Sistemi başlat ve yetkiyi doğrula."),
    ("/menu", "Dokunulabilir ana menüyü aç."),
    ("/bugun", "Güncel futbol analiz raporu."),
    ("/yarin", "Mevcut ertesi gün fikstürü."),
    ("/analiz", "Takım veya maç adıyla manuel araştırma kuyruğu."),
    ("/kadro", "Güncel kesin/muhtemel kadro bilgileri."),
    ("/haberler", "Doğrulanmış futbol haberleri."),
    ("/sonuclar", "Tamamlanmış karşılaşmalar."),
    ("/gunluk", "Günlük model performansı."),
    ("/haftalik", "Haftalık model performansı."),
    ("/aylik", "Aylık model performansı."),
    ("/rapor", "Son araştırma raporu."),
    ("/ligler", "Aktif beyaz liste ligleri."),
    ("/kaynaklar", "Veri kaynaklarının sağlık durumu."),
    ("/durum", "Sistemin çalışma durumu ve limitler."),
    ("/panel", "Web yönetim paneli bağlantısı."),
    ("/ayarlar", "Sistem ayarları özeti."),
    ("/yardim", "Komut açıklamaları."),
]


class TelegramCommandRouter:
    def __init__(
        self,
        repo: AyzelaRepository,
        allowed_user_id: str | None = None,
        allowed_chat_id: str | None = None,
    ) -> None:
        self.repo = repo
        self.allowed_user_id = allowed_user_id
        self.allowed_chat_id = allowed_chat_id

    def handle_update(self, update: dict[str, Any]) -> dict[str, Any]:
        uid, cid, text = extract_actor_from_update(update)
        if not is_authorized_telegram_actor(
            uid,
            cid,
            allowed_user_id=self.allowed_user_id,
            allowed_chat_id=self.allowed_chat_id,
            repo=self.repo,
        ):
            return {
                "authorized": False,
                "status_code": 403,
                "reply_text": "⛔ Bu bot yalnızca yetkili kişisel kullanıcı içindir.",
            }

        parts = text.split(maxsplit=1)
        cmd = (parts[0].split("@")[0].lower() if parts else "/menu")
        arg = parts[1].strip() if len(parts) > 1 else ""

        handler_map = {
            "/start": self._cmd_start,
            "/menu": self._cmd_menu,
            "/bugun": self._cmd_bugun,
            "/yarin": self._cmd_yarin,
            "/analiz": self._cmd_analiz,
            "/simdi_analiz": self._cmd_simdi_analiz,
            "/kadro": self._cmd_kadro,
            "/haberler": self._cmd_haberler,
            "/sonuclar": self._cmd_sonuclar,
            "/gunluk": lambda _: self._cmd_perf("daily", "Günlük"),
            "/haftalik": lambda _: self._cmd_perf("weekly", "Haftalık"),
            "/aylik": lambda _: self._cmd_perf("monthly", "Aylık"),
            "/rapor": self._cmd_rapor,
            "/ligler": self._cmd_ligler,
            "/kaynaklar": self._cmd_kaynaklar,
            "/durum": self._cmd_durum,
            "/panel": self._cmd_panel,
            "/ayarlar": self._cmd_ayarlar,
            "/yardim": self._cmd_yardim,
        }

        fn = handler_map.get(cmd)
        if fn is None:
            return {
                "authorized": True,
                "status_code": 200,
                "reply_text": "Bilinmeyen komut. Yardım için /yardim yazabilirsiniz.",
                "reply_markup": main_menu_keyboard(),
            }

        reply_text, markup = fn(arg)
        return {
            "authorized": True,
            "status_code": 200,
            "command": cmd,
            "reply_text": reply_text,
            "reply_markup": markup,
        }

    def _cmd_start(self, _: str) -> tuple[str, dict]:
        return (
            "⚽ *AyzEla Football AI* aktif.\n"
            "Kişisel araştırma ve analiz asistanınız hazır. Aşağıdaki menüden ilerleyebilirsiniz.",
            main_menu_keyboard(),
        )

    def _cmd_menu(self, _: str) -> tuple[str, dict]:
        return ("📋 *AyzEla Ana Menü*", main_menu_keyboard())

    def _cmd_bugun(self, _: str) -> tuple[str, dict]:
        today_tr = datetime.now(ISTANBUL_TZ).date().isoformat()
        rows = self.repo.db.execute(
            """
            SELECT f.iddaa_match_code, f.home_team_name, f.away_team_name, f.league_name, f.kickoff_tr,
                   mp.prob_home, mp.prob_draw, mp.prob_away, mp.data_coverage_score, mp.iddaa_verified
            FROM match_predictions mp
            JOIN fixtures f ON mp.fixture_id = f.fixture_id
            WHERE mp.analysis_day_tr = ? AND mp.is_demo = 0
              AND mp.created_at_utc = (
                SELECT MAX(mp2.created_at_utc) FROM match_predictions mp2 WHERE mp2.fixture_id = mp.fixture_id
              )
            ORDER BY f.league_name ASC, f.kickoff_tr ASC
            LIMIT 30
            """,
            (today_tr,),
        )
        if not rows:
            return (f"📅 `{today_tr}` için henüz kayıtlı günlük analiz yok.", main_menu_keyboard())
        lines = [f"📊 *Bugünkü Analizler ({today_tr})*"]
        cur_lg = None
        for i, r in enumerate(rows, 1):
            if r["league_name"] != cur_lg:
                cur_lg = r["league_name"]
                lines.append(f"\n🏆 *{cur_lg}*")
            code = r.get("iddaa_match_code") or "-"
            badge = "✅" if r["iddaa_verified"] else "⚠️"
            lines.append(
                f"{i}. `[Kod: {code}]` *{r['home_team_name']} - {r['away_team_name']}* ({r['kickoff_tr'][11:16]})\n"
                f"   1-X-2: `%{int(r['prob_home']*100)}/%{int(r['prob_draw']*100)}/%{int(r['prob_away']*100)}` | Veri: `%{int(r['data_coverage_score']*100)}` {badge}"
            )
        return ("\n".join(lines), main_menu_keyboard())

    def _cmd_yarin(self, _: str) -> tuple[str, dict]:
        tomorrow_tr = (datetime.now(ISTANBUL_TZ).date() + timedelta(days=1)).isoformat()
        rows = self.repo.list_fixtures_for_day(tomorrow_tr, include_demo=False)
        rows.sort(key=lambda r: (r["league_name"], r["kickoff_tr"]))
        if not rows:
            return (f"📅 `{tomorrow_tr}` için kayıtlı fikstür henüz yok.", main_menu_keyboard())
        lines = [f"📅 *Yarının Fikstürü ({tomorrow_tr})*"]
        cur_lg = None
        for r in rows[:30]:
            if r["league_name"] != cur_lg:
                cur_lg = r["league_name"]
                lines.append(f"\n🏆 *{cur_lg}*")
            code = r.get("iddaa_match_code") or "-"
            lines.append(f"- `[Kod: {code}]` {r['kickoff_tr'][11:16]} | *{r['home_team_name']} - {r['away_team_name']}*")
        return ("\n".join(lines), main_menu_keyboard())

    def _cmd_analiz(self, arg: str) -> tuple[str, dict]:
        if not arg:
            return ("🔎 Kullanım: `/analiz Galatasaray` veya anlık tam analiz için `/simdi_analiz`", main_menu_keyboard())
        job_id = self.repo.enqueue_job(
            job_type="manual_analysis",
            payload={"query": arg},
            requested_by_telegram_id=self.allowed_user_id or get_settings().telegram_allowed_user_id,
        )
        return (
            f"⏳ *Manuel araştırma kuyruğa eklendi*\n"
            f"Sorgu: `{arg}`\n"
            f"İş No: `{job_id}`\n"
            f"Analiz tamamlandığında sonuç otomatik gönderilecektir.",
            main_menu_keyboard(),
        )

    def _cmd_simdi_analiz(self, _: str) -> tuple[str, dict]:
        job_id = self.repo.enqueue_job(
            job_type="manual_analysis",
            payload={"mode": "full_now"},
            requested_by_telegram_id=self.allowed_user_id or get_settings().telegram_allowed_user_id,
        )
        return (
            f"⚡ *Anlık tam analiz kuyruğa eklendi*\n"
            f"İş No: `{job_id}`\n"
            f"Tamamlandığında güncel rapor buraya gönderilecektir.",
            main_menu_keyboard(),
        )

    def _cmd_kadro(self, _: str) -> tuple[str, dict]:
        rows = self.repo.db.execute(
            """
            SELECT f.home_team_name, f.away_team_name, l.team_side, l.lineup_type, l.formation, l.fetched_at
            FROM lineups l
            JOIN fixtures f ON l.fixture_id = f.fixture_id
            ORDER BY l.fetched_at DESC LIMIT 8
            """
        )
        if not rows:
            return ("👥 Henüz doğrulanmış veya muhtemel kadro kaydı yok.", main_menu_keyboard())
        lines = ["👥 *Güncel Kadro Bilgileri*"]
        for r in rows:
            lines.append(f"- {r['home_team_name']} - {r['away_team_name']} ({r['team_side']}): {r['lineup_type']} {r['formation'] or ''}")
        return ("\n".join(lines), main_menu_keyboard())

    def _cmd_haberler(self, _: str) -> tuple[str, dict]:
        rows = self.repo.db.execute(
            "SELECT title, source_name, published_at FROM news ORDER BY id DESC LIMIT 6"
        )
        if not rows:
            return ("📰 Henüz çekilmiş spor haberi yok.", main_menu_keyboard())
        lines = ["📰 *Doğrulanmış Futbol Haberleri*"]
        for r in rows:
            lines.append(f"- [{r['source_name']}] {r['title']}")
        return ("\n".join(lines), main_menu_keyboard())

    def _cmd_sonuclar(self, _: str) -> tuple[str, dict]:
        rows = self.repo.db.execute(
            """
            SELECT f.home_team_name, f.away_team_name, mr.home_goals, mr.away_goals, mr.outcome_1x2
            FROM match_results mr
            JOIN fixtures f ON mr.fixture_id = f.fixture_id
            WHERE mr.is_demo = 0
            ORDER BY mr.recorded_at DESC LIMIT 15
            """
        )
        if not rows:
            return ("🏁 Henüz tamamlanmış maç sonucu kaydedilmedi.", main_menu_keyboard())
        lines = ["🏁 *Son Tamamlanan Karşılaşmalar*"]
        for r in rows:
            lines.append(f"- {r['home_team_name']} *{r['home_goals']}-{r['away_goals']}* {r['away_team_name']} ({r['outcome_1x2']})")
        return ("\n".join(lines), main_menu_keyboard())

    def _cmd_perf(self, period_type: str, label: str) -> tuple[str, dict]:
        rows = self.repo.db.execute(
            "SELECT * FROM model_metrics WHERE period_type = ? AND is_demo = 0 ORDER BY computed_at_utc DESC LIMIT 1",
            (period_type,),
        )
        if not rows:
            return (f"📈 *{label} Model Performansı*: Henüz tamamlanmış gerçek sonuç eşleşmesi yok.", main_menu_keyboard())
        r = rows[0]
        return (
            f"📈 *{label} Model Performansı ({r['period_key']})*\n"
            f"- Değerlendirilen maç: `{r['evaluated_matches']}`\n"
            f"- Accuracy: `%{round(r['accuracy']*100, 1)}`\n"
            f"- Brier Score: `{r['brier_score']}`\n"
            f"- Log Loss: `{r['log_loss']}`",
            main_menu_keyboard(),
        )

    def _cmd_rapor(self, _: str) -> tuple[str, dict]:
        rows = self.repo.db.execute(
            "SELECT message_text, created_at_utc FROM telegram_notifications WHERE notification_type = 'daily_report' ORDER BY id DESC LIMIT 1"
        )
        if not rows:
            return ("📄 Henüz gönderilmiş araştırma raporu yok.", main_menu_keyboard())
        return (rows[0]["message_text"], main_menu_keyboard())

    def _cmd_ligler(self, _: str) -> tuple[str, dict]:
        leagues = self.repo.list_leagues(enabled_only=True)
        lines = [f"🏆 *Aktif Beyaz Liste Ligleri ({len(leagues)})*"]
        for lg in leagues:
            lines.append(f"- {lg['name_tr']} (`{lg['organization_id']}`)")
        return ("\n".join(lines), main_menu_keyboard())

    def _cmd_kaynaklar(self, _: str) -> tuple[str, dict]:
        rows = self.repo.list_source_health()
        lines = ["🩺 *Veri Kaynakları Sağlık Durumu*"]
        for r in rows:
            st = (r.get("status") or "untested").upper()
            lines.append(f"- `{r['source_id']}`: *{st}* | {r.get('coverage_summary') or ''}")
        return ("\n".join(lines), main_menu_keyboard())

    def _cmd_durum(self, _: str) -> tuple[str, dict]:
        settings = get_settings()
        limits = self.repo.list_usage_limits()
        lines = [
            "⚙️ *Sistem Durumu*",
            f"- Saat Dilimi: `{settings.tz}`",
            f"- FREE_ONLY_MODE: `{'Aktif' if settings.free_only_mode else 'Kapalı'}`",
            f"- Günlük Maks Maç: `{settings.daily_max_matches}`",
        ]
        for lim in limits:
            pct = (lim["used_amount"] / lim["max_limit"] * 100.0) if lim["max_limit"] else 0.0
            lines.append(f"- {lim['label_tr']}: `{lim['used_amount']}/{lim['max_limit']}` (%{pct:.1f})")
        return ("\n".join(lines), main_menu_keyboard())

    def _cmd_panel(self, _: str) -> tuple[str, dict]:
        url = get_settings().panel_base_url
        return (f"🖥️ *AyzEla Yönetim Paneli*\n{url}", main_menu_keyboard())

    def _cmd_ayarlar(self, _: str) -> tuple[str, dict]:
        s = get_settings()
        return (
            "🔧 *Sistem Ayarları*\n"
            f"- Ortam: `{s.app_env}`\n"
            f"- DB: `{s.db_backend}`\n"
            f"- Kadro Kontrol Aralığı: `{s.lineup_check_interval_minutes} dk`\n"
            f"- Ücretsiz Mod: `{s.free_only_mode}`",
            main_menu_keyboard(),
        )

    def _cmd_yardim(self, _: str) -> tuple[str, dict]:
        lines = ["ℹ️ *Komut Listesi*"] + [f"`{c}` – {d}" for c, d in COMMAND_HELP]
        return ("\n".join(lines), main_menu_keyboard())
