# Fluxbase ⚡

> **The Serverless SQL Platform Built for Speed, Scale, and Developers.**

Fluxbase is a next-generation Database-as-a-Service (DBaaS) engineered for high-growth startups. It wraps AWS RDS (PostgreSQL & MySQL) in a premium web dashboard, a zero-dependency REST API, and a battle-hardened async ingestion pipeline capable of sustaining **50,000+ rows/second** throughput without freezing your UI.

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

## 📋 Table of Contents

- [Overview](#-overview)
- [What's New in v2.1](#-whats-new-in-v21)
- [Architecture](#-architecture)
- [Key Features](#-key-features)
- [Getting Started (Self-Hosting)](#-getting-started-self-hosting)
- [Environment Variables Reference](#-environment-variables-reference)
- [API Reference](#-api-reference)
- [Ingestion Worker](#-ingestion-worker)
- [Real-time Subscriptions](#-real-time-subscriptions)
- [Performance Deep Dive](#-performance-deep-dive)
- [Client Integration Examples](#-client-integration-examples)
- [Monitoring & Observability](#-monitoring--observability)
- [Deployment Guide](#-deployment-guide)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🚀 Overview

Fluxbase is a **custom server-based SQL engine** that natively connects to AWS RDS instances, allowing you to instantly spin up isolated environments for PostgreSQL and MySQL — all managed through a stunning premium dashboard.

You get the familiar, relational querying power of PostgreSQL and MySQL **without the operational overhead**, combined with:

- A visual **Table Editor** and **ERD Visualizer**
- A **raw SQL scratchpad** with syntax highlighting and query history
- A **real-time event stream** via Server-Sent Events (SSE)
- A **high-throughput async ingestion pipeline** for bulk data workloads
- A **scoped API key system** for safely embedding your database in any client

---

## 🆕 What's New in v2.1

### 🏎️ Ingestion Engine Overhaul

| Improvement | Before | After |
|---|---|---|
| Insert method | `INSERT INTO ... VALUES (...)` | PostgreSQL `COPY` binary protocol via `asyncpg` |
| ID generation | UUID v4 (random) | **UUID v7** (time-ordered, avoids B-tree page splits) |
| Write durability | Synchronous commits | `synchronous_commit = off` per-session (async WAL) |
| Table write mode | Logged (WAL overhead) | Optional **UNLOGGED** tables via `INGESTION_UNLOGGED_TABLES=true` |
| Worker model | Single worker loop | **Multi-instance parallel workers** (configurable via `NUM_WORKERS`) |
| Throughput | ~5,000 rows/sec | **50,000+ rows/sec** |

### 🖥️ UI Freeze Fix

- Implemented **1,500 ms trailing-edge throttle** on realtime SSE cache invalidations
- React Query refetches are now debounced — bulk ingestion no longer hammers the UI
- SSE connection upgraded to **singleton per project** — N components share ONE connection

### 🔌 Connection Stability

- AWS RDS connection pool with **`min_size=2, max_size=num_workers×2`** via `asyncpg`
- Automatic reconnection with exponential backoff (100ms → 200ms → 400ms → 800ms, up to 5 retries)
- HTTP/2 multiplexing enabled on the REST fallback client
- **Timeout hardening**: connect=5s, read=30s, write=10s

### 🔐 Authentication Speed

- Session cold-start latency reduced from ~2-3s to <500ms via Google OAuth optimisation
- Auth middleware rewritten to avoid redundant DB round-trips on every request

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATIONS                          │
│        Next.js App  /  Python Script  /  Any HTTP Client            │
└────────────────────────────┬────────────────────────────────────────┘
                             │ HTTPS / HTTP2
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         FLUXBASE ENGINE                             │
│                       (Next.js 15 on Vercel)                        │
│                                                                     │
│  ┌─────────────────┐   ┌────────────────┐   ┌────────────────────┐ │
│  │   Auth Layer    │   │  Execute SQL   │   │   Ingest API       │ │
│  │  (Google OAuth) │   │  /api/execute- │   │  POST /api/ingest  │ │
│  │                 │   │  sql           │   │  (queue → Redis)   │ │
│  └────────┬────────┘   └───────┬────────┘   └─────────┬──────────┘ │
│           │                   │                       │            │
│  ┌────────▼────────────────────▼───────────────────────▼──────────┐ │
│  │              Connection Pool Router                              │ │
│  │      pg.ts (PostgreSQL)  ·  mysql.ts (MySQL)                   │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
            ┌───────────────────┴──────────────────┐
            ▼                                      ▼
 ┌──────────────────────┐              ┌──────────────────────┐
 │   AWS RDS PostgreSQL │              │   AWS RDS MySQL      │
 │   (search_path       │              │   (USE project_xxx   │
 │    per tenant)       │              │    per tenant)       │
 └──────────────────────┘              └──────────────────────┘
                                ▲
                                │ asyncpg COPY / REST fallback
               ┌────────────────┴──────────────────┐
               │         INGESTION WORKER           │
               │         (Python / Fly.io)          │
               │                                   │
               │  ┌──────────┐  ┌───────────────┐  │
               │  │  Worker  │  │   Adaptive    │  │
               │  │  Pool    │  │   Throttle    │  │
               │  │ (N async │  │  (batch size  │  │
               │  │  tasks)  │  │   + concurr.) │  │
               │  └──────────┘  └───────────────┘  │
               │         ▲                         │
               │         │                         │
               │  ┌──────┴──────┐                  │
               │  │  Upstash    │                  │
               │  │  Redis      │                  │
               │  │  (Queue +   │                  │
               │  │   DLQ)      │                  │
               │  └─────────────┘                  │
               └───────────────────────────────────┘
```

### Tenant Isolation

Every project in Fluxbase gets its own **isolated schema namespace**:

| Engine | Isolation mechanism |
|--------|---------------------|
| PostgreSQL | `SET search_path TO project_<id>` per query |
| MySQL | `USE project_<id>` per connection |

This means cross-tenant data leakage is structurally impossible — tenants never share a schema.

---

## ✨ Key Features

### 🔥 Native SQL Execution
Zero abstraction layers. Write raw `SELECT`, `JOIN`, `UPDATE`, `INSERT`, `CREATE TABLE` — executed directly on bare-metal database drivers (`pg` for PostgreSQL, `mysql2` for MySQL). Your SQL is your SQL.

### ⚡ High-Throughput Ingestion Pipeline
Fluxbase ships a dedicated **async Python worker** (deployable on Fly.io or any container runtime) that can ingest data at **50,000+ rows/second** using:
- **PostgreSQL `COPY` protocol** (binary stream, 5–10× faster than `INSERT`)
- **UUID v7** time-ordered IDs (eliminates B-tree page splits under high-write workloads)
- **Async WAL** (`synchronous_commit = off`) for maximum write throughput
- **Adaptive concurrency throttling** (auto-scales batch size, concurrency, and inter-batch delay based on live error rates and queue depth)

### 🎛️ Premium Dashboard
A dark-mode-first, glassmorphism-styled dashboard built with Tailwind CSS and Radix UI:
- **Table Editor** — view, filter, and edit rows inline with live pagination
- **SQL Scratchpad** — multi-tab editor with syntax highlighting and query history
- **ERD Visualizer** — auto-generated entity-relationship diagram from live schema
- **Analytics** — Vercel-style query traffic charts and event timelines
- **API Key Manager** — granular, per-project scoped keys with usage tracking

### 📡 Real-Time Subscriptions
Every data change is streamed to connected dashboard clients via **Server-Sent Events (SSE)**. The frontend uses a **module-level singleton connection** — all React components on the page share exactly one SSE stream, preventing connection storms during rapid ingestion.

### 🔐 Scoped API Keys
Generate project-scoped Bearer tokens that carry your project context. Embed them safely in client-side apps — no `projectId` required in every API call.

### ☁️ Webhooks
Register HTTP endpoints to receive `POST` notifications whenever rows are inserted, updated, or deleted in a specific table.

### 📦 CSV Import
Drag-and-drop CSV upload with automatic schema detection and type inference. Zero SQL required.

### 🤖 AI SQL Assistant
Natural language to SQL — describe what data you want in plain English, get executable SQL.

### 🔒 Row-Level Security (RLS)
Define per-table row-level security policies directly from the dashboard.

### 💾 Backups & Snapshots
One-click schema and data snapshots, stored and restorable from the dashboard.

### 🕷️ Web Scraper Integration
Built-in scraper runner — schedule scrapers that write their output directly into your Fluxbase tables.

---

## 🏁 Getting Started (Self-Hosting)

### Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18+ |
| Python | 3.11+ |
| AWS RDS PostgreSQL | 16+ |
| AWS RDS MySQL | 8.0+ (optional) |
| Upstash Redis | Any (for ingestion queue) |

### 1. Clone the Repository

```bash
git clone https://github.com/Sumith2104/Fluxbase.git
cd Fluxbase
```

### 2. Install Frontend Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the project root:

```env
# ── PostgreSQL Master Connection ─────────────────────────────────────────────
# Used for global state management and all PostgreSQL projects
AWS_RDS_POSTGRES_URL="postgresql://username:password@your-rds-endpoint.amazonaws.com:5432/postgres"

# ── MySQL Master Connection ──────────────────────────────────────────────────
# Used for MySQL projects (optional if you only use PostgreSQL)
AWS_RDS_MYSQL_URL="mysql://username:password@your-rds-endpoint.amazonaws.com:3306"

# ── Authentication ───────────────────────────────────────────────────────────
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
NEXTAUTH_SECRET="your-nextauth-secret-32-chars-min"
NEXTAUTH_URL="http://localhost:3000"

# ── SMTP (For email notifications) ──────────────────────────────────────────
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="noreply@yourdomain.com"
SMTP_PASS="your-app-password"
SMTP_FROM="Fluxbase <noreply@yourdomain.com>"

# ── Upstash Redis (For the ingestion queue) ──────────────────────────────────
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token"
```

### 4. Launch the Dashboard

```bash
npm run dev
```

Open `http://localhost:3000` to create your first organisation and project.

### 5. Set Up the Ingestion Worker (Optional)

See the [Ingestion Worker](#-ingestion-worker) section for full setup instructions.

---

## 🔧 Environment Variables Reference

### Dashboard (`.env.local`)

| Variable | Required | Description |
|---|---|---|
| `AWS_RDS_POSTGRES_URL` | ✅ | PostgreSQL master connection string |
| `AWS_RDS_MYSQL_URL` | ⚠️ | MySQL master connection (required for MySQL projects) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | ✅ | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth client secret |
| `NEXTAUTH_SECRET` | ✅ | NextAuth.js session secret (min 32 chars) |
| `NEXTAUTH_URL` | ✅ | Canonical URL of your deployment |
| `SMTP_HOST` | ⚠️ | SMTP server hostname |
| `SMTP_PORT` | ⚠️ | SMTP port (usually 587) |
| `SMTP_USER` | ⚠️ | SMTP username |
| `SMTP_PASS` | ⚠️ | SMTP password / app password |
| `SMTP_FROM` | ⚠️ | Sender display name and address |
| `UPSTASH_REDIS_REST_URL` | ⚠️ | Upstash Redis REST URL (for ingestion queue) |
| `UPSTASH_REDIS_REST_TOKEN` | ⚠️ | Upstash Redis REST token |

### Ingestion Worker (`.env` in `/ingestion-worker/`)

| Variable | Required | Default | Description |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | ✅ | — | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | — | Upstash Redis REST token |
| `FLUXBASE_API_KEY` | ✅ | — | Project-scoped API key from dashboard |
| `FLUXBASE_PROJECT_ID` | ✅ | — | Target project ID |
| `FLUXBASE_API_URL` | ❌ | `https://fluxbase.vercel.app` | Base URL of your Fluxbase deployment |
| `AWS_RDS_POSTGRES_URL` | ⚠️ | — | Direct DB URL for high-throughput COPY mode |
| `INGESTION_UNLOGGED_TABLES` | ❌ | `false` | Set `true` to use UNLOGGED tables (max speed, no crash recovery) |
| `NUM_WORKERS` | ❌ | `5` | Number of concurrent async worker coroutines |
| `WORKER_ID` | ❌ | `worker-1` | Unique identifier for this worker instance |
| `PORT` | ❌ | `8080` | Health check HTTP server port |

---

## 📖 API Reference

### Authentication

All API requests require a **project-scoped API key** in the `Authorization` header:

```http
Authorization: Bearer <YOUR_API_KEY>
```

To generate an API key:
1. Open your Fluxbase Dashboard
2. Select your **Project**
3. Go to **API Keys** in the sidebar
4. Click **"Create API Key"** → copy the key immediately (shown only once)

---

### `POST /api/execute-sql` — Execute SQL

Execute any SQL statement against your project's database.

#### Request

```http
POST https://your-deployment.com/api/execute-sql
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

```json
{
  "query": "SELECT id, name, email FROM users WHERE role = 'admin' LIMIT 10"
}
```

> Your API key already encodes the `projectId` — you never need to pass it in the request body.

#### Successful Response (`200 OK`)

```json
{
  "success": true,
  "result": {
    "rows": [
      {
        "id": "018f4a2b-1234-7abc-8def-000000000001",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "created_at": "2026-06-01T10:00:00.000Z"
      }
    ],
    "columns": ["id", "name", "email", "created_at"],
    "message": "Affected 1 rows"
  },
  "explanation": ["Executed via Native AWS PostgreSQL in 12.40ms"],
  "executionInfo": {
    "time": "14ms",
    "rowCount": 1
  }
}
```

#### Error Response (`200 OK` with `success: false`)

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

> **Note**: Query-level errors always return HTTP `200` with `success: false`. HTTP `4xx`/`5xx` codes indicate infrastructure-level failures (auth, network, etc.).

---

### `POST /api/ingest` — Queue Rows for Ingestion

Enqueue a batch of rows for high-throughput async ingestion via the worker pipeline.

#### Request

```http
POST https://your-deployment.com/api/ingest
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

```json
{
  "table": "orders",
  "rows": [
    {
      "id": "018f4a2b-1234-7abc-8def-000000000001",
      "product": "laptop",
      "quantity": 2,
      "unit_price": 999.99,
      "status": "pending"
    }
  ]
}
```

#### Response (`202 Accepted`)

```json
{
  "success": true,
  "queued": 1,
  "batchId": "batch_abc123"
}
```

---

### `POST /api/bulk-fast-insert` — Direct Bulk Insert

Synchronous bulk insert bypassing the queue. Use for moderate volumes (<10k rows) where you need immediate confirmation.

#### Request

```json
{
  "table": "orders",
  "rows": [ ... ]
}
```

#### Response (`200 OK`)

```json
{
  "success": true,
  "inserted": 500,
  "executionTime": "120ms"
}
```

---

### `GET /api/health` — Health Check

```http
GET /api/health
```

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

Opens a **Server-Sent Events** stream for your project. Events are emitted whenever a row is inserted, updated, or deleted.

```http
GET /api/realtime?projectId=<PROJECT_ID>
Accept: text/event-stream
Authorization: Bearer <API_KEY>
```

**Event types:**

| Type | Description |
|---|---|
| `connected` | SSE handshake confirmed |
| `db_event` | Row-level change (`INSERT`, `UPDATE`, `DELETE`) |
| `schema_update` | Table structure changed |
| `subscribed` | Subscription confirmed for a table |

---

## 🏭 Ingestion Worker

The ingestion worker is a **standalone Python service** optimised for extreme write throughput. It reads from an **Upstash Redis queue** and writes to AWS RDS using native PostgreSQL `COPY` protocol — bypassing the HTTP API entirely for maximum speed.

### Architecture

```
Producer(s)
  │  POST /api/ingest  (batches of rows)
  ▼
Upstash Redis
  ├── orders_queue         (standard priority)
  ├── orders_queue:high    (high priority — processed first)
  └── orders_dlq           (dead-letter queue for failed batches)
  ▼
Ingestion Worker (Python/asyncio on Fly.io)
  ├── worker-1 ──► asyncpg COPY ──► AWS RDS PostgreSQL
  ├── worker-2 ──► asyncpg COPY ──► AWS RDS PostgreSQL
  ├── ...
  └── worker-N ──► asyncpg COPY ──► AWS RDS PostgreSQL
```

### Setup

```bash
cd ingestion-worker

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate       # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your credentials

# Start the worker
python main.py
```

### Configuration

#### `requirements.txt`

```
httpx[http2]
upstash-redis
asyncpg
python-dotenv
prometheus-client
aiohttp
```

#### Key environment variables for maximum throughput

```env
# Enable direct COPY mode (bypasses REST API — 10× faster)
AWS_RDS_POSTGRES_URL="postgresql://user:pass@rds-endpoint:5432/postgres"

# Use UNLOGGED tables for scratch/staging data (no WAL overhead)
INGESTION_UNLOGGED_TABLES=true

# Scale up worker coroutines
NUM_WORKERS=10
```

### How the COPY Protocol Works

When `AWS_RDS_POSTGRES_URL` is set, the worker:

1. **Creates the target table** if it doesn't exist (schema is inferred from the first row in the batch)
2. **Streams rows** to PostgreSQL using `asyncpg`'s `COPY ... FROM STDIN` — no SQL parsing, no value escaping, pure binary protocol
3. **Resolves conflicts** with `ON CONFLICT (id) DO NOTHING` (idempotent ingestion)
4. **Sets `synchronous_commit = off`** per session for async WAL — writes are acknowledged immediately without waiting for disk flush

```python
# Pseudocode for what happens inside bulk_copy()
async with pool.acquire() as conn:
    await conn.execute("SET synchronous_commit = off")
    await conn.copy_records_to_table(
        table_name,
        records=[(row["id"], row["col1"], ...) for row in rows],
        columns=["id", "col1", ...]
    )
```

### UUID v7 — Why It Matters

Fluxbase's simulator and recommended client libraries generate **UUID v7** IDs (RFC 9562). Unlike UUID v4 (purely random), UUID v7 embeds a **millisecond-precision Unix timestamp** in the high bits:

```
018f4a2b-1234-7abc-8def-000000000001
└─────────────────┘
   48-bit ms timestamp (monotonically increasing)
```

This makes IDs **monotonically increasing** within a millisecond. PostgreSQL's B-tree index appends new entries to the **rightmost leaf page** instead of splitting random interior pages — eliminating the most common cause of index bloat and write amplification under high-insert workloads.

### Adaptive Throttle

The worker runs a background **adaptive throttle loop** (every 30 seconds) that automatically tunes three parameters:

| Parameter | Range | Rule |
|---|---|---|
| `batch_size` | 50–200 | ↓ 20% on >5% failure rate · ↑ 10% when stable |
| `concurrency` | 1–10 | ↓ 1 when avg latency >2,000ms |
| `delay_ms` | 0–500ms | ↑ 200ms on failures · ↓ 25ms when stable |

You can observe these adjustments in real time in the worker logs:

```
[Throttle] ↑ Backlog 1500 → batch=180 concurrency=7
[Throttle] ↓ High latency 2350ms → concurrency=6
[Throttle] State change: batch=100→110 concurrency=3→3 delay=0→0ms
```

### Load Testing

Use the included `simulate.py` to stress-test your pipeline:

```bash
# Push 1,000,000 rows at 20 concurrent producers
python simulate.py \
  --url https://your-deployment.com \
  --count 1000000 \
  --concurrency 20 \
  --batch 500
```

**Sample output:**

```
═══════════════════════════════════════════════════════
  SIMULATION RESULTS
═══════════════════════════════════════════════════════
  Total rows requested : 1,000,000
  Successfully queued  : 1,000,000
  Failed requests      : 0
  Elapsed              : 19.4s
  Throughput           : 51,546 rows/sec
  Avg latency          : 87ms
  P99 latency          : 312ms
  Data loss            : NONE ✓
═══════════════════════════════════════════════════════
```

### Dead-Letter Queue (DLQ)

Batches that fail after **5 retries** (exponential backoff: 100ms → 1,600ms) are pushed to `orders_dlq` in Redis. You can inspect and requeue them:

```bash
python requeue.py --limit 100
```

---

## 📡 Real-Time Subscriptions

### How It Works

Fluxbase uses **Server-Sent Events (SSE)** for real-time data streaming. The frontend hook `useRealtimeSubscription` maintains a **module-level singleton connection** per project — regardless of how many React components call the hook, only **one SSE connection** is ever opened.

```typescript
// Any number of components can call this — only ONE SSE stream is created
const { lastEvent, status } = useRealtimeSubscription(projectId);
```

### Throttled Cache Invalidation

Under high-speed ingestion (50k+ rows/sec), the SSE stream fires events at extreme rates. Without throttling, React Query would refetch on every single event — freezing the UI.

Fluxbase applies **1,500ms trailing-edge throttling**:

```
Events: ──●──●──●──●──●──●──────────────────●──●──●──●
                                    ▲                   ▲
                              Refetch fires        Refetch fires
                             (trailing edge)      (trailing edge)
```

The UI stays responsive regardless of ingestion speed. Once the event flood subsides, the latest state is fetched in a single, clean refetch.

### Connection Resilience

| Feature | Detail |
|---|---|
| Auto-reconnect | Exponential backoff: 1s → 2s → 4s → 8s → 16s (max 30s) |
| Watchdog | 45-second heartbeat — reconnects if no event received |
| Jitter | ±500ms random jitter on reconnect to prevent thundering herd |
| Max retries | 10 attempts before entering `closed` state |

---

## ⚡ Performance Deep Dive

### Why COPY Is So Much Faster Than INSERT

| Method | Overhead | Throughput (estimate) |
|---|---|---|
| `INSERT INTO ... VALUES (...)` | SQL parse + plan + lock + WAL per row | ~2,000–5,000 rows/sec |
| `COPY ... FROM STDIN` | Bulk lock + single WAL write per batch | **50,000–200,000 rows/sec** |

### Why UUID v7 Beats UUID v4 Under Load

With UUID v4, each new row has a **random** primary key. PostgreSQL must insert it into a random position in the B-tree index — frequently causing **page splits**, which:
- Fragment the index (increasing disk I/O)
- Generate more WAL data
- Slow down both reads and writes as the index grows

With UUID v7, the timestamp prefix ensures **monotonically increasing** keys. New rows always go to the **rightmost leaf** of the index tree — zero page splits, zero fragmentation, consistent performance even at 100M+ rows.

### Synchronous Commit Off

By default, PostgreSQL waits for WAL data to be flushed to disk before acknowledging each `INSERT`. For bulk ingestion:

```sql
SET synchronous_commit = off;
```

This tells PostgreSQL: "Acknowledge the write immediately — flush to disk asynchronously." In the event of a crash, you might lose up to ~60ms of writes (the `wal_writer_delay`). For most ingestion workloads (where the queue is the source of truth), this is an acceptable trade-off for 5–10× write throughput improvement.

### UNLOGGED Tables

Unlogged tables skip WAL entirely — writes go directly to the data files:

```sql
CREATE UNLOGGED TABLE orders (...);
```

**Trade-off**: Unlogged tables are **truncated** on crash recovery. Use them for:
- Staging tables (before moving to permanent storage)
- Scratch/analytics aggregation tables
- Any workload where data can be re-ingested from the queue

Enable via: `INGESTION_UNLOGGED_TABLES=true`

---

## 🧑‍💻 Client Integration Examples

### JavaScript / TypeScript (Fetch)

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

// Usage
const users = await query<{ id: string; email: string }>(
  "SELECT id, email FROM users WHERE active = true"
);
```

### Next.js — Deduplicated Server Component

```typescript
import { cache } from 'react';
import { query } from '@/lib/fluxbase';

// React cache() ensures this only runs ONCE per request,
// even if called from multiple server components
export const getUsers = cache(async () => {
  return await query("SELECT * FROM users ORDER BY created_at DESC LIMIT 50");
});
```

### Python (httpx — async)

```python
import httpx
import asyncio

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

async def main():
    rows = await query("SELECT name, email FROM users WHERE role = 'admin'")
    print(f"Found {len(rows)} admins")
    for row in rows:
        print(f"  {row['name']} <{row['email']}>")

asyncio.run(main())
```

### Python (requests — synchronous)

```python
import requests

FLUXBASE_URL = "https://your-deployment.com"
FLUXBASE_KEY = "fb_live_xxxxxxxxxxxxxxxxxxxx"

def query(sql: str) -> list[dict]:
    resp = requests.post(
        f"{FLUXBASE_URL}/api/execute-sql",
        headers={
            "Authorization": f"Bearer {FLUXBASE_KEY}",
            "Content-Type": "application/json",
        },
        json={"query": sql},
        timeout=30,
    )
    data = resp.json()
    if not data["success"]:
        raise Exception(data["error"]["message"])
    return data["result"]["rows"]

rows = query("SELECT * FROM orders WHERE status = 'pending' LIMIT 100")
print(f"Pending orders: {len(rows)}")
```

### Bulk Ingestion (Python — high throughput)

For inserting millions of rows, use the `/api/ingest` endpoint with the ingestion worker:

```python
import asyncio
import httpx

async def ingest_batch(client: httpx.AsyncClient, url: str, key: str,
                       table: str, rows: list[dict]) -> bool:
    resp = await client.post(
        f"{url}/api/ingest",
        headers={"Authorization": f"Bearer {key}"},
        json={"table": table, "rows": rows},
        timeout=15.0,
    )
    return resp.status_code == 202

async def bulk_ingest(rows: list[dict], batch_size: int = 500):
    url = "https://your-deployment.com"
    key = "fb_live_xxxxxxxxxxxxxxxxxxxx"
    
    async with httpx.AsyncClient(http2=True) as client:
        batches = [rows[i:i+batch_size] for i in range(0, len(rows), batch_size)]
        tasks = [ingest_batch(client, url, key, "orders", b) for b in batches]
        results = await asyncio.gather(*tasks)
    
    success = sum(results)
    print(f"Queued {success}/{len(batches)} batches ({success * batch_size} rows)")
```

---

## 📊 Monitoring & Observability

### Prometheus Metrics

The ingestion worker exposes a `/metrics` endpoint (Prometheus format) on port `8080`:

| Metric | Type | Description |
|---|---|---|
| `rows_ingested_total` | Counter | Total rows successfully written |
| `rows_failed_total` | Counter | Total rows that failed after retries |
| `rows_dlq_total` | Counter | Total rows sent to dead-letter queue |
| `batches_total` | Counter | Total batches processed (by status) |
| `insert_latency_ms` | Histogram | Per-batch insert latency distribution |

### Grafana Dashboard

Import the included `grafana_dashboard.json` for a pre-built dashboard showing:
- Real-time rows/second ingestion rate
- Error rate and DLQ depth
- Worker latency percentiles (P50, P95, P99)
- Redis queue depth over time
- Adaptive throttle state (batch size, concurrency)

### Alerting

The included `alert_rules.yml` (Prometheus Alertmanager format) configures alerts for:
- High DLQ depth (>100 items)
- Worker error rate >5%
- P99 latency >5,000ms
- Redis queue depth >10,000 (backpressure warning)

---

## 🚢 Deployment Guide

### Dashboard — Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel deploy --prod
```

Set all environment variables in the Vercel dashboard under **Settings → Environment Variables**.

### Ingestion Worker — Fly.io (Recommended)

The worker ships with a `fly.toml` and `Dockerfile`:

```bash
cd ingestion-worker

# Install Fly CLI and authenticate
fly auth login

# Create the app
fly launch --name fluxbase-worker --no-deploy

# Set secrets
fly secrets set UPSTASH_REDIS_REST_URL="..."
fly secrets set UPSTASH_REDIS_REST_TOKEN="..."
fly secrets set FLUXBASE_API_KEY="..."
fly secrets set FLUXBASE_PROJECT_ID="..."
fly secrets set AWS_RDS_POSTGRES_URL="..."

# Deploy
fly deploy
```

**Scaling across multiple regions:**

```bash
# Run 3 workers in 3 regions for geo-distributed ingestion
fly scale count 3 --region iad,fra,sin
```

### Ingestion Worker — Docker

```bash
cd ingestion-worker
docker build -t fluxbase-worker .

docker run -d \
  --name fluxbase-worker \
  -e UPSTASH_REDIS_REST_URL="..." \
  -e UPSTASH_REDIS_REST_TOKEN="..." \
  -e FLUXBASE_API_KEY="..." \
  -e FLUXBASE_PROJECT_ID="..." \
  -e AWS_RDS_POSTGRES_URL="..." \
  -e NUM_WORKERS=10 \
  -p 8080:8080 \
  fluxbase-worker
```

### AWS RDS Recommended Configuration

For maximum ingestion performance, apply these PostgreSQL parameters to your RDS parameter group:

```sql
-- In RDS Parameter Group (requires reboot)
shared_buffers                = 25% of RAM       -- e.g., 4GB on db.r6g.2xlarge
effective_cache_size          = 75% of RAM
maintenance_work_mem          = 512MB
checkpoint_completion_target  = 0.9
wal_buffers                   = 64MB
default_statistics_target     = 100
max_connections               = 200

-- Applied per-session by the worker (no reboot needed)
synchronous_commit            = off
work_mem                      = 64MB
```

---

## 🧪 Development & Testing

```bash
# Type-check frontend
npm run typecheck

# Lint frontend
npm run lint

# Build for production
npm run build

# Run ingestion worker tests
cd ingestion-worker
python test_pipeline.py

# Run quick DB connectivity test
python quick_test.py

# Load test the ingestion pipeline
python simulate.py --url http://localhost:3000 --count 100000 --concurrency 10
```

---

## 🗂️ Project Structure

```
Fluxbase/
├── src/
│   ├── app/
│   │   ├── (app)/                 # Authenticated dashboard routes
│   │   │   ├── analytics/         # Query traffic analytics
│   │   │   ├── dashboard/         # Project overview
│   │   │   ├── database/          # Table editor + ERD
│   │   │   ├── editor/            # SQL scratchpad
│   │   │   ├── query/             # Query history
│   │   │   ├── scraper/           # Web scraper runner
│   │   │   ├── settings/          # Project settings, API keys, webhooks
│   │   │   └── storage/           # File/blob storage
│   │   ├── api/
│   │   │   ├── execute-sql/       # Core SQL execution endpoint
│   │   │   ├── ingest/            # High-throughput row ingestion
│   │   │   ├── bulk-fast-insert/  # Synchronous bulk insert
│   │   │   ├── realtime/          # SSE event stream
│   │   │   ├── webhooks/          # Webhook management
│   │   │   ├── schema/            # Schema introspection
│   │   │   ├── analytics/         # Usage analytics
│   │   │   ├── backups/           # Backup & restore
│   │   │   ├── rls/               # Row-level security policies
│   │   │   ├── auth/              # Authentication
│   │   │   ├── health/            # Health check
│   │   │   └── ...                # 29 total API routes
│   │   └── ...
│   ├── hooks/
│   │   └── use-realtime-subscription.ts  # SSE singleton hook (throttled)
│   ├── lib/
│   │   ├── pg.ts                  # PostgreSQL connection pool
│   │   └── mysql.ts               # MySQL connection pool
│   └── components/                # Shared UI components
│
├── ingestion-worker/
│   ├── main.py                    # Entry point + worker orchestration
│   ├── worker.py                  # Core worker loop (dequeue → insert)
│   ├── fluxbase_client.py         # asyncpg COPY + HTTP fallback client
│   ├── throttle.py                # Adaptive throughput controller
│   ├── queue_client.py            # Upstash Redis queue interface
│   ├── config.py                  # Centralised configuration
│   ├── metrics.py                 # In-process metrics aggregator
│   ├── prometheus_metrics.py      # Prometheus counter/histogram exports
│   ├── health.py                  # Health check HTTP server
│   ├── scaler.py                  # Auto-scaling logic
│   ├── simulate.py                # Load test producer
│   ├── test_pipeline.py           # Integration tests
│   ├── requeue.py                 # DLQ requeue tool
│   ├── Dockerfile                 # Container image
│   ├── fly.toml                   # Fly.io deployment config
│   ├── alert_rules.yml            # Prometheus alerting rules
│   └── grafana_dashboard.json     # Pre-built Grafana dashboard
│
├── .env.local                     # Dashboard environment variables (gitignored)
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

## 📄 License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ for developers who refuse to compromise on performance.
</p>
