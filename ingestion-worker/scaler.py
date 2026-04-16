"""
scaler.py — Queue-depth-driven auto-scaler.

Monitors queue depth every EVAL_INTERVAL_S seconds and:
  - Spawns new worker asyncio tasks when queue builds up
  - Cancels idle worker tasks when queue is empty

Works in two modes (controlled by env var SCALER_MODE):
  "process"  — in-process asyncio task scaling (default, works everywhere)
  "flyio"    — calls Fly.io Machines API to add/remove VMs

Scale rules:
  depth > HIGH_WATERMARK  → add workers (up to MAX_WORKERS)
  depth < LOW_WATERMARK   → remove workers (down to MIN_WORKERS)
  consecutive stable      → hold current level

This gives true cloud-native elastic scaling with zero human intervention.
"""

import asyncio
import logging
import os
import time
from typing import Callable, Coroutine

import httpx

from config import cfg
from prometheus_metrics import worker_count as prom_worker_count

logger = logging.getLogger(__name__)

# ─── Scaling thresholds ───────────────────────────────────────────────────────
HIGH_WATERMARK    = int(os.environ.get("SCALE_UP_THRESHOLD",   "500"))   # depth → add worker
LOW_WATERMARK     = int(os.environ.get("SCALE_DOWN_THRESHOLD", "50"))    # depth → remove worker
MIN_WORKERS       = int(os.environ.get("MIN_WORKERS",          "1"))
MAX_WORKERS       = int(os.environ.get("MAX_WORKERS",          "20"))
EVAL_INTERVAL_S   = int(os.environ.get("SCALE_EVAL_INTERVAL",  "30"))
STABLE_ROUNDS_DOWN = 3    # require N stable rounds before scaling down (hysteresis)

SCALER_MODE = os.environ.get("SCALER_MODE", "process")   # "process" | "flyio"

# Fly.io config (only needed when SCALER_MODE=flyio)
FLY_APP_NAME   = os.environ.get("FLY_APP_NAME", "")
FLY_API_TOKEN  = os.environ.get("FLY_API_TOKEN", "")
FLY_REGION     = os.environ.get("FLY_PRIMARY_REGION", "ord")
FLY_IMAGE      = os.environ.get("FLY_IMAGE", "")


