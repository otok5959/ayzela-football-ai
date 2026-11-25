"""Agent 12 – Veri Doğrulama ve Denetim Uzmanı."""

from __future__ import annotations

from backend.schemas import AgentOutput, FixtureRecord
from backend.validation.data_auditor import audit_fixture_and_agents


def run_agent_12(
    fixture: FixtureRecord,
    agent_outputs: list[AgentOutput],
    probs: dict[str, float] | None,
) -> AgentOutput:
    return audit_fixture_and_agents(fixture=fixture, agent_outputs=agent_outputs, probs=probs)
