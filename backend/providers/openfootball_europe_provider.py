"""Adapter for OpenFootball Europe repository (Football.TXT format, incl. Turkey Süper Lig & Scotland)."""

from __future__ import annotations

import re
from datetime import datetime, timezone

from backend.collectors.team_matcher import canonical_team_id
from backend.config import ISTANBUL_TZ, ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.providers.iddaa_provider import compute_analysis_day_tr
from backend.schemas import FixtureRecord, HistoricalMatch, SourceHealthStatus, SourceProvenance
from backend.validation.league_filter import LeagueFilter

BASE_RAW = "https://raw.githubusercontent.com/openfootball/europe/master"

EUROPE_TXT_MAP = {
    "tr_super_lig": [("2026-27", "turkey/2026-27_tr1.txt"), ("2025-26", "turkey/2025-26_tr1.txt")],
    "sco_premiership": [("2026-27", "scotland/2026-27_sco1.txt"), ("2025-26", "scotland/2025-26_sco1.txt")],
    "bel_pro_league": [("2026-27", "belgium/2026-27_be1.txt"), ("2025-26", "belgium/2025-26_be1.txt")],
}

MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def parse_football_txt(text: str, organization_id: str, season: str, source_name: str, source_url: str) -> tuple[list[HistoricalMatch], list[dict]]:
    """Parse Football.TXT lines into finished HistoricalMatch rows and scheduled match dicts."""
    finished: list[HistoricalMatch] = []
    upcoming: list[dict] = []
    start_year = int(season.split("-")[0])
    current_date: str | None = None

    date_re = re.compile(r"^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})/(\d{1,2})(?:\s+(\d{4}))?")
    score_re = re.compile(r"^(?:(\d{1,2}[:.]\d{2})\s+)?(.+?)\s+(\d+)-(\d+)\s+(.+?)(?:\s+\(.*\))?$")
    sched_re = re.compile(r"^(\d{1,2}[:.]\d{2})\s+(.+?)\s+v\s+(.+?)$")

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or line.startswith("="):
            continue
        dm = date_re.match(line)
        if dm and " v " not in line and "-" not in line:
            mon = MONTH_MAP.get(dm.group(1).lower())
            day = int(dm.group(2))
            if mon:
                yr = int(dm.group(3)) if dm.group(3) else (start_year if mon >= 7 else start_year + 1)
                current_date = f"{yr:04d}-{mon:02d}-{day:02d}"
            continue

        if not current_date:
            continue

        sm = score_re.match(line)
        if sm and " v " not in line:
            time_part = (sm.group(1) or "15:00").replace(".", ":")
            home = sm.group(2).strip()
            hg = int(sm.group(3))
            ag = int(sm.group(4))
            away = sm.group(5).strip()
            finished.append(
                HistoricalMatch(
                    match_id=f"ofe_{organization_id}_{current_date}_{len(finished)}",
                    organization_id=organization_id,
                    season=season,
                    match_date_utc=f"{current_date}T{time_part}:00Z",
                    home_team=home,
                    away_team=away,
                    home_goals=hg,
                    away_goals=ag,
                    source_name=source_name,
                    source_url=source_url,
                )
            )
            continue

        qm = sched_re.match(line)
        if qm:
            upcoming.append(
                {
                    "date": current_date,
                    "time": qm.group(1).replace(".", ":"),
                    "home": qm.group(2).strip(),
                    "away": qm.group(3).strip(),
                    "source_url": source_url,
                }
            )
    return finished, upcoming


class OpenFootballEuropeProvider(BaseProvider):
    source_id = "openfootball_europe"
    source_name = "OpenFootball Europe"
    requires_payment = False

    def __init__(self, http=None, league_filter: LeagueFilter | None = None) -> None:
        super().__init__(http=http)
        self.league_filter = league_filter or LeagueFilter()

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        url = f"{BASE_RAW}/turkey/2026-27_tr1.txt"
        try:
            text, status, latency, fetched_at = self.http.get_text(url, ttl_seconds=120, check_robots=False)
            fin, upc = parse_football_txt(text, "tr_super_lig", "2026-27", self.source_name, url)
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(fin) + len(upc),
                coverage_summary=f"Türkiye 2026-27 TR1 ({len(fin)} tamamlanmış, {len(upc)} planlı maç)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="OpenFootball Europe erişilemedi",
                updated_at=now,
            )

    def fetch_historical_matches(self, organization_id: str) -> list[HistoricalMatch]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        entries = EUROPE_TXT_MAP.get(organization_id, [])
        all_matches: list[HistoricalMatch] = []
        for season, path in entries:
            url = f"{BASE_RAW}/{path}"
            try:
                text, _, _, _ = self.http.get_text(url, ttl_seconds=1800, check_robots=False)
                fin, _ = parse_football_txt(text, organization_id, season, self.source_name, url)
                all_matches.extend(fin)
            except Exception:
                continue
        all_matches.sort(key=lambda x: x.match_date_utc)
        return all_matches

    def fetch_upcoming_fixtures(self) -> list[FixtureRecord]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now_utc = datetime.now(timezone.utc)
        fixtures: list[FixtureRecord] = []
        for org_id, entries in EUROPE_TXT_MAP.items():
            lg = self.league_filter.by_org_id.get(org_id)
            if not lg or not lg.get("enabled", True):
                continue
            season, path = entries[0]
            url = f"{BASE_RAW}/{path}"
            try:
                text, _, _, fetched_at = self.http.get_text(url, ttl_seconds=900, check_robots=False)
                _, upc = parse_football_txt(text, org_id, season, self.source_name, url)
            except Exception:
                continue
            for item in upc:
                try:
                    dt_utc = datetime.strptime(f"{item['date']} {item['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
                if (dt_utc - now_utc).total_seconds() < -3600 or (dt_utc - now_utc).days > 7:
                    continue
                dt_tr = dt_utc.astimezone(ISTANBUL_TZ)
                fixtures.append(
                    FixtureRecord(
                        fixture_id=f"ofe_{org_id}_{item['date']}_{canonical_team_id(item['home'])}_{canonical_team_id(item['away'])}",
                        organization_id=org_id,
                        league_name=lg["name_tr"],
                        country=lg["country"],
                        home_team=item["home"],
                        away_team=item["away"],
                        home_team_id=canonical_team_id(item["home"]),
                        away_team_id=canonical_team_id(item["away"]),
                        kickoff_utc=dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        kickoff_tr=dt_tr.strftime("%Y-%m-%dT%H:%M:%S+03:00"),
                        analysis_day_tr=compute_analysis_day_tr(dt_tr),
                        status="scheduled",
                        bulletin_source=self.source_id,
                        iddaa_verified=False,
                        available_markets=[],
                        is_demo=False,
                        provenance=SourceProvenance(
                            source_name=self.source_name,
                            source_url=url,
                            published_at=fetched_at,
                            fetched_at=fetched_at,
                            verification_status="fallback",
                            data_type="fallback_fixture",
                            is_demo=False,
                        ),
                    )
                )
        return fixtures
