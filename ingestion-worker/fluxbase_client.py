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
        Production-grade bulk insert with automatic chunking.
        Handles PostgreSQL parameter limits (~32k) and large batch splitting.
        """
        if not rows:
            return {"success": True, "rowsAffected": 0}

        # 1. Extract canonical schema from union of all keys in this batch
        all_keys = set()
        for r in rows:
            all_keys.update(r.keys())
        columns = sorted(list(all_keys))
        num_cols = len(columns)

        if num_cols == 0:
            return {"success": True, "rowsAffected": 0}

        # 2. Calculate safe chunk size
        # PG Limit: 32,767 params. Safety Buffer: 30,000.
        max_rows_by_params = 30000 // num_cols
        rows_per_chunk = max(1, min(1000, max_rows_by_params))
        
        chunks = [rows[i : i + rows_per_chunk] for i in range(0, len(rows), rows_per_chunk)]
        
        if len(chunks) > 1:
            logger.info(
                "[Fluxbase] Splitting %d rows into %d chunks (cols=%d, rows_per_chunk=%d)",
                len(rows), len(chunks), num_cols, rows_per_chunk
            )

        total_affected = 0
        total_latency = 0

        # 3. Execute chunks sequentially for protocol safety and pool management
        for i, chunk in enumerate(chunks):
            sql, params = self._build_insert_chunk(table, columns, chunk)
            
            # Fail-safe check
            if not params or not sql:
                continue

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
                chunk_latency = (time.monotonic() - start) * 1000
                total_latency += chunk_latency

                if resp.status_code == 429:
                    raise FluxbaseRetryError(f"Rate limited (429) at chunk {i+1}", latency_ms=chunk_latency)

                if resp.status_code >= 500:
                    raise FluxbaseRetryError(
                        f"Server error {resp.status_code} at chunk {i+1}: {resp.text[:200]}",
                        latency_ms=chunk_latency,
                    )

                if resp.status_code >= 400:
                    raise FluxbaseError(
                        f"Client error {resp.status_code} at chunk {i+1}: {resp.text[:200]}",
                        latency_ms=chunk_latency,
                    )

                data = resp.json()
                if not data.get("success"):
                    err = data.get("error", {})
                    msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
                    raise FluxbaseRetryError(f"API error at chunk {i+1}: {msg}", latency_ms=chunk_latency)

                total_affected += data.get("rowsAffected", len(chunk))

            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                latency_ms = (time.monotonic() - start) * 1000
                raise FluxbaseRetryError(f"Network error at chunk {i+1}: {exc}", latency_ms=latency_ms) from exc

        return {
            "success": True, 
            "rowsAffected": total_affected, 
            "_latency_ms": total_latency
        }

    # ── SQL builder ───────────────────────────────────────────────────────────
    @staticmethod
    def _build_insert_chunk(
        table: str,
        columns: list[str],
        rows: list[dict[str, Any]],
    ) -> tuple[str, list[Any]]:
        """
        Builds a single parameterised INSERT block for a chunk of rows.
        """
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
