<p align="center">
  <img src="public/logo.png" alt="Fluxbase Logo" width="180" />
</p>

<h1 align="center">Fluxbase ⚡</h1>
<p align="center"><strong>The Serverless SQL Platform Built for Speed, Scale, and Developers.</strong></p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.1.0-6366f1.svg?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/PostgreSQL-16+-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/MySQL-8.0+-4479A1?style=for-the-badge&logo=mysql&logoColor=white" alt="MySQL">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/Redis-Upstash-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge" alt="MIT License">
</p>

---

Fluxbase is a next-generation **Database-as-a-Service (DBaaS)** built for high-growth startups. It wraps AWS RDS (PostgreSQL & MySQL) in a premium web dashboard, a zero-dependency REST API, and a battle-hardened async ingestion pipeline capable of sustaining **80,000+ rows/second** throughput without freezing your UI.

Every project gets its own **isolated schema namespace** — cross-tenant data leakage is structurally impossible. You write plain SQL, we handle the rest.

| Engine | Tenant isolation |
|--------|-----------------|
| PostgreSQL | `SET search_path TO project_<id>` per query |
| MySQL | `USE project_<id>` per connection |

---

## ✨ Key Features

### 🔥 Native SQL Execution — Multi-Dialect
Zero abstraction layers. Write raw `SELECT`, `JOIN`, `UPDATE`, `INSERT`, `CREATE TABLE` executed directly on bare-metal database drivers. Choose your engine per project:

| Dialect | Driver | Notes |
|---------|--------|-------|
| **PostgreSQL 16+** | `pg` (node-postgres) | Full SQL, JSON, arrays, CTEs |
| **MySQL 8.0+** | `mysql2` | Full SQL, window functions, JSON |

Your API key encodes which engine your project uses — same REST API, zero config changes on your end.

### ⚡ High-Throughput Ingestion Pipeline
A dedicated async Python worker that ingests data at **80,000+ rows/second** using:
- **PostgreSQL `COPY` protocol** — binary stream, 5–10× faster than `INSERT`
- **UUID v7** time-ordered IDs — eliminates B-tree page splits under high-write workloads
- **Async WAL** (`synchronous_commit = off`) — maximum write throughput
- **Adaptive throttle** — auto-scales batch size, concurrency, and delay based on live error rates

### 🎛️ Premium Dashboard
- **Table Editor** — view, filter, and edit rows inline with live pagination
- **SQL Scratchpad** — multi-tab editor with syntax highlighting and query history
- **ERD Visualizer** — auto-generated entity-relationship diagram from your live schema
- **Analytics** — Vercel-style query traffic charts and event timelines
- **API Key Manager** — granular, per-project scoped keys with usage tracking

### 📡 Real-Time Subscriptions
Every data change streamed to your dashboard via **SSE**. A module-level singleton ensures N components share exactly one connection — no connection storms.

### 🔐 Scoped API Keys
Project-scoped Bearer tokens. Embed safely in any client — no `projectId` needed per request.

### ☁️ Webhooks
Register HTTP endpoints to receive `POST` notifications on `INSERT`, `UPDATE`, or `DELETE`.

### 📦 CSV Import
Drag-and-drop CSV upload with automatic schema detection and type inference.

### 🤖 AI SQL Assistant
Natural language → executable SQL. Describe what you want, get a query back.

### 🔒 Row-Level Security (RLS)
Define per-table RLS policies directly from the dashboard.

### 💾 Backups & Snapshots
One-click schema and data snapshots, stored and restorable from the dashboard.

### 🕷️ Web Scraper Integration
Built-in scraper runner — schedule scrapers that write output directly into your Fluxbase tables.

---

## 📖 API Reference

### Authentication

All requests require a project-scoped API key:

```http
Authorization: Bearer <YOUR_API_KEY>
```

Generate one: **Dashboard → Project → API Keys → Create API Key**

---

### `POST /api/execute-sql` — Execute SQL

