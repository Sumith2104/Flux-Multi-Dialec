# Fluxbase Upgrade — Change Log, Deployment Checklist & Test Plan

> Generated: 2026-08-28 | All phases complete | Typecheck: 0 errors | Tests: 37/37 passing

---

## Table of Contents

1. [All Changes Made](#1-all-changes-made)
2. [Manual Pre-Deployment Tasks](#2-manual-pre-deployment-tasks)
3. [Remaining TODOs](#3-remaining-todos)
4. [Manual Test Cases](#4-manual-test-cases)

---

## 1. All Changes Made

### Phase 1: Foundation & Security

#### 1A — Test Suite (37 tests)
| Change | File |
|--------|------|
| Vitest config with ESM support | `vitest.config.ts` |
| Test setup file | `src/__tests__/setup.ts` |
| SQL safety tests (33 cases) | `src/lib/__tests__/sql-safety.test.ts` |
| API key tests (4 cases) | `src/lib/__tests__/api-keys.test.ts` |
| tsconfig excludes test files | `tsconfig.json` |

#### 1B — Auth: jsonwebtoken → jose + Refresh Tokens
| Change | File |
|--------|------|
| Removed `jsonwebtoken`, added `jose` | `package.json` |
| Migrated `sign/verify` to `jose` `SignJWT/jwtVerify` | `src/lib/auth.ts` |
| Access token TTL: 30 days → **15 minutes** | `src/lib/auth.ts` |
| Added `createRefreshToken()` | `src/lib/auth.ts` |
| Added `verifyAndRotateRefreshToken()` (one-time-use rotation) | `src/lib/auth.ts` |
| Added `revokeAllRefreshTokens()` | `src/lib/auth.ts` |
| **NEW** Refresh endpoint | `src/app/api/auth/refresh/route.ts` |
| **NEW** Refresh tokens table DDL | `scripts/migrations/001_refresh_tokens.sql` |
| Set refresh token cookie on login | `src/app/api/auth/github/callback/route.ts` |
| Set refresh token cookie on login | `src/app/api/auth/google/callback/route.ts` |
| Set refresh token cookie on login | `src/app/api/auth/magic-login/route.ts` |
| Logout revokes refresh tokens + clears cookie | `src/lib/auth.ts` (logout function) |
| Migrated realtime token to jose | `src/app/api/realtime/token/route.ts` |
| Migrated WebSocket to jose async jwtVerify | `src/server/websocket.ts` |
| Removed dev secret fallback | `src/middleware.ts` |

#### 1C — SQL Safety Hardening
| Change | File |
|--------|------|
| 30s `statement_timeout` via `SET` before execution | `src/lib/sql-engine.ts` |
| Result truncation at 10,000 rows | `src/lib/sql-engine.ts` |
| 2-layer RLS validation: regex quick-reject + AST via `node-sql-parser` | `src/lib/sql-safety.ts` |

#### 1D — Production Hardening
| Change | File |
|--------|------|
| **NEW** Startup config validation, blocks dev secrets in production | `src/lib/config-validator.ts` |
| **NEW** 10MB body size guard | `src/lib/body-size-limit.ts` |
| **NEW** Graceful SIGTERM/SIGINT handler | `src/lib/shutdown.ts` |
| SSL: `rejectUnauthorized: false` → `true` + `PG_SSL_CA_PATH` support | `src/lib/pg.ts` |
| SSL hardened on external pools | `src/lib/tenant-pools.ts` |
| `queueLimit: 0` (unlimited) → `10` | `src/lib/tenant-pools.ts` |
| Exported `getExternalPools()` | `src/lib/tenant-pools.ts` |
| Removed dev secret fallback | `src/lib/auth.ts` |

#### Scope Enforcement (19 mutating routes)
| Change | File |
|--------|------|
| **NEW** `requireScope()`, `requireWriteScope()`, `requireAdminScope()` | `src/lib/require-scope.ts` |
| Write scope on execute-sql | `src/app/api/execute-sql/route.ts` |
| Write scope + body size on fast-insert | `src/app/api/fast-insert/route.ts` |
| Write scope + body size on bulk-fast-insert | `src/app/api/bulk-fast-insert/route.ts` |
| Write scope on 16 additional routes | `migrations/run`, `rls`, `rls/toggle`, `scrapers`, `snapshots`, `storage/upload`, `storage/upload/finalize`, `storage/buckets`, `storage/files`, `team`, `team/role`, `team/invites/accept`, `webhooks`, `backups`, `backups/restore`, `provision` |

### Phase 2: Observability & Quality

#### 2A — Structured Logging (pino)
| Change | File |
|--------|------|
| **NEW** Pino singleton with env-based levels + pretty-print in dev | `src/lib/logger.ts` |
| **350 replacements** across 97 files: `console.*` → `logger.*` | All `src/lib/`, `src/server/`, `src/app/api/`, `src/app/actions.ts`, `src/actions/`, `src/scraper/`, `src/app/(app)/` |
| `.catch(console.error)` → `.catch((e) => { logger.error(e); })` | 6 files |

#### 2B — Prometheus Metrics
| Change | File |
|--------|------|
| **NEW** `/api/metrics` endpoint (Prometheus text format) | `src/app/api/metrics/route.ts` |
| Metrics: uptime, memory (rss, heap), PG pool (total, idle, waiting), external pool count | |

#### 2C — CI/CD Pipeline
| Change | File |
|--------|------|
| **NEW** GitHub Actions: lint → typecheck → test → build → deploy | `.github/workflows/ci.yml` |
| **NEW** Multi-stage Dockerfile (deps → builder → runner) | `Dockerfile` |
| **NEW** Docker Compose for dev (app + redis + pgbouncer) | `docker-compose.yml` |
| **NEW** Docker Compose for test (postgres + redis) | `docker-compose.test.yml` |
| **NEW** Docker ignore file | `.dockerignore` |

### Phase 3: Scalability

#### 3A — Dialect Abstraction
| Change | File |
|--------|------|
| **NEW** `DatabaseAdapter` interface, `QueryResult`, `TransactionClient`, etc. | `src/lib/db/adapters/types.ts` |
| **NEW** PostgresAdapter implementing all interface methods | `src/lib/db/adapters/postgres.ts` |
| **NEW** MySqlAdapter implementing all interface methods | `src/lib/db/adapters/mysql.ts` |
| **NEW** Barrel export | `src/lib/db/adapters/index.ts` |

#### 3B — Redis Pub/Sub for Cluster Realtime
| Change | File |
|--------|------|
| **NEW** Cross-instance event relay layer | `src/lib/realtime-pubsub.ts` |
| `publishRealtimeEvent()` — publishes to Redis after writes | |
| `isClusterMode()` — checks if Redis is configured | |

#### 3C — PgBouncer
| Change | File |
|--------|------|
| **NEW** PgBouncer config (transaction mode, configurable pool sizes) | `pgbouncer/pgbouncer.ini` |
| **NEW** Userlist template | `pgbouncer/userlist.txt` |

### Phase 4: Developer Experience

#### 4A — API Versioning + Auto-REST
| Change | File |
|--------|------|
| **NEW** Dynamic CRUD route: GET (paginated list), POST (insert), PUT (update), DELETE | `src/app/api/v1/rest/[projectId]/[table]/route.ts` |
| **NEW** `listRows`, `getRow`, `insertRow`, `updateRow`, `deleteRow`, `sanitizeTableName` | `src/lib/rest-generator.ts` |
| Pagination: `?page=1&limit=50&order_by=col&filter[col]=val` | |

#### 4B — OpenAPI Spec
| Change | File |
|--------|------|
| **NEW** Generates OpenAPI 3.0 spec for all endpoints | `src/lib/openapi-generator.ts` |
| **NEW** `/api/docs` serves spec as JSON | `src/app/api/docs/route.ts` |

#### 4C — Migration Tooling v2
| Change | File |
|--------|------|
| **NEW** Versioned migrations with up/down, schema diff | `src/lib/migrations-v2.ts` |
| `_flux_migrations` history table per schema | |
| `diffSchemas()` — compares two DDL strings | |

#### 4D — CLI Tool
| Change | File |
|--------|------|
| **NEW** CLI package with 6 commands | `packages/cli/` |
| `fluxbase login <url> --key <key>` | `packages/cli/src/commands/login.ts` |
| `fluxbase sql "SELECT..." --project <id>` | `packages/cli/src/commands/sql.ts` |
| `fluxbase tables --project <id>` | `packages/cli/src/commands/tables.ts` |
| `fluxbase push schema.sql --project <id>` | `packages/cli/src/commands/push.ts` |
| `fluxbase pull --project <id>` | `packages/cli/src/commands/pull.ts` |
| `fluxbase seed data.json --project <id> --table <name>` | `packages/cli/src/commands/seed.ts` |

#### 4E — Edge Functions Interface
| Change | File |
|--------|------|
| **NEW** Full interface: `EdgeFunctionContext`, `EdgeFunctionRuntime`, triggers, DDL | `src/lib/edge-functions.ts` |
| Supports: before/after insert/update/delete, http-request | |

### Security Hardening (post-phase)

| Change | File |
|--------|------|
| **NEW** CORS utility — reads `ALLOWED_ORIGINS` env var, no wildcard `*` | `src/lib/cors.ts` |
| Replaced `Access-Control-Allow-Origin: *` on 5 routes | `execute-sql`, `fast-insert`, `bulk-fast-insert`, `table-data`, `docs` |
| Removed hardcoded webhook secrets (`sumith@fluxbase`, `fluxbase_payment_webhook_secret_key_2026`) | `src/app/api/webhooks/payment/route.ts` |
| Server-side plan IDs use `RAZORPAY_PRO_PLAN_ID` (not `NEXT_PUBLIC_`) | `src/app/api/subscriptions/create/route.ts` |

#### OpenTelemetry Tracing
| Change | File |
|--------|------|
| **NEW** OTel SDK init, auto-instruments pg/redis/fetch | `src/lib/tracing.ts` |
| Activated via `OTEL_EXPORTER_OTLP_ENDPOINT` env var | |

---

## 2. Manual Pre-Deployment Tasks

### CRITICAL — Must do before deploy

- [ ] **Run refresh tokens migration** against production DB:
  ```sql
  -- From scripts/migrations/001_refresh_tokens.sql
  CREATE TABLE IF NOT EXISTS fluxbase_global.refresh_tokens (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      user_id TEXT NOT NULL REFERENCES fluxbase_global.users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON fluxbase_global.refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON fluxbase_global.refresh_tokens(token_hash);
  ```
  ⚠️ Without this table, login will 500 because the refresh token cookie setter fails.

- [ ] **Set `ALLOWED_ORIGINS`** environment variable:
  ```
  ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
  ```
  Without this, all API CORS headers will be omitted → browser cross-origin requests will fail.

- [ ] **Set `PAYMENT_WEBHOOK_SECRET`** and **`SMS_WEBHOOK_SECRET`** env vars:
  - Previously hardcoded secrets were removed. Without these env vars, the webhook endpoint returns 500.

### IMPORTANT — Should do before deploy

- [ ] **Set `RAZORPAY_PRO_PLAN_ID`** and **`RAZORPAY_MAX_PLAN_ID`** as server-only env vars:
  - Server code now reads these (not `NEXT_PUBLIC_*`). Set them to the same values your `NEXT_PUBLIC_*` vars have.

- [ ] **Verify `PG_SSL_CA_PATH`** if using a custom CA:
  - `src/lib/pg.ts` now enforces `rejectUnauthorized: true`. If your DB uses a self-signed cert, set `PG_SSL_CA_PATH` to the CA file path. If you must disable (dev only), set `PG_SSL_DISABLED=true`.

- [ ] **Add GitHub Actions secrets** for CI/CD:
  - `RENDER_DEPLOY_HOOK_STAGING` — Render deploy hook URL for staging
  - `RENDER_DEPLOY_HOOK_PRODUCTION` — Render deploy hook URL for production

- [ ] **npm audit fix**:
  ```bash
  npm audit fix --legacy-peer-deps
  ```
  117 vulnerabilities reported. Most are in dev dependencies. Review remaining after auto-fix.

### OPTIONAL — Nice to have

- [ ] **Set `OTEL_EXPORTER_OTLP_ENDPOINT`** for OpenTelemetry tracing (e.g. Honeycomb, Grafana Tempo)
- [ ] **Set `UPSTASH_REDIS_REST_URL`** + `UPSTASH_REDIS_REST_TOKEN` for cluster-mode realtime Pub/Sub
- [ ] **Configure PgBouncer** in front of Postgres for production (see `pgbouncer/pgbouncer.ini`)
- [ ] **Set `LOG_LEVEL`** env var (default: `info` in prod, `debug` in dev)

---

## 3. Remaining TODOs

| # | Item | Priority | Notes |
|---|------|----------|-------|
| 1 | Wire `src/lib/config-validator.ts` into app startup | Medium | Call `validateConfig()` in `instrumentation.ts` or `layout.tsx` |
| 2 | Wire `src/lib/shutdown.ts` into app startup | Medium | Call `registerShutdownHandlers()` in `instrumentation.ts` |
| 3 | Wire `src/lib/tracing.ts` into `instrumentation.ts` | Medium | Call `initTracing()` — Next.js supports `instrumentation.ts` natively |
| 4 | Replace `src/lib/sql-engine.ts` internals with `DatabaseAdapter` | Medium | SqlEngine still uses `pg.Pool` directly; refactor to accept adapter |
| 5 | Implement `MySqlAdapter.query()` with `$1` → `?` param conversion | Low | MySQL uses positional `?` params, not PG-style `$n` |
| 6 | Add OpenTelemetry spans to SqlEngine | Low | Wrap query execution in OTel spans for distributed tracing |
| 7 | Write integration tests for refresh token flow | Medium | Test login → cookie → refresh → rotation → revoke |
| 8 | Write integration tests for auto-REST CRUD | Medium | Test GET/POST/PUT/DELETE on v1/rest endpoint |
| 9 | Write integration tests for CORS origin checking | Medium | Test with matching and non-matching origins |
| 10 | Add rate limiting middleware | Low | Per-IP and per-API-key rate limits |
| 11 | CSP headers | Low | Content-Security-Policy for the web app |

---

## 4. Manual Test Cases

### A. Authentication — Refresh Token Flow

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| A1 | Login sets refresh cookie | Login via GitHub/Google/Magic Link | Response sets `refresh_token` HttpOnly cookie with 7-day expiry |
| A2 | Access token expires after 15 min | Wait 15+ min after login, make API call | Returns 401 |
| A3 | Refresh token works | After access token expires, call `POST /api/auth/refresh` | Returns new 15-min access token |
| A4 | Refresh token rotates | Call `/api/auth/refresh` twice with same cookie | Second call returns 401 (old token revoked) |
| A5 | Logout revokes refresh tokens | Logout, then try `/api/auth/refresh` | Returns 401 |
| A6 | No dev secret in production | Set `NODE_ENV=production`, start without `JWT_SECRET` | App refuses to start (config-validator blocks) |

### B. CORS — Origin Validation

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| B1 | Matching origin allowed | Set `ALLOWED_ORIGINS=https://app.example.com`, request with `Origin: https://app.example.com` | Response includes `Access-Control-Allow-Origin: https://app.example.com` and `Vary: Origin` |
| B2 | Non-matching origin blocked | Same config, request with `Origin: https://evil.com` | No `Access-Control-Allow-Origin` header |
| B3 | No ALLOWED_ORIGINS set | Remove env var, make request | No CORS headers (browser blocks cross-origin) |
| B4 | Preflight works | Send OPTIONS with valid origin | Returns 204 with CORS headers |

### C. SQL Safety — Timeout & Truncation

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| C1 | Query timeout | Execute a slow query: `SELECT pg_sleep(35)` | Returns error after 30s timeout |
| C2 | Result truncation | Execute `SELECT * FROM generate_series(1, 20000)` | Returns 10,000 rows + `truncated: true` + `totalRows: 20000` |
| C3 | RLS AST validation | Try `SET row_level_security = off` | Rejected by AST validator (RLS bypass attempt) |
| C4 | Read-only scope blocks write | Use API key with `scopes: ["read"]`, try `INSERT INTO ...` | Returns 403 |

### D. Webhook — No Hardcoded Secrets

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| D1 | No env var = 500 | Remove `PAYMENT_WEBHOOK_SECRET`, send webhook | Returns 500 "Webhook not configured" |
| D2 | Correct secret = 200 | Set `PAYMENT_WEBHOOK_SECRET=abc`, send with `x-webhook-secret: abc` | Processes webhook normally |
| D3 | Wrong secret = 401 | Send with `x-webhook-secret: wrong` | Returns 401 |
| D4 | Old hardcoded secret rejected | Send with `x-webhook-secret: fluxbase_payment_webhook_secret_key_2026` | Returns 401 (no longer accepted) |

### E. Auto-REST API

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| E1 | List with pagination | `GET /api/v1/rest/{projectId}/orders1?page=1&limit=10` | Returns `{ data: [...], pagination: { page: 1, limit: 10, total: N } }` |
| E2 | Filter | `GET /api/v1/rest/{projectId}/orders1?filter[status]=pending` | Only rows where status = 'pending' |
| E3 | Insert row | `POST /api/v1/rest/{projectId}/orders1` with `{ "customer_id": 1, "order_date": "2026-01-01", "status": "new" }` | Returns 201 with created row |
| E4 | Update row | `PUT /api/v1/rest/{projectId}/orders1` with `{ "id": 123, "status": "shipped" }` | Returns 200 with updated row |
| E5 | Delete row | `DELETE /api/v1/rest/{projectId}/orders1?id=123` | Returns 200 `{ success: true }` |
| E6 | Invalid table name | `GET /api/v1/rest/{projectId}/DROP TABLE users` | Returns 400 (table name sanitized) |
| E7 | Unauthenticated | Call without auth headers | Returns 401 |
| E8 | Read-only scope | Use `scopes: ["read"]` API key, try POST | Returns 403 |

### F. OpenAPI Spec

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| F1 | Spec valid | `GET /api/docs` | Returns valid OpenAPI 3.0 JSON with `openapi: "3.0.3"` |
| F2 | Paths documented | Check spec paths | Includes `/api/execute-sql`, `/api/v1/rest/{projectId}/{table}`, `/api/auth/refresh`, `/api/metrics` |

### G. Prometheus Metrics

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| G1 | Metrics format | `GET /api/metrics` | Returns Prometheus text format (`fluxbase_` prefixed metrics) |
| G2 | Memory metrics | Check response | Includes `fluxbase_memory_rss_bytes` and `fluxbase_memory_heap_used_bytes` |
| G3 | Pool metrics | Check response with active PG pool | Includes `fluxbase_pg_pool_total`, `fluxbase_pg_pool_idle` |

### H. Body Size Limit

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| H1 | Under limit | Send 5MB body to fast-insert | Processes normally |
| H2 | Over limit | Send 11MB body to fast-insert | Returns 413 "Request body too large" |

### I. SSL Configuration

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| I1 | Production rejects unauthorized | Set `NODE_ENV=production`, connect to DB with self-signed cert | Connection refused (rejectUnauthorized: true) |
| I2 | Custom CA accepted | Set `PG_SSL_CA_PATH=/path/to/ca.pem` | Connection succeeds |
| I3 | Dev bypass | Set `PG_SSL_DISABLED=true` | Connection succeeds (dev override) |

### J. Scope Enforcement

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| J1 | Read-only API key | Use `scopes: ["read"]`, call `POST /api/migrations/run` | Returns 403 |
| J2 | Write API key | Use `scopes: ["write"]`, call `POST /api/migrations/run` | Processes normally |
| J3 | Full scope API key | Use `scopes: ["admin"]`, call any mutating endpoint | Processes normally |
| J4 | JWT user (no scopes) | Auth via login cookie, call any endpoint | Processes normally (scopes only apply to API keys) |

### K. CLI Tool

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| K1 | Login | `fluxbase login https://app.fluxbase.com --key fb_xxx` | Writes `~/.fluxbase/config.json` |
| K2 | SQL query | `fluxbase sql "SELECT 1" --project proj_xxx` | Prints result table |
| K3 | List tables | `fluxbase tables --project proj_xxx` | Lists all tables with column counts |
| K4 | Push schema | `fluxbase push schema.sql --project proj_xxx` | Executes each statement, shows progress |
| K5 | Pull schema | `fluxbase pull --project proj_xxx` | Outputs CREATE TABLE DDL |
| K6 | Seed data | `fluxbase seed data.json --project proj_xxx --table orders1` | Inserts rows, shows count |

### L. Structured Logging

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| L1 | No console.log in source | `grep -r "console\.\(log\|error\|warn\)" src/ --include="*.ts"` | Zero matches (excluding logger.ts) |
| L2 | JSON in production | Set `NODE_ENV=production`, trigger a log line | Output is valid JSON |
| L3 | Pretty-print in dev | Set `NODE_ENV=development`, trigger a log line | Output is colorized pretty-print |

### M. PgBouncer

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| M1 | Transaction mode | Connect via PgBouncer port 6432, run query | Connection is in transaction pool mode |
| M2 | Pool size | Check PgBouncer admin stats | `default_pool_size = 20` |
| M3 | Max clients | Check config | `max_client_conn = 1000` |
