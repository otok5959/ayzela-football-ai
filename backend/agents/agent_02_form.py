"""Agent 02 – Form Analisti: son 6 resmi maç + sezon geneli empirical Bayes shrinkage."""

from __future__ import annotations

from typing import Any

from backend.collectors.team_matcher import teams_match
from backend.schemas import AgentOutput, FixtureRecord, HistoricalMatch


def _summarize_team_form(history: list[HistoricalMatch], team_name: str) -> dict[str, Any]:
    team_matches = [
        m for m in sorted(history, key=lambda x: x.match_date_utc)
        if teams_match(m.home_team, team_name) or teams_match(m.away_team, team_name)
    ]
    if not team_matches:
        return {"count": 0}

    def stats_for(subset: list[HistoricalMatch]) -> dict[str, Any]:
        w = d = l = gf = ga = cs = fts = 0
        for m in subset:
            is_home = teams_match(m.home_team, team_name)
            my_g = m.home_goals if is_home else m.away_goals
            op_g = m.away_goals if is_home else m.home_goals
            gf += my_g
            ga += op_g
            if my_g > op_g:
                w += 1
            elif my_g == op_g:
                d += 1
            else:
                l += 1
            if op_g == 0:
                cs += 1
            if my_g == 0:
                fts += 1
        n = len(subset)
        ppg = (3 * w + d) / n if n else 0.0
        return {
            "n": n, "w": w, "d": d, "l": l, "gf": gf, "ga": ga,
            "clean_sheets": cs, "failed_to_score": fts, "ppg": round(ppg, 3),
        }

    last6 = stats_for(team_matches[-6:])
    season = stats_for(team_matches[-38:])
    # Shrink small 6-match sample toward season-long PPG
    shrunk_ppg = (last6["ppg"] * last6["n"] + season["ppg"] * 6.0) / (last6["n"] + 6.0)
    return {
        "count": len(team_matches),
        "last_6": last6,
        "season": season,
        "shrunk_ppg": round(shrunk_ppg, 3),
    }


def run_agent_02(fixture: FixtureRecord, history: list[HistoricalMatch]) -> AgentOutput:
    h = _summarize_team_form(history, fixture.home_team)
    a = _summarize_team_form(history, fixture.away_team)

    if h["count"] == 0 or a["count"] == 0:
        return AgentOutput(
            agent_id="agent_02",
            agent_name="Form Analisti",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr="Takımların son 6 resmi maç geçmişi bulunamadı.",
            metrics={"home": h, "away": a},
            warnings=["Son 6 maç örneklemi eksik"],
        )

    cov = round(min(1.0, (min(h["last_6"]["n"], 6) + min(a["last_6"]["n"], 6)) / 12.0), 4)
    hl6 = h["last_6"]
    al6 = a["last_6"]
    summary = (
        f"Son {hl6['n']} maç {fixture.home_team}: {hl6['w']}G-{hl6['d']}B-{hl6['l']}M ({hl6['gf']}:{hl6['ga']}) | "
        f"Son {al6['n']} maç {fixture.away_team}: {al6['w']}G-{al6['d']}B-{al6['l']}M ({al6['gf']}:{al6['ga']})."
    )
    return AgentOutput(
        agent_id="agent_02",
        agent_name="Form Analisti",
        fixture_id=fixture.fixture_id,
        status="ok" if cov >= 0.75 else "partial",
        data_coverage=cov,
        summary_tr=summary,
        metrics={"home": h, "away": a},
    )