```http
POST /api/execute-sql
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

```json
{
  "query": "SELECT id, name, email FROM users WHERE role = 'admin' LIMIT 10"
}
```

**Success (`200`)**

```json
{
  "success": true,
  "result": {
    "rows": [
      { "id": "018f4a2b-...", "name": "Jane Doe", "email": "jane@example.com" }
    ],
    "columns": ["id", "name", "email"],
    "message": "Affected 1 rows"
  },
  "explanation": ["Executed via Native AWS PostgreSQL in 12.40ms"],
  "executionInfo": { "time": "14ms", "rowCount": 1 }
}
```

**Error (`200` with `success: false`)**

```json
{
  "success": false,
  "error": {
    "message": "relation \"users\" does not exist",
    "code": "EXECUTION_ERROR",
    "hint": "Check syntax and table names."
  }
}
```

> Query-level errors always return HTTP `200` with `success: false`. HTTP `4xx`/`5xx` indicate infrastructure failures.

---

### `POST /api/ingest` — Queue Rows for Ingestion

Enqueue rows for high-throughput async ingestion via the worker pipeline.

```json
{
  "table": "orders",
  "rows": [
    { "id": "018f4a2b-...", "product": "laptop", "quantity": 2, "unit_price": 999.99 }
  ]
}
```

**Response (`202 Accepted`)**

```json
{ "success": true, "queued": 1, "batchId": "batch_abc123" }
```

---

### `POST /api/bulk-fast-insert` — Direct Bulk Insert

Synchronous bulk insert bypassing the queue. Use for moderate volumes (<10k rows).

```json
{ "table": "orders", "rows": [ ... ] }
```

**Response (`200 OK`)**

```json
{ "success": true, "inserted": 500, "executionTime": "120ms" }
```

---

### `GET /api/health` — Health Check

```json
{
  "status": "ok",
  "postgres": "connected",
  "mysql": "connected",
  "timestamp": "2026-06-02T12:00:00.000Z"
}
```

---

### `GET /api/realtime` — SSE Stream

```http
GET /api/realtime?projectId=<PROJECT_ID>
Accept: text/event-stream
Authorization: Bearer <API_KEY>
```

| Event type | Description |
|---|---|
| `connected` | SSE handshake confirmed |
| `db_event` | Row-level change (`INSERT`, `UPDATE`, `DELETE`) |
| `schema_update` | Table structure changed |
| `subscribed` | Subscription confirmed for a table |

---

## 🏭 Ingestion Worker

A standalone Python service for extreme write throughput. Reads from an **Upstash Redis queue**, writes directly to AWS RDS using the native `COPY` protocol — bypassing the HTTP API entirely.

```
Producer(s)  →  POST /api/ingest  →  Upstash Redis
                                         │
                          ┌──────────────┼──────────────┐
                       worker-1       worker-2       worker-N
                          │              │              │
                     asyncpg COPY   asyncpg COPY   asyncpg COPY
                          └──────────────┴──────────────┘
                                         │
                                  AWS RDS PostgreSQL
```

### Setup

```bash
cd ingestion-worker
python -m venv .venv
source .venv/bin/activate      # macOS/Linux
.venv\Scripts\activate         # Windows

pip install -r requirements.txt
cp .env.example .env
# Fill in your credentials in .env

python main.py
```

### How the COPY Protocol Works

1. **Auto-creates the target table** if it doesn't exist (schema inferred from first row)
2. **Streams rows** via `asyncpg` `COPY ... FROM STDIN` — no SQL parsing, pure binary
3. **Idempotent** — `ON CONFLICT (id) DO NOTHING`
4. **Async WAL** — `SET synchronous_commit = off` per session

```python
async with pool.acquire() as conn:
    await conn.execute("SET synchronous_commit = off")
    await conn.copy_records_to_table(
        table_name,
        records=[(row["id"], row["col1"], ...) for row in rows],
        columns=["id", "col1", ...]
    )
```

### UUID v7 — Why It Matters

```
018f4a2b-1234-7abc-8def-000000000001
└─────────────────┘
   48-bit ms timestamp (monotonically increasing)
```

UUID v7 IDs are time-ordered — new rows always land on the **rightmost B-tree leaf page**. Zero page splits, zero index fragmentation, consistent performance at 100M+ rows.

### Adaptive Throttle

Background loop (every 30s) auto-tunes three parameters:

| Parameter | Range | Rule |
|---|---|---|
| `batch_size` | 50–200 | ↓ 20% on >5% failure rate · ↑ 10% when stable |
| `concurrency` | 1–10 | ↓ 1 when avg latency >2,000ms |
| `delay_ms` | 0–500ms | ↑ 200ms on failures · ↓ 25ms when stable |

### Load Testing — Real Benchmark

```bash
python simulate.py \
  --url https://your-deployment.com \
  --count 10000000 \
  --concurrency 20 \
  --batch 500
```

```
═══════════════════════════════════════════════════════
  SIMULATION RESULTS
═══════════════════════════════════════════════════════
  Total rows requested : 10,000,000
  Successfully queued  : 10,000,000
  Failed requests      : 0
  Elapsed              : 123.60s
  Throughput           : 80,907 rows/sec
  Data loss            : NONE ✓
