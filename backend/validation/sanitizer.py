"""Output safety sanitizer: blocks forbidden deterministic betting claims."""

from __future__ import annotations

import re

FORBIDDEN_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bkesin\s+kazan[ıi]r\b", re.IGNORECASE), "kesin kazanır"),
    (re.compile(r"\bgaranti\s+sonu[çc]\b", re.IGNORECASE), "garanti sonuç"),
    (re.compile(r"\bbanko\b", re.IGNORECASE), "banko"),
    (re.compile(r"\brisksiz\b", re.IGNORECASE), "risksiz"),
    (re.compile(r"\bkupon\s+[öo]nerisi\b", re.IGNORECASE), "kupon önerisi"),
    (re.compile(r"\bbahis\s+miktar[ıi]\b", re.IGNORECASE), "bahis miktarı"),
    (re.compile(r"\by[üu]zde\s*100\s+tutar\b", re.IGNORECASE), "yüzde 100 tutar"),
]


def find_forbidden_phrases(text: str) -> list[str]:
    hits: list[str] = []
    for pattern, label in FORBIDDEN_PATTERNS:
        if pattern.search(text):
            hits.append(label)
    return hits


def assert_safe_report_text(text: str) -> str:
    hits = find_forbidden_phrases(text)
    if hits:
        raise ValueError(f"Yasaklı ifade tespit edildi: {', '.join(hits)}")
    return text
