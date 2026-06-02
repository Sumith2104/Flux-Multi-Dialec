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
import asyncpg
import httpx

from config import cfg

logger = logging.getLogger(__name__)

# Keep one persistent async client (connection pool) per process
_http_client: httpx.AsyncClient | None = None
_pg_pool: asyncpg.Pool | None = None


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


async def get_pg_pool() -> asyncpg.Pool:
    global _pg_pool
    if _pg_pool is None:
        if not cfg.database_url:
            raise ValueError("AWS_RDS_POSTGRES_URL environment variable is required for direct DB COPY ingestion.")
        
        logger.info("[Fluxbase Pool] Initialising asyncpg connection pool to RDS database...")
        # AWS RDS db.t4g.2xlarge supports up to ~3600 connections.
        # We cap max_size at num_workers * 2 to leave plenty of pool headroom.
        _pg_pool = await asyncpg.create_pool(
            dsn=cfg.database_url,
            min_size=2,
            max_size=max(5, cfg.num_workers * 2),
            timeout=10.0,
            command_timeout=15.0,
            # Ensure SSL is configured correctly for AWS RDS
            ssl="require" if "rds.amazonaws.com" in cfg.database_url else None
        )
    return _pg_pool


async def close_http_client():
    global _http_client
    if _http_client:
        await _http_client.aclose()
        _http_client = None

    global _pg_pool
    if _pg_pool:
        logger.info("[Fluxbase Pool] Closing asyncpg connection pool...")
        await _pg_pool.close()
        _pg_pool = None


class FluxbaseClient:
    """
    Wraps both high-speed direct PostgreSQL connection (COPY stream)
    and fallback HTTP REST API (/api/execute-sql) operations.

    Core operations:
      - Direct database connection via asyncpg using COPY protocol (Fastest, 100k+ rows/sec)
      - Parameterised INSERT queries over HTTP (Fallback)
    """

    def __init__(self):
        self.client = get_http_client()

    # ── High-Speed PostgreSQL COPY Ingestion ──────────────────────────────────
    async def bulk_copy(
        self,
        table: str,
        rows: list[dict[str, Any]],
    ) -> dict:
        """
        Ingests a batch of rows directly into the PostgreSQL database using the native
        COPY protocol. Optimised with SET LOCAL synchronous_commit = off.
        """
        if not rows:
            return {"success": True, "rowsAffected": 0}

        # 1. Extract canonical schema from union of all keys in this batch
        all_keys = set()
        for r in rows:
            all_keys.update(r.keys())
        columns = sorted(list(all_keys))

        if not columns:
            return {"success": True, "rowsAffected": 0}

        # 2. Form aligned tuple records
        records = []
        for r in rows:
            records.append(tuple(r.get(c) for c in columns))

        start = time.monotonic()
        try:
            pool = await get_pg_pool()
            schema_name = f"project_{cfg.fluxbase_project_id}"

            async with pool.acquire() as conn:
                async with conn.transaction():
                    # Turn off synchronous commit at the session level for maximum disk write speed
                    await conn.execute("SET LOCAL synchronous_commit = OFF;")
                    
                    # Stream records using binary COPY stream
                    await conn.copy_records_to_table(
                        table_name=table,
                        schema_name=schema_name,
                        columns=columns,
                        records=records
                    )

            elapsed = (time.monotonic() - start) * 1000
            return {
                "success": True,
                "rowsAffected": len(rows),
                "_latency_ms": elapsed
            }

        except Exception as exc:
            latency_ms = (time.monotonic() - start) * 1000
            # Identify transient connection reset or timeout issues
            err_msg = str(exc).lower()
            is_transient = "timeout" in err_msg or "connection" in err_msg or "pool" in err_msg
            if is_transient:
                raise FluxbaseRetryError(f"Database direct COPY connection error: {exc}", latency_ms=latency_ms) from exc
            else:
                raise FluxbaseError(f"Database direct COPY permanent failure: {exc}", latency_ms=latency_ms) from exc

    # ── Bulk insert (HTTP Fallback) ───────────────────────────────────────────
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
        Issues a CREATE TABLE (or UNLOGGED TABLE) IF NOT EXISTS based on the sample row schema.
        Supports direct DB execution or API execution fallback.
        """
        col_defs = []
        for key, val in sample_row.items():
            if key == "id":
                col_defs.append('"id" TEXT PRIMARY KEY')
                continue
            pg_type = _infer_pg_type(val)
            col_defs.append(f'"{key}" {pg_type}')

        table_type = "UNLOGGED TABLE" if cfg.use_unlogged_tables else "TABLE"
        schema_name = f"project_{cfg.fluxbase_project_id}"
        
        # Direct DB DDL when database_url is provided
        if cfg.database_url:
            ddl = (
                f'CREATE {table_type} IF NOT EXISTS "{schema_name}"."{table}" (\n  '
                + ",\n  ".join(col_defs)
                + "\n)"
            )
            try:
                pool = await get_pg_pool()
                async with pool.acquire() as conn:
                    await conn.execute(ddl)
                logger.info("[Fluxbase] Direct DB table check successful: %s.%s (%s)", schema_name, table, table_type)
                return True
            except Exception as e:
                logger.error("[Fluxbase] Direct DB table check failed: %s", e)
                return False

        # Fallback DDL over HTTP API (note: API handles project isolation schema mapping)
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

