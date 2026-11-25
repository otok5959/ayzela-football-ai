"""Data validation & audit rules (Agent 12 core logic)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.schemas import AgentOutput, FixtureRecord


def audit_fixture_and_agents(
    fixture: FixtureRecord,
    agent_outputs: list[AgentOutput],
    probs: dict[str, float] | None,
) -> AgentOutput:
    """Verify consistency, freshness, team/league alignment, and probability calibration."""
    warnings: list[str] = []
    checks_passed = 0
    total_checks = 6

    # 1. Valid league & non-excluded
    if fixture.organization_id:
        checks_passed += 1
    else:
        warnings.append("Geçersiz organizasyon kimliği")

    # 2. Distinct teams
    if fixture.home_team_id != fixture.away_team_id:
        checks_passed += 1
    else:
        warnings.append("Ev sahibi ve deplasman takımı aynı görünüyor")

    # 3. Kickoff & analysis day sanity (+03:00 TRT)
    if "+03:00" in fixture.kickoff_tr and len(fixture.analysis_day_tr) == 10:
        checks_passed += 1
    else:
        warnings.append("Tarih/saat Europe/Istanbul formatında değil")

    # 4. Freshness check (fetched_at within 24h)
    try:
        fetched_dt = datetime.fromisoformat(fixture.provenance.fetched_at.replace("Z", "+00:00"))
        age_hours = (datetime.now(timezone.utc) - fetched_dt).total_seconds() / 3600.0
        if age_hours <= 24.0:
            checks_passed += 1
        else:
            warnings.append(f"Veri güncelliğini yitirmiş ({age_hours:.1f} saat)")
    except Exception:
        warnings.append("Veri çekilme zamanı doğrulanamadı")

    # 5. Probability sum calibration check
    if probs:
        s = probs.get("home", 0.0) + probs.get("draw", 0.0) + probs.get("away", 0.0)
        if abs(s - 1.0) <= 0.02 and all(0.0 < v < 1.0 for v in probs.values()):
            checks_passed += 1
        else:
            warnings.append(f"Olasılık toplamı kalibrasyon dışı ({s:.3f})")
    else:
        warnings.append("Matematiksel olasılık üretilemedi")

    # 6. Provenance separation check (alternative sources never labeled iddaa_verified)
    if fixture.bulletin_source != "iddaa" and fixture.iddaa_verified:
        warnings.append("Çelişki: alternatif kaynak verisi İddaa onaylı işaretlenmiş")
    else:
        checks_passed += 1

    cov = round(checks_passed / total_checks, 4)
    status = "ok" if not warnings else ("partial" if checks_passed >= 4 else "insufficient_data")
    summary = (
        "Tüm doğrulama ve kalibrasyon kontrolleri geçti."
        if not warnings
        else "Denetim uyarıları: " + "; ".join(warnings)
    )
    return AgentOutput(
        agent_id="agent_12",
        agent_name="Veri Doğrulama ve Denetim Uzmanı",
        fixture_id=fixture.fixture_id,
        status=status,
        data_coverage=cov,
        summary_tr=summary,
        metrics={"checks_passed": checks_passed, "total_checks": total_checks},
        warnings=warnings,
    )
