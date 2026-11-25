"""Agent 05 – Sakatlık ve Ceza Araştırmacısı: kaynaklı ve tarihli tarama."""

from __future__ import annotations

from backend.collectors.team_matcher import teams_match
from backend.schemas import AgentOutput, FixtureRecord, NewsItem, SourceProvenance

INJURY_KEYWORDS = (
    "injury", "injured", "ruled out", "suspended", "suspension", "ban", "doubtful",
    "sakat", "sakatlık", "cezalı", "ceza", "kadro dışı", "şüpheli",
)


def run_agent_05(fixture: FixtureRecord, news_items: list[NewsItem]) -> AgentOutput:
    relevant: list[dict] = []
    provs: list[SourceProvenance] = []

    for item in news_items:
        blob = f"{item.title} {item.summary or ''}".lower()
        if not (teams_match(fixture.home_team, blob) or teams_match(fixture.away_team, blob)
                or fixture.home_team.lower() in blob or fixture.away_team.lower() in blob):
            continue
        if any(k in blob for k in INJURY_KEYWORDS):
            relevant.append(
                {
                    "title": item.title,
                    "source_name": item.source_name,
                    "source_url": item.source_url,
                    "published_at": item.published_at,
                    "confirmation_status": "unconfirmed",
                }
            )
            provs.append(
                SourceProvenance(
                    source_name=item.source_name,
                    source_url=item.source_url,
                    published_at=item.published_at,
                    fetched_at=item.fetched_at,
                    verification_status="unconfirmed",
                    data_type="injury_news",
                    is_demo=False,
                )
            )

    if not relevant:
        return AgentOutput(
            agent_id="agent_05",
            agent_name="Sakatlık ve Ceza Araştırmacısı",
            fixture_id=fixture.fixture_id,
            status="partial",
            data_coverage=0.4,
            summary_tr="İzinli RSS kaynaklarında bu maç için yeni sakatlık/ceza haberi tespit edilmedi.",
            metrics={"alerts": [], "rss_checked_count": len(news_items)},
        )

    return AgentOutput(
        agent_id="agent_05",
        agent_name="Sakatlık ve Ceza Araştırmacısı",
        fixture_id=fixture.fixture_id,
        status="ok",
        data_coverage=0.8,
        summary_tr=f"{len(relevant)} adet sakatlık/ceza haberi bulundu (doğrulanmamış haber etiketiyle).",
        metrics={"alerts": relevant},
        provenance=provs,
    )
