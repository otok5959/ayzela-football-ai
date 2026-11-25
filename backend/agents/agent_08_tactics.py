"""Agent 08 – Taktik Analisti: yalnızca kaynaklı diziliş ve teknik direktör verisi."""

from __future__ import annotations

from typing import Any

from backend.collectors.team_matcher import teams_match
from backend.schemas import AgentOutput, FixtureRecord, NewsItem

TACTICAL_KEYWORDS = ("manager", "coach", "head coach", "sacked", "appointed", "teknik direktör", "formation", "tactic")


def run_agent_08(
    fixture: FixtureRecord,
    news_items: list[NewsItem],
    lineup_info: dict[str, Any] | None = None,
) -> AgentOutput:
    formations = {
        "home": (lineup_info or {}).get("home_formation"),
        "away": (lineup_info or {}).get("away_formation"),
    }
    manager_news = []
    for n in news_items:
        blob = f"{n.title} {n.summary or ''}".lower()
        if (teams_match(fixture.home_team, blob) or teams_match(fixture.away_team, blob)) and any(
            k in blob for k in TACTICAL_KEYWORDS
        ):
            manager_news.append({"title": n.title, "source": n.source_name, "url": n.source_url})

    has_formations = bool(formations["home"] or formations["away"])
    if not has_formations and not manager_news:
        return AgentOutput(
            agent_id="agent_08",
            agent_name="Taktik Analisti",
            fixture_id=fixture.fixture_id,
            status="insufficient_data",
            data_coverage=0.0,
            summary_tr="Doğrulanmış diziliş veya teknik direktör değişikliği verisi bulunamadı (kaynaksız yorum üretilmedi).",
            warnings=["Kaynaklı taktik verisi yok"],
        )

    cov = 0.7 if has_formations else 0.45
    return AgentOutput(
        agent_id="agent_08",
        agent_name="Taktik Analisti",
        fixture_id=fixture.fixture_id,
        status="ok" if has_formations else "partial",
        data_coverage=cov,
        summary_tr=f"Diziliş bilgisi: {formations} | Teknik ekip haberi: {len(manager_news)} adet.",
        metrics={"formations": formations, "manager_news": manager_news},
    )
