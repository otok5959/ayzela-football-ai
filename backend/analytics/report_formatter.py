"""Turkish daily report formatter showing Top-15 selected matches grouped by league with Top-3 picks."""

from __future__ import annotations

from collections import OrderedDict

from backend.analytics.top_picks import select_daily_top15
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
    total_scanned = len(bundles)
    top15 = [b for b in bundles if b.is_selected_top15]
    if not top15 and bundles:
        select_daily_top15(bundles, limit=min(15, max_matches))
        top15 = [b for b in bundles if b.is_selected_top15]

    selected = list(top15)[: min(15, max_matches)]
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
        f"⚽ Bülten: {total_scanned} maç incelendi | 🎯 Seçilen: {len(selected)} maç ({len(by_league)} lig)",
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
                pick_parts: list[str] = []
                for p in (b.top_picks or [])[:3]:
                    pct = int(round(float(p["probability"]) * 100))
                    odd = p.get("iddaa_odd")
                    odd_str = f" ({odd:.2f})" if isinstance(odd, (int, float)) else ""
                    pick_parts.append(f"{p['label_tr']}: `%{pct}`{odd_str}")
                picks_line = " | ".join(pick_parts) if pick_parts else f"1-X-2: `%{int(round(b.prob_home * 100))}/%{int(round(b.prob_draw * 100))}/%{int(round(b.prob_away * 100))}`"

                lines.append(
                    f"{idx}. `[Kod: {code}]` *{fx.home_team} - {fx.away_team}* ({fx.kickoff_tr[11:16]} TRT)\n"
                    f"   🎯 {picks_line} | Veri: `%{cov_pct}`"
                )
                idx += 1
            lines.append("")

    lines.append(f"🖥️ Seçilen 15 Maç & Canlı Takip: {panel_url}")
    lines.append("_Not: Sunulan yüzdeler istatistiksel model çıktısıdır; kesin sonuç veya garanti içermez._")
    return assert_safe_report_text("\n".join(lines))
