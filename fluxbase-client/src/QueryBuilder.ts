// ============================================================
// Fluxbase Client SDK v1.1.0 - Query Builder
// Chainable SQL builder with retry, timeout, abort, pagination,
// count, deduplication, and typed error codes.
// ============================================================

import type { FluxbaseConfig, FluxbaseResponse, FluxbaseError, ErrorCode } from './types.js';
import { ERROR_CODES } from './types.js';
import type { Logger } from './logger.js';
import type { Deduplicator } from './deduplicator.js';

type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike';

interface FilterClause {
  column: string;
  operator: FilterOperator;
  value: any;
}

interface OrderClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

const operatorMap: Record<FilterOperator, string> = {
  eq: '=', neq: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=',
  like: 'LIKE', ilike: 'ILIKE',
};

export class QueryBuilder<T = Record<string, any>> {
  private _table: string;
  private _config: FluxbaseConfig;
  private _log: Logger;
  private _dedup: Deduplicator;
  private _onAuthError?: (err: FluxbaseError) => void;

  private _select: string = '*';
  private _filters: FilterClause[] = [];
  private _order: OrderClause | null = null;
  private _limitVal: number | null = null;
  private _offsetVal: number | null = null;
  private _single: boolean = false;
  private _countOnly: boolean = false;
  private _retries: number;
  private _timeout: number;
  private _abortSignal?: AbortSignal;

  constructor(
    table: string,
    config: FluxbaseConfig,
    log: Logger,
    dedup: Deduplicator,
    onAuthError?: (err: FluxbaseError) => void
  ) {
    this._table = table;
    this._config = config;
    this._log = log;
    this._dedup = dedup;
    this._onAuthError = onAuthError;
    this._retries = config.retries ?? 2;
    this._timeout = config.timeout ?? 10000;
  }

  // ─── SELECT ────────────────────────────────────────────────
  select(columns: string | string[] = '*'): this {
    this._select = Array.isArray(columns) ? columns.join(', ') : columns;
    return this;
  }

  // ─── COUNT ─────────────────────────────────────────────────
  count(): this {
    this._countOnly = true;
    this._select = 'COUNT(*) as _count';
    return this;
  }

  // ─── FILTERS ───────────────────────────────────────────────
  eq(column: string, value: any): this { return this._addFilter(column, 'eq', value); }
  neq(column: string, value: any): this { return this._addFilter(column, 'neq', value); }
  gt(column: string, value: any): this { return this._addFilter(column, 'gt', value); }
  gte(column: string, value: any): this { return this._addFilter(column, 'gte', value); }
  lt(column: string, value: any): this { return this._addFilter(column, 'lt', value); }
  lte(column: string, value: any): this { return this._addFilter(column, 'lte', value); }
  like(column: string, pattern: string): this { return this._addFilter(column, 'like', pattern); }
  ilike(column: string, pattern: string): this { return this._addFilter(column, 'ilike', pattern); }

  private _addFilter(column: string, operator: FilterOperator, value: any): this {
    this._filters.push({ column, operator, value });
    return this;
  }

  // ─── ORDER ─────────────────────────────────────────────────
  order(column: string, direction: 'asc' | 'desc' = 'asc'): this {
    this._order = { column, direction: direction.toUpperCase() as 'ASC' | 'DESC' };
    return this;
  }

  // ─── LIMIT / OFFSET ────────────────────────────────────────
  limit(n: number): this {
    this._limitVal = n;
    return this;
  }

  /** Fetch a specific page of results (1-indexed). */
  page(pageNumber: number, pageSize: number = 20): this {
    this._limitVal = pageSize;
    this._offsetVal = (pageNumber - 1) * pageSize;
    return this;
  }

  /** Return only 1 row (throws if none found). */
  single(): this {
    this._single = true;
    this._limitVal = 1;
    return this;
  }

  // ─── RETRY ─────────────────────────────────────────────────
  /** Override the global retry count for this query only. */
  retry(times: number): this {
    this._retries = times;
    return this;
  }

  // ─── TIMEOUT ───────────────────────────────────────────────
  /** Override the global timeout (ms) for this query only. */
  timeout(ms: number): this {
    this._timeout = ms;
    return this;
  }

  // ─── ABORT ─────────────────────────────────────────────────
  /** Attach an AbortSignal to cancel the request on demand. */
  signal(signal: AbortSignal): this {
    this._abortSignal = signal;
    return this;
  }

  // ─── INSERT ────────────────────────────────────────────────
  async insert(data: Partial<T> | Partial<T>[]): Promise<FluxbaseResponse<T>> {
    const rows = Array.isArray(data) ? data : [data];
    const columns = Object.keys(rows[0] as object);
    const valueGroups = rows.map(row =>
      `(${columns.map(col => this._escape((row as any)[col])).join(', ')})`
    );
    const sql = `INSERT INTO ${this._table} (${columns.join(', ')}) VALUES ${valueGroups.join(', ')}`;
    this._log.debug(`INSERT → ${this._table}`, { columns, rows: rows.length });
    return this._executeWithRetry(sql);
  }

  // ─── UPDATE ────────────────────────────────────────────────
  async update(data: Partial<T>): Promise<FluxbaseResponse<T>> {
    const setClauses = Object.entries(data as object)
      .map(([k, v]) => `${k} = ${this._escape(v)}`)
      .join(', ');
    const where = this._buildWhere();
    const sql = `UPDATE ${this._table} SET ${setClauses}${where ? ` WHERE ${where}` : ''}`;
    this._log.debug(`UPDATE → ${this._table}`, { data, where });
    return this._executeWithRetry(sql);
  }

