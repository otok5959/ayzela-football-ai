"""Multi-source collector with automatic failover, health tracking, and strict provenance."""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.collectors.http_client import RespectfulHttpClient
from backend.database.repositories import AyzelaRepository
from backend.providers.fifa_provider import FifaProvider
from backend.providers.iddaa_provider import IddaaProvider
from backend.providers.open_meteo_provider import OpenMeteoProvider
from backend.providers.openfootball_europe_provider import OpenFootballEuropeProvider
from backend.providers.openfootball_json_provider import OpenFootballJsonProvider
from backend.providers.openfootball_world_provider import OpenFootballWorldProvider
from backend.providers.openligadb_provider import OpenLigaDBProvider
from backend.providers.rss_news_provider import RssNewsProvider
from backend.providers.statsbomb_provider import StatsBombProvider
from backend.providers.tff_provider import TffProvider
from backend.providers.thesportsdb_provider import TheSportsDBProvider
from backend.providers.uefa_provider import UefaProvider
from backend.schemas import FixtureRecord, HistoricalMatch, SourceHealthStatus
from backend.validation.league_filter import LeagueFilter


@dataclass
class BulletinFetchResult:
    fixtures: list[FixtureRecord]
    primary_source: str
    used_fallback: bool
    fallback_sources: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class MultiSourceFailoverManager:
    """Orchestrates primary (iddaa.com) and legal open fallback sources without fabricated data."""

    def __init__(
        self,
        repo: AyzelaRepository | None = None,
        http: RespectfulHttpClient | None = None,
        league_filter: LeagueFilter | None = None,
    ) -> None:
        self.repo = repo
        self.http = http or RespectfulHttpClient()
        self.league_filter = league_filter or LeagueFilter()

        self.iddaa = IddaaProvider(http=self.http, league_filter=self.league_filter)
        self.openfootball_json = OpenFootballJsonProvider(http=self.http, league_filter=self.league_filter)
        self.openfootball_europe = OpenFootballEuropeProvider(http=self.http, league_filter=self.league_filter)
        self.openfootball_world = OpenFootballWorldProvider(http=self.http)
        self.openligadb = OpenLigaDBProvider(http=self.http, league_filter=self.league_filter)
        self.uefa = UefaProvider(http=self.http, league_filter=self.league_filter)
        self.fifa = FifaProvider(http=self.http, league_filter=self.league_filter)
        self.tff = TffProvider(http=self.http)
        self.statsbomb = StatsBombProvider(http=self.http)
        self.thesportsdb = TheSportsDBProvider(http=self.http, league_filter=self.league_filter)
        self.open_meteo = OpenMeteoProvider(http=self.http)
        self.rss_news = RssNewsProvider(http=self.http)

        self.all_providers = [
            self.iddaa,
            self.openfootball_json,
            self.openfootball_europe,
            self.openfootball_world,
            self.openligadb,
            self.uefa,
            self.fifa,
            self.tff,
            self.statsbomb,
            self.thesportsdb,
            self.open_meteo,
            self.rss_news,
        ]

    def run_all_health_checks(self) -> list[SourceHealthStatus]:
        statuses: list[SourceHealthStatus] = []
        for provider in self.all_providers:
            st = provider.check_health()
            statuses.append(st)
            if self.repo:
                self.repo.upsert_source_health(st)
        return statuses

    def fetch_bulletin_with_failover(self) -> BulletinFetchResult:
        """Try iddaa.com first; if unavailable or empty, automatically fail over to open sources."""
        errors: list[str] = []
        try:
            iddaa_fixtures = self.iddaa.fetch_upcoming_fixtures()
            if iddaa_fixtures:
                return BulletinFetchResult(
                    fixtures=iddaa_fixtures,
                    primary_source="iddaa",
                    used_fallback=False,
                )
            errors.append("İddaa bülteni 0 beyaz liste maçı döndürdü.")
        except Exception as exc:
            errors.append(f"İddaa erişim hatası: {exc}")

        # Automatic failover across open, keyless sources — strictly marked iddaa_verified=False
        fallback_providers = [
            self.openfootball_json,
            self.openfootball_europe,
            self.openligadb,
            self.uefa,
            self.fifa,
            self.thesportsdb,
        ]
        combined: list[FixtureRecord] = []
        seen_keys: set[str] = set()
        used_sources: list[str] = []

        for prov in fallback_providers:
            try:
                rows = prov.fetch_upcoming_fixtures()
                if rows:
                    used_sources.append(prov.source_id)
                for fx in rows:
                    # Strictly ensure fallback data is NEVER marked as iddaa_verified
                    fx.iddaa_verified = False
                    dedup_key = f"{fx.organization_id}|{fx.analysis_day_tr}|{fx.home_team_id}|{fx.away_team_id}"
                    if dedup_key not in seen_keys:
                        seen_keys.add(dedup_key)
                        combined.append(fx)
            except Exception as exc:
                errors.append(f"{prov.source_id} yedek hatası: {exc}")

        return BulletinFetchResult(
            fixtures=combined,
            primary_source=used_sources[0] if used_sources else "none",
            used_fallback=True,
            fallback_sources=used_sources,
            errors=errors,
        )

    def fetch_historical_for_league(self, organization_id: str) -> list[HistoricalMatch]:
        """Collect historical matches across open providers with automatic fallback."""
        if not hasattr(self, "_hist_cache"):
            self._hist_cache: dict[str, list[HistoricalMatch]] = {}
        if organization_id in self._hist_cache:
            return self._hist_cache[organization_id]

        if organization_id.startswith("iddaa_comp_"):
            self._hist_cache[organization_id] = []
            return []

        matches: list[HistoricalMatch] = []
        if organization_id in ("uefa_ucl", "uefa_uel", "uefa_nations_league"):
            matches.extend(self.uefa.fetch_historical_matches(organization_id))
            for dom_org in (
                "eng_premier_league",
                "esp_la_liga",
                "ger_bundesliga",
                "ita_serie_a",
                "fra_ligue_1",
                "ned_eredivisie",
                "por_primeira_liga",
                "bel_pro_league",
            ):
                matches.extend(self.fetch_historical_for_league(dom_org))
        elif organization_id == "ger_bundesliga":
            matches = self.openligadb.fetch_historical_matches(organization_id)
        if not matches:
            matches = self.openfootball_json.fetch_historical_matches(organization_id)
        if not matches:
            matches = self.openfootball_europe.fetch_historical_matches(organization_id)
        if not matches:
            matches = self.thesportsdb.fetch_historical_matches(organization_id)

        matches.sort(key=lambda x: x.match_date_utc)
        self._hist_cache[organization_id] = matches
        return matches