═══════════════════════════════════════════════════════
```

### Dead-Letter Queue (DLQ)

Batches that fail after 5 retries (100ms → 1,600ms backoff) go to `orders_dlq`. Requeue with:

```bash
python requeue.py --limit 100
```

---

## 📡 Real-Time Subscriptions

Fluxbase uses **Server-Sent Events (SSE)**. The `useRealtimeSubscription` hook maintains a **module-level singleton** per project — N components, one connection.

```typescript
// All components share ONE SSE stream
const { lastEvent, status } = useRealtimeSubscription(projectId);
```

### Throttled Cache Invalidation

At 80k+ rows/sec, the SSE stream fires events at extreme rates. Without throttling, React Query would refetch on every event — freezing the UI.

Fluxbase applies **1,500ms trailing-edge throttling**:

```
Events:  ──●──●──●──●──●──●────────────────●──●──●──●
                                   ▲                  ▲
                             Refetch fires       Refetch fires
                            (trailing edge)     (trailing edge)
```

### Connection Resilience

| Feature | Detail |
|---|---|
| Auto-reconnect | Exponential backoff: 1s → 2s → 4s → 8s → 16s (max 30s) |
| Watchdog | 45s heartbeat — reconnects if no event received |
| Jitter | ±500ms on reconnect to prevent thundering herd |
| Max retries | 10 attempts before `closed` state |

---

## ⚡ Performance Deep Dive

### COPY vs INSERT

| Method | Overhead | Throughput |
|---|---|---|
| `INSERT INTO ... VALUES (...)` | SQL parse + plan + lock + WAL per row | ~2,000–5,000 rows/sec |
| `COPY ... FROM STDIN` | Bulk lock + single WAL write per batch | **80,000–200,000 rows/sec** |

### UUID v7 vs UUID v4 Under Load

UUID v4 is purely random — every insert lands at a random B-tree position causing **page splits**:
- Index fragmentation → more disk I/O
- Extra WAL data
- Performance degrades as table grows

UUID v7 is time-ordered — inserts always go to the **rightmost leaf**:
- Zero page splits
- Zero fragmentation
- Consistent speed at any scale

### Synchronous Commit Off

```sql
SET synchronous_commit = off;
```

PostgreSQL acknowledges writes immediately, flushes WAL async. Worst-case data loss: ~60ms (one `wal_writer_delay` cycle). For ingestion workloads backed by a Redis queue, this is a safe 5–10× throughput gain.

### UNLOGGED Tables

```sql
CREATE UNLOGGED TABLE orders (...);
```

Skips WAL entirely. **Truncated on crash recovery** — ideal for staging tables and re-ingestible scratch data. Enable: `INGESTION_UNLOGGED_TABLES=true`

---

## 🧑‍💻 Client Integration Examples

### JavaScript / TypeScript

```typescript
const FLUXBASE_URL = process.env.FLUXBASE_API_URL!;
const FLUXBASE_KEY = process.env.FLUXBASE_API_KEY!;

