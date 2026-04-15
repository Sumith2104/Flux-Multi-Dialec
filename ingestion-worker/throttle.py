"""
throttle.py — Adaptive throughput controller.

Monitors live metrics and adjusts:
  - batch_size   (50–200)
  - concurrency  (1–10 per worker)
  - inter-batch delay (0–500ms)

Rules (evaluated every EVAL_INTERVAL_S seconds):
  1. failure_rate > 5%        → reduce batch_size 20%, add 200ms delay
  2. latency_avg > 2000ms     → reduce concurrent tasks by 1
  3. queue_depth > 1000       → increase batch_size 20%, increase concurrency
  4. all stable               → gradually increase batch_size toward max
"""

import asyncio
import logging
import time
from dataclasses import dataclass

from config import cfg
from metrics import metrics

logger = logging.getLogger(__name__)

EVAL_INTERVAL_S = 10      # Re-evaluate every 10 seconds
RAMP_UP_PCT     = 0.10    # Grow batch by 10% when stable
RAMP_DOWN_PCT   = 0.20    # Shrink batch by 20% on degradation


@dataclass
class ThrottleState:
    batch_size:    int   = cfg.initial_batch_size
    concurrency:   int   = 3           # concurrent insert tasks per worker
    delay_ms:      float = 0.0         # inter-batch delay in ms

    _stable_rounds: int  = 0           # consecutive stable evaluation rounds


class AdaptiveThrottle:
    """
    Shared state updated by the throttle loop;
    read by worker coroutines before each batch.
    """

    def __init__(self):
        self.state = ThrottleState()
        self._lock = asyncio.Lock()
        self._running = False

    @property
    def batch_size(self) -> int:
        return self.state.batch_size

    @property
    def concurrency(self) -> int:
        return self.state.concurrency

    @property
    def delay_ms(self) -> float:
        return self.state.delay_ms

    async def start(self, queue_depth_fn):
        """
        Start the background throttle evaluation loop.
        queue_depth_fn: async callable → int (current queue depth)
        """
        self._running = True
        asyncio.create_task(self._eval_loop(queue_depth_fn))

    async def stop(self):
        self._running = False

    async def _eval_loop(self, queue_depth_fn):
        logger.info("[Throttle] Adaptive throttle loop started")
        while self._running:
            await asyncio.sleep(EVAL_INTERVAL_S)
            try:
                await self._evaluate(queue_depth_fn)
            except Exception as exc:
                logger.warning("[Throttle] Eval error: %s", exc)

    async def _evaluate(self, queue_depth_fn):
        snap         = metrics.snapshot()
        failure_rate = snap["failure_rate_window"]
        latency_avg  = snap["latency_avg_ms"]
        queue_depth  = await queue_depth_fn()

        async with self._lock:
            s = self.state
            old = (s.batch_size, s.concurrency, round(s.delay_ms))
            degraded = False

            # Rule 1: High failure rate → reduce batch, slow down
            if failure_rate > cfg.failure_rate_threshold:
                s.batch_size  = max(cfg.min_batch_size, int(s.batch_size * (1 - RAMP_DOWN_PCT)))
                s.delay_ms    = min(500.0, s.delay_ms + 200.0)
                s._stable_rounds = 0
                degraded = True
                logger.warning("[Throttle] ↓ High failure rate %.1f%% → batch=%d delay=%dms",
                               failure_rate * 100, s.batch_size, s.delay_ms)

            # Rule 2: High latency → reduce concurrency
            if latency_avg > cfg.latency_threshold_ms:
                s.concurrency  = max(1, s.concurrency - 1)
                s._stable_rounds = 0
                degraded = True
                logger.warning("[Throttle] ↓ High latency %.0fms → concurrency=%d", latency_avg, s.concurrency)

            # Rule 3: Backlog building → scale up aggressively
            if queue_depth > cfg.backlog_scale_up_threshold and not degraded:
                s.batch_size  = min(cfg.max_batch_size, int(s.batch_size * (1 + RAMP_UP_PCT * 2)))
                s.concurrency = min(10, s.concurrency + 1)
                s.delay_ms    = max(0.0, s.delay_ms - 50.0)
                logger.info("[Throttle] ↑ Backlog %d → batch=%d concurrency=%d", queue_depth, s.batch_size, s.concurrency)

            # Rule 4: Stable → gradual ramp up
            elif not degraded:
                s._stable_rounds += 1
                if s._stable_rounds >= 3:   # 30 stable seconds
                    s.batch_size  = min(cfg.max_batch_size, int(s.batch_size * (1 + RAMP_UP_PCT)))
                    s.delay_ms    = max(0.0, s.delay_ms - 25.0)
                    s.concurrency = min(10, s.concurrency + 1) if queue_depth > 200 else s.concurrency
                    s._stable_rounds = 0

            new = (s.batch_size, s.concurrency, round(s.delay_ms))
            if old != new:
                logger.info("[Throttle] State change: batch=%d→%d concurrency=%d→%d delay=%d→%dms",
                            old[0], new[0], old[1], new[1], old[2], new[2])


# Shared singleton
throttle = AdaptiveThrottle()
