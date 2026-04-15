"""
fluxbase_client.py — Async Fluxbase REST API client.

Handles:
  - Bulk INSERT with parameterised VALUES clauses
  - Idempotency via ON CONFLICT (id) DO NOTHING
  - Connection pooling via httpx.AsyncClient
  - Request-level timeout + retry signalling
"""

import json
import logging
import time
from typing import Any

import httpx

from config import cfg

logger = logging.getLogger(__name__)

# Keep one persistent async client (connection pool) per process
_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            base_url=cfg.fluxbase_url,
            headers={
                "Authorization": f"Bearer {cfg.fluxbase_api_key}",
                "Content-Type": "application/json",
                "X-Worker-Id": cfg.worker_id,
            },
            timeout=httpx.Timeout(connect=5.0, read=30.0, write=10.0, pool=5.0),
            limits=httpx.Limits(
                max_connections=cfg.num_workers * 4,
                max_keepalive_connections=cfg.num_workers * 2,
                keepalive_expiry=30,
            ),
            http2=True,   # enable HTTP/2 multiplexing where supported
        )
    return _http_client


async def close_http_client():
    global _http_client
    if _http_client:
        await _http_client.aclose()
        _http_client = None


class FluxbaseClient:
    """
    Wraps the Fluxbase /api/execute-sql endpoint.

    Core operation: bulk INSERT using multi-row VALUES.
    Idempotency: ON CONFLICT (id) DO NOTHING

    The caller is responsible for retry logic.
    This class raises FluxbaseError on non-retriable failures
    and FluxbaseRetryError on throttling / transient errors.
    """

    def __init__(self):
        self.client = get_http_client()

    # ── Bulk insert ───────────────────────────────────────────────────────────
    async def bulk_insert(
        self,
        table: str,
        rows: list[dict[str, Any]],
    ) -> dict:
        """
        Builds and executes a parameterised bulk INSERT statement.

        Returns the Fluxbase response dict.
        Raises:
          FluxbaseRetryError   — transient / rate-limit errors (caller should retry)
          FluxbaseError        — permanent failure (send to DLQ)
        """
        if not rows:
            return {"success": True, "rowsAffected": 0}

        sql, params = self._build_bulk_insert(table, rows)

        start = time.monotonic()
        try:
            resp = await self.client.post(
                "/api/execute-sql",
                json={
                    "projectId": cfg.fluxbase_project_id,
                    "query": sql,
                    "params": params,
                },
            )
            latency_ms = (time.monotonic() - start) * 1000

            if resp.status_code == 429:
                raise FluxbaseRetryError(f"Rate limited (429)", latency_ms=latency_ms)

            if resp.status_code >= 500:
                raise FluxbaseRetryError(
                    f"Server error {resp.status_code}: {resp.text[:200]}",
                    latency_ms=latency_ms,
                )

            if resp.status_code >= 400:
                raise FluxbaseError(
                    f"Client error {resp.status_code}: {resp.text[:200]}",
                    latency_ms=latency_ms,
                )

            data = resp.json()
            if not data.get("success"):
                error_msg = data.get("error", {})
                if isinstance(error_msg, dict):
                    error_msg = error_msg.get("message", str(error_msg))
                raise FluxbaseRetryError(f"API error: {error_msg}", latency_ms=latency_ms)

            return {**data, "_latency_ms": latency_ms}

        except (httpx.TimeoutException, httpx.ConnectError) as exc:
            latency_ms = (time.monotonic() - start) * 1000
            raise FluxbaseRetryError(f"Network error: {exc}", latency_ms=latency_ms) from exc

    # ── SQL builder ───────────────────────────────────────────────────────────
    @staticmethod
    def _build_bulk_insert(
        table: str,
        rows: list[dict[str, Any]],
    ) -> tuple[str, list[Any]]:
        """
        Returns (sql, params) for a parameterised multi-row INSERT.

        Example output:
          INSERT INTO orders (id, amount, _batch_id, _ingested_at)
          VALUES ($1,$2,$3,$4),($5,$6,$7,$8),...
          ON CONFLICT (id) DO NOTHING

        All rows must share the same column set (taken from the first row).
        Missing columns in subsequent rows are filled with None.
        """
        # Derive canonical column order from union of all keys
        all_keys: list[str] = []
        seen: set[str] = set()
        for row in rows:
            for k in row:
                if k not in seen:
                    all_keys.append(k)
                    seen.add(k)

        # Strip internal metadata keys that shouldn't go into the DB
        # (_batch_id and _ingested_at are INCLUDED for observability)
        columns = all_keys

        col_list  = ", ".join(f'"{c}"' for c in columns)
        params: list[Any] = []
        value_groups: list[str] = []
        idx = 1

        for row in rows:
            placeholders = []
            for col in columns:
                params.append(row.get(col))
                placeholders.append(f"${idx}")
                idx += 1
            value_groups.append(f"({', '.join(placeholders)})")

        values_clause = ",\n  ".join(value_groups)
        sql = (
            f'INSERT INTO "{table}" ({col_list})\n'
            f"VALUES\n  {values_clause}\n"
            f"ON CONFLICT (id) DO NOTHING"
        )

        return sql, params

    # ── Helper: check table exists ────────────────────────────────────────────
    async def ensure_table_exists(self, table: str, sample_row: dict) -> bool:
        """
        Issues a CREATE TABLE IF NOT EXISTS based on the sample row schema.
        Column types are inferred heuristically.
        """
        col_defs = []
        for key, val in sample_row.items():
            if key == "id":
                col_defs.append('"id" TEXT PRIMARY KEY')
                continue
            pg_type = _infer_pg_type(val)
            col_defs.append(f'"{key}" {pg_type}')

        ddl = (
            f'CREATE TABLE IF NOT EXISTS "{table}" (\n  '
            + ",\n  ".join(col_defs)
            + "\n)"
        )

        try:
            resp = await self.client.post(
                "/api/execute-sql",
                json={"projectId": cfg.fluxbase_project_id, "query": ddl},
            )
            return resp.status_code < 400
        except Exception:
            return False


def _infer_pg_type(value: Any) -> str:
    if isinstance(value, bool):      return "BOOLEAN"
    if isinstance(value, int):       return "BIGINT"
    if isinstance(value, float):     return "DOUBLE PRECISION"
    if isinstance(value, dict):      return "JSONB"
    if isinstance(value, list):      return "JSONB"
    return "TEXT"


class FluxbaseError(Exception):
    """Non-retriable error — send batch to DLQ."""
    def __init__(self, message: str, latency_ms: float = 0.0):
        super().__init__(message)
        self.latency_ms = latency_ms


class FluxbaseRetryError(Exception):
    """Transient error — caller should retry with backoff."""
    def __init__(self, message: str, latency_ms: float = 0.0):
        super().__init__(message)
        self.latency_ms = latency_ms