# ─── In-process scaler ────────────────────────────────────────────────────────
class ProcessScaler:
    """
    Manages worker asyncio tasks within the current process.
    Scales by creating or cancelling tasks.
    """

    def __init__(
        self,
        worker_factory: Callable[[str, list], Coroutine],
        batch_counter: list[int],
    ):
        self._factory = worker_factory
        self._batch_counter = batch_counter
        self._tasks: dict[str, asyncio.Task] = {}   # worker_id → Task
        self._stable_low_rounds = 0
        self._running = False

    @property
    def current_count(self) -> int:
        # Prune finished tasks
        self._tasks = {wid: t for wid, t in self._tasks.items() if not t.done()}
        return len(self._tasks)

    def _next_worker_id(self) -> str:
        existing = set(self._tasks.keys())
        i = 1
        while f"{cfg.worker_id}-{i}" in existing:
            i += 1
        return f"{cfg.worker_id}-{i}"

    def _spawn(self):
        wid = self._next_worker_id()
        task = asyncio.create_task(
            self._factory(wid, self._batch_counter),
            name=wid,
        )
        self._tasks[wid] = task
        logger.info("[Scaler] ↑ Spawned worker %s (total=%d)", wid, self.current_count)

    def _terminate_one(self):
        if not self._tasks:
            return
        # Cancel the most recently created worker (LIFO)
        wid = list(self._tasks.keys())[-1]
        self._tasks[wid].cancel()
        del self._tasks[wid]
        logger.info("[Scaler] ↓ Terminated worker %s (total=%d)", wid, self.current_count)

    async def ensure_minimum(self):
        """Call once at startup to spawn MIN_WORKERS."""
        while self.current_count < MIN_WORKERS:
            self._spawn()
        prom_worker_count.set(self.current_count)

    async def evaluate(self, depth: int):
        count = self.current_count
        prom_worker_count.set(count)

        if depth > HIGH_WATERMARK and count < MAX_WORKERS:
            # Scale up — add one worker per evaluation cycle
            # (gradual to avoid thundering herd)
            workers_to_add = min(
                MAX_WORKERS - count,
                max(1, (depth // HIGH_WATERMARK)),  # aggressive if very deep
            )
            for _ in range(workers_to_add):
                if self.current_count < MAX_WORKERS:
                    self._spawn()
            self._stable_low_rounds = 0
            logger.info("[Scaler] ↑ Scale UP: depth=%d workers=%d", depth, self.current_count)

        elif depth < LOW_WATERMARK and count > MIN_WORKERS:
            self._stable_low_rounds += 1
            if self._stable_low_rounds >= STABLE_ROUNDS_DOWN:
                self._terminate_one()
                self._stable_low_rounds = 0
                logger.info("[Scaler] ↓ Scale DOWN: depth=%d workers=%d", depth, self.current_count)
        else:
            self._stable_low_rounds = 0

    async def cancel_all(self):
        for task in self._tasks.values():
            task.cancel()
        await asyncio.gather(*self._tasks.values(), return_exceptions=True)


# ─── Fly.io scaler ────────────────────────────────────────────────────────────
class FlyScaler:
    """
    Scales by calling the Fly.io Machines API.
    Each 'machine' is a full VM running this worker image.
    Requires FLY_APP_NAME, FLY_API_TOKEN, FLY_IMAGE env vars.

    API docs: https://fly.io/docs/machines/api/
    """

    BASE_URL = "https://api.machines.dev/v1"

    def __init__(self):
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={"Authorization": f"Bearer {FLY_API_TOKEN}"},
            timeout=15.0,
        )
        self._stable_low_rounds = 0

    async def _list_machines(self) -> list[dict]:
        r = await self._client.get(f"/apps/{FLY_APP_NAME}/machines")
        r.raise_for_status()
        return r.json()

    async def _current_count(self) -> int:
        machines = await self._list_machines()
        return sum(1 for m in machines if m.get("state") == "started")

    async def _scale_up(self):
        """Create one new Fly machine."""
        payload = {
            "region": FLY_REGION,
            "config": {
                "image": FLY_IMAGE,
                "env": {
                    "NUM_WORKERS": "3",
                    "SCALER_MODE": "flyio",
                },
                "services": [{
                    "ports": [{"port": 8080, "handlers": ["http"]}],
                    "protocol": "tcp",
                    "internal_port": 8080,
                }],
                "auto_destroy": True,
            },
        }
        r = await self._client.post(f"/apps/{FLY_APP_NAME}/machines", json=payload)
        r.raise_for_status()
        machine_id = r.json().get("id")
        logger.info("[FlyScaler] ↑ Created machine %s", machine_id)

    async def _scale_down(self):
        """Destroy the most recently created machine."""
        machines = await self._list_machines()
        started = [m for m in machines if m.get("state") == "started"]
        if len(started) <= MIN_WORKERS:
            return
        # Destroy the last one
        target = started[-1]["id"]
        await self._client.delete(f"/apps/{FLY_APP_NAME}/machines/{target}?force=true")
        logger.info("[FlyScaler] ↓ Destroyed machine %s", target)

    async def evaluate(self, depth: int):
        try:
            count = await self._current_count()
            prom_worker_count.set(count)

            if depth > HIGH_WATERMARK and count < MAX_WORKERS:
                await self._scale_up()
                self._stable_low_rounds = 0
                logger.info("[FlyScaler] ↑ Scale UP: depth=%d machines=%d", depth, count + 1)

            elif depth < LOW_WATERMARK and count > MIN_WORKERS:
                self._stable_low_rounds += 1
                if self._stable_low_rounds >= STABLE_ROUNDS_DOWN:
                    await self._scale_down()
                    self._stable_low_rounds = 0
            else:
                self._stable_low_rounds = 0
        except Exception as exc:
            logger.warning("[FlyScaler] Eval error: %s", exc)

    async def cancel_all(self):
        await self._client.aclose()


# ─── Scaler loop ─────────────────────────────────────────────────────────────
async def run_scaler_loop(
    scaler,
    queue_depth_fn: Callable[[], Coroutine],
):
    """
    Background coroutine: evaluates scale decisions every EVAL_INTERVAL_S.
    """
    logger.info("[Scaler] Auto-scaler started (mode=%s high=%d low=%d min=%d max=%d)",
                SCALER_MODE, HIGH_WATERMARK, LOW_WATERMARK, MIN_WORKERS, MAX_WORKERS)
    while True:
        await asyncio.sleep(EVAL_INTERVAL_S)
        try:
            depth = await queue_depth_fn()
            await scaler.evaluate(depth)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("[Scaler] Loop error: %s", exc)


def make_scaler(worker_factory=None, batch_counter=None):
    if SCALER_MODE == "flyio":
        return FlyScaler()
    return ProcessScaler(worker_factory, batch_counter)
