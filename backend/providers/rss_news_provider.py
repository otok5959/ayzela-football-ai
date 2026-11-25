"""Adapter for authorized football RSS/Atom news feeds (BBC, Guardian, TRT Spor, NTV Spor)."""

from __future__ import annotations

import xml.etree.ElementTree as ET

from backend.config import ensure_free_only_allowed
from backend.providers.base import BaseProvider, utc_now_iso
from backend.schemas import NewsItem, SourceHealthStatus

RSS_FEEDS = [
    ("BBC Sport Football", "https://feeds.bbci.co.uk/sport/football/rss.xml"),
    ("The Guardian Football", "https://www.theguardian.com/football/rss"),
    ("TRT Haber Spor", "https://www.trthaber.com/spor_articles.rss"),
    ("NTV Spor Futbol", "https://www.ntvspor.net/rss/kategori/futbol"),
]


class RssNewsProvider(BaseProvider):
    source_id = "rss_news"
    source_name = "İzinli Spor RSS Akışları"
    requires_payment = False

    def check_health(self) -> SourceHealthStatus:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        now = utc_now_iso()
        ok_feeds = 0
        total_items = 0
        errors: list[str] = []
        for feed_name, feed_url in RSS_FEEDS:
            try:
                items = self._parse_feed(feed_name, feed_url, limit=10)
                if items:
                    ok_feeds += 1
                    total_items += len(items)
            except Exception as exc:
                errors.append(f"{feed_name}: {exc}")
        if ok_feeds == 0:
            return SourceHealthStatus(
                source_id=self.source_id,
                status="down",
                last_error_at=now,
                last_error_message="; ".join(errors)[:300],
                coverage_summary="Hiçbir RSS akışı okunamadı",
                updated_at=now,
            )
        return SourceHealthStatus(
            source_id=self.source_id,
            status="healthy" if ok_feeds >= 2 else "degraded",
            last_success_at=now,
            http_status=200,
            records_fetched=total_items,
            coverage_summary=f"{ok_feeds}/{len(RSS_FEEDS)} RSS akışı aktif ({total_items} haber)",
            updated_at=now,
        )

    def _parse_feed(self, feed_name: str, feed_url: str, limit: int = 20) -> list[NewsItem]:
        xml_text, _, _, fetched_at = self.http.get_text(feed_url, ttl_seconds=600, check_robots=False)
        root = ET.fromstring(xml_text)
        items: list[NewsItem] = []

        # RSS 2.0
        for item in root.findall(".//item")[:limit]:
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            desc = (item.findtext("description") or "").strip()
            pub = (item.findtext("pubDate") or "").strip() or None
            if title and link:
                items.append(
                    NewsItem(
                        title=title,
                        summary=desc[:400] if desc else None,
                        source_name=feed_name,
                        source_url=link,
                        published_at=pub,
                        fetched_at=fetched_at,
                        verification_status="verified",
                    )
                )

        # Atom fallback (e.g. NTV Spor)
        if not items:
            ns = {"atom": "http://www.w3.org/2005/Atom"}
            for entry in root.findall(".//atom:entry", ns)[:limit]:
                title = (entry.findtext("atom:title", default="", namespaces=ns) or "").strip()
                link_el = entry.find("atom:link", ns)
                link = (link_el.attrib.get("href") if link_el is not None else "") or ""
                summary = (entry.findtext("atom:summary", default="", namespaces=ns) or "").strip()
                pub = (entry.findtext("atom:updated", default="", namespaces=ns) or "").strip() or None
                if title and link:
                    items.append(
                        NewsItem(
                            title=title,
                            summary=summary[:400] if summary else None,
                            source_name=feed_name,
                            source_url=link,
                            published_at=pub,
                            fetched_at=fetched_at,
                            verification_status="verified",
                        )
                    )
        return items

    def fetch_all_news(self, limit_per_feed: int = 15) -> list[NewsItem]:
        ensure_free_only_allowed(self.requires_payment, self.source_name)
        all_items: list[NewsItem] = []
        for feed_name, feed_url in RSS_FEEDS:
            try:
                all_items.extend(self._parse_feed(feed_name, feed_url, limit=limit_per_feed))
            except Exception:
                continue
        return all_items
