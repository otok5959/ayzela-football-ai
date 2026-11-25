"""Acceptance tests: live data fetch, source failover when iddaa is down, and disabled football-data.co.uk."""

from __future__ import annotations

from backend.collectors.failover_manager import MultiSourceFailoverManager


def test_live_iddaa_and_open_sources_connectivity(temp_repo):
    mgr = MultiSourceFailoverManager(repo=temp_repo)
    statuses = mgr.run_all_health_checks()
    by_id = {s.source_id: s for s in statuses}

    assert by_id["iddaa"].status == "healthy"
    assert by_id["openfootball_json"].status == "healthy"
    assert by_id["openligadb"].status == "healthy"
    assert by_id["uefa"].status == "healthy"
    assert by_id["tff"].status == "healthy"

    # football-data.co.uk remains disabled
    db_sources = {r["source_id"]: r for r in temp_repo.list_source_health()}
    assert db_sources["football_data_co_uk"]["status"] == "disabled"
    assert db_sources["football_data_co_uk"]["enabled"] == 0

    # Real fixture fetch from iddaa
    res = mgr.fetch_bulletin_with_failover()
    assert res.primary_source == "iddaa"
    assert res.used_fallback is False
    assert len(res.fixtures) > 0
    assert all(f.iddaa_verified is True for f in res.fixtures)


def test_source_outage_failover_never_marks_iddaa_verified(temp_repo):
    mgr = MultiSourceFailoverManager(repo=temp_repo)

    # Simulate iddaa outage
    def broken_iddaa():
        raise RuntimeError("Simulated iddaa.com 503 outage")

    mgr.iddaa.fetch_upcoming_fixtures = broken_iddaa  # type: ignore[method-assign]
    res = mgr.fetch_bulletin_with_failover()

    assert res.used_fallback is True
    assert "iddaa" != res.primary_source
    assert any("iddaa" in e.lower() for e in res.errors)
    # Fallback fixtures MUST NEVER be marked as iddaa_verified
    assert all(f.iddaa_verified is False for f in res.fixtures)
