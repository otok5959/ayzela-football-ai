"""Live technical verification of all open data sources and persistence to source_health."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.collectors.failover_manager import MultiSourceFailoverManager
from backend.config import get_settings
from backend.database.client import get_db_client
from backend.database.repositories import AyzelaRepository


def main() -> None:
    settings = get_settings()
    db = get_db_client()
    if settings.db_backend.lower() == "sqlite":
        db.init_schema(settings.migrations_dir)
    repo = AyzelaRepository(db)
    mgr = MultiSourceFailoverManager(repo=repo)

    print("=== AYAZELA CANLI VERİ KAYNAKLARI SAĞLIK TESTİ ===")
    statuses = mgr.run_all_health_checks()
    for st in statuses:
        print(
            f"[{st.status.upper():8s}] {st.source_id:20s} | HTTP={st.http_status} | "
            f"latency={st.latency_ms}ms | records={st.records_fetched} | {st.coverage_summary}"
        )
        if st.last_error_message:
            print(f"           Hata: {st.last_error_message}")

    print("\n=== BÜLTEN & FİKSTÜR ÇEKİM DOĞRULAMASI ===")
    res = mgr.fetch_bulletin_with_failover()
    print(f"Ana kaynak: {res.primary_source} | Yedek kullanıldı mı: {res.used_fallback} | Maç sayısı: {len(res.fixtures)}")
    for fx in res.fixtures[:8]:
        print(
            f"  - [{fx.league_name}] {fx.home_team} vs {fx.away_team} | "
            f"{fx.kickoff_tr} | gün={fx.analysis_day_tr} | iddaa_onaylı={fx.iddaa_verified}"
        )


if __name__ == "__main__":
    main()
