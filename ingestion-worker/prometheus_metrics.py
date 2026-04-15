"""
prometheus_metrics.py — Prometheus exposition format metrics.

Exposes all ingestion metrics as Prometheus counters, gauges, and histograms.
The /metrics endpoint on the health server serves this output.

Compatible with:
  - Prometheus scrape config
  - Grafana Cloud agent
  - Any OpenMetrics consumer
"""

import time
import threading
from typing import Dict, List

# ─── Manual Prometheus text format (no extra library dependency) ──────────────
# We implement the exposition format ourselves so workers need zero extra deps.


class Counter:
    def __init__(self, name: str, help_text: str, labels: List[str] = []):
        self.name = name
        self.help = help_text
        self.labels = labels
        self._values: Dict[tuple, float] = {}
        self._lock = threading.Lock()

    def inc(self, amount: float = 1.0, **label_values):
        key = tuple(label_values.get(l, "") for l in self.labels)
        with self._lock:
            self._values[key] = self._values.get(key, 0.0) + amount

    def render(self) -> str:
        lines = [f"# HELP {self.name} {self.help}", f"# TYPE {self.name} counter"]
        with self._lock:
            for key, val in self._values.items():
                label_str = self._format_labels(key)
                lines.append(f"{self.name}{label_str} {val}")
        if not self._values:
            lines.append(f"{self.name} 0")
        return "\n".join(lines)

    def _format_labels(self, key: tuple) -> str:
        if not self.labels:
            return ""
        pairs = ",".join(f'{l}="{v}"' for l, v in zip(self.labels, key))
        return "{" + pairs + "}"


class Gauge:
    def __init__(self, name: str, help_text: str, labels: List[str] = []):
        self.name = name
        self.help = help_text
        self.labels = labels
        self._values: Dict[tuple, float] = {}
        self._lock = threading.Lock()

    def set(self, value: float, **label_values):
        key = tuple(label_values.get(l, "") for l in self.labels)
        with self._lock:
            self._values[key] = value

    def render(self) -> str:
        lines = [f"# HELP {self.name} {self.help}", f"# TYPE {self.name} gauge"]
        with self._lock:
            for key, val in self._values.items():
                label_str = self._format_labels(key)
                lines.append(f"{self.name}{label_str} {val}")
        if not self._values:
            lines.append(f"{self.name} 0")
        return "\n".join(lines)

    def _format_labels(self, key: tuple) -> str:
        if not self.labels:
            return ""
        pairs = ",".join(f'{l}="{v}"' for l, v in zip(self.labels, key))
        return "{" + pairs + "}"


class Histogram:
    """Simplified histogram — tracks sum, count, and fixed buckets."""
    BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2000, 5000, float("inf")]

    def __init__(self, name: str, help_text: str):
        self.name = name
        self.help = help_text
        self._sum = 0.0
        self._count = 0
        self._buckets: Dict[float, int] = {b: 0 for b in self.BUCKETS}
        self._lock = threading.Lock()

    def observe(self, value: float):
        with self._lock:
            self._sum += value
            self._count += 1
            for b in self.BUCKETS:
                if value <= b:
                    self._buckets[b] += 1

    def render(self) -> str:
        lines = [f"# HELP {self.name} {self.help}", f"# TYPE {self.name} histogram"]
        with self._lock:
            cumulative = 0
            for b, count in self._buckets.items():
                cumulative += count
                le = "+Inf" if b == float("inf") else str(b)
                lines.append(f'{self.name}_bucket{{le="{le}"}} {cumulative}')
            lines.append(f"{self.name}_sum {self._sum}")
            lines.append(f"{self.name}_count {self._count}")
        return "\n".join(lines)


# ─── Registry ─────────────────────────────────────────────────────────────────
class Registry:
    def __init__(self):
        self._metrics: List = []

    def register(self, metric):
        self._metrics.append(metric)
        return metric

    def render_all(self) -> str:
        ts = int(time.time() * 1000)
        parts = [m.render() for m in self._metrics]
        return "\n".join(parts) + "\n"


prom = Registry()

# ─── Ingestion counters ───────────────────────────────────────────────────────
rows_ingested_total = prom.register(Counter(
    "ingestion_rows_ingested_total",
    "Total rows successfully inserted into Fluxbase",
    labels=["worker_id", "table"],
))
rows_failed_total = prom.register(Counter(
    "ingestion_rows_failed_total",
    "Total rows that failed (including retries exhausted)",
    labels=["worker_id"],
))
rows_dlq_total = prom.register(Counter(
    "ingestion_rows_dlq_total",
    "Total rows pushed to dead letter queue",
    labels=["worker_id"],
))
batches_total = prom.register(Counter(
    "ingestion_batches_total",
    "Total batches processed",
    labels=["worker_id", "status"],
))

# ─── Latency histogram ───────────────────────────────────────────────────────
insert_latency_ms = prom.register(Histogram(
    "ingestion_insert_latency_ms",
    "Latency of Fluxbase bulk insert requests in milliseconds",
))

# ─── Gauges ──────────────────────────────────────────────────────────────────
queue_depth = prom.register(Gauge(
    "ingestion_queue_depth",
    "Current number of messages in the Redis queue",
    labels=["queue"],
))
worker_count = prom.register(Gauge(
    "ingestion_worker_count",
    "Number of active worker coroutines",
))
batch_size_current = prom.register(Gauge(
    "ingestion_batch_size_current",
    "Current adaptive batch size",
))
concurrency_current = prom.register(Gauge(
    "ingestion_concurrency_current",
    "Current adaptive concurrency level",
))
rows_per_second = prom.register(Gauge(
    "ingestion_rows_per_second",
    "Rolling rows/sec over the last 60 seconds",
))
failure_rate = prom.register(Gauge(
    "ingestion_failure_rate",
    "Rolling failure rate over the last 60 seconds (0.0–1.0)",
))
