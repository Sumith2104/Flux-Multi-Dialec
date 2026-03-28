/**
 * Fluxbase Client SDK v1.0.0
 * Official JavaScript/TypeScript client for Fluxbase
 * https://github.com/Sumith2104/Fluxbase
 * MIT License
 */

// src/types.ts
var ERROR_CODES = {
  // Auth
  AUTH_REQUIRED: "AUTH_REQUIRED",
  UNAUTHORIZED: "UNAUTHORIZED",
  SCOPE_MISMATCH: "SCOPE_MISMATCH",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  // Request
  BAD_REQUEST: "BAD_REQUEST",
  PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND",
  TABLE_NOT_FOUND: "TABLE_NOT_FOUND",
  SQL_EXECUTION_ERROR: "SQL_EXECUTION_ERROR",
  // Limits
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  ROW_LIMIT_EXCEEDED: "ROW_LIMIT_EXCEEDED",
  // Network
  NETWORK_ERROR: "NETWORK_ERROR",
  TIMEOUT: "TIMEOUT",
  CORS_ERROR: "CORS_ERROR",
  ABORTED: "ABORTED",
  // Server
  INTERNAL_ERROR: "INTERNAL_ERROR",
  REALTIME_CONNECTION_FAILED: "REALTIME_CONNECTION_FAILED"
};

