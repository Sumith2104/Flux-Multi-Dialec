"""
config.py — Centralised configuration for the ingestion worker system.
All values are sourced from environment variables with sensible defaults.
"""

import os
from dataclasses import dataclass, field


@dataclass
class Config:
    # ── Upstash Redis (REST API — works on all platforms) ────────────────────
    upstash_rest_url: str = field(
        default_factory=lambda: os.environ["UPSTASH_REDIS_REST_URL"]
    )
    upstash_rest_token: str = field(
        default_factory=lambda: os.environ["UPSTASH_REDIS_REST_TOKEN"]
    )

    queue_key: str    = "orders_queue"
    queue_key_high: str = "orders_queue:high"
    dlq_key: str      = "orders_dlq"
    stats_key: str    = "ingestion:stats"

    # ── Fluxbase REST API ────────────────────────────────────────────────────
    fluxbase_url: str = field(default_factory=lambda: os.environ.get(
        "FLUXBASE_API_URL", "https://fluxbase.vercel.app"
    ))
    fluxbase_api_key: str = field(default_factory=lambda: os.environ["FLUXBASE_API_KEY"])
    fluxbase_project_id: str = field(default_factory=lambda: os.environ["FLUXBASE_PROJECT_ID"])

    # ── Worker tuning ────────────────────────────────────────────────────────
    worker_id: str = field(default_factory=lambda: os.environ.get("WORKER_ID", "worker-1"))
    num_workers: int = field(default_factory=lambda: int(os.environ.get("NUM_WORKERS", "5")))

    min_batch_size: int = 50
    max_batch_size: int = 200
    initial_batch_size: int = 100

    # How long BRPOP waits for an item (seconds)
    dequeue_timeout: int = 2

    # ── Retry policy ─────────────────────────────────────────────────────────
    max_retries: int = 5
    base_backoff_ms: int = 100          # doubles each retry: 100→200→400→800ms

    # ── Adaptive throttle thresholds ─────────────────────────────────────────
    # Reduce batch size if failure rate exceeds this
    failure_rate_threshold: float = 0.05    # 5%
    # Reduce concurrency if API latency exceeds this (ms)
    latency_threshold_ms: float = 2000.0
    # Scale up if queue depth exceeds this
    backlog_scale_up_threshold: int = 1000

    # ── Health check server ──────────────────────────────────────────────────
    health_port: int = field(default_factory=lambda: int(os.environ.get("PORT", "8080")))

    # ── Control plane ────────────────────────────────────────────────────────
    pause_key: str = "ingestion:paused"     # set to "1" in Redis to pause all workers


# Singleton
cfg = Config()
