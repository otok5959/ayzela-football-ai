"""Canonical team name normalization and cross-source fuzzy matching."""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher

COMMON_SUFFIXES = (
    " fc", " fk", " sk", " jk", " afc", " cf", " sc", " ac", " sv", " vfb",
    " bc", " sporting", " club", " futbol kulubu", " as", " a s",
)

MANUAL_ALIASES: dict[str, str] = {
    "galatasaray": "galatasaray",
    "galatasaray sk": "galatasaray",
    "fenerbahce": "fenerbahce",
    "fenerbahce sk": "fenerbahce",
    "besiktas": "besiktas",
    "besiktas jk": "besiktas",
    "trabzonspor": "trabzonspor",
    "rams basaksehir": "basaksehir",
    "istanbul basaksehir": "basaksehir",
    "basaksehir": "basaksehir",
    "bayern munchen": "bayern munich",
    "fc bayern munchen": "bayern munich",
    "bayern munih": "bayern munich",
    "bayern munich": "bayern munich",
    "borussia dortmund": "borussia dortmund",
    "bvb": "borussia dortmund",
    "paris saint germain": "psg",
    "paris sg": "psg",
    "psg": "psg",
    "internazionale": "inter",
    "inter milan": "inter",
    "inter": "inter",
    "ac milan": "milan",
    "milan": "milan",
    "atletico madrid": "atletico madrid",
    "atletico de madrid": "atletico madrid",
    "manchester united": "manchester united",
    "man united": "manchester united",
    "manchester city": "manchester city",
    "man city": "manchester city",
    "tottenham hotspur": "tottenham",
    "tottenham": "tottenham",
    "wolverhampton wanderers": "wolves",
    "wolves": "wolves",
    "newcastle united": "newcastle",
    "newcastle": "newcastle",
    "athletic bilbao": "athletic club",
    "athletic club": "athletic club",
    "real betis": "betis",
    "real sociedad": "real sociedad",
    "bayer 04 leverkusen": "bayer leverkusen",
    "bayer leverkusen": "bayer leverkusen",
    "rb leipzig": "rb leipzig",
    "rasenballsport leipzig": "rb leipzig",
}


def normalize_team_name(name: str) -> str:
    s = name.strip().lower()
    s = s.translate(str.maketrans("çğıöşüâîûäöß", "cgiosuaiaoss"))
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = re.sub(r"[^a-z0-9\s]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    if s in MANUAL_ALIASES:
        return MANUAL_ALIASES[s]
    for suf in COMMON_SUFFIXES:
        if s.endswith(suf) and len(s) > len(suf) + 2:
            s = s[: -len(suf)].strip()
    return MANUAL_ALIASES.get(s, s)


def canonical_team_id(name: str) -> str:
    norm = normalize_team_name(name)
    return "team_" + norm.replace(" ", "_")


def teams_match(name_a: str, name_b: str, threshold: float = 0.84) -> bool:
    na = normalize_team_name(name_a)
    nb = normalize_team_name(name_b)
    if not na or not nb:
        return False
    if na == nb or na in nb or nb in na:
        return True
    return SequenceMatcher(None, na, nb).ratio() >= threshold
