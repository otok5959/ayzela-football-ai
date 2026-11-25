"""Agent 04 – Oyuncu Performans Analisti: kadro ve oyuncu katkısı (yalnız izinli veri varsa)."""

from __future__ import annotations

from typing import Any

from backend.schemas import AgentOutput, FixtureRecord


def run_agent_04(
    fixture: FixtureRecord,
    lineup_info: dict[str, Any] | None = None,
    player_stats: list[dict[str, Any]] | None = None,
) -> AgentOutput:
    lineup = lineup_info or {}
    pstats = player_stats or []
    has_confirmed = bool(lineup.get("confirmed_home") and lineup.get("confirmed_away"))
    has_probable = bool(lineup.get("probable_home") and lineup.get("probable_away"))

    if not has_confirmed and not has_probable and not pstats:
        return AgentOutput(
            agent_id="agent_04",
            agent_name="Oyuncu Performans Analisti",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr="Açık kaynaklarda bu maç için henüz kesin/muhtemel ilk 11 veya oyuncu istatistiği yayınlanmadı.",
            metrics={"has_confirmed_lineup": False, "has_probable_lineup": False, "player_records": 0},
            warnings=["Oyuncu/ilk 11 verisi bekleniyor (sahte kadro üretilmedi)"],
        )

    cov = 0.9 if has_confirmed else (0.55 if has_probable else 0.35)
    return AgentOutput(
        agent_id="agent_04",
        agent_name="Oyuncu Performans Analisti",
        fixture_id=fixture.fixture_id,
        status="ok" if has_confirmed else "partial",
        data_coverage=cov,
        summary_tr=(
            "Kesin ilk 11 doğrulandı." if has_confirmed else "Muhtemel kadro / kısmi oyuncu istatistikleri mevcut."
        ),
        metrics={"lineup": lineup, "player_records": len(pstats)},
    )
