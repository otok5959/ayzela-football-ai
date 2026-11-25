"""Separates data coverage score strictly from match outcome probability."""

from __future__ import annotations

from backend.schemas import AgentOutput

AGENT_WEIGHTS: dict[str, float] = {
    "agent_01": 0.12,
    "agent_02": 0.14,
    "agent_03": 0.12,
    "agent_04": 0.08,
    "agent_05": 0.08,
    "agent_06": 0.10,
    "agent_07": 0.08,
    "agent_08": 0.05,
    "agent_09": 0.08,
    "agent_10": 0.05,
    "agent_11": 0.10,
}


def compute_data_coverage_score(outputs: list[AgentOutput]) -> float:
    """Weighted average of real data availability across research modules (0.0 to 1.0)."""
    total_w = 0.0
    weighted = 0.0
    for out in outputs:
        w = AGENT_WEIGHTS.get(out.agent_id, 0.0)
        if w <= 0:
            continue
        total_w += w
        weighted += w * out.data_coverage
    if total_w <= 0:
        return 0.0
    return round(min(max(weighted / total_w, 0.0), 1.0), 4)


def compute_research_quality_score(outputs: list[AgentOutput]) -> float:
    """Measures verification ratio and absence of critical data warnings."""
    if not outputs:
        return 0.0
    ok_count = sum(1 for o in outputs if o.status in ("ok", "partial"))
    warning_penalty = min(sum(len(o.warnings) for o in outputs) * 0.03, 0.35)
    base = ok_count / len(outputs)
    return round(max(min(base - warning_penalty, 1.0), 0.0), 4)
