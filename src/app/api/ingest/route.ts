/**
 * PRODUCER — Vercel Serverless Function
 * ─────────────────────────────────────
 * Accepts incoming events (orders, logs, metrics, etc.)
 * Validates & enriches them, then enqueues in Upstash Redis.
 *
 * Contract:
 *   POST /api/ingest
 *   Body: { table: string, rows: Record<string,any>[], idempotencyKey?: string }
 *   Response: 202 Accepted { queued: n, batchId: string }
 *
 * MUST NOT perform DB operations — only Redis enqueue.
 * Target response time: <100ms p99.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

// ─── Upstash Redis client (REST-based — works in Vercel Edge/Serverless) ─────
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const QUEUE_KEY     = 'orders_queue';
const STATS_KEY     = 'ingestion:stats';
const MAX_BATCH_SIZE = 500;          // hard cap per request
const MAX_PAYLOAD_BYTES = 512_000;   // 512 KB

// ─── Types ────────────────────────────────────────────────────────────────────
interface IngestRequest {
    table: string;
    rows: Record<string, unknown>[];
    idempotencyKey?: string;
    priority?: 'high' | 'normal';
}

interface QueueMessage {
    batchId: string;
    table: string;
    rows: Record<string, unknown>[];
    enqueuedAt: number;
    producerRegion: string;
    attempt: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────
function validate(body: unknown): { ok: true; data: IngestRequest } | { ok: false; error: string } {
    if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be JSON object' };
    const b = body as Record<string, unknown>;

    if (typeof b.table !== 'string' || !b.table.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
        return { ok: false, error: 'Invalid table name' };
    }
    if (!Array.isArray(b.rows) || b.rows.length === 0) {
        return { ok: false, error: 'rows must be a non-empty array' };
    }
    if (b.rows.length > MAX_BATCH_SIZE) {
        return { ok: false, error: `rows exceeds max batch size of ${MAX_BATCH_SIZE}` };
    }
    // Each row must be a plain object
    const invalid = b.rows.findIndex(r => typeof r !== 'object' || r === null || Array.isArray(r));
    if (invalid !== -1) return { ok: false, error: `Row at index ${invalid} is not a plain object` };

    return { ok: true, data: b as unknown as IngestRequest };
}

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    const start = Date.now();

    // Reject oversized payloads early
    const contentLength = parseInt(req.headers.get('content-length') ?? '0');
    if (contentLength > MAX_PAYLOAD_BYTES) {
        return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    // Parse + validate
    let body: unknown;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const validation = validate(body);
    if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });

    const { table, rows, priority = 'normal' } = validation.data;

    // Idempotency key — caller can supply one; we always embed it in the message
    const batchId = validation.data.idempotencyKey ?? crypto.randomUUID();

    // Enrich rows: stamp insert metadata
    const enrichedRows = rows.map(row => ({
        ...row,
        _batch_id: batchId,
        _ingested_at: new Date().toISOString(),
    }));

    // Build queue message
    const message: QueueMessage = {
        batchId,
        table,
        rows: enrichedRows,
        enqueuedAt: Date.now(),
        producerRegion: process.env.VERCEL_REGION ?? 'local',
        attempt: 0,
    };

    // Push to Redis queue
    // LPUSH → workers BRPOP from tail (FIFO order maintained)
    // High-priority items go to a separate key workers also check
    const queueKey = priority === 'high' ? `${QUEUE_KEY}:high` : QUEUE_KEY;

    try {
        const pipeline = redis.pipeline();
        pipeline.lpush(queueKey, JSON.stringify(message));
        // Increment stats counter (non-blocking, fire-and-forget)
        pipeline.hincrby(STATS_KEY, 'enqueued_total', rows.length);
        pipeline.hincrby(STATS_KEY, 'batches_total', 1);
        await pipeline.exec();
    } catch (err: any) {
        console.error('[PRODUCER] Redis enqueue error:', err.message);
        return NextResponse.json({ error: 'Queue unavailable. Please retry.' }, { status: 503 });
    }

    const elapsed = Date.now() - start;

    return NextResponse.json({
        ok: true,
        batchId,
        queued: rows.length,
        table,
        latencyMs: elapsed,
    }, {
        status: 202,
        headers: {
            'X-Batch-Id': batchId,
            'X-Latency-Ms': String(elapsed),
        },
    });
}

// ─── Queue depth probe (GET /api/ingest) ─────────────────────────────────────
export async function GET() {
    try {
        const [depth, highDepth, stats] = await Promise.all([
            redis.llen(QUEUE_KEY),
            redis.llen(`${QUEUE_KEY}:high`),
            redis.hgetall(STATS_KEY),
        ]);
        return NextResponse.json({
            queueDepth: depth,
            highPriorityDepth: highDepth,
            stats,
        });
    } catch {
        return NextResponse.json({ error: 'Redis unavailable' }, { status: 503 });
    }
}