// src/QueryBuilder.ts
var operatorMap = {
  eq: "=",
  neq: "!=",
  gt: ">",
  gte: ">=",
  lt: "<",
  lte: "<=",
  like: "LIKE",
  ilike: "ILIKE"
};
var QueryBuilder = class {
  constructor(table, config, log, dedup, onAuthError) {
    this._select = "*";
    this._filters = [];
    this._order = null;
    this._limitVal = null;
    this._offsetVal = null;
    this._single = false;
    this._countOnly = false;
    this._table = table;
    this._config = config;
    this._log = log;
    this._dedup = dedup;
    this._onAuthError = onAuthError;
    this._retries = config.retries ?? 2;
    this._timeout = config.timeout ?? 1e4;
  }
  // ─── SELECT ────────────────────────────────────────────────
  select(columns = "*") {
    this._select = Array.isArray(columns) ? columns.join(", ") : columns;
    return this;
  }
  // ─── COUNT ─────────────────────────────────────────────────
  count() {
    this._countOnly = true;
    this._select = "COUNT(*) as _count";
    return this;
  }
  // ─── FILTERS ───────────────────────────────────────────────
  eq(column, value) {
    return this._addFilter(column, "eq", value);
  }
  neq(column, value) {
    return this._addFilter(column, "neq", value);
  }
  gt(column, value) {
    return this._addFilter(column, "gt", value);
  }
  gte(column, value) {
    return this._addFilter(column, "gte", value);
  }
  lt(column, value) {
    return this._addFilter(column, "lt", value);
  }
  lte(column, value) {
    return this._addFilter(column, "lte", value);
  }
  like(column, pattern) {
    return this._addFilter(column, "like", pattern);
  }
  ilike(column, pattern) {
    return this._addFilter(column, "ilike", pattern);
  }
  _addFilter(column, operator, value) {
    this._filters.push({ column, operator, value });
    return this;
  }
  // ─── ORDER ─────────────────────────────────────────────────
  order(column, direction = "asc") {
    this._order = { column, direction: direction.toUpperCase() };
    return this;
  }
  // ─── LIMIT / OFFSET ────────────────────────────────────────
  limit(n) {
    this._limitVal = n;
    return this;
  }
  /** Fetch a specific page of results (1-indexed). */
  page(pageNumber, pageSize = 20) {
    this._limitVal = pageSize;
    this._offsetVal = (pageNumber - 1) * pageSize;
    return this;
  }
  /** Return only 1 row (throws if none found). */
  single() {
    this._single = true;
    this._limitVal = 1;
    return this;
  }
  // ─── RETRY ─────────────────────────────────────────────────
  /** Override the global retry count for this query only. */
  retry(times) {
    this._retries = times;
    return this;
  }
  // ─── TIMEOUT ───────────────────────────────────────────────
  /** Override the global timeout (ms) for this query only. */
  timeout(ms) {
    this._timeout = ms;
    return this;
  }
  // ─── ABORT ─────────────────────────────────────────────────
  /** Attach an AbortSignal to cancel the request on demand. */
  signal(signal) {
    this._abortSignal = signal;
    return this;
  }
  // ─── INSERT ────────────────────────────────────────────────
  async insert(data) {
    const rows = Array.isArray(data) ? data : [data];
    const columns = Object.keys(rows[0]);
    const valueGroups = rows.map(
      (row) => `(${columns.map((col) => this._escape(row[col])).join(", ")})`
    );
    const sql = `INSERT INTO ${this._table} (${columns.join(", ")}) VALUES ${valueGroups.join(", ")}`;
    this._log.debug(`INSERT \u2192 ${this._table}`, { columns, rows: rows.length });
    return this._executeWithRetry(sql);
  }
  // ─── UPDATE ────────────────────────────────────────────────
  async update(data) {
    const setClauses = Object.entries(data).map(([k, v]) => `${k} = ${this._escape(v)}`).join(", ");
    const where = this._buildWhere();
    const sql = `UPDATE ${this._table} SET ${setClauses}${where ? ` WHERE ${where}` : ""}`;
    this._log.debug(`UPDATE \u2192 ${this._table}`, { data, where });
    return this._executeWithRetry(sql);
  }
  // ─── DELETE ────────────────────────────────────────────────
  async delete() {
    const where = this._buildWhere();
    const sql = `DELETE FROM ${this._table}${where ? ` WHERE ${where}` : ""}`;
    this._log.debug(`DELETE \u2192 ${this._table}`, { where });
    return this._executeWithRetry(sql);
  }
  // ─── IMPLICIT SELECT (thenable) ────────────────────────────
  then(onfulfilled, onrejected) {
    return this._runSelect().then(onfulfilled, onrejected);
  }
  // ─── Internal: SELECT ──────────────────────────────────────
  async _runSelect() {
    const where = this._buildWhere();
    let sql = `SELECT ${this._select} FROM ${this._table}`;
    if (where) sql += ` WHERE ${where}`;
    if (this._order) sql += ` ORDER BY ${this._order.column} ${this._order.direction}`;
    if (this._limitVal !== null) sql += ` LIMIT ${this._limitVal}`;
    if (this._offsetVal !== null) sql += ` OFFSET ${this._offsetVal}`;
    const dedupeKey = `${this._config.projectId}::${sql}`;
    this._log.debug(`SELECT \u2192 ${this._table}`, { sql });
    return this._dedup.execute(dedupeKey, () => this._executeWithRetry(sql));
  }
  // ─── Internal: Retry Engine ────────────────────────────────
  async _executeWithRetry(sql, attempt = 0) {
    const result = await this._executeFetch(sql);
    if (!result.success && attempt < this._retries) {
      const delay = Math.min(500 * Math.pow(2, attempt), 8e3);
      const code = result.error?.code;
      const noRetry = [
        ERROR_CODES.AUTH_REQUIRED,
        ERROR_CODES.UNAUTHORIZED,
        ERROR_CODES.SCOPE_MISMATCH,
        ERROR_CODES.ABORTED
      ];
      if (noRetry.includes(code)) return result;
      this._log.warn(`Request failed (attempt ${attempt + 1}/${this._retries + 1}), retrying in ${delay}ms...`, result.error);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return this._executeWithRetry(sql, attempt + 1);
    }
    return result;
  }
  // ─── Internal: Fetch + Timeout + Abort ────────────────────
  async _executeFetch(sql) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._timeout);
    if (this._abortSignal) {
      this._abortSignal.addEventListener("abort", () => controller.abort());
    }
    try {
      const res = await fetch(`${this._config.url}/api/execute-sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this._config.apiKey}`
        },
        body: JSON.stringify({ projectId: this._config.projectId, query: sql }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.status === 401 || res.status === 403) {
        const err = {
          message: res.status === 401 ? "Unauthorized: Invalid or expired API Key." : "Forbidden: API Key does not have access to this project.",
          code: res.status === 401 ? ERROR_CODES.UNAUTHORIZED : ERROR_CODES.SCOPE_MISMATCH
        };
        this._log.error(err.message);
        this._onAuthError?.(err);
        return { success: false, error: err };
      }
      const json = await res.json();
      if (!json.success) {
        this._log.warn("Query returned error", json.error);
        return { success: false, error: json.error };
      }
      const rows = json.result?.rows || [];
      if (this._countOnly) {
        const countVal = rows[0]?._count ?? rows.length;
        this._log.debug(`COUNT result: ${countVal}`);
        return { success: true, data: [], count: Number(countVal) };
      }
      this._log.debug(`Query returned ${rows.length} row(s)`);
      return { success: true, data: this._single ? rows.slice(0, 1) : rows };
    } catch (err) {
      clearTimeout(timeoutId);
      if (err?.name === "AbortError") {
        const isTimeout = !this._abortSignal?.aborted;
        const code2 = isTimeout ? ERROR_CODES.TIMEOUT : ERROR_CODES.ABORTED;
        const message2 = isTimeout ? `Request timed out after ${this._timeout}ms` : "Request was aborted by the caller";
        this._log.warn(message2);
        return { success: false, error: { message: message2, code: code2 } };
      }
      const message = err?.message || "Network error";
      const isCors = message === "Failed to fetch" || message === "Load failed" || message === "NetworkError when attempting to fetch resource.";
      const code = isCors ? ERROR_CODES.CORS_ERROR : ERROR_CODES.NETWORK_ERROR;
      const hint = isCors ? "This is likely a CORS error. Make sure your Fluxbase backend has Authorization in Access-Control-Allow-Headers." : void 0;
      this._log.error(message, { code, hint });
      return { success: false, error: { message, code, hint } };
    }
  }
  // ─── Helpers ───────────────────────────────────────────────
  _buildWhere() {
    return this._filters.map((f) => `${f.column} ${operatorMap[f.operator]} ${this._escape(f.value)}`).join(" AND ");
  }
  _escape(value) {
    if (value === null || value === void 0) return "NULL";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
  }
};

