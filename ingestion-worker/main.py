"""
main.py — Worker process entry point.

Starts:
  - Auto-scaler (queue-depth driven, spawns/cancels worker tasks)
  - Adaptive throttle evaluation loop
  - Health + Prometheus metrics HTTP server
  - Periodic log reporter

Handles graceful shutdown on SIGINT / SIGTERM.
"""

import asyncio
import logging
import signal
import sys

from config import cfg
from health import run_health_server, set_scaler
from metrics import metrics
from queue_client import queue
from scaler import make_scaler, run_scaler_loop
from throttle import throttle
from worker import run_worker

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ─── Metrics reporter ─────────────────────────────────────────────────────────
async def _metrics_reporter(scaler, interval_s: int = 60):
    while True:
        await asyncio.sleep(interval_s)
        snap  = metrics.snapshot()
        depth = await queue.queue_depth()
        count = getattr(scaler, "current_count", cfg.num_workers)
        logger.info(
            "[METRICS] rows/s=%.1f | batches=%d | ingested=%d | failed=%d | "
            "dlq=%d | fail_rate=%.1f%% | lat_p99=%.0fms | "
            "queue=%d | workers=%d | batch_sz=%d | concurrency=%d",
            snap.get("rows_per_sec", 0),
            snap["batches_total"],
            snap["rows_ingested_total"],
            snap["rows_failed_total"],
            snap["dlq_pushes_total"],
            snap["failure_rate_window"] * 100,
            snap["latency_p99_ms"],
            depth["total"],
            count,
            throttle.batch_size,
            throttle.concurrency,
        )


# ─── Main ─────────────────────────────────────────────────────────────────────
async def main():
    logger.info("=" * 65)
    logger.info("  Fluxbase Ingestion Worker — Production Mode")
    logger.info("  Worker ID     : %s", cfg.worker_id)
    logger.info("  Initial workers: %d (auto-scales to %d)",
                cfg.num_workers, cfg.num_workers)
    logger.info("  Batch size    : %d–%d", cfg.min_batch_size, cfg.max_batch_size)
    logger.info("  Fluxbase URL  : %s", cfg.fluxbase_url)
    logger.info("=" * 65)

    # Connect to Redis
    await queue.connect()

    # Shared batch counter
    batch_counter = [0]

    # ── Auto-scaler ──────────────────────────────────────────────────────────
    scaler = make_scaler(worker_factory=run_worker, batch_counter=batch_counter)
    set_scaler(scaler)

    # Spawn initial minimum workers
    if hasattr(scaler, "ensure_minimum"):
        await scaler.ensure_minimum()
    
    logger.info("[Main] Started %d workers", getattr(scaler, "current_count", cfg.num_workers))

    # ── Queue depth probe ────────────────────────────────────────────────────
    async def _depth():
        d = await queue.queue_depth()
        return d["total"]

    # ── Adaptive throttle ────────────────────────────────────────────────────
    await throttle.start(_depth)

    # ── Background tasks ─────────────────────────────────────────────────────
    scaler_task   = asyncio.create_task(run_scaler_loop(scaler, _depth), name="scaler")
    health_task   = asyncio.create_task(run_health_server(),             name="health")
    reporter_task = asyncio.create_task(_metrics_reporter(scaler),       name="reporter")

    support_tasks = [scaler_task, health_task, reporter_task]

    # ── Graceful shutdown ─────────────────────────────────────────────────────
    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def _handle_signal():
        logger.info("Shutdown signal received — graceful drain starting...")
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _handle_signal)
        except NotImplementedError:
            pass  # Windows

    await shutdown_event.wait()

    # Cancel everything
    logger.info("Cancelling support tasks...")
    for t in support_tasks:
        t.cancel()

    logger.info("Draining worker tasks...")
    if hasattr(scaler, "cancel_all"):
        await scaler.cancel_all()

    await asyncio.gather(*support_tasks, return_exceptions=True)
    await queue.close()
    await throttle.stop()

    # Final stats
    snap = metrics.snapshot()
    logger.info("=" * 65)
    logger.info("  FINAL STATS")
    logger.info("  Ingested : %d rows", snap["rows_ingested_total"])
    logger.info("  Failed   : %d rows", snap["rows_failed_total"])
    logger.info("  DLQ      : %d rows", snap["dlq_pushes_total"])
    logger.info("  Batches  : %d", snap["batches_total"])
    logger.info("=" * 65)
    logger.info("Worker process exited cleanly.")


if __name__ == "__main__":
    asyncio.run(main())
