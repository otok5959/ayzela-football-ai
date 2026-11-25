"""Turkish daily report formatter grouping matches by league with match codes and safe phrasing."""

from __future__ import annotations

from collections import OrderedDict

from backend.schemas import MatchPredictionBundle
from backend.validation.sanitizer import assert_safe_report_text


def format_daily_report_tr(
    bundles: list[MatchPredictionBundle],
    run_type_label: str,
    analysis_day_tr: str,
    bulletin_source: str,
    panel_url: str,
    used_fallback: bool = False,
    max_matches: int = 250,
) -> str:
    selected = sorted(
        bundles,
        key=lambda b: (b.data_coverage_score, b.research_quality_score),
        reverse=True,
    )[:max_matches]

    # Group by league name (alphabetical leagues, kickoff time within each league)
    selected.sort(key=lambda b: (b.fixture.league_name, b.fixture.kickoff_tr))
    by_league: OrderedDict[str, list[MatchPredictionBundle]] = OrderedDict()
    for b in selected:
        by_league.setdefault(b.fixture.league_name, []).append(b)

    lines: list[str] = [
        f"📊 *AyzEla Football AI – {run_type_label}*",
        f"📅 Analiz Günü (TRT): `{analysis_day_tr}`",
        f"📡 Bülten Kaynağı: `{bulletin_source}`"
        + (" (⚠️ Yedek kaynak — İddaa onaylı değildir)" if used_fallback else " (✅ İddaa.com doğrulandı)"),
        f"⚽ İncelenen Maç: {len(selected)} ({len(by_league)} lig)",
        "",
    ]

    if not selected:
        lines.append("Bugünkü pencerede analiz edilebilir karşılaşma bulunamadı.")
    else:
        idx = 1
        for league_name, items in by_league.items():
            lines.append(f"🏆 *{league_name} ({len(items)} maç)*")
            for b in items:
                fx = b.fixture
                code = fx.iddaa_match_code or "-"
                cov_pct = int(round(b.data_coverage_score * 100))
                p1 = int(round(b.prob_home * 100))
                px = int(round(b.prob_draw * 100))
                p2 = int(round(b.prob_away * 100))

                extra_goals = ""
                if b.prob_btts_yes is not None and b.prob_over_25 is not None:
                    extra_goals = (
                        f" | KG: `%{int(round(b.prob_btts_yes * 100))}`"
                        f" | 2.5Ü: `%{int(round(b.prob_over_25 * 100))}`"
                    )

                lines.append(
                    f"{idx}. `[Kod: {code}]` *{fx.home_team} - {fx.away_team}* ({fx.kickoff_tr[11:16]} TRT)\n"
                    f"   1-X-2: `%{p1}/%{px}/%{p2}`{extra_goals} | Veri: `%{cov_pct}`"
                )
                idx += 1
            lines.append("")

    lines.append(f"🖥️ Tüm Detaylar: {panel_url}")
    lines.append("_Not: Sunulan yüzdeler istatistiksel model çıktısıdır; kesin sonuç veya garanti içermez._")
    return assert_safe_report_text("\n".join(lines))
