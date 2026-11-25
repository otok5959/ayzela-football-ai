"""Respectful HTTP client with TTL file cache, per-host rate limiting, backoff retries, and robots check."""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx

from backend.config import get_settings

USER_AGENT = "AyzElaFootballAI/1.0 (+personal-research; respectful-crawler)"


class RobotsBlockedError(RuntimeError):
    """Raised when robots.txt disallows fetching a path."""


class AccessRestrictedError(RuntimeError):
    """Raised when a target responds with 403/429/CAPTCHA/WAF block (never bypassed)."""


class RespectfulHttpClient:
    def __init__(
        self,
        cache_dir: Path | None = None,
        timeout_seconds: float = 15.0,
        min_interval_seconds: float = 0.6,
        max_retries: int = 2,
    ) -> None:
        self.cache_dir = cache_dir or get_settings().cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.timeout_seconds = timeout_seconds
        self.min_interval_seconds = min_interval_seconds
        self.max_retries = max_retries
        self._last_request_by_host: dict[str, float] = {}
        self._robots_cache: dict[str, RobotFileParser | None] = {}
        self._client = httpx.Client(
            timeout=timeout_seconds,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/html, application/xml;q=0.9, */*;q=0.8"},
        )

    def close(self) -> None:
        self._client.close()

    def _cache_path(self, url: str) -> Path:
        digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:32]
        return self.cache_dir / f"{digest}.json"

    def _throttle(self, host: str) -> None:
        last = self._last_request_by_host.get(host)
        if last is not None:
            elapsed = time.monotonic() - last
            if elapsed < self.min_interval_seconds:
                time.sleep(self.min_interval_seconds - elapsed)
        self._last_request_by_host[host] = time.monotonic()

    def is_allowed_by_robots(self, url: str) -> bool:
        parsed = urlparse(url)
        host_base = f"{parsed.scheme}://{parsed.netloc}"
        if host_base not in self._robots_cache:
            rp = RobotFileParser()
            robots_url = f"{host_base}/robots.txt"
            try:
                self._throttle(parsed.netloc)
                resp = self._client.get(robots_url)
                if resp.status_code == 200 and len(resp.text) < 200_000:
                    rp.parse(resp.text.splitlines())
                    self._robots_cache[host_base] = rp
                else:
                    self._robots_cache[host_base] = None
            except Exception:
                self._robots_cache[host_base] = None

        cached_rp = self._robots_cache[host_base]
        if cached_rp is None:
            return True
        return cached_rp.can_fetch(USER_AGENT, url)

    def get_text(
        self,
        url: str,
        ttl_seconds: int = 300,
        encoding_override: str | None = None,
        check_robots: bool = True,
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[str, int, int, str]:
        """Fetch URL returning (text, status_code, latency_ms, fetched_at_iso)."""
        cache_file = self._cache_path(url)
        if ttl_seconds > 0 and cache_file.exists():
            try:
                cached = json.loads(cache_file.read_text(encoding="utf-8"))
                age = time.time() - float(cached["ts"])
                if age <= ttl_seconds:
                    return cached["text"], int(cached["status"]), 0, cached["fetched_at"]
            except Exception:
                pass

        if check_robots and not self.is_allowed_by_robots(url):
            raise RobotsBlockedError(f"robots.txt tarafından engelli yol: {url}")

        host = urlparse(url).netloc
        last_exc: Exception | None = None
        for attempt in range(self.max_retries + 1):
            self._throttle(host)
            t0 = time.monotonic()
            try:
                resp = self._client.get(url, headers=extra_headers)
                latency_ms = int((time.monotonic() - t0) * 1000)
                if resp.status_code in (403, 429):
                    raise AccessRestrictedError(
                        f"Erişim kısıtlandı (HTTP {resp.status_code}) — bypass denenmedi: {url}"
                    )
                resp.raise_for_status()
                text = (
                    resp.content.decode(encoding_override, errors="replace")
                    if encoding_override
                    else resp.text
                )
                lowered = text[:1500].lower()
                if "cf-turnstile" in lowered or "g-recaptcha" in lowered or "erisime_engellenmis" in lowered:
                    raise AccessRestrictedError(f"Erişim engeli / doğrulama kapısı tespit edildi: {url}")

                fetched_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                if ttl_seconds > 0:
                    try:
                        cache_file.write_text(
                            json.dumps(
                                {"ts": time.time(), "status": resp.status_code, "fetched_at": fetched_at, "text": text},
                                ensure_ascii=False,
                            ),
                            encoding="utf-8",
                        )
                    except Exception:
                        pass
                return text, resp.status_code, latency_ms, fetched_at
            except (RobotsBlockedError, AccessRestrictedError):
                raise
            except Exception as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(1.0 * (2**attempt))

        raise RuntimeError(f"İstek başarısız ({url}): {last_exc}") from last_exc

    def get_json(
        self,
        url: str,
        ttl_seconds: int = 300,
        check_robots: bool = True,
        extra_headers: dict[str, str] | None = None,
    ) -> tuple[Any, int, int, str]:
        text, status, latency_ms, fetched_at = self.get_text(
            url, ttl_seconds=ttl_seconds, check_robots=check_robots, extra_headers=extra_headers
        )
        return json.loads(text), status, latency_ms, fetched_at
