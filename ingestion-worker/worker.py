"""
worker.py — Core ingestion worker coroutine.

Each worker:
  1. Dequeues a batch from Redis
  2. Groups rows by target table
  3. Bulk-inserts each group into Fluxbase
  4. Retries on transient failures (exponential backoff)
  5. Sends permanently failed batches to DLQ
  6. Records metrics

Multiple workers run as concurrent asyncio tasks in the same process.
"""

import asyncio
import logging
import time
from typing import Any

from config import cfg
from fluxbase_client import FluxbaseClient, FluxbaseError, FluxbaseRetryError
from metrics import metrics
from prometheus_metrics import (
    rows_ingested_total, rows_failed_total, rows_dlq_total,
    batches_total, insert_latency_ms as prom_latency,
)
from queue_client import queue
from throttle import throttle

logger = logging.getLogger(__name__)


# ─── Retry helper ─────────────────────────────────────────────────────────────
async def _with_retry(
    coro_fn,
    *,
    max_retries: int = cfg.max_retries,
    base_ms: int = cfg.base_backoff_ms,
) -> Any:
    """
    Calls coro_fn() and retries on FluxbaseRetryError with exponential backoff.
    Raises FluxbaseError or re-raises after max_retries exhausted.
    """
    last_exc = None
    for attempt in range(max_retries + 1):
        try:
            return await coro_fn()
        except FluxbaseRetryError as exc:
            last_exc = exc
            if attempt == max_retries:
                break
            delay_s = (base_ms * (2 ** attempt)) / 1000.0
            logger.warning(
                "[Retry] attempt=%d/%d backoff=%.0fms reason=%s",
                attempt + 1, max_retries, delay_s * 1000, exc,
            )
            await asyncio.sleep(delay_s)
        except FluxbaseError:
            raise   # Non-retriable; propagate immediately

    raise last_exc   # type: ignore[misc]


# ─── Flatten messages into per-table row groups ───────────────────────────────
def _group_by_table(messages: list[dict]) -> dict[str, list[dict]]:
    """
    Each queue message has shape: { table, rows: [...], batchId, ... }
    Returns: { tableName: [row, row, ...] }
    Rows from all messages that share the same table are coalesced.
    """
    groups: dict[str, list[dict]] = {}
    for msg in messages:
        table = msg.get("table", "unknown")
        rows  = msg.get("rows", [])
        if table not in groups:
            groups[table] = []
        groups[table].extend(rows)
    return groups


# ─── Single-table insert task (runs concurrently) ────────────────────────────
async def _insert_table_batch(
    db: FluxbaseClient,
    table: str,
    rows: list[dict],
    batch_num: int,
    worker_id: str,
) -> bool:
    """
    Inserts a batch of rows into one table.
    Returns True on success, False if sent to DLQ.
    """
    t_start = time.monotonic()

    try:
        result = await _with_retry(lambda: db.bulk_insert(table, rows))
        latency_ms = (time.monotonic() - t_start) * 1000

        metrics.record_success(len(rows), latency_ms)
        prom_latency.observe(latency_ms)
        rows_ingested_total.inc(len(rows), worker_id=worker_id, table=table)
        batches_total.inc(1, worker_id=worker_id, status="success")
        logger.info(
            "[%s] Batch %d → table=%s rows=%d latency=%.0fms → success",
            worker_id, batch_num, table, len(rows), latency_ms,
        )
        await queue.increment_stats("rows_inserted", len(rows))
        return True

    except FluxbaseRetryError as exc:
        latency_ms = (time.monotonic() - t_start) * 1000
        metrics.record_failure(len(rows), latency_ms)
        rows_failed_total.inc(len(rows), worker_id=worker_id)
        batches_total.inc(1, worker_id=worker_id, status="failed")
        logger.error(
            "[%s] Batch %d → table=%s FAILED after %d retries: %s — sending to DLQ",
            worker_id, batch_num, table, cfg.max_retries, exc,
        )
        await queue.push_dlq({"table": table, "rows": rows}, reason=str(exc))
        metrics.record_dlq(len(rows))
        rows_dlq_total.inc(len(rows), worker_id=worker_id)
        return False

    except FluxbaseError as exc:
        latency_ms = (time.monotonic() - t_start) * 1000
        metrics.record_failure(len(rows), latency_ms)
        rows_failed_total.inc(len(rows), worker_id=worker_id)
        batches_total.inc(1, worker_id=worker_id, status="failed")
        logger.error(
            "[%s] Batch %d → table=%s PERMANENT error: %s — DLQ",
            worker_id, batch_num, table, exc,
        )
        await queue.push_dlq({"table": table, "rows": rows}, reason=f"permanent: {exc}")
        metrics.record_dlq(len(rows))
        rows_dlq_total.inc(len(rows), worker_id=worker_id)
        return False


# ─── Worker coroutine ─────────────────────────────────────────────────────────
async def run_worker(worker_id: str, batch_counter: list[int]):
    """
    Single worker loop. Runs forever until cancelled.

    Flow:
      1. Check pause flag
      2. Dequeue a dynamic-sized batch from Redis
      3. Group rows by table
      4. Launch concurrent insert tasks (up to throttle.concurrency)
      5. Apply inter-batch delay if throttle says so
    """
    db = FluxbaseClient()
    logger.info("[%s] Worker started", worker_id)

    while True:
        try:
            # Pause / resume support
            if await queue.is_paused():
                logger.info("[%s] Paused — waiting 5s", worker_id)
                await asyncio.sleep(5)
                continue

            # Dequeue a batch
            batch_size = throttle.batch_size
            messages   = await queue.dequeue_batch(batch_size)
            if not messages:
                # Queue empty — short sleep to avoid tight loop
                await asyncio.sleep(0.1)
                continue

            batch_num = batch_counter[0]
            batch_counter[0] += 1

            # Group by target table
            groups = _group_by_table(messages)

            # Build concurrent insert tasks
            # Limit concurrency to throttle.concurrency
            tasks    = []
            sem      = asyncio.Semaphore(throttle.concurrency)

            async def _guarded_insert(table: str, rows: list[dict]):
                async with sem:
                    return await _insert_table_batch(db, table, rows, batch_num, worker_id)

            for table, rows in groups.items():
                tasks.append(asyncio.create_task(_guarded_insert(table, rows)))

            # Wait for all tables in this batch to complete
            await asyncio.gather(*tasks, return_exceptions=True)

            # Apply adaptive inter-batch delay
            delay_s = throttle.delay_ms / 1000.0
            if delay_s > 0:
                await asyncio.sleep(delay_s)

        except asyncio.CancelledError:
            logger.info("[%s] Cancelled — shutting down", worker_id)
            break
        except Exception as exc:
            # Catch-all: log and keep running
            logger.exception("[%s] Unexpected error in worker loop: %s", worker_id, exc)
            await asyncio.sleep(1)