// src/RealtimeChannel.ts
async function getEventSource() {
  if (typeof EventSource !== "undefined") {
    return EventSource;
  }
  try {
    const { EventSource: NodeEventSource } = await import('eventsource');
    return NodeEventSource;
  } catch {
    throw new Error(
      "[Fluxbase] EventSource is not available in this environment. In Node.js, install the ponyfill: npm install eventsource"
    );
  }
}
var RealtimeChannel = class {
  constructor(channelName, config, log, table, onAuthError) {
    this._subscriptions = [];
    this._sse = null;
    this._state = "disconnected";
    // Backoff state
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;
    this._maxReconnectDelay = 3e4;
    this._baseReconnectDelay = 1e3;
    this._channelName = channelName;
    this._config = config;
    this._log = log;
    this._table = table;
    this._onAuthError = onAuthError;
  }
  // ─── Event Registration ────────────────────────────────────
  on(event, callback) {
    this._subscriptions.push({ event, table: this._table, callback });
    return this;
  }
  onConnect(callback) {
    this._onConnectCallback = callback;
    return this;
  }
  onDisconnect(callback) {
    this._onDisconnectCallback = callback;
    return this;
  }
  /** Called every time a reconnect is attempted. Useful for showing UI indicators. */
  onReconnect(callback) {
    this._onReconnectCallback = callback;
    return this;
  }
  // ─── Connect ───────────────────────────────────────────────
  subscribe() {
    this._setupOnlineOffline();
    this._connect();
    return this;
  }
  // ─── Disconnect ────────────────────────────────────────────
  unsubscribe() {
    this._log.info(`Channel '${this._channelName}' unsubscribed.`);
    this._cleanup();
    this._state = "disconnected";
    this._subscriptions = [];
    this._removeOnlineOffline();
  }
  // ─── Pause / Resume ────────────────────────────────────────
  /** Temporarily pause the connection (e.g. tab hidden, offline). */
  pause() {
    if (this._state === "connected" || this._state === "connecting") {
      this._log.debug(`Channel '${this._channelName}' paused.`);
      this._cleanup();
      this._state = "paused";
    }
  }
  /** Resume a previously paused connection. */
  resume() {
    if (this._state === "paused") {
      this._log.debug(`Channel '${this._channelName}' resuming...`);
      this._reconnectAttempt = 0;
      this._connect();
    }
  }
  get state() {
    return this._state;
  }
  // ─── Internal: Connect ─────────────────────────────────────
  async _connect() {
    if (this._state === "paused") return;
    this._state = "connecting";
    const ESClass = await getEventSource().catch((err) => {
      this._log.error(err.message);
      this._state = "disconnected";
      return null;
    });
    if (!ESClass) return;
    const baseUrl = this._config.realtimeUrl || this._config.url;
    const url = new URL(`${baseUrl}/api/realtime/subscribe`);
    url.searchParams.set("projectId", this._config.projectId);
    url.searchParams.set("apiKey", this._config.apiKey);
    this._log.info(`Channel '${this._channelName}' connecting to SSE...`);
    this._sse = new ESClass(url.toString());
    this._sse.onopen = () => {
      this._state = "connected";
      this._reconnectAttempt = 0;
      this._log.info(`Channel '${this._channelName}' connected. \u2713`);
      this._onConnectCallback?.();
    };
    this._sse.onerror = (err) => {
      if (this._state === "connecting") {
        this._log.error(`Channel '${this._channelName}' failed to connect. Check your API Key and Project ID.`);
      } else {
        this._log.warn(`Channel '${this._channelName}' connection lost.`);
      }
      this._state = "disconnected";
      this._onDisconnectCallback?.();
      this._sse?.close();
      this._sse = null;
      this._scheduleReconnect();
    };
    this._sse.onmessage = (event) => {
      this._handleMessage(event);
    };
  }
  // ─── Internal: Message Handling ────────────────────────────
  _handleMessage(event) {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === "connected") return;
      this._log.debug(`Channel '${this._channelName}' received event`, payload);
      const row = payload.data?.new ?? payload.data?.old ?? payload.record;
      for (const sub of this._subscriptions) {
        if (sub.table && payload.table_name !== sub.table && payload.table_id !== sub.table) {
          continue;
        }
        const op = payload.operation;
        const et = payload.event_type;
        const matchesEvent = sub.event === "*" || sub.event === "row.inserted" && (et === "row.inserted" || et === "raw_sql_mutation" && op === "INSERT") || sub.event === "row.updated" && (et === "row.updated" || et === "raw_sql_mutation" && op === "UPDATE") || sub.event === "row.deleted" && (et === "row.deleted" || et === "raw_sql_mutation" && op === "DELETE");
        if (!matchesEvent) continue;
        if (row && Object.keys(row).length === 0) continue;
        sub.callback(payload);
      }
    } catch {
    }
  }
  // ─── Internal: Exponential Backoff Reconnect ───────────────
  _scheduleReconnect() {
    if (this._state === "paused" || this._state === "disconnected" && this._subscriptions.length === 0) return;
    this._reconnectAttempt++;
    const delay = Math.min(
      this._baseReconnectDelay * Math.pow(2, this._reconnectAttempt - 1),
      this._maxReconnectDelay
    );
    this._log.warn(`Reconnecting channel '${this._channelName}' in ${delay}ms (attempt ${this._reconnectAttempt})...`);
    this._onReconnectCallback?.(this._reconnectAttempt, delay);
    this._reconnectTimer = setTimeout(() => {
      if (this._state !== "paused") {
        this._connect();
      }
    }, delay);
  }
  // ─── Internal: Online / Offline ────────────────────────────
  _setupOnlineOffline() {
    if (typeof window === "undefined") return;
    this._offlineHandler = () => {
      this._log.warn(`Network offline \u2014 pausing channel '${this._channelName}'.`);
      this.pause();
    };
    this._onlineHandler = () => {
      this._log.info(`Network online \u2014 resuming channel '${this._channelName}'.`);
      this.resume();
    };
    window.addEventListener("offline", this._offlineHandler);
    window.addEventListener("online", this._onlineHandler);
  }
  _removeOnlineOffline() {
    if (typeof window === "undefined") return;
    if (this._offlineHandler) window.removeEventListener("offline", this._offlineHandler);
    if (this._onlineHandler) window.removeEventListener("online", this._onlineHandler);
  }
  // ─── Internal: Cleanup ─────────────────────────────────────
  _cleanup() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._sse) {
      this._sse.close();
      this._sse = null;
    }
  }
};

