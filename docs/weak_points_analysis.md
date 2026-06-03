# Fluxbase Security & Architectural Analysis Report

This document outlines the security vulnerabilities, architectural bottlenecks, and logic bugs identified during the analysis of the Fluxbase codebase.

---

## 1. Security & Scope Bypass Vulnerabilities

### Multi-Statement SQL Isolation Bypass
* **Target File:** [src/lib/sql-engine.ts](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/sql-engine.ts) (specifically [SqlEngine.validateScope](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/sql-engine.ts#L418))
* **Description:** Operation scopes (`read`, `write`, `admin`) are determined by inspecting the first word of the query string:
  ```typescript
  const firstWord = query.trim().split(/\s+/)[0].toUpperCase();
  this.validateScope(firstWord);
  ```
* **Implications:**
  > [!WARNING]
  > Because database client pools (both PostgreSQL and MySQL) support multi-statement execution, query separation allows a user with restricted permissions (e.g., `read`) to chain unauthorized commands.
  * **Chaining:** A user can send `SELECT 1; DROP TABLE users;`. The first word is `SELECT` (which is authorized for the `read` scope), but the driver executes all statements, resulting in unauthorized DDL execution.
  * **Comment/Formatting evasion:** Starting queries with leading comments (e.g., `/* query */ DROP TABLE users;`) shifts the first word token to `/*`, causing the validation logic to misclassify or fail to match expected read/write keywords.

### Direct DDL Injection via Unsanitized Column Parameters
* **Target File:** [src/lib/data.ts](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/data.ts) (specifically [addColumn](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/data.ts#L865))
* **Description:** While database queries parameterized with dynamic values are safe, structural database definitions (DDL queries) interpolate table and column names directly into SQL strings.
* **Implications:**
  > [!CAUTION]
  > In the [addColumn](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/data.ts#L865) logic for PostgreSQL:
  > ```typescript
  > let def = `ADD COLUMN "${column.column_name}" ${type}`;
  > await pool.query(`ALTER TABLE "${schemaName}"."${safeTableName}" ${def}`);
  > ```
  > The variable `column.column_name` is not filtered or sanitized against character escapes before being wrapped in double quotes. A malicious user with table schema editing capabilities could name a column:
  > `my_new_col" TEXT; DROP TABLE users; --`
  > This string escapes the double quotes and executes arbitrary queries on the database.

### Insecure Firestore Rules (Project Stats Exposure)
* **Target File:** [firestore.rules](file:///c:/Users/sumit/Downloads/Fluxbase-main/firestore.rules)
* **Description:** The Firestore database rule definitions for project stats sub-collections lack ownership validation.
* **Implications:**
  > [!IMPORTANT]
  > The rules for `/stats`, `/stats_history`, and `/stats_realtime` are configured as:
  > ```javascript
  > match /stats/{statId} {
  >   allow read: if request.auth != null; 
  > }
  > ```
  > Any logged-in Firebase user can query statistics and usage history from *any other user's project* without validation of project membership or ownership.
  > Additionally, because the project write rule checks `resource.data.user_id`, document creation fails because the document does not exist yet (resulting in an undefined `resource` object).

---

## 2. Ingestion & Pipeline Robustness Issues

### Heterogeneous Schema Mismatch in Ingestion Batches
* **Target File:** [ingestion-worker/fluxbase_client.py](file:///c:/Users/sumit/Downloads/Fluxbase-main/ingestion-worker/fluxbase_client.py) (specifically [ensure_table_exists](file:///c:/Users/sumit/Downloads/Fluxbase-main/ingestion-worker/fluxbase_client.py#L284))
* **Description:** The worker dynamically checks if the target table exists and, if not, auto-creates it based on the keys of the **first** row in the batch (`rows[0]`).
* **Implications:**
  * If a high-throughput batch contains records with non-uniform keys (e.g. Row 0 has `{"id": 1, "name": "val"}` and Row 1 has `{"id": 2, "description": "val"}`):
    1. The table is created using only the fields present in Row 0 (creating columns `id` and `name`).
    2. The batch copy payload aligns fields for all records using the union of all keys `["id", "name", "description"]`.
    3. The `copy_records_to_table` call fails because the database table lacks the `description` column. The entire batch is aborted and sent to the Dead-Letter Queue (DLQ).

### Ingestion DDL SQL Injection
* **Target File:** [ingestion-worker/fluxbase_client.py](file:///c:/Users/sumit/Downloads/Fluxbase-main/ingestion-worker/fluxbase_client.py) (specifically [ensure_table_exists](file:///c:/Users/sumit/Downloads/Fluxbase-main/ingestion-worker/fluxbase_client.py#L284))
* **Description:** In the ingestion worker, column names (derived from keys of ingestion JSON payloads) are directly interpolated into the table creation DDL:
  ```python
  for key, val in sample_row.items():
      pg_type = _infer_pg_type(val)
      col_defs.append(f'"{key}" {pg_type}')
  ```
* **Implications:**
  > [!WARNING]
  > Since keys from ingestion payloads are used to construct the SQL query, keys containing double quotes can break out of identifier quotes and lead to SQL injection during table auto-generation.

---

## 3. Architecture & Connection Management

### External Database Pool Leaks
* **Target File:** [src/lib/tenant-pools.ts](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/tenant-pools.ts) (specifically [getTenantPgPool](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/tenant-pools.ts#L46) and [getTenantMysqlPool](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/tenant-pools.ts#L80))
* **Description:** Connections to external client databases are created dynamically and cached globally in `_externalPools`.
* **Implications:**
  * While pools are closed during project deletion, they are never closed or evicted based on inactivity. Stale connection pools will leak, potentially running out of database slots or memory allocations on the hosting server over time.

### Fragile AST Fallback Regex
* **Target File:** [src/app/api/execute-sql/route.ts](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/app/api/execute-sql/route.ts#L195)
* **Description:** If the AST SQL parser throws an error during mutation analysis, the routing logic falls back to a regular expression to extract the target table name for caching and webhooks:
  ```typescript
  const tblMatch = query.match(/(?:INTO|UPDATE|FROM)\s+["'\`]?(?:[a-zA-Z0-9_]+\.)?["'\`]?([a-zA-Z0-9_]+)["'\`]?/i);
  ```
* **Implications:**
  * In complex queries containing subqueries or CTEs, the first match may point to a source table instead of the mutated table. This breaks cache invalidation, webhooks, and SSE real-time sync.

---

## 4. MFA Enforcement & Session Checks

### Incomplete MFA Middleware Check
* **Target File:** [src/middleware.ts](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/middleware.ts#L96)
* **Description:** The middleware checks for MFA verification (`isMfaVerified = false`) but only blocks requests under `/api/admin`.
* **Implications:**
  * Standard pages and endpoints (like `/api/execute-sql` and `/api/projects`) are left accessible without MFA checks, meaning an unverified session can still inspect, modify, or delete tenant resources.

---

## Recommended Remediations

1. **Robust SQL Scope Validation:** Avoid checking the first token string. Utilize a strict parsing engine to parse the incoming query and walk the syntax tree to ensure only authorized nodes are present.
2. **Identifier Sanitization:** Restrict table and column names to a safe alphanumeric subset using a strict regex (e.g. `^[a-zA-Z0-9_]+$`) before executing DDL interpolations.
3. **Union-Based Schema Inference:** Inspect all items in an ingestion batch (rather than just `rows[0]`) to ensure the table schema accounts for all columns before attempting ingestion.
4. **Implement Pool Reaper:** Set an `idleTimeoutMillis` and regularly check/evict unused external pools from the globally cached dictionary.
5. **Secure Firestore Rules:** Enforce parent project ownership inside the sub-collection rules of `firestore.rules`.
