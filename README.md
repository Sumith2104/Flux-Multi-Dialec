<p align="center">
  <img src="src/app/favicon.ico" alt="Fluxbase Logo" width="120" height="120" />
</p>

<h1 align="center">Fluxbase ⚡</h1>

<p align="center">
  <strong>The Serverless SQL Platform Built for Speed, Scale, and Developers.</strong>
</p>

---

## 📖 What is Fluxbase?

Fluxbase is a serverless SQL platform designed to wrap your relational databases in a developer-friendly REST API, complete with a high-performance async ingestion pipeline and real-time subscription capabilities. It enables multi-dialect database execution (PostgreSQL and MySQL) with strict tenant-isolation and zero-trust security.

---

## ✨ Key Features

- **Native SQL Execution (Multi-Dialect)**: Execute raw SQL queries directly on bare-metal PostgreSQL or MySQL drivers without heavy ORM abstractions.
- **High-Throughput Ingestion**: Leverage a dedicated ingestion pipeline capable of writing 80,000+ rows/second asynchronously.
- **Real-Time Data Streaming**: Stream row-level database updates (`INSERT`, `UPDATE`, `DELETE`) to clients over resilient Server-Sent Events (SSE).
- **Security-First Architecture**: Built-in AST-based command validation, JWT-claim RLS mapping, and scoped API key authorization.

---

## 📖 API Reference

All requests require a project-scoped API key passed via the authorization header:
```http
Authorization: Bearer <your-api-key>
```

### `POST /api/execute-sql`
Executes an arbitrary SQL query under the project's namespace.

**Request:**
```json
{
  "query": "SELECT * FROM users WHERE active = true LIMIT 5"
}
```

**Response:**
```json
{
  "success": true,
  "result": {
    "rows": [
      { "id": "018f4a2b-...", "name": "Alice" }
    ],
    "columns": ["id", "name"]
  }
}
```

### `POST /api/ingest`
Queues rows for high-speed asynchronous ingestion.

**Request:**
```json
{
  "table": "events",
  "rows": [
    { "event_name": "page_view", "path": "/home" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "queued": 1,
  "batchId": "batch_12345"
}
```

### `GET /api/realtime`
Establish a Server-Sent Events (SSE) connection to subscribe to database events.
```http
GET /api/realtime?projectId=<project-id>
Accept: text/event-stream
```

---

## 🏭 Ingestion Worker

The ingestion worker is a standalone service written in Python that dequeues rows from a Redis buffer and streams them to the database.

- **Fast COPY Protocol**: Rather than running parameterized `INSERT` statements, the worker streams batches using `asyncpg`'s `COPY` protocol to maximize performance.
- **Dynamic Union Schema Merging**: Before importing a batch, the worker dynamically calculates the union of keys present across all rows to auto-ensure column existence.
- **Strict Identifier Sanitization**: Rejects and quarantines (to a DLQ) any table or column name not matching `^[a-zA-Z_][a-zA-Z0-9_]*$` to block SQL injection at the ingestion boundary.

---

## 📡 Real-Time Subscriptions

Fluxbase implements low-latency SSE subscriptions with connection resilience:
- **Throttled Cache Invalidation**: Throttles invalidation events to prevent UI blocking under high-frequency database writes.
- **Connection Resilience**: Incorporates exponential backoff with jitter and heartbeats to ensure automatic client reconnection.
- **Shared Event Source**: Reuses a single SSE connection per project across multiple UI components to prevent connection exhaustion.

---

## ⚡ Performance Deep Dive

- **COPY vs INSERT**: Bulk inserts are translated into PostgreSQL binary stream copies, eliminating SQL parsing and planning overhead.
- **Monotonic UUID v7**: Fluxbase recommends UUID v7 primary keys to prevent B-tree page fragmentation and index splits under heavy insert loads.
- **Asynchronous WAL Writing**: Using transaction-local `SET synchronous_commit = off` allows fast database ingestion replies without waiting for disk flushes.

---

## 🧑‍💻 Client Integration Examples

### JavaScript / TypeScript
```typescript
async function executeQuery<T>(sql: string): Promise<T[]> {
  const response = await fetch("https://api.fluxbase.dev/api/execute-sql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer <API_KEY>"
    },
    body: JSON.stringify({ query: sql })
  });
  const data = await response.json();
  if (!data.success) throw new Error(data.error.message);
  return data.result.rows;
}
```

### Python
```python
import requests

def ingest_rows(table: str, rows: list[dict]):
    response = requests.post(
        "https://api.fluxbase.dev/api/ingest",
        headers={"Authorization": "Bearer <API_KEY>"},
        json={"table": table, "rows": rows}
    )
    return response.json()
```

---

## 📊 Monitoring & Observability

The Ingestion worker exposes a `/metrics` Prometheus endpoint, tracking:
- `rows_ingested_total` (counter)
- `rows_failed_total` (counter)
- `rows_dlq_total` (counter)
- `insert_latency_ms` (histogram)

You can import the preconfigured Grafana dashboard in `ingestion-worker/grafana_dashboard.json` to monitor ingest throughput, error rates, and queue latency.

---

## 🗂️ Project Structure

```
Fluxbase/
├── src/
│   ├── app/                   # Next.js pages and API routing
│   │   ├── (app)/             # Authenticated dashboard views
│   │   └── api/               # API endpoints (execute-sql, ingest, realtime)
│   ├── components/            # UI components (SQL editor, table viewer)
│   └── lib/                   # Database pools, auth, and helper modules
├── ingestion-worker/          # Async Python ingestion worker
│   ├── main.py                # Worker process entrypoint
│   └── worker.py              # Schema merger and COPY implementation
├── package.json
└── README.md
```

---

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch: `git checkout -b feat/my-feature`.
3. Commit your changes: `git commit -m 'feat: add feature'`.
4. Push to origin: `git push origin feat/my-feature`.
5. Open a Pull Request.
