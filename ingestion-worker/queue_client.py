"""
queue_client.py — Upstash Redis queue via Native TCP (rediss://).

Migrated from REST to Native Redis Protocol to enable Zero-Polling (BRPOP).
This reduces idle Upstash costs to effectively ZERO while improving latency.
"""

import asyncio
import json
import logging
from typing import Optional, List, Any

import redis.asyncio as redis
from config import cfg

logger = logging.getLogger(__name__)


class QueueClient:
    """
    Upstash Native Redis client.
    Uses the TCP protocol to support blocking commands (BRPOP).
    """

    def __init__(self):
        self._redis: Optional[redis.Redis] = None

    async def connect(self):
        """
        Connects to Upstash using the TCP connection string.
        Automatically handles SSL and pooling.
        """
        if not cfg.upstash_redis_url:
            raise RuntimeError("UPSTASH_REDIS_URL is not configured in environment")

        self._redis = redis.from_url(
            cfg.upstash_redis_url,
            decode_responses=True,
            health_check_interval=30,
            socket_timeout=60,
        )
        # Verify connectivity
        await self._redis.ping()
        logger.info("[Queue] Upstash Native TCP connection established")

    async def close(self):
        if self._redis:
            await self._redis.aclose()

    # ── Enqueue (LPUSH) ───────────────────────────────────────────────────────
    async def enqueue(self, message: dict, high_priority: bool = False) -> int:
        key = cfg.queue_key_high if high_priority else cfg.queue_key
        return await self._redis.lpush(key, json.dumps(message))

    # ── Dequeue (BRPOP — Blocking) ───────────────────────────────────────────
    async def dequeue_batch(self, target_size: int) -> List[dict]:
        """
        Production-grade Zero-Polling Dequeue:
        1. Blocks on BRPOP for the first message (zero CPU/cost while idle)
        2. Greedily collects up to target_size - 1 more messages (non-blocking)
        """
        messages = []
        
        try:
            # 1. Block for the first item (max 30s wait per command)
            # BRPOP handles priority by checking keys in order: high then normal
            result = await self._redis.brpop([cfg.queue_key_high, cfg.queue_key], timeout=30)
            
            if not result:
                return []

            # brpop returns (key, value)
            _, first_raw = result
            first_msg = self._parse_json(first_raw)
            if first_msg:
                messages.append(first_msg)

            # 2. Grab the rest of the batch greedily (non-blocking)
            for _ in range(target_size - 1):
                # Check high priority first
                raw = await self._redis.rpop(cfg.queue_key_high)
                if not raw:
                    raw = await self._redis.rpop(cfg.queue_key)
                
                if not raw:
                    break
                    
                msg = self._parse_json(raw)
                if msg:
                    messages.append(msg)

        except Exception as e:
            logger.error("[Queue] Dequeue error: %s", e)
            await asyncio.sleep(1) # Safety backoff

        return messages

    # ── Dead Letter Queue ─────────────────────────────────────────────────────
    async def push_dlq(self, message: dict, reason: str):
        dlq_entry = {**message, "_dlq_reason": reason}
        await self._redis.lpush(cfg.dlq_key, json.dumps(dlq_entry))
        logger.warning("[Queue] → DLQ reason=%s batchId=%s", reason, message.get("batchId", "?"))

    # ── Queue depth ───────────────────────────────────────────────────────────
    async def queue_depth(self) -> dict:
        normal = await self._redis.llen(cfg.queue_key) or 0
        high   = await self._redis.llen(cfg.queue_key_high) or 0
        dlq    = await self._redis.llen(cfg.dlq_key) or 0
        return {"normal": normal, "high": high, "dlq": dlq, "total": normal + high}

    # ── Pause / Resume ────────────────────────────────────────────────────────
    async def is_paused(self) -> bool:
        val = await self._redis.get(cfg.pause_key)
        return val == "1"

    async def pause(self):
        await self._redis.set(cfg.pause_key, "1")

    async def resume(self):
        await self._redis.delete(cfg.pause_key)

    # ── Stats ─────────────────────────────────────────────────────────────────
    async def increment_stats(self, field: str, amount: int = 1):
        await self._redis.hincrby(cfg.stats_key, field, amount)

    async def get_stats(self) -> dict:
        return await self._redis.hgetall(cfg.stats_key)

    def _parse_json(self, raw: str) -> Optional[dict]:
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            logger.error("[Queue] Malformed message: %s", str(raw)[:100])
            return None


# Shared singleton
queue = QueueClient()
