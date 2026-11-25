"""Acceptance tests: league filter, Europe/Istanbul TZ, midnight crossover, 08:00/11:59 runs, max 10 cap."""

from __future__ import annotations

from datetime import datetime, timedelta

from backend.config import ISTANBUL_TZ
from backend.providers.iddaa_provider import compute_analysis_day_tr
from backend.scheduler.daily_runner import run_daily_analysis
from backend.scheduler.windows import get_analysis_window
from backend.schemas import FixtureRecord, HistoricalMatch, SourceProvenance
from backend.validation.league_filter import LeagueFilter


def test_league_filter_whitelist_and_exclusions():
    lf = LeagueFilter()
    assert lf.match("Türkiye Süper Lig", iddaa_comp_id=584)["organization_id"] == "tr_super_lig"
    assert lf.match("İngiltere Premier Lig", iddaa_comp_id=43)["organization_id"] == "eng_premier_league"
    assert lf.match("UEFA Şampiyonlar Ligi", iddaa_comp_id=126)["organization_id"] == "uefa_ucl"

    # Excluded categories must be rejected
    assert lf.match("İngiltere Premier Lig Kadınlar") is None
    assert lf.match("UEFA Gençlik Ligi U19") is None
    assert lf.match("Türkiye 2. Lig") is None
    assert lf.match("E-Futbol Şampiyonası") is None
    assert lf.match("Sanal Futbol Ligi") is None
    assert lf.match("Kulüp Hazırlık Maçları") is None


def test_timezone_and_midnight_crossover():
    # Match at 2026-11-26 02:30 TRT belongs to analysis_day_tr = 2026-11-25
    dt_after_midnight = datetime(2026, 11, 26, 2, 30, tzinfo=ISTANBUL_TZ)
    assert compute_analysis_day_tr(dt_after_midnight) == "2026-11-25"

    # Match at 2026-11-26 08:05 TRT belongs to analysis_day_tr = 2026-11-26
    dt_morning = datetime(2026, 11, 26, 8, 5, tzinfo=ISTANBUL_TZ)
    assert compute_analysis_day_tr(dt_morning) == "2026-11-26"

    w08 = get_analysis_window("morning_0800", now_tr=datetime(2026, 11, 25, 8, 0, tzinfo=ISTANBUL_TZ))
    w1159 = get_analysis_window("midday_1159", now_tr=datetime(2026, 11, 25, 11, 59, tzinfo=ISTANBUL_TZ))
    assert w08.window_start_tr.hour == 8
    assert w08.window_end_tr == datetime(2026, 11, 26, 8, 0, tzinfo=ISTANBUL_TZ)
    assert w1159.window_start_tr.hour == 11 and w1159.window_start_tr.minute == 59
    assert w1159.window_end_tr == w08.window_end_tr


def _synthetic_history() -> list[HistoricalMatch]:
    teams = [f"Team{i}" for i in range(1, 25)]
    out: list[HistoricalMatch] = []
    base = datetime(2026, 8, 1, 15, 0)
    idx = 0
    for round_i in range(4):
        for i in range(0, 24, 2):
            t1 = teams[i] if round_i % 2 == 0 else teams[(i + 1) % 24]
            t2 = teams[(i + 1 + round_i) % 24]
            if t1 == t2:
                continue
            dt = base + timedelta(days=round_i * 7 + (i // 2))
            out.append(
                HistoricalMatch(
                    match_id=f"hm_{idx}",
                    organization_id="eng_premier_league",
                    season="2026-27",
                    match_date_utc=dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    home_team=t1,
                    away_team=t2,
                    home_goals=(idx % 3) + 1,
                    away_goals=(idx % 2),
                    source_name="test",
                    source_url="https://example.local",
                )
            )
            idx += 1
    return out


class _StubBulletinResult:
    def __init__(self, fixtures):
        self.fixtures = fixtures
        self.primary_source = "iddaa"
        self.used_fallback = False
        self.fallback_sources = []


class _StubFailover:
    def __init__(self, fixtures, history):
        self._fixtures = fixtures
        self._history = history
        self.league_filter = LeagueFilter()
        self.iddaa = type("I", (), {"league_filter": self.league_filter})()
        self.rss_news = type("R", (), {"fetch_all_news": lambda *a, **kw: []})()
        self.open_meteo = type("M", (), {"fetch_match_weather": lambda *a, **kw: None})()
        self.tff = type("T", (), {"fetch_standings": lambda *a, **kw: []})()
        self.openligadb = type("O", (), {"fetch_standings": lambda *a, **kw: []})()

    def fetch_bulletin_with_failover(self):
        return _StubBulletinResult(self._fixtures)

    def fetch_historical_for_league(self, organization_id):
        return self._history


def test_morning_0800_and_independent_1159_and_full_bulletin(temp_repo):
    history = _synthetic_history()
    now_0800 = datetime(2026, 11, 25, 8, 3, tzinfo=ISTANBUL_TZ)  # 3 min delay recorded
    fixtures = []
    # Create 18 distinct valid fixtures inside [08:00, next 08:00)
    for i in range(18):
        ko_tr = datetime(2026, 11, 25, 13 + (i % 10), i % 40, tzinfo=ISTANBUL_TZ)
        h_num = (i % 12) + 1
        a_num = ((i + 1 + (i // 12)) % 12) + 13
        fixtures.append(
            FixtureRecord(
                fixture_id=f"fx_{i}",
                iddaa_event_id=str(1000 + i),
                iddaa_match_code=str(2000 + i),
                organization_id="eng_premier_league",
                league_name="İngiltere Premier League",
                country="İngiltere",
                home_team=f"Team{h_num}",
                away_team=f"Team{a_num}",
                home_team_id=f"team_{h_num}",
                away_team_id=f"team_{a_num}",
                kickoff_utc=(ko_tr - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                kickoff_tr=ko_tr.isoformat(),
                analysis_day_tr="2026-11-25",
                status="scheduled",
                bulletin_source="iddaa",
                iddaa_verified=True,
                is_demo=False,
                provenance=SourceProvenance(
                    source_name="iddaa",
                    source_url="https://sportsbookv2.iddaa.com",
                    fetched_at="2026-11-25T05:00:00Z",
                    data_type="bulletin_fixture",
                ),
            )
        )

    failover = _StubFailover(fixtures, history)
    res_morning = run_daily_analysis(
        repo=temp_repo, failover=failover, run_type="morning_0800", now_tr=now_0800, send_telegram=True
    )
    assert res_morning["status"] == "completed"
    assert res_morning["delay_seconds"] == 180
    assert len(res_morning["bundles"]) == 18
    assert sum(1 for b in res_morning["bundles"] if b.is_selected_top15) == 15
    assert "[Kod: 20" in res_morning["report_text"]
    assert "Seçilen: 15 maç" in res_morning["report_text"]
    assert "🏆 *İngiltere Premier League" in res_morning["report_text"]

    # Independent 11:59 run recalculates with fresh run_id and new predictions
    now_1159 = datetime(2026, 11, 25, 11, 59, tzinfo=ISTANBUL_TZ)
    res_midday = run_daily_analysis(
        repo=temp_repo, failover=failover, run_type="midday_1159", now_tr=now_1159, send_telegram=True
    )
    assert res_midday["run_id"] != res_morning["run_id"]
    assert res_midday["status"] == "completed"
    runs = temp_repo.db.execute("SELECT * FROM analysis_runs ORDER BY actual_started_at_tr ASC")
    assert len(runs) == 2
