"""Cloudflare D1 HTTP REST API backend for GitHub Actions and production persistence."""

from __future__ import annotations

from typing import Any

import httpx


class CloudflareD1Client:
    """Executes parameterized SQL queries against Cloudflare D1 via REST API."""

    def __init__(self, account_id: str, database_id: str, api_token: str) -> None:
        if not (account_id and database_id and api_token):
            raise ValueError("Cloudflare D1 için ACCOUNT_ID, DATABASE_ID ve API_TOKEN zorunludur.")
        self.url = (
            f"https://api.cloudflare.com/client/v4/accounts/{account_id}"
            f"/d1/database/{database_id}/query"
        )
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

    def execute(self, sql: str, params: tuple[Any, ...] | list[Any] = ()) -> list[dict[str, Any]]:
        payload = {"sql": sql, "params": list(params)}
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(self.url, headers=self.headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
        if not data.get("success"):
            raise RuntimeError(f"Cloudflare D1 hatası: {data.get('errors')}")
        results = data.get("result", [])
        if not results:
            return []
        return results[0].get("results", [])

    def execute_many(self, sql: str, params_list: list[tuple[Any, ...] | list[Any]]) -> None:
        for params in params_list:
            self.execute(sql, params)

    def execute_script(self, sql_script: str) -> None:
        statements = [s.strip() for s in sql_script.split(";") if s.strip()]
        for stmt in statements:
            if stmt.upper().startswith("PRAGMA "):
                continue
            self.execute(stmt)
