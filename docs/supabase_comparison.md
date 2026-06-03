# Fluxbase vs. Supabase Architecture Comparison & Remediation Guide

This document compares the architectural designs of **Fluxbase** and **Supabase** and provides practical remediation strategies to fix the identified weak points in Fluxbase using Supabase's patterns.

---

## 1. SQL Identifier Quoting & Formatting

### The Comparison
* **Fluxbase (Brittle/Insecure):** Uses simple inline regular expressions (e.g., `replace(/[^a-zA-Z0-9_]/g, '')`) or directly interpolates parameters into double quotes (e.g., `"${column.column_name}"`).
* **Supabase (Robust/Secure):** Implements a dedicated formatting layer ([packages/pg-meta/src/pg-format/index.ts](file:///c:/Users/sumit/Downloads/supabase-master/supabase-master/packages/pg-meta/src/pg-format/index.ts)) featuring:
  1. A type-safe branded system (`SafeSqlFragment` vs `UntrustedSqlFragment`) which ensures raw untrusted SQL cannot be mixed into queries.
  2. Formatting routines (`ident` and `literal`) ported directly from the PostgreSQL C source code (`fe-exec.c`) to safely double-quote identifiers and single-quote values, escaping internal characters correctly.

### The Fix for Fluxbase
Implement a standard PostgreSQL/MySQL escaping utility in Fluxbase similar to Supabase's `ident` and `literal` formatters.

```typescript
// Safe identifier escaping function for Fluxbase
export function escapeIdentifier(ident: string): string {
  if (!ident) throw new Error("Identifier cannot be empty");
  
  // Strip any null bytes
  const clean = ident.replace(/\0/g, '');
  
  // Escape quotes by doubling them, wrap in double quotes
  let escaped = '"';
  for (const char of clean) {
    escaped += char === '"' ? '""' : char;
  }
  escaped += '"';
  return escaped;
}
```

Apply this function to all dynamic structural queries in [src/lib/data.ts](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/data.ts):
```diff
-let def = `ADD COLUMN "${column.column_name}" ${type}`;
+let def = `ADD COLUMN ${escapeIdentifier(column.column_name)} ${type}`;
```

---

## 2. SQL Scope Validation & AST Traversal

### The Comparison
* **Fluxbase (Bypassable):** Extracts the first space-separated token of the query string (`query.trim().split(/\s+/)[0]`) to authenticate commands (`SELECT`, `INSERT`, `DROP`). This is easily bypassed using SQL comments (`/* drop */`) or multi-statement chaining (`SELECT 1; DROP TABLE users;`).
* **Supabase (Robust):** Uses `libpg-query` ([apps/studio/lib/sql-identifier-quoting.ts](file:///c:/Users/sumit/Downloads/supabase-master/supabase-master/apps/studio/lib/sql-identifier-quoting.ts)) to parse statements using the actual PostgreSQL parser. It traverses the generated Abstract Syntax Tree (AST) to verify that all nodes and table/column references comply with permission scopes.

### The Fix for Fluxbase
Fluxbase already includes `node-sql-parser` in its dependencies. Use the parser to validate all statement types inside a batch, ensuring no statement type violates the key scope.

```typescript
import { Parser } from 'node-sql-parser';

export function validateSqlScope(query: string, allowedScopes: string[]) {
  const parser = new Parser();
  let ast: any;
  
  try {
    ast = parser.astify(query);
  } catch (err) {
    throw new Error("Invalid SQL syntax: " + err.message);
  }
  
  const statements = Array.isArray(ast) ? ast : [ast];
  
  for (const stmt of statements) {
    const type = stmt.type.toUpperCase();
    if (type === 'SELECT' && !allowedScopes.includes('read')) {
      throw new Error("Unauthorized statement type: " + type);
    }
    if (['INSERT', 'UPDATE', 'DELETE'].includes(type) && !allowedScopes.includes('write')) {
      throw new Error("Unauthorized statement type: " + type);
    }
    if (['CREATE', 'DROP', 'ALTER', 'RENAME'].includes(type) && !allowedScopes.includes('admin')) {
      throw new Error("Unauthorized statement type: " + type);
    }
  }
}
```

---

## 3. Database Connection Pooling

### The Comparison
* **Fluxbase (Leaky):** Instantiates connections dynamically and stores them in a global object (`_externalPools`). Pools are only evicted when a project is deleted, leading to database connection leaks over time.
* **Supabase (Robust):** Relies on enterprise-grade pooling proxies (PgBouncer or Supavisor) at the infrastructure level. The database connections are pooled, queued, and automatically reaped on inactivity.

### The Fix for Fluxbase
Implement an idle connection timeout reaper in [src/lib/tenant-pools.ts](file:///c:/Users/sumit/Downloads/Fluxbase-main/src/lib/tenant-pools.ts) to periodically scan and evict pools that have not been queried within a threshold (e.g., 5 minutes).

```typescript
// Add tracking metadata to the cache mapping
interface CachedPool {
  pool: any;
  lastUsed: number;
}

declare global {
  var _externalPools: Record<string, CachedPool> | undefined;
}

// Background reaper routine running every 60s
setInterval(() => {
  const pools = globalThis._externalPools;
  if (!pools) return;

  const now = Date.now();
  for (const [key, cached] of Object.entries(pools)) {
    if (now - cached.lastUsed > 5 * 60 * 1000) { // 5 minutes idle
      console.log(`[Reaper] Closing idle pool: ${key}`);
      cached.pool.end().catch(console.error);
      delete pools[key];
    }
  }
}, 60000);
```

---

## 4. Tenant Impersonation & Row-Level Security (RLS)

### The Comparison
* **Fluxbase (Simple):** Isolates tenant data by changing the schema path (`set_config('search_path', schemaName)`) on query pools.
* **Supabase (Highly Secure):** Wraps custom SQL queries with impersonation headers ([packages/pg-meta/src/sql/studio/role-impersonation.ts](file:///c:/Users/sumit/Downloads/supabase-master/supabase-master/packages/pg-meta/src/sql/studio/role-impersonation.ts#L29)) that set the Postgres session parameters `role` and `request.jwt.claims` using `set_config`. This enforces PostgreSQL's native Row-Level Security policies per statement.

### The Fix for Fluxbase
To achieve similar security, wrap tenant queries inside transaction boundaries or prepend them with session configuration settings inside a clean database transaction to prevent scope leakage.
Use PostgreSQL's native `GRANT` and `REVOKE` DDL statements to explicitly restrict cross-schema SELECT permissions between `project_<id>` schemas.
