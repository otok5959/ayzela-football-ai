"""Agent 11 – Matematiksel Analiz Uzmanı: Poisson, Dixon-Coles, Elo, ML karşılaştırması."""

from __future__ import annotations

from typing import Any

from backend.models.ensemble import run_ensemble
from backend.schemas import AgentOutput, FixtureRecord, HistoricalMatch


def run_agent_11(fixture: FixtureRecord, history: list[HistoricalMatch]) -> tuple[AgentOutput, dict[str, Any]]:
    ens = run_ensemble(history, fixture.home_team, fixture.away_team, iddaa_odds=fixture.iddaa_odds)
    if not ens.get("enabled"):
        out = AgentOutput(
            agent_id="agent_11",
            agent_name="Matematiksel Analiz Uzmanı",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr=ens.get("reason") or "Matematiksel modeller için yeterli veri yok.",
            metrics={"disabled_models": ens.get("models", {})},
            warnings=["Model örneklemi yetersiz"],
        )
        return out, ens

    active = ens["active_models"]
    used_market_only = bool(ens.get("used_market_only"))
    cov = 0.25 if used_market_only else round(len(active) / 4.0, 4)
    p = ens["probs"]
    note_prefix = "Piyasa olasılık modeli (sınırlı geçmiş veri)" if used_market_only else f"Aktif modeller ({', '.join(active)})"
    out = AgentOutput(
        agent_id="agent_11",
        agent_name="Matematiksel Analiz Uzmanı",
        fixture_id=fixture.fixture_id,
        status="partial" if used_market_only or len(active) < 2 else "ok",
        data_coverage=cov,
        summary_tr=(
            f"{note_prefix}: 1=%{int(round(p['home']*100))}, "
            f"X=%{int(round(p['draw']*100))}, 2=%{int(round(p['away']*100))}."
        ),
        metrics={"active_models": active, "disabled_models": ens["disabled_models"], "breakdown": ens["breakdown"]},
    )
    return out, ens