  // ─── DELETE ────────────────────────────────────────────────
  async delete(): Promise<FluxbaseResponse<T>> {
    const where = this._buildWhere();
    const sql = `DELETE FROM ${this._table}${where ? ` WHERE ${where}` : ''}`;
    this._log.debug(`DELETE → ${this._table}`, { where });
    return this._executeWithRetry(sql);
  }

  // ─── IMPLICIT SELECT (thenable) ────────────────────────────
  then<TResult1 = FluxbaseResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: FluxbaseResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._runSelect().then(onfulfilled, onrejected);
  }

  // ─── Internal: SELECT ──────────────────────────────────────
  private async _runSelect(): Promise<FluxbaseResponse<T>> {
    const where = this._buildWhere();
    let sql = `SELECT ${this._select} FROM ${this._table}`;
    if (where) sql += ` WHERE ${where}`;
    if (this._order) sql += ` ORDER BY ${this._order.column} ${this._order.direction}`;
    if (this._limitVal !== null) sql += ` LIMIT ${this._limitVal}`;
    if (this._offsetVal !== null) sql += ` OFFSET ${this._offsetVal}`;

    // Deduplicate identical SELECT queries
    const dedupeKey = `${this._config.projectId}::${sql}`;
    this._log.debug(`SELECT → ${this._table}`, { sql });

    return this._dedup.execute(dedupeKey, () => this._executeWithRetry(sql));
  }

  // ─── Internal: Retry Engine ────────────────────────────────
  private async _executeWithRetry(sql: string, attempt = 0): Promise<FluxbaseResponse<T>> {
    const result = await this._executeFetch(sql);

    if (!result.success && attempt < this._retries) {
      const delay = Math.min(500 * Math.pow(2, attempt), 8000); // 500ms, 1s, 2s, 4s… max 8s
      const code = result.error?.code as string;

      // Don't retry auth/scope errors — they won't change
      const noRetry: string[] = [
        ERROR_CODES.AUTH_REQUIRED,
        ERROR_CODES.UNAUTHORIZED,
        ERROR_CODES.SCOPE_MISMATCH,
        ERROR_CODES.ABORTED,
      ];
      if (noRetry.includes(code)) return result;

      this._log.warn(`Request failed (attempt ${attempt + 1}/${this._retries + 1}), retrying in ${delay}ms...`, result.error);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this._executeWithRetry(sql, attempt + 1);
    }

    return result;
  }

  // ─── Internal: Fetch + Timeout + Abort ────────────────────
  private async _executeFetch(sql: string): Promise<FluxbaseResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);

    // Merge user-provided signal
    if (this._abortSignal) {
      this._abortSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const res = await fetch(`${this._config.url}/api/execute-sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._config.apiKey}`,
        },
        body: JSON.stringify({ projectId: this._config.projectId, query: sql }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Auth error
      if (res.status === 401 || res.status === 403) {
        const err: FluxbaseError = {
          message: res.status === 401 ? 'Unauthorized: Invalid or expired API Key.' : 'Forbidden: API Key does not have access to this project.',
          code: res.status === 401 ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.SCOPE_MISMATCH,
        };
        this._log.error(err.message);
        this._onAuthError?.(err);
        return { success: false, error: err };
      }

      const json = await res.json() as any;

      if (!json.success) {
        this._log.warn('Query returned error', json.error);
        return { success: false, error: json.error };
      }

      const rows: T[] = json.result?.rows || [];

      if (this._countOnly) {
        const countVal = (rows[0] as any)?._count ?? rows.length;
        this._log.debug(`COUNT result: ${countVal}`);
        return { success: true, data: [], count: Number(countVal) };
      }

      this._log.debug(`Query returned ${rows.length} row(s)`);
      return { success: true, data: this._single ? rows.slice(0, 1) : rows };

    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err?.name === 'AbortError') {
        const isTimeout = !this._abortSignal?.aborted;
        const code: ErrorCode = isTimeout ? ERROR_CODES.TIMEOUT : ERROR_CODES.ABORTED;
        const message = isTimeout
          ? `Request timed out after ${this._timeout}ms`
          : 'Request was aborted by the caller';
        this._log.warn(message);
        return { success: false, error: { message, code } };
      }

      // CORS detection: fetch throws TypeError with no useful message cross-origin
      const message = err?.message || 'Network error';
      const isCors = message === 'Failed to fetch' || message === 'Load failed' || message === 'NetworkError when attempting to fetch resource.';
      const code: ErrorCode = isCors ? ERROR_CODES.CORS_ERROR : ERROR_CODES.NETWORK_ERROR;
      const hint = isCors
        ? 'This is likely a CORS error. Make sure your Fluxbase backend has Authorization in Access-Control-Allow-Headers.'
        : undefined;

      this._log.error(message, { code, hint });
      return { success: false, error: { message, code, hint } };
    }
  }

  // ─── Helpers ───────────────────────────────────────────────
  private _buildWhere(): string {
    return this._filters
      .map(f => `${f.column} ${operatorMap[f.operator]} ${this._escape(f.value)}`)
      .join(' AND ');
  }

  private _escape(value: any): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
  }
}
