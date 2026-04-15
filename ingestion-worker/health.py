"""
health.py — HTTP health + observability server.

Endpoints:
  GET /health        → JSON { status, metrics, throttle, queue, workers }
  GET /metrics       → Prometheus text exposition (scrape target)
  GET /pause         → Pauses all workers
  GET /resume        → Resumes workers
  GET /scale/up      → Force +1 worker (manual override)
  GET /scale/down    → Force -1 worker

The /metrics endpoint is designed to be scraped by:
  - Prometheus
  - Grafana Agent
  - Grafana Cloud (via remote_write)
  - Any OpenMetrics consumer
"""

import asyncio
import json
import logging
from aiohttp import web

from config import cfg
from metrics import metrics
from prometheus_metrics import (
    prom,
    queue_depth as prom_queue_depth,
    rows_per_second as prom_rows_ps,
    failure_rate as prom_failure_rate,
    batch_size_current as prom_batch_size,
    concurrency_current as prom_concurrency,
)
from queue_client import queue
from throttle import throttle

logger = logging.getLogger(__name__)

# Scaler reference (set by main.py after init)
_scaler = None

def set_scaler(s):
    global _scaler
    _scaler = s


# ─── Endpoint handlers ────────────────────────────────────────────────────────
async def _health(request: web.Request) -> web.Response:
    depth_info = await queue.queue_depth()
    snap = metrics.snapshot()

    # Push latest values into Prometheus gauges before serving
    prom_rows_ps.set(snap["rows_per_second"])
    prom_failure_rate.set(snap["failure_rate_window"])
    prom_batch_size.set(throttle.batch_size)
    prom_concurrency.set(throttle.concurrency)
    for q_name, count in depth_info.items():
        if q_name != "total":
            prom_queue_depth.set(count, queue=q_name)

    body = {
        "status":    "ok",
        "worker_id": cfg.worker_id,
        "paused":    await queue.is_paused(),
        "metrics":   snap,
        "throttle": {
            "batch_size":  throttle.batch_size,
            "concurrency": throttle.concurrency,
            "delay_ms":    throttle.delay_ms,
        },
        "queue": depth_info,
        "workers": getattr(_scaler, "current_count", cfg.num_workers),
    }
    return web.Response(
        text=json.dumps(body, indent=2),
        content_type="application/json",
        status=200,
    )


async def _prometheus_metrics(request: web.Request) -> web.Response:
    """
    Prometheus text format endpoint — scrape every 15s.

    prometheus.yml:
      scrape_configs:
        - job_name: 'ingestion_worker'
          static_configs:
            - targets: ['worker-host:8080']
          metrics_path: /metrics
          scrape_interval: 15s
    """
    snap = metrics.snapshot()
    depth_info = await queue.queue_depth()

    # Sync all gauges with latest values
    prom_rows_ps.set(snap["rows_per_second"])
    prom_failure_rate.set(snap["failure_rate_window"])
    prom_batch_size.set(throttle.batch_size)
    prom_concurrency.set(throttle.concurrency)
    for q_name, count in depth_info.items():
        if q_name != "total":
            prom_queue_depth.set(count, queue=q_name)

    text = prom.render_all()
    return web.Response(
        text=text,
        content_type="text/plain; version=0.0.4; charset=utf-8",
        status=200,
    )


async def _pause(request: web.Request) -> web.Response:
    await queue.pause()
    logger.warning("[Health] Workers PAUSED")
    return web.Response(text='{"ok":true,"status":"paused"}', content_type="application/json")


async def _resume(request: web.Request) -> web.Response:
    await queue.resume()
    logger.info("[Health] Workers RESUMED")
    return web.Response(text='{"ok":true,"status":"running"}', content_type="application/json")


async def _scale_up(request: web.Request) -> web.Response:
    if _scaler and hasattr(_scaler, "_spawn"):
        _scaler._spawn()
        return web.Response(text=json.dumps({"ok": True, "workers": _scaler.current_count}),
                            content_type="application/json")
    return web.Response(text='{"ok":false,"error":"scaler not available"}',
                        content_type="application/json", status=400)


async def _scale_down(request: web.Request) -> web.Response:
    if _scaler and hasattr(_scaler, "_terminate_one"):
        _scaler._terminate_one()
        return web.Response(text=json.dumps({"ok": True, "workers": _scaler.current_count}),
                            content_type="application/json")
    return web.Response(text='{"ok":false,"error":"scaler not available"}',
                        content_type="application/json", status=400)


# ─── Server ───────────────────────────────────────────────────────────────────
async def run_health_server():
    app = web.Application()
    app.router.add_get("/health",     _health)
    app.router.add_get("/metrics",    _prometheus_metrics)
    app.router.add_get("/pause",      _pause)
    app.router.add_get("/resume",     _resume)
    app.router.add_get("/scale/up",   _scale_up)
    app.router.add_get("/scale/down", _scale_down)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", cfg.health_port)
    await site.start()
    logger.info("[Health] Server listening on http://0.0.0.0:%d", cfg.health_port)
    logger.info("[Health] Prometheus: http://0.0.0.0:%d/metrics", cfg.health_port)

    try:
        while True:
            await asyncio.sleep(3600)
    finally:
        await runner.cleanup()
