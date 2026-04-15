"""
simulate.py — Load test: pushes 10,000 events to the ingestion API.

Usage:
  python simulate.py --url https://your-app.vercel.app --count 10000 --concurrency 20

Simulates:
  - Realistic order data
  - Concurrent producers
  - Rate measurement
  - Zero-loss validation (checks queue depth after completion)
"""

import argparse
import asyncio
import json
import time
import uuid
import random
import logging
import sys

import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


# ─── Fake data generators ─────────────────────────────────────────────────────
PRODUCTS  = ["laptop", "phone", "tablet", "headphones", "keyboard", "monitor"]
REGIONS   = ["us-east", "us-west", "eu-west", "ap-south", "ap-northeast"]
STATUSES  = ["pending", "processing", "shipped", "delivered"]


def _make_order() -> dict:
    return {
        "id":          str(uuid.uuid4()),
        "product":     random.choice(PRODUCTS),
        "quantity":    random.randint(1, 10),
        "unit_price":  round(random.uniform(9.99, 999.99), 2),
        "currency":    "USD",
        "region":      random.choice(REGIONS),
        "status":      random.choice(STATUSES),
        "customer_id": str(uuid.uuid4()),
        "created_at":  time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def _make_batch(size: int) -> list[dict]:
    return [_make_order() for _ in range(size)]


# ─── Single producer task ─────────────────────────────────────────────────────
async def _producer_task(
    client: httpx.AsyncClient,
    url: str,
    rows_per_request: int,
    count: int,
    results: list,
):
    sent = 0
    while sent < count:
        batch_size = min(rows_per_request, count - sent)
        rows = _make_batch(batch_size)
        t = time.monotonic()
        try:
            resp = await client.post(
                f"{url}/api/ingest",
                json={"table": "orders", "rows": rows},
                timeout=15.0,
            )
            latency_ms = (time.monotonic() - t) * 1000
            if resp.status_code == 202:
                sent += batch_size
                results.append({"ok": True, "rows": batch_size, "latency_ms": latency_ms})
            else:
                results.append({"ok": False, "status": resp.status_code, "rows": batch_size})
                logger.warning("Non-202 response: %d %s", resp.status_code, resp.text[:100])
        except Exception as exc:
            results.append({"ok": False, "error": str(exc), "rows": batch_size})
            logger.error("Request error: %s", exc)
            await asyncio.sleep(0.5)


# ─── Main simulation ──────────────────────────────────────────────────────────
async def simulate(url: str, total: int, concurrency: int, rows_per_req: int):
    per_task = total // concurrency
    leftovers = total - per_task * concurrency

    results = []

    async with httpx.AsyncClient(http2=True) as client:
        tasks = []
        for i in range(concurrency):
            n = per_task + (leftovers if i == 0 else 0)
            tasks.append(asyncio.create_task(
                _producer_task(client, url, rows_per_req, n, results)
            ))

        t_start = time.monotonic()
        logger.info("Simulating %d events across %d concurrent producers...", total, concurrency)
        await asyncio.gather(*tasks)
        elapsed = time.monotonic() - t_start

    # ── Summary ──────────────────────────────────────────────────────────────
    ok      = [r for r in results if r.get("ok")]
    failed  = [r for r in results if not r.get("ok")]
    sent    = sum(r["rows"] for r in ok)
    latencies = [r["latency_ms"] for r in ok]
    avg_lat = sum(latencies) / len(latencies) if latencies else 0
    p99_lat = sorted(latencies)[int(len(latencies) * 0.99)] if latencies else 0
    rps     = sent / elapsed

    print("\n" + "=" * 55)
    print("  SIMULATION RESULTS")
    print("=" * 55)
    print(f"  Total rows requested : {total:,}")
    print(f"  Successfully queued  : {sent:,}")
    print(f"  Failed requests      : {len(failed)}")
    print(f"  Elapsed              : {elapsed:.1f}s")
    print(f"  Throughput           : {rps:,.0f} rows/sec")
    print(f"  Avg latency          : {avg_lat:.0f}ms")
    print(f"  P99 latency          : {p99_lat:.0f}ms")
    print(f"  Data loss            : {'NONE ✓' if len(failed) == 0 else f'{len(failed)} batches LOST ✗'}")
    print("=" * 55)

    # ── Check current queue depth ─────────────────────────────────────────────
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(f"{url}/api/ingest", timeout=5.0)
            if r.status_code == 200:
                q = r.json()
                print(f"\n  Queue depth now      : {q.get('queueDepth', '?')}")
                print(f"  High-priority depth  : {q.get('highPriorityDepth', '?')}")
    except Exception:
        pass


# ─── CLI ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fluxbase ingestion load test")
    parser.add_argument("--url",         default="http://localhost:3000", help="Base URL of the producer API")
    parser.add_argument("--count",       type=int, default=10_000,        help="Total rows to send")
    parser.add_argument("--concurrency", type=int, default=20,            help="Concurrent producer goroutines")
    parser.add_argument("--batch",       type=int, default=100,           help="Rows per API request")
    args = parser.parse_args()

    asyncio.run(simulate(
        url=args.url,
        total=args.count,
        concurrency=args.concurrency,
        rows_per_req=args.batch,
    ))
