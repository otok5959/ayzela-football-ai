"""Independent adapter for iddaa.com public sportsbook bulletin."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from backend.collectors.team_matcher import canonical_team_id
from backend.config import ISTANBUL_TZ, ensure_free_only_allowed, get_settings
from backend.providers.base import BaseProvider, utc_now_iso
from backend.schemas import FixtureRecord, SourceHealthStatus, SourceProvenance
from backend.validation.league_filter import LeagueFilter

IDDAA_EVENTS_URL = "https://sportsbookv2.iddaa.com/sportsbook/events?st=1&type=0&version=0"
IDDAA_EVENT_DETAIL_URL = "https://sportsbookv2.iddaa.com/sportsbook/event/{event_id}"
IDDAA_COMPS_URL = "https://sportsbookv2.iddaa.com/sportsbook/competitions"
IDDAA_LIVE_RESULTS_URL = "https://statisticsv2.iddaa.com/live-results?sportId=1&date={date}"

_LIVE_STATUS_LABELS = {
    2: "1. Yarı",
    3: "2. Yarı",
    5: "Devre Arası",
    6: "MS",
    7: "Uzatma",
    12: "Penaltılar",
}

MARKET_TYPE_LABELS = {
    1: "Maç Sonucu (1X2)",
    2: "Alt / Üst",
    3: "Çifte Şans",
    4: "Toplam Gol",
    6: "Handikap",
    89: "İlk Yarı / Maç Sonucu",
}


def parse_iddaa_markets(raw_markets: list[dict[str, Any]]) -> tuple[list[str], dict[str, Any]]:
    """
    Parse raw iddaa market objects into backward-compatible nested dicts,
    plus `flat_odds` (pick_key -> real odd) and `market_groups` (group -> {outcome_key: odd})
    for exact overround removal across all available markets.
    """
    market_names: list[str] = []
    iddaa_odds: dict[str, Any] = {}
    flat_odds: dict[str, float] = {}
    market_groups: dict[str, dict[str, float]] = {}

    def _add_group(group_id: str, mapping: dict[str, float]) -> None:
        clean = {k: float(v) for k, v in mapping.items() if isinstance(v, (int, float)) and float(v) > 1.0}
        if clean:
            market_groups[group_id] = clean

    def _set_flat(pick_key: str, odd_val: float | None) -> None:
        if odd_val is not None and float(odd_val) > 1.0:
            flat_odds[pick_key] = round(float(odd_val), 2)

    for m in raw_markets or []:
        try:
            t = int(m.get("t", -1))
            st = int(m.get("st", -1))
            sov = str(m.get("sov") or "").strip()
        except Exception:
            continue

        label = MARKET_TYPE_LABELS.get(t)
        if label and label not in market_names:
            market_names.append(label)

        outcomes: dict[str, float] = {}
        for o in m.get("o", []) or []:
            try:
                odd_val = float(o.get("odd"))
                if odd_val > 1.0:
                    outcomes[str(o.get("n"))] = odd_val
            except (TypeError, ValueError):
                continue
        if not outcomes:
            continue

        if t == 1 and st == 1 and {"1", "0", "2"}.issubset(outcomes):
            iddaa_odds["1x2"] = {"home": outcomes["1"], "draw": outcomes["0"], "away": outcomes["2"]}
            grp = {"ms_1": outcomes["1"], "ms_x": outcomes["0"], "ms_2": outcomes["2"]}
            _add_group("1x2", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 92:
            dc_map: dict[str, float] = {}
            grp: dict[str, float] = {}
            if "1 ve 0" in outcomes:
                dc_map["1x"] = outcomes["1 ve 0"]
                grp["dc_1x"] = outcomes["1 ve 0"]
            if "0 ve 2" in outcomes:
                dc_map["x2"] = outcomes["0 ve 2"]
                grp["dc_x2"] = outcomes["0 ve 2"]
            if "1 ve 2" in outcomes:
                dc_map["12"] = outcomes["1 ve 2"]
                grp["dc_12"] = outcomes["1 ve 2"]
            if dc_map:
                iddaa_odds["dc"] = dc_map
                _add_group("dc", grp)
                for k, v in grp.items():
                    _set_flat(k, v)

        elif t == 2 and st == 89 and {"Var", "Yok"}.issubset(outcomes):
            iddaa_odds["btts"] = {"yes": outcomes["Var"], "no": outcomes["Yok"]}
            grp = {"kg_var": outcomes["Var"], "kg_yok": outcomes["Yok"]}
            _add_group("btts", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 101 and sov in ("1.5", "2.5", "3.5", "4.5") and {"Alt", "Üst"}.issubset(outcomes):
            line_key = sov.replace(".", "_")
            iddaa_odds[f"ou_{sov.replace('.', '')}"] = {"under": outcomes["Alt"], "over": outcomes["Üst"]}
            grp = {f"alt_{line_key}": outcomes["Alt"], f"ust_{line_key}": outcomes["Üst"]}
            _add_group(f"ou_{line_key}", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 88 and {"1", "0", "2"}.issubset(outcomes):
            grp = {"iy_1": outcomes["1"], "iy_x": outcomes["0"], "iy_2": outcomes["2"]}
            _add_group("iy_1x2", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 77:
            grp = {}
            if "1 ve 0" in outcomes:
                grp["iy_1x"] = outcomes["1 ve 0"]
            if "0 ve 2" in outcomes:
                grp["iy_x2"] = outcomes["0 ve 2"]
            if "1 ve 2" in outcomes:
                grp["iy_12"] = outcomes["1 ve 2"]
            _add_group("iy_dc", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 60 and sov in ("0.5", "1.5") and {"Alt", "Üst"}.issubset(outcomes):
            line_key = sov.replace(".", "_")
            grp = {f"iy_alt_{line_key}": outcomes["Alt"], f"iy_ust_{line_key}": outcomes["Üst"]}
            _add_group(f"iy_ou_{line_key}", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 720 and {"Var", "Yok"}.issubset(outcomes):
            grp = {"iy_kg_var": outcomes["Var"], "iy_kg_yok": outcomes["Yok"]}
            _add_group("iy_btts", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 36 and {"1", "0", "2"}.issubset(outcomes):
            grp = {"2y_1": outcomes["1"], "2y_x": outcomes["0"], "2y_2": outcomes["2"]}
            _add_group("2y_1x2", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 603 and sov in ("0.5", "1.5", "2.5") and {"Alt", "Üst"}.issubset(outcomes):
            line_key = sov.replace(".", "_")
            grp = {f"ev_alt_{line_key}": outcomes["Alt"], f"ev_ust_{line_key}": outcomes["Üst"]}
            _add_group(f"ev_ou_{line_key}", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 604 and sov in ("0.5", "1.5", "2.5") and {"Alt", "Üst"}.issubset(outcomes):
            line_key = sov.replace(".", "_")
            grp = {f"dep_alt_{line_key}": outcomes["Alt"], f"dep_ust_{line_key}": outcomes["Üst"]}
            _add_group(f"dep_ou_{line_key}", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 7 and sov in ("1.5", "2.5", "3.5"):
            line_key = sov.replace(".", "_")
            raw_map = {
                "1 ve Üst": f"ms1_ust_{line_key}",
                "1 ve Alt": f"ms1_alt_{line_key}",
                "2 ve Üst": f"ms2_ust_{line_key}",
                "2 ve Alt": f"ms2_alt_{line_key}",
                "0 ve Üst": f"_msx_ust_{line_key}",
                "0 ve Alt": f"_msx_alt_{line_key}",
            }
            grp: dict[str, float] = {}
            for raw_n, target_k in raw_map.items():
                if raw_n in outcomes:
                    grp[target_k] = outcomes[raw_n]
                    if not target_k.startswith("_"):
                        _set_flat(target_k, outcomes[raw_n])
            _add_group(f"ms_ou_{line_key}", grp)

        elif t == 2 and st == 700 and sov == "2.5":
            raw_map = {
                "Üst ve Var": "ust25_kg_var",
                "Alt ve Yok": "alt25_kg_yok",
                "Alt ve Var": "alt25_kg_var",
                "Üst ve Yok": "ust25_kg_yok",
            }
            grp = {target_k: outcomes[raw_n] for raw_n, target_k in raw_map.items() if raw_n in outcomes}
            _add_group("ou25_btts", grp)
            for k, v in grp.items():
                _set_flat(k, v)

        elif t == 2 and st == 698:
            raw_map = {
                "1 ve Var": "ms1_kg_var",
                "1 ve Yok": "ms1_kg_yok",
                "2 ve Var": "ms2_kg_var",
                "2 ve Yok": "ms2_kg_yok",
                "0 ve Var": "_msx_kg_var",
                "0 ve Yok": "_msx_kg_yok",
            }
            grp = {}
            for raw_n, target_k in raw_map.items():
                if raw_n in outcomes:
                    grp[target_k] = outcomes[raw_n]
                    if not target_k.startswith("_"):
                        _set_flat(target_k, outcomes[raw_n])
            _add_group("ms_btts", grp)

        elif t == 2 and st == 100 and sov in ("-1", "1") and {"1", "0", "2"}.issubset(outcomes):
            if sov == "-1":
                grp = {"hnd_m1_1": outcomes["1"], "_hnd_m1_0": outcomes["0"], "_hnd_m1_2": outcomes["2"]}
                _add_group("hnd_m1", grp)
                _set_flat("hnd_m1_1", outcomes["1"])
            elif sov == "1":
                grp = {"_hnd_p1_1": outcomes["1"], "_hnd_p1_0": outcomes["0"], "hnd_p1_2": outcomes["2"]}
                _add_group("hnd_p1", grp)
                _set_flat("hnd_p1_2", outcomes["2"])

        elif t == 2 and st == 4:
            raw_map = {
                "0-1 gol": "gol_0_1",
                "2-3 gol": "gol_2_3",
                "4-5 gol": "gol_4_5",
                "6+ gol": "_gol_6_plus",
            }
            grp = {}
            for raw_n, target_k in raw_map.items():
                if raw_n in outcomes:
                    grp[target_k] = outcomes[raw_n]
                    if not target_k.startswith("_"):
                        _set_flat(target_k, outcomes[raw_n])
            _add_group("goal_range", grp)

    if flat_odds:
        iddaa_odds["flat_odds"] = flat_odds
    if market_groups:
        iddaa_odds["market_groups"] = market_groups
    return market_names, iddaa_odds


def compute_analysis_day_tr(dt_tr: datetime) -> str:
    """Assign matches between 00:00 and 07:59 TRT to previous analysis day."""
    from datetime import timedelta

    if dt_tr.hour < 8:
        return (dt_tr.date() - timedelta(days=1)).isoformat()
    return dt_tr.date().isoformat()


class IddaaProvider(BaseProvider):
    source_id = "iddaa"
    source_name = "İddaa.com Bülten"
    requires_payment = False

    def __init__(self, http=None, league_filter: LeagueFilter | None = None) -> None:
        super().__init__(http=http)
        self.league_filter = league_filter or LeagueFilter()

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        try:
            data, status, latency, fetched_at = self.http.get_json(IDDAA_EVENTS_URL, ttl_seconds=60)
            events = data.get("data", {}).get("events", [])
            if not data.get("isSuccess") or not isinstance(events, list):
                raise ValueError("İddaa bülten şeması değişti veya isSuccess=false")
            return SourceHealthStatus(
                source_id=self.source_id,
                status="healthy" if len(events) > 0 else "degraded",
                last_success_at=fetched_at,
                latency_ms=latency,
                http_status=status,
                records_fetched=len(events),
                coverage_summary=f"Canlı bülten erişildi ({len(events)} ham futbol etkinliği)",
                updated_at=now,
            )
        except Exception as exc:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message=str(exc)[:300],
                coverage_summary="İddaa bülteni erişilemedi",
                updated_at=now,
            )

    def fetch_upcoming_fixtures(self) -> list[FixtureRecord]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        comp_data, _, _, _ = self.http.get_json(IDDAA_COMPS_URL, ttl_seconds=600)
        comp_map: dict[int, dict[str, Any]] = {
            int(c["i"]): c for c in comp_data.get("data", []) if str(c.get("si")) == "1"
        }

        ev_data, _, _, fetched_at = self.http.get_json(IDDAA_EVENTS_URL, ttl_seconds=120)
        if not ev_data.get("isSuccess"):
            raise RuntimeError("İddaa events endpoint isSuccess=false")
        events = ev_data.get("data", {}).get("events", [])
        if not isinstance(events, list):
            raise RuntimeError("İddaa events alanı liste değil (şema değişmiş olabilir)")

        include_all = get_settings().all_iddaa_bulletin
        virtual_words = ("sanal", "virtual", "e-futbol", "efootball", "esports", "cyber", "simulated")

        fixtures: list[FixtureRecord] = []
        for ev in events:
            try:
                if int(ev.get("sid", 0)) != 1:
                    continue
                comp_id = int(ev.get("ci", 0))
                comp_info = comp_map.get(comp_id, {})
                raw_league_name = str(comp_info.get("n") or f"Lig {comp_id}")
                country_code = str(comp_info.get("cid") or "INT")

                if any(vw in raw_league_name.lower() for vw in virtual_words):
                    continue

                matched_lg = self.league_filter.match(
                    league_name=raw_league_name,
                    iddaa_comp_id=comp_id,
                    country_code=country_code,
                )
                if matched_lg:
                    org_id = matched_lg["organization_id"]
                    league_name = matched_lg["name_tr"]
                    country = matched_lg["country"]
                elif include_all:
                    org_id = f"iddaa_comp_{comp_id}"
                    league_name = raw_league_name
                    country = country_code
                else:
                    continue

                ts = int(ev["d"])
                dt_utc = datetime.fromtimestamp(ts, tz=timezone.utc)
                dt_tr = dt_utc.astimezone(ISTANBUL_TZ)

                raw_status = int(ev.get("s", 0))
                # s=0 upcoming, s=1 live, s=2/3 finished/settled (treat nonzero cautiously)
                if raw_status == 0:
                    status_str = "scheduled"
                elif raw_status == 1:
                    status_str = "live"
                else:
                    status_str = "finished"

                home_name = str(ev.get("hn", "")).strip()
                away_name = str(ev.get("an", "")).strip()
                if not home_name or not away_name:
                    continue

                market_names, iddaa_odds = parse_iddaa_markets(ev.get("m", []))

                event_id = str(ev["i"])
                match_code = str(ev.get("bri") or event_id)
                fixtures.append(
                    FixtureRecord(
                        fixture_id=f"iddaa_{event_id}",
                        iddaa_event_id=event_id,
                        iddaa_match_code=match_code,
                        organization_id=org_id,
                        league_name=league_name,
                        country=country,
                        home_team=home_name,
                        away_team=away_name,
                        home_team_id=canonical_team_id(home_name),
                        away_team_id=canonical_team_id(away_name),
                        kickoff_utc=dt_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        kickoff_tr=dt_tr.strftime("%Y-%m-%dT%H:%M:%S+03:00"),
                        analysis_day_tr=compute_analysis_day_tr(dt_tr),
                        status=status_str,
                        bulletin_source="iddaa",
                        iddaa_verified=True,
                        available_markets=market_names,
                        iddaa_odds=iddaa_odds,
                        is_demo=False,
                        provenance=SourceProvenance(
                            source_name=self.source_name,
                            source_url=IDDAA_EVENTS_URL,
                            published_at=fetched_at,
                            fetched_at=fetched_at,
                            verification_status="verified",
                            data_type="bulletin_fixture",
                            is_demo=False,
                        ),
                    )
                )
            except Exception:
                # Isolate malformed individual event rows without crashing pipeline
                continue
        return fixtures

    def enrich_event_odds(self, fixture: FixtureRecord) -> FixtureRecord:
        """Fetch full per-event market list (50+ markets) from iddaa.com and merge into fixture.iddaa_odds."""
        if not fixture.iddaa_event_id:
            return fixture
        try:
            url = IDDAA_EVENT_DETAIL_URL.format(event_id=fixture.iddaa_event_id)
            data, _, _, _ = self.http.get_json(url, ttl_seconds=120)
            if not data.get("isSuccess"):
                return fixture
            raw_m = (data.get("data") or {}).get("m") or []
            if not isinstance(raw_m, list) or not raw_m:
                return fixture
            names, parsed = parse_iddaa_markets(raw_m)
            merged_odds = dict(fixture.iddaa_odds or {})
            for k, v in parsed.items():
                if k in ("flat_odds", "market_groups") and isinstance(v, dict):
                    base = dict(merged_odds.get(k) or {})
                    base.update(v)
                    merged_odds[k] = base
                else:
                    merged_odds[k] = v
            merged_names = list(dict.fromkeys([*(fixture.available_markets or []), *names]))
            return fixture.model_copy(update={"iddaa_odds": merged_odds, "available_markets": merged_names})
        except Exception:
            return fixture

    def fetch_live_and_finished_scores(self, dates: list[str]) -> dict[str, dict[str, Any]]:
        """
        Fetch real-time live and finished football match scores from iddaa statistics API
        for the given YYYY-MM-DD dates. Keyed by iddaa_event_id string.
        """
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        out: dict[str, dict[str, Any]] = {}
        seen_dates: list[str] = []
        for dt in dates:
            if dt and dt not in seen_dates:
                seen_dates.append(dt)

        for dt in seen_dates:
            url = IDDAA_LIVE_RESULTS_URL.format(date=dt)
            try:
                payload, _, _, fetched_at = self.http.get_json(url, ttl_seconds=20)
            except Exception:
                continue
            if not payload.get("isSuccess"):
                continue
            data = payload.get("data") or {}
            events = data.get("events") or []
            sc_map = data.get("sc") or {}
            if not isinstance(events, list) or not isinstance(sc_map, dict):
                continue

            for ev in events:
                eid = str(ev.get("eventId") or "")
                if not eid:
                    continue
                phase = ev.get("phase")
                sc = sc_map.get(eid)
                if phase == 1:
                    status = "live"
                elif phase == 2:
                    status = "finished"
                else:
                    status = "scheduled"

                ht = sc.get("ht") if isinstance(sc, dict) and isinstance(sc.get("ht"), dict) else {}
                at = sc.get("at") if isinstance(sc, dict) and isinstance(sc.get("at"), dict) else {}
                sc_s = sc.get("s") if isinstance(sc, dict) else None
                raw_min = sc.get("min") if isinstance(sc, dict) else None

                home_goals = ht.get("r")
                away_goals = at.get("r")
                ht_home_goals = ht.get("ht")
                ht_away_goals = at.get("ht")

                if status == "finished":
                    minute = "MS"
                    status_label = _LIVE_STATUS_LABELS.get(sc_s, "MS")
                elif sc_s == 5:
                    minute = "İY"
                    status_label = "Devre Arası"
                elif status == "live" and raw_min is not None:
                    minute = f"{raw_min}'"
                    status_label = _LIVE_STATUS_LABELS.get(sc_s, "Canlı")
                else:
                    minute = None
                    status_label = _LIVE_STATUS_LABELS.get(sc_s, "Başlamadı")

                out[eid] = {
                    "event_id": eid,
                    "fixture_id": f"iddaa_{eid}",
                    "betradar_id": str(ev.get("betradarId") or ""),
                    "status": status,
                    "home_goals": int(home_goals) if home_goals is not None else None,
                    "away_goals": int(away_goals) if away_goals is not None else None,
                    "ht_home_goals": int(ht_home_goals) if ht_home_goals is not None else None,
                    "ht_away_goals": int(ht_away_goals) if ht_away_goals is not None else None,
                    "minute": minute,
                    "status_label": status_label,
                    "source_url": url,
                    "fetched_at": fetched_at,
                }
        return out