// src/logger.ts
var COLORS = {
  info: "\x1B[36m",
  // cyan
  warn: "\x1B[33m",
  // yellow
  error: "\x1B[31m",
  // red
  debug: "\x1B[90m"
  // grey
};
var RESET = "\x1B[0m";
var Logger = class {
  constructor(enabled, prefix = "[Fluxbase]") {
    this.enabled = enabled;
    this.prefix = prefix;
  }
  info(message, data) {
    this._log("info", message, data);
  }
  warn(message, data) {
    this._log("warn", message, data);
  }
  error(message, data) {
    this._log("error", message, data);
  }
  debug(message, data) {
    this._log("debug", message, data);
  }
  _log(level, message, data) {
    if (!this.enabled && level !== "error") return;
    const isBrowser = typeof window !== "undefined";
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].replace("Z", "");
    const label = `${this.prefix} [${timestamp}] ${level.toUpperCase()}`;
    if (isBrowser) {
      const styles = {
        info: "color: #06b6d4; font-weight: bold",
        warn: "color: #f59e0b; font-weight: bold",
        error: "color: #ef4444; font-weight: bold",
        debug: "color: #6b7280"
      };
      if (data !== void 0) {
        console.groupCollapsed(`%c${label}: ${message}`, styles[level]);
        console.log(data);
        console.groupEnd();
      } else {
        console.log(`%c${label}: ${message}`, styles[level]);
      }
    } else {
      const color = COLORS[level];
      const msg = `${color}${label}${RESET}: ${message}`;
      if (data !== void 0) {
        console.log(msg, data);
      } else {
        console.log(msg);
      }
    }
  }
};

