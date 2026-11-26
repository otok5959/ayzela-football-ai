"""Turkish daily report formatter showing Top-15 selected matches with Top-2 real-odd picks and daily 2x4 coupons."""

from __future__ import annotations

from collections import OrderedDict
from typing import Any

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
    coupons: list[dict[str, Any]] | None = None,
) -> str:
    total_scanned = len(bundles)
    top15 = [b for b in bundles if b.is_selected_top15]
    if not top15 and bundles:
        select_daily_top15(bundles, limit=min(15, max_matches))
        top15 = [b for b in bundles if b.is_selected_top15]

    selected = list(top15)[: min(15, max_matches)]
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
                for p in (b.top_picks or [])[:2]:
                    odd = p.get("iddaa_odd")
                    if not isinstance(odd, (int, float)):
                        continue
                    pct = int(round(float(p["probability"]) * 100))
                    pick_parts.append(f"{p['label_tr']}: `%{pct}` ({odd:.2f})")
                picks_line = " | ".join(pick_parts) if pick_parts else "Oran aralığında uygun seçim yok"

                lines.append(
                    f"{idx}. `[Kod: {code}]` *{fx.home_team} - {fx.away_team}* ({fx.kickoff_tr[11:16]} TRT)\n"
                    f"   🎯 {picks_line} | Veri: `%{cov_pct}`"
                )
                idx += 1
            lines.append("")

    if coupons:
        lines.append("🎟️ *Günün Kuponları (2 x 4 Maç)*")
        for c in coupons:
            icon = "🛡️" if c.get("coupon_type") == "balanced" else "🚀"
            lines.append(
                f"\n{icon} *{c.get('title_tr')}* — Toplam Oran: *{float(c.get('total_odd', 0)):.2f}*"
            )
            for li, leg in enumerate(c.get("legs") or [], start=1):
                code = leg.get("iddaa_match_code") or "-"
                lines.append(
                    f"  {li}. `[{code}]` {leg.get('home_team')} - {leg.get('away_team')} → *{leg.get('label_tr')}* ({float(leg.get('iddaa_odd', 0)):.2f})"
                )
        lines.append("")

    lines.append(f"🖥️ Kuponlarım & Canlı Takip: {panel_url}")
    lines.append("_Not: Sunulan yüzdeler istatistiksel model çıktısıdır; kesin sonuç veya garanti içermez._")
    return assert_safe_report_text("\n".join(lines))
