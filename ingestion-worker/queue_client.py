"""
queue_client.py — Upstash Redis queue via REST API (HTTPS).

Uses Upstash REST API instead of TCP redis:// protocol.
This works on ALL platforms (Render, Fly.io, Railway, Vercel)
since it's plain HTTPS — no firewall issues, no port 6380 needed.

REST API docs: https://upstash.com/docs/redis/features/restapi
"""

import asyncio
import json
import logging
from typing import Optional

import httpx

from config import cfg

logger = logging.getLogger(__name__)


class QueueClient:
    """
    Upstash REST-based queue client.
    All operations use HTTPS POST to https://<host>/<COMMAND>/args
    Authorization: Bearer <token>
    """

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None

    async def connect(self):
        self._client = httpx.AsyncClient(
            base_url=cfg.upstash_rest_url,
            headers={
                "Authorization": f"Bearer {cfg.upstash_rest_token}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=5.0),
        )
        # Verify connectivity
        await self._cmd("PING")
        logger.info("[Queue] Upstash REST connection established (%s)", cfg.upstash_rest_url)

    async def close(self):
        if self._client:
            await self._client.aclose()

    # ── Raw command ───────────────────────────────────────────────────────────
    async def _cmd(self, *args) -> any:
        """
        Execute any Redis command via Upstash REST.
        POST /  body: ["COMMAND", "arg1", "arg2", ...]
        Returns the result field.
        """
        r = await self._client.post("/", json=list(args))
        r.raise_for_status()
        data = r.json()
        if "error" in data:
            raise RuntimeError(f"Upstash error: {data['error']}")
        return data.get("result")

    # ── Enqueue (LPUSH) ───────────────────────────────────────────────────────
    async def enqueue(self, message: dict, high_priority: bool = False) -> int:
        key = cfg.queue_key_high if high_priority else cfg.queue_key
        return await self._cmd("LPUSH", key, json.dumps(message))

    # ── Dequeue (RPOP — non-blocking) ────────────────────────────────────────
    async def _rpop(self, key: str) -> Optional[dict]:
        raw = await self._cmd("RPOP", key)
        if raw is None:
            return None
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.error("[Queue] Malformed message: %s", str(raw)[:100])
            return None

    async def dequeue(self) -> Optional[dict]:
        """Check high priority queue first, then normal."""
        msg = await self._rpop(cfg.queue_key_high)
        if msg is not None:
            return msg
        return await self._rpop(cfg.queue_key)

    # ── Batch dequeue ─────────────────────────────────────────────────────────
    async def dequeue_batch(self, target_size: int) -> list[dict]:
        """
        Polls for up to target_size messages without blocking.
        Waits up to dequeue_timeout seconds for at least one message.
        """
        messages = []
        deadline = asyncio.get_event_loop().time() + cfg.dequeue_timeout

        # Wait for first message
        while asyncio.get_event_loop().time() < deadline:
            first = await self.dequeue()
            if first is not None:
                messages.append(first)
                break
            await asyncio.sleep(1.0)   # 1s poll when idle — saves Upstash quota

        if not messages:
            return []

        # Greedily collect the rest (non-blocking)
        for _ in range(target_size - 1):
            msg = await self.dequeue()
            if msg is None:
                break
            messages.append(msg)

        return messages

    # ── Dead Letter Queue ─────────────────────────────────────────────────────
    async def push_dlq(self, message: dict, reason: str):
        dlq_entry = {**message, "_dlq_reason": reason}
        await self._cmd("LPUSH", cfg.dlq_key, json.dumps(dlq_entry))
        logger.warning("[Queue] → DLQ reason=%s batchId=%s", reason, message.get("batchId", "?"))

    # ── Queue depth ───────────────────────────────────────────────────────────
    async def queue_depth(self) -> dict:
        normal = await self._cmd("LLEN", cfg.queue_key)
        high   = await self._cmd("LLEN", cfg.queue_key_high)
        dlq    = await self._cmd("LLEN", cfg.dlq_key)
        return {"normal": normal or 0, "high": high or 0, "dlq": dlq or 0,
                "total": (normal or 0) + (high or 0)}

    # ── Pause / Resume ────────────────────────────────────────────────────────
    async def is_paused(self) -> bool:
        val = await self._cmd("GET", cfg.pause_key)
        return val == "1"

    async def pause(self):
        await self._cmd("SET", cfg.pause_key, "1")

    async def resume(self):
        await self._cmd("DEL", cfg.pause_key)

    # ── Stats ─────────────────────────────────────────────────────────────────
    async def increment_stats(self, field: str, amount: int = 1):
        await self._cmd("HINCRBY", cfg.stats_key, field, amount)

    async def get_stats(self) -> dict:
        result = await self._cmd("HGETALL", cfg.stats_key)
        # HGETALL returns flat list [key, val, key, val, ...]
        if isinstance(result, list):
            return dict(zip(result[::2], result[1::2]))
        return {}


# Shared singleton
queue = QueueClient()