// src/deduplicator.ts
var Deduplicator = class {
  constructor() {
    this._inflight = /* @__PURE__ */ new Map();
  }
  /**
   * Execute a fetch function, deduplicating identical concurrent calls.
   * @param key - Unique cache key (e.g. hash of SQL + projectId)
   * @param fn - The async function to execute
   */
  async execute(key, fn) {
    if (this._inflight.has(key)) {
      return this._inflight.get(key);
    }
    const promise = fn().finally(() => {
      this._inflight.delete(key);
    });
    this._inflight.set(key, promise);
    return promise;
  }
  /** Returns how many requests are currently in-flight */
  get size() {
    return this._inflight.size;
  }
};

// src/FluxbaseClient.ts
var FluxbaseClient = class {
  constructor(config) {
    if (!config.url) throw new Error("[Fluxbase] url is required.");
    if (!config.projectId) throw new Error("[Fluxbase] projectId is required.");
    if (!config.apiKey) throw new Error("[Fluxbase] apiKey is required.");
    this._config = {
      ...config,
      url: config.url.replace(/\/$/, ""),
      realtimeUrl: config.realtimeUrl ? config.realtimeUrl.replace(/\/$/, "") : config.url.replace(/\/$/, ""),
      timeout: config.timeout ?? 1e4,
      retries: config.retries ?? 2,
      debug: config.debug ?? false
    };
    this._log = new Logger(this._config.debug ?? false);
    this._dedup = new Deduplicator();
    this._log.info(`Client initialized for project: ${this._config.projectId}`);
  }
  /**
   * Register a global handler called whenever any request returns a 401/403.
   * Use this to redirect users to login when their session expires.
   *
   * @example
   * flux.onAuthError((err) => router.push('/login'));
   */
  onAuthError(callback) {
    this._authErrorCallback = callback;
    return this;
  }
  /**
   * Build a chainable query for a table.
   *
   * @example
   * const { data } = await flux.from('messages').select('*').eq('room', 'A1').limit(50);
   */
  from(table) {
    return new QueryBuilder(
      table,
      this._config,
      this._log,
      this._dedup,
      this._authErrorCallback
    );
  }
  /**
   * Execute raw SQL directly.
   *
   * @example
   * const { data } = await flux.sql('SELECT COUNT(*) FROM messages');
   */
  async sql(query, params) {
    this._log.debug("RAW SQL", { query });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._config.timeout ?? 1e4);
    try {
      const res = await fetch(`${this._config.url}/api/execute-sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this._config.apiKey}`
        },
        body: JSON.stringify({ projectId: this._config.projectId, query, params }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.status === 401 || res.status === 403) {
        const err = {
          message: "Unauthorized: Invalid or expired API Key.",
          code: "UNAUTHORIZED"
        };
        this._authErrorCallback?.(err);
        return { success: false, error: err };
      }
      const json = await res.json();
      if (!json.success) return { success: false, error: json.error };
      return { success: true, data: json.result?.rows || [] };
    } catch (err) {
      clearTimeout(timeoutId);
      return { success: false, error: { message: err?.message || "Network error", code: "NETWORK_ERROR" } };
    }
  }
  /**
   * Subscribe to live database changes via Server-Sent Events (SSE).
   *
   * @param channelName - A logical label for this subscription.
   * @param table - Optional: Only receive events for this specific table.
   *
   * @example
   * flux.channel('chat', 'messages')
   *   .on('row.inserted', (p) => console.log(p.data?.new))
   *   .onConnect(() => setConnected(true))
   *   .onReconnect((attempt, delay) => console.log(`Retry #${attempt} in ${delay}ms`))
   *   .subscribe();
   */
  channel(channelName, table) {
    return new RealtimeChannel(
      channelName,
      this._config,
      this._log,
      table,
      this._authErrorCallback
    );
  }
};
function createClient(url, projectId, apiKey, options) {
  return new FluxbaseClient({ url, projectId, apiKey, ...options });
}

export { Deduplicator, ERROR_CODES, FluxbaseClient, Logger, QueryBuilder, RealtimeChannel, createClient };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map