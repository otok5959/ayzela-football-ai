"""Agent 10 – Çevresel Faktör Analisti: Open-Meteo hava durumu ve stadyum verisi."""

from __future__ import annotations

from typing import Any

from backend.schemas import AgentOutput, FixtureRecord


def run_agent_10(fixture: FixtureRecord, weather: dict[str, Any] | None = None) -> AgentOutput:
    if not weather:
        return AgentOutput(
            agent_id="agent_10",
            agent_name="Çevresel Faktör Analisti",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr="Stadyum hava durumu veya hakem verisi bulunamadı.",
        )

    cov = 0.85 if weather.get("location_precision") == "stadium" else 0.55
    summary = (
        f"{weather.get('stadium')} ({weather.get('city')}): {weather.get('temperature_c')}°C, "
        f"yağış olasılığı %{weather.get('precipitation_prob_pct')}, rüzgar {weather.get('wind_speed_kmh')} km/sa."
    )
    return AgentOutput(
        agent_id="agent_10",
        agent_name="Çevresel Faktör Analisti",
        fixture_id=fixture.fixture_id,
        status="ok" if cov >= 0.7 else "partial",
        data_coverage=cov,
        summary_tr=summary,
        metrics=weather,
    )
