"""League filtering and canonical organization_id resolution."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from backend.config import get_settings


def normalize_text(text: str) -> str:
    text = text.strip().lower()
    tr_map = str.maketrans("çğıöşüâîû", "cgiosuaiu")
    text = text.translate(tr_map)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9\s]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


class LeagueFilter:
    """Filters competitions against the editable 18-league male top-tier whitelist."""

    def __init__(self, config_path: Path | None = None) -> None:
        path = config_path or (get_settings().config_dir / "leagues_whitelist.json")
        raw = json.loads(path.read_text(encoding="utf-8"))
        self.excluded_keywords: list[str] = [normalize_text(k) for k in raw.get("excluded_keywords", [])]
        self.leagues: list[dict[str, Any]] = raw.get("leagues", [])
        self._build_indexes()

    def _build_indexes(self) -> None:
        self.by_org_id: dict[str, dict[str, Any]] = {}
        self.by_iddaa_id: dict[int, dict[str, Any]] = {}
        self.by_alias: dict[str, dict[str, Any]] = {}
        for lg in self.leagues:
            self.by_org_id[lg["organization_id"]] = lg
            for cid in lg.get("iddaa_comp_ids", []):
                self.by_iddaa_id[int(cid)] = lg
            for alias in [lg["name_tr"], *lg.get("aliases", [])]:
                self.by_alias[normalize_text(alias)] = lg

    @classmethod
    def from_db_rows(cls, rows: list[dict[str, Any]], config_path: Path | None = None) -> "LeagueFilter":
        lf = cls(config_path=config_path)
        db_leagues: list[dict[str, Any]] = []
        for r in rows:
            db_leagues.append(
                {
                    "organization_id": r["organization_id"],
                    "name_tr": r["name_tr"],
                    "country": r["country"],
                    "country_code": r["country_code"],
                    "tier": r.get("tier", 1),
                    "category": r["category"],
                    "enabled": bool(r["enabled"]),
                    "iddaa_comp_ids": json.loads(r.get("iddaa_comp_ids_json") or "[]"),
                    "aliases": json.loads(r.get("aliases_json") or "[]"),
                }
            )
        if db_leagues:
            lf.leagues = db_leagues
            lf._build_indexes()
        return lf

    def is_excluded_name(self, name: str) -> bool:
        norm = f" {normalize_text(name)} "
        for kw in self.excluded_keywords:
            if not kw:
                continue
            if f" {kw} " in norm or (len(kw) >= 4 and kw in norm):
                return True
        if re.search(r"\bu\s*(15|16|17|18|19|20|21|23)\b", norm):
            return True
        return False

    def match(
        self,
        league_name: str,
        iddaa_comp_id: int | None = None,
        organization_id_hint: str | None = None,
        country_code: str | None = None,
    ) -> dict[str, Any] | None:
        if self.is_excluded_name(league_name):
            return None

        if organization_id_hint and organization_id_hint in self.by_org_id:
            lg = self.by_org_id[organization_id_hint]
            return lg if lg.get("enabled", True) else None

        if iddaa_comp_id is not None and iddaa_comp_id in self.by_iddaa_id:
            lg = self.by_iddaa_id[iddaa_comp_id]
            return lg if lg.get("enabled", True) else None

        norm_name = normalize_text(league_name)
        if norm_name in self.by_alias:
            lg = self.by_alias[norm_name]
            if lg.get("enabled", True):
                return lg
            return None

        # Substring fallback only when country_code matches or league is international
        for alias_norm, lg in self.by_alias.items():
            if not lg.get("enabled", True):
                continue
            if len(alias_norm) >= 6 and alias_norm in norm_name:
                if country_code and lg.get("country_code") not in ("INT", country_code):
                    continue
                return lg

        return None
