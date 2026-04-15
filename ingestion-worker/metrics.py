"""
metrics.py — In-process metrics tracker with rolling window statistics.
Thread-safe, zero external dependencies.
"""

import time
import threading
from collections import deque
from dataclasses import dataclass, field
from typing import Deque


@dataclass
class Sample:
    ts: float
    rows: int
    latency_ms: float
    success: bool


class MetricsTracker:
    """
    Tracks ingestion metrics over a rolling window.
    All public methods are thread-safe.
    """

    def __init__(self, window_seconds: int = 60):
        self._lock = threading.Lock()
        self._window = window_seconds

        self._samples: Deque[Sample] = deque()

        # Cumulative counters (never reset)
        self.total_rows_ingested: int = 0
        self.total_rows_failed: int = 0
        self.total_batches: int = 0
        self.total_dlq_pushes: int = 0

        self._started_at = time.monotonic()

    def record_success(self, rows: int, latency_ms: float):
        with self._lock:
            self._samples.append(Sample(time.monotonic(), rows, latency_ms, True))
            self.total_rows_ingested += rows
            self.total_batches += 1
            self._evict()

    def record_failure(self, rows: int, latency_ms: float):
        with self._lock:
            self._samples.append(Sample(time.monotonic(), rows, latency_ms, False))
            self.total_rows_failed += rows
            self.total_batches += 1
            self._evict()

    def record_dlq(self, rows: int):
        with self._lock:
            self.total_dlq_pushes += rows

    def _evict(self):
        cutoff = time.monotonic() - self._window
        while self._samples and self._samples[0].ts < cutoff:
            self._samples.popleft()

    def snapshot(self) -> dict:
        with self._lock:
            self._evict()
            samples = list(self._samples)

        if not samples:
            return self._empty_snapshot()

        window_s = min(self._window, time.monotonic() - self._started_at) or 1
        success_samples = [s for s in samples if s.success]
        fail_samples    = [s for s in samples if not s.success]

        rows_in_window   = sum(s.rows for s in success_samples)
        rows_per_sec     = rows_in_window / window_s

        latencies        = [s.latency_ms for s in success_samples] or [0]
        avg_latency      = sum(latencies) / len(latencies)
        p99_latency      = sorted(latencies)[int(len(latencies) * 0.99)]

        total            = len(samples)
        failure_rate     = len(fail_samples) / total if total else 0

        return {
            "rows_per_sec":          round(rows_per_sec, 1),
            "batches_total":         self.total_batches,
            "rows_ingested_total":   self.total_rows_ingested,
            "rows_failed_total":     self.total_rows_failed,
            "dlq_pushes_total":      self.total_dlq_pushes,
            "failure_rate_window":   round(failure_rate, 4),
            "latency_avg_ms":        round(avg_latency, 1),
            "latency_p99_ms":        round(p99_latency, 1),
            "window_seconds":        self._window,
        }

    def _empty_snapshot(self) -> dict:
        return {
            "rows_per_sec": 0,
            "batches_total": self.total_batches,
            "rows_ingested_total": self.total_rows_ingested,
            "rows_failed_total": self.total_rows_failed,
            "dlq_pushes_total": self.total_dlq_pushes,
            "failure_rate_window": 0,
            "latency_avg_ms": 0,
            "latency_p99_ms": 0,
            "window_seconds": self._window,
        }


# Shared singleton used by all workers in this process
metrics = MetricsTracker(window_seconds=60)
