"""Turkish daily report formatter enforcing safe phrasing and max 10 match cap."""

from __future__ import annotations

from backend.schemas import MatchPredictionBundle
from backend.validation.sanitizer import assert_safe_report_text


def format_daily_report_tr(
    bundles: list[MatchPredictionBundle],
    run_type_label: str,
    analysis_day_tr: str,
    bulletin_source: str,
    panel_url: str,
    used_fallback: bool = False,
    max_matches: int = 15,
) -> str:
    sorted_bundles = sorted(
        bundles,
        key=lambda b: (b.data_coverage_score, b.research_quality_score),
        reverse=True,
    )[:max_matches]

    lines: list[str] = [
        f"📊 *AyzEla Football AI – {run_type_label}*",
        f"📅 Analiz Günü (TRT): `{analysis_day_tr}`",
        f"📡 Bülten Kaynağı: `{bulletin_source}`"
        + (" (⚠️ Yedek kaynak — İddaa onaylı değildir)" if used_fallback else " (✅ İddaa.com doğrulandı)"),
        f"⚽ İncelenen Maç: {len(sorted_bundles)} / {max_matches}",
        "",
    ]

    if not sorted_bundles:
        lines.append("Bugünkü pencerede beyaz liste ve veri yeterliliği şartlarını karşılayan karşılaşma bulunamadı.")
    else:
        for idx, b in enumerate(sorted_bundles, start=1):
            fx = b.fixture
            cov_pct = int(round(b.data_coverage_score * 100))
            qual_pct = int(round(b.research_quality_score * 100))
            p1 = int(round(b.prob_home * 100))
            px = int(round(b.prob_draw * 100))
            p2 = int(round(b.prob_away * 100))

            form_agent = next((a for a in b.agent_outputs if a.agent_id == "agent_02"), None)
            inj_agent = next((a for a in b.agent_outputs if a.agent_id == "agent_05"), None)
            form_txt = form_agent.summary_tr if form_agent else "Form verisi sınırlı"
            inj_txt = inj_agent.summary_tr if inj_agent else "Doğrulanmış sakatlık kaydı yok"

            lines.extend(
                [
                    f"*{idx}. {fx.home_team} - {fx.away_team}*",
                    f"🏆 {fx.league_name} | 🕒 {fx.kickoff_tr[:16].replace('T', ' ')} TRT",
                    f"📈 Olasılıklar (1-X-2): `%{p1} / %{px} / %{p2}`",
                ]
            )
            if b.prob_btts_yes is not None and b.prob_over_25 is not None:
                lines.append(
                    f"⚽ KG Var: `%{int(round(b.prob_btts_yes * 100))}` | 2.5 Üst: `%{int(round(b.prob_over_25 * 100))}`"
                )
            lines.extend(
                [
                    f"🔍 Veri Kapsamı: `%{cov_pct}` | Araştırma Kalitesi: `%{qual_pct}` _(olasılık değildir)_",
                    f"📋 Form: {form_txt}",
                    f"🏥 Kadro/Haber: {inj_txt}",
                    f"🔗 Detay: {panel_url}/matches/{fx.fixture_id}",
                    f"🕒 Son Güncelleme: `{b.created_at_utc}`",
                    "",
                ]
            )

    lines.append(
        "_Not: Sunulan yüzdeler istatistiksel model çıktısıdır; kesin sonuç veya garanti içermez._"
    )
    text = "\n".join(lines)
    return assert_safe_report_text(text)
