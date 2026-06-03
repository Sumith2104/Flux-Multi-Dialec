# Fluxbase: Next-Level Security & Architecture Roadmap

This document outlines the core security, robustness, and scalability improvements required to transform **Fluxbase** into a production-grade, enterprise-ready Serverless SQL platform.

---

## 1. Zero-Trust SQL Execution Engine

### AST-Based Command Validation
* **Current Weakness:** Keyword matching on the first space-separated token of the query string.
* **Next-Level Target:** Full parse validation.
* **Implementation Plan:**
  1. Parse every incoming SQL string using the `node-sql-parser` parser.
  2. Reject any payload containing multiple statements (checking if the returned AST is an array of length > 1) unless multi-statement execution is explicitly authorized (e.g., in a migrations editor).
  3. Walk the AST programmatically to check statement type nodes against the API key scopes:
     * **Read scope:** Only allow `Select`, `Show`, `Explain` nodes.
     * **Write scope:** Allow `Insert`, `Update`, `Delete`, `Call` nodes.
     * **Admin scope:** Allow DDL nodes (`Create`, `Alter`, `Drop`, `Truncate`).
  4. Reject queries if any unauthorized nodes are discovered.

### Branded Type-Safety (`SafeSqlFragment`)
* **Current Weakness:** String interpolation allows raw, unescaped strings into DDL execution.
* **Next-Level Target:** Enforce strict type constraints on code-authored query builders.
* **Implementation Plan:**
  1. Implement a compile-time branded type system matching Supabase's `SafeSqlFragment`.
  2. Ensure that database client helpers (e.g., `pool.query()`) only accept parameters wrapped in `SafeSqlFragment`.
  3. Force developers to construct SQL using a tagged template literal (like `safeSql` or `pg-format` helpers) that validates inputs.

```typescript
type SafeSqlFragment = string & { readonly __safeSqlFragmentBrand: never };

// Only allow static strings or explicitly sanitized identifiers to compile
export function safeSql(
  strings: TemplateStringsArray,
  ...interpolated: Array<SafeSqlFragment>
): SafeSqlFragment {
  return strings.reduce(
    (result, string, i) => result + string + (interpolated[i] ?? ''),
    ''
  ) as SafeSqlFragment;
}
```

---

## 2. Row-Level Security (RLS) & Impersonation

### Native Impersonation & Claims Propagation
* **Current Weakness:** Namespace separation relies purely on altering search paths (`search_path`).
* **Next-Level Target:** Enforce PostgreSQL's Row-Level Security (RLS) dynamically using database sessions.
* **Implementation Plan:**
  1. Set the transaction-local session configuration settings before running tenant-facing queries:
     ```sql
     SET LOCAL role = 'authenticated';
     SET LOCAL request.jwt.claims = '{"sub": "user_123", "role": "authenticated"}';
     ```
  2. Require tenant databases to enable RLS on sensitive tables:
     ```sql
     ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
     CREATE POLICY order_isolation ON orders 
       USING (user_id = current_setting('request.jwt.claims', true)::jsonb->>'sub');
     ```

---

## 3. Robust Ingestion Worker Pipeline

### Dynamic Union Schema Merging
* **Current Weakness:** Ingestion worker generates table schemas using keys from only the first row (`rows[0]`), crashing when encountering rows containing new keys.
* **Next-Level Target:** Merge all incoming keys before attempting database insertion.
* **Implementation Plan:**
  1. Iterate over all items in the batch to calculate a unified column array representing the union of all keys.
  2. Perform the `CREATE TABLE IF NOT EXISTS` operation using the unified column list.
  3. Ensure that records lacking specific keys are set to `NULL` before database injection via the binary `COPY` protocol.

```python
# python implementation
all_keys = set()
for row in rows:
    all_keys.update(row.keys())
columns = sorted(list(all_keys))

# Build insertion records matching the union-calculated columns
records = []
for row in rows:
    records.append(tuple(row.get(col) for col in columns))
```

### Direct Ingestion Sanitization
* **Current Weakness:** Table columns are created using unvalidated keys straight from JSON payloads.
* **Next-Level Target:** Clean all keys using a whitelist pattern.
* **Implementation Plan:**
  1. Filter all dictionary keys using a strict regular expression: `^[a-zA-Z_][a-zA-Z0-9_]*$`.
  2. Raise a validation error and redirect the batch to the DLQ if any keys contain double quotes, semicolons, or invalid identifier characters.

---

## 4. Connection Pooling & Resource Lifecycle

### Idle Pool Garbage Collection
* **Current Weakness:** Tenant connection pools are cached in Node memory indefinitely.
* **Next-Level Target:** Implement an automated cleanup routine for idle pools.
* **Implementation Plan:**
  1. Record a `lastUsed` timestamp whenever a pool is fetched from the cache.
  2. Run a background interval checking for pools that have been idle longer than a defined threshold (e.g. 5 minutes).
  3. Gracefully drain and close idle pools to reclaim serverless connection slots:

```typescript
// Add tracking metadata to the cache mapping
interface CachedPool {
  pool: any;
  lastUsed: number;
}

declare global {
  var _externalPools: Record<string, CachedPool> | undefined;
}

setInterval(async () => {
  const pools = globalThis._externalPools;
  if (!pools) return;
  const now = Date.now();
  for (const [key, cacheEntry] of Object.entries(pools)) {
    if (now - cacheEntry.lastUsed > 300000) { // 5 minutes
      await cacheEntry.pool.end();
      delete pools[key];
    }
  }
}, 60000);
```

---

## 5. Session Protection & Access Controls

### Global MFA Enforcement Middleware
* **Current Weakness:** MFA checks are only active on `/api/admin` routes.
* **Next-Level Target:** Block access to all mutation endpoints if the user has enrolled in MFA but has not verified their second factor.
* **Implementation Plan:**
  1. Check the session JWT payload for the `mfa` claim in the Next.js `middleware.ts`.
  2. Require MFA verification for any non-GET requests under `/api/execute-sql`, `/api/projects`, `/api/webhooks`, or `/api/backups`.

### Strict Firestore Security Rules
* **Current Weakness:** Sub-collections under `/projects/{projectId}` are readable by any authenticated user.
* **Next-Level Target:** Validate user access by querying parent project settings.
* **Implementation Plan:**
  1. Update Firestore security rules to match:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /projects/{projectId} {
      allow read, write: if request.auth != null && 
        (resource.data.user_id == request.auth.uid || resource.data.userId == request.auth.uid);
      
      // Enforce project membership check on stats sub-collections
      match /stats/{statId} {
        allow read: if request.auth != null && 
          get(/databases/$(database)/documents/projects/$(projectId)).data.user_id == request.auth.uid;
      }
      match /stats_history/{historyId} {
        allow read: if request.auth != null && 
          get(/databases/$(database)/documents/projects/$(projectId)).data.user_id == request.auth.uid;
      }
      match /stats_realtime/{realtimeId} {
        allow read: if request.auth != null && 
          get(/databases/$(database)/documents/projects/$(projectId)).data.user_id == request.auth.uid;
      }
    }
  }
}
```
