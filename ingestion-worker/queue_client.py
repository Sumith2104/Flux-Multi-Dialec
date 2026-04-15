"""
queue_client.py — Async Redis queue wrapper using redis-py (asyncio).

Supports:
  - LPUSH (enqueue)
  - BRPOP  (blocking dequeue with timeout)
  - LLEN   (depth probe)
  - DLQ push
  - Pause/resume via control key

Uses a connection pool for efficiency across many concurrent workers.
"""

import asyncio
import json
import logging
from typing import Optional

import redis.asyncio as aioredis

from config import cfg

logger = logging.getLogger(__name__)


class QueueClient:
    """
    Async wrapper around Redis lists for the ingestion queue.

    Queue model (FIFO):
      Producer:  LPUSH queue_key  message
      Consumer:  BRPOP queue_key  (pops from right → FIFO)

    High-priority queue is checked first.
    """

    def __init__(self):
        self._pool: Optional[aioredis.Redis] = None

    async def connect(self):
        self._pool = await aioredis.from_url(
            cfg.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=cfg.num_workers * 2 + 4,
            socket_keepalive=True,
            socket_connect_timeout=5,
            retry_on_timeout=True,
        )
        # Ping to verify connectivity at startup
        await self._pool.ping()
        logger.info("[Queue] Redis connection pool established")

    async def close(self):
        if self._pool:
            await self._pool.aclose()

    # ── Enqueue ──────────────────────────────────────────────────────────────
    async def enqueue(self, message: dict, high_priority: bool = False) -> int:
        key = cfg.queue_key_high if high_priority else cfg.queue_key
        return await self._pool.lpush(key, json.dumps(message))

    # ── Dequeue (blocking) ───────────────────────────────────────────────────
    async def dequeue(self) -> Optional[dict]:
        """
        Pops one message. Checks high-priority queue first.
        Returns None on timeout (no messages within dequeue_timeout).
        """
        result = await self._pool.brpop(
            [cfg.queue_key_high, cfg.queue_key],
            timeout=cfg.dequeue_timeout,
        )
        if result is None:
            return None
        _key, raw = result
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.error("[Queue] Malformed message (not JSON): %s", raw[:200])
            return None

    # ── Batch dequeue ────────────────────────────────────────────────────────
    async def dequeue_batch(self, target_size: int) -> list[dict]:
        """
        Tries to fill a batch of up to target_size messages without blocking
        for each individually. Uses pipeline for efficiency.
        Blocks on the first item, then greedily pops the rest.
        """
        messages = []

        # Block for first message (up to dequeue_timeout seconds)
        first = await self.dequeue()
        if first is None:
            return []
        messages.append(first)

        # Greedily collect remaining without blocking
        remaining = target_size - 1
        if remaining > 0:
            # Pipeline RPOP calls to minimise round trips
            pipe = self._pool.pipeline(transaction=False)
            for _ in range(remaining):
                pipe.rpop(cfg.queue_key)
            results = await pipe.execute()
            for raw in results:
                if raw is None:
                    break
                try:
                    messages.append(json.loads(raw))
                except json.JSONDecodeError:
                    pass

        return messages

    # ── Dead Letter Queue ────────────────────────────────────────────────────
    async def push_dlq(self, message: dict, reason: str):
        dlq_entry = {**message, "_dlq_reason": reason, "_dlq_at": asyncio.get_event_loop().time()}
        await self._pool.lpush(cfg.dlq_key, json.dumps(dlq_entry))
        logger.warning("[Queue] Pushed to DLQ (reason=%s) batchId=%s", reason, message.get("batchId"))

    # ── Depth probe ──────────────────────────────────────────────────────────
    async def queue_depth(self) -> dict:
        pipe = self._pool.pipeline(transaction=False)
        pipe.llen(cfg.queue_key)
        pipe.llen(cfg.queue_key_high)
        pipe.llen(cfg.dlq_key)
        normal, high, dlq = await pipe.execute()
        return {"normal": normal, "high": high, "dlq": dlq, "total": normal + high}

    # ── Pause / Resume ────────────────────────────────────────────────────────
    async def is_paused(self) -> bool:
        val = await self._pool.get(cfg.pause_key)
        return val == "1"

    async def pause(self):
        await self._pool.set(cfg.pause_key, "1")

    async def resume(self):
        await self._pool.delete(cfg.pause_key)

    # ── Stats ─────────────────────────────────────────────────────────────────
    async def increment_stats(self, field: str, amount: int = 1):
        await self._pool.hincrby(cfg.stats_key, field, amount)

    async def get_stats(self) -> dict:
        return await self._pool.hgetall(cfg.stats_key) or {}


# Shared singleton
queue = QueueClient()