async function query<T>(sql: string): Promise<T[]> {
  const res = await fetch(`${FLUXBASE_URL}/api/execute-sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FLUXBASE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
    next: { revalidate: 15 }, // Next.js data cache
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error?.message);
  return data.result.rows as T[];
}
```

### Next.js — Deduplicated Server Component

```typescript
import { cache } from 'react';
import { query } from '@/lib/fluxbase';

// Runs only ONCE per request even if called from many components
export const getUsers = cache(async () =>
  query("SELECT * FROM users ORDER BY created_at DESC LIMIT 50")
);
```

### Python (async)

```python
import httpx, asyncio

FLUXBASE_URL = "https://your-deployment.com"
FLUXBASE_KEY = "fb_live_xxxxxxxxxxxxxxxxxxxx"

async def query(sql: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{FLUXBASE_URL}/api/execute-sql",
            headers={"Authorization": f"Bearer {FLUXBASE_KEY}"},
            json={"query": sql},
            timeout=30.0,
        )
        data = resp.json()
        if not data["success"]:
            raise Exception(data["error"]["message"])
        return data["result"]["rows"]

asyncio.run(query("SELECT * FROM orders LIMIT 10"))
```

### Python (sync)

```python
import requests

def query(sql: str) -> list[dict]:
    data = requests.post(
        "https://your-deployment.com/api/execute-sql",
        headers={"Authorization": "Bearer fb_live_xxxxxxxxxxxxxxxxxxxx"},
        json={"query": sql},
        timeout=30,
    ).json()
    if not data["success"]:
        raise Exception(data["error"]["message"])
    return data["result"]["rows"]
```

### Bulk Ingestion (Python)

```python
import asyncio, httpx

async def bulk_ingest(rows: list[dict], batch_size: int = 500):
    async with httpx.AsyncClient(http2=True) as client:
        batches = [rows[i:i+batch_size] for i in range(0, len(rows), batch_size)]
        results = await asyncio.gather(*[
            client.post(
                "https://your-deployment.com/api/ingest",
                headers={"Authorization": "Bearer fb_live_xxxxxxxxxxxxxxxxxxxx"},
                json={"table": "orders", "rows": b},
                timeout=15.0,
            )
            for b in batches
        ])
    print(f"Queued {sum(r.status_code == 202 for r in results)}/{len(batches)} batches")
```

---

## 📊 Monitoring & Observability

### Prometheus Metrics

The ingestion worker exposes `/metrics` (Prometheus format) on port `8080`:

| Metric | Type | Description |
|---|---|---|
| `rows_ingested_total` | Counter | Rows successfully written |
| `rows_failed_total` | Counter | Rows failed after all retries |
| `rows_dlq_total` | Counter | Rows sent to dead-letter queue |
| `batches_total` | Counter | Batches processed (by status) |
| `insert_latency_ms` | Histogram | Per-batch insert latency |

### Grafana Dashboard

Import `ingestion-worker/grafana_dashboard.json` for a pre-built dashboard:
- Real-time rows/sec ingestion rate
- Error rate and DLQ depth
- Latency percentiles (P50, P95, P99)
- Redis queue depth over time
- Adaptive throttle state

### Alerting

`ingestion-worker/alert_rules.yml` (Prometheus Alertmanager) fires on:
- DLQ depth > 100
- Worker error rate > 5%
- P99 latency > 5,000ms
- Redis queue depth > 10,000

---

## 🗂️ Project Structure

```
Fluxbase/
├── src/
│   ├── app/
│   │   ├── (app)/                 # Authenticated dashboard routes
│   │   │   ├── analytics/         # Query traffic analytics
│   │   │   ├── dashboard/         # Project overview
│   │   │   ├── database/          # Table editor + ERD visualizer
│   │   │   ├── editor/            # SQL scratchpad
│   │   │   ├── query/             # Query history
│   │   │   ├── scraper/           # Web scraper runner
│   │   │   ├── settings/          # API keys, webhooks, RLS
│   │   │   └── storage/           # File/blob storage
│   │   └── api/
│   │       ├── execute-sql/       # Core SQL execution endpoint
│   │       ├── ingest/            # High-throughput async ingestion
│   │       ├── bulk-fast-insert/  # Synchronous bulk insert
│   │       ├── realtime/          # SSE event stream
│   │       ├── webhooks/          # Webhook management
│   │       ├── schema/            # Schema introspection
│   │       ├── analytics/         # Usage analytics
│   │       ├── backups/           # Backup & restore
│   │       ├── rls/               # Row-level security
│   │       ├── health/            # Health check
│   │       └── ...                # 29 total API routes
│   ├── hooks/
│   │   └── use-realtime-subscription.ts  # SSE singleton + 1500ms throttle
│   └── lib/
│       ├── pg.ts                  # PostgreSQL connection pool
│       └── mysql.ts               # MySQL connection pool
│
├── ingestion-worker/
│   ├── main.py                    # Entry point + worker orchestration
│   ├── worker.py                  # Core loop (dequeue → COPY → metrics)
│   ├── fluxbase_client.py         # asyncpg COPY + HTTP fallback client
│   ├── throttle.py                # Adaptive throughput controller
│   ├── queue_client.py            # Upstash Redis interface
│   ├── metrics.py                 # In-process metrics aggregator
│   ├── prometheus_metrics.py      # Prometheus exports
│   ├── health.py                  # Health check HTTP server
│   ├── scaler.py                  # Auto-scaling logic
│   ├── simulate.py                # Load test producer
│   ├── requeue.py                 # DLQ requeue tool
│   ├── Dockerfile
│   ├── fly.toml
│   ├── alert_rules.yml
│   └── grafana_dashboard.json
│
├── package.json
├── next.config.ts
└── README.md
```

---

## 🤝 Contributing

Contributions are welcome! Please open an issue first to discuss significant changes.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit your changes: `git commit -m 'feat: add amazing feature'`
4. Push to the branch: `git push origin feat/your-feature`
5. Open a Pull Request

---

<p align="center">Built with ❤️ for developers who refuse to compromise on performance.</p>
