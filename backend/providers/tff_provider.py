"""Adapter for TFF.org official Turkish Süper Lig standings and weekly schedule."""

from __future__ import annotations

import re
from bs4 import BeautifulSoup

from backend.config import ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.schemas import SourceHealthStatus, TeamStandingRow

TFF_SUPERLIG_URL = "https://www.tff.org/default.aspx?pageID=198"


class TffProvider(BaseProvider):
    source_id = "tff"
    source_name = "TFF.org Süper Lig"
    requires_payment = False

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        try:
            standings = self.fetch_standings()
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if len(standings) >= 10 else "degraded",
                last_success_at=now,
                latency_ms=400,
                http_status=200,
                records_fetched=len(standings),
                coverage_summary=f"TFF Trendyol Süper Lig puan cetveli ({len(standings)} takım)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="TFF.org erişilemedi veya HTML ayrıştırılamadı",
                updated_at=now,
            )

    def fetch_standings(self) -> list[TeamStandingRow]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        html, _, _, fetched_at = self.http.get_text(
            TFF_SUPERLIG_URL,
            ttl_seconds=1800,
            encoding_override="windows-1254",
            check_robots=False,
        )
        soup = BeautifulSoup(html, "lxml")
        standings: list[TeamStandingRow] = []

        for table in soup.find_all("table"):
            rows = table.find_all("tr")
            if len(rows) < 15 or len(rows) > 30:
                continue
            parsed_rows: list[TeamStandingRow] = []
            for r in rows:
                cells = [c.get_text(" ", strip=True) for c in r.find_all(["td", "th"])]
                if len(cells) < 9:
                    continue
                # Typical TFF row: "1. GALATASARAY A.Ş." | O | G | B | M | A | Y | AV | P
                m_rank = re.match(r"^(\d+)\.\s*(.+)$", cells[0])
                if not m_rank:
                    continue
                try:
                    rank = int(m_rank.group(1))
                    team_name = m_rank.group(2).strip()
                    played = int(cells[1])
                    wins = int(cells[2])
                    draws = int(cells[3])
                    losses = int(cells[4])
                    gf = int(cells[5])
                    ga = int(cells[6])
                    pts = int(cells[8])
                    parsed_rows.append(
                        TeamStandingRow(
                            organization_id="tr_super_lig",
                            team_name=team_name,
                            rank=rank,
                            played=played,
                            wins=wins,
                            draws=draws,
                            losses=losses,
                            goals_for=gf,
                            goals_against=ga,
                            points=pts,
                            source_name=self.source_name,
                            source_url=TFF_SUPERLIG_URL,
                            fetched_at=fetched_at,
                        )
                    )
                except ValueError:
                    continue
            if len(parsed_rows) >= 14:
                standings = parsed_rows
                break
        return standings
