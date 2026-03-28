declare const ERROR_CODES: {
    readonly AUTH_REQUIRED: "AUTH_REQUIRED";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly SCOPE_MISMATCH: "SCOPE_MISMATCH";
    readonly TOKEN_EXPIRED: "TOKEN_EXPIRED";
    readonly BAD_REQUEST: "BAD_REQUEST";
    readonly PROJECT_NOT_FOUND: "PROJECT_NOT_FOUND";
    readonly TABLE_NOT_FOUND: "TABLE_NOT_FOUND";
    readonly SQL_EXECUTION_ERROR: "SQL_EXECUTION_ERROR";
    readonly RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED";
    readonly ROW_LIMIT_EXCEEDED: "ROW_LIMIT_EXCEEDED";
    readonly NETWORK_ERROR: "NETWORK_ERROR";
    readonly TIMEOUT: "TIMEOUT";
    readonly CORS_ERROR: "CORS_ERROR";
    readonly ABORTED: "ABORTED";
    readonly INTERNAL_ERROR: "INTERNAL_ERROR";
    readonly REALTIME_CONNECTION_FAILED: "REALTIME_CONNECTION_FAILED";
};
type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
interface FluxbaseConfig {
    /** The full URL of your Fluxbase backend (Vercel or Render). */
    url: string;
    /** Your Fluxbase Project ID. */
    projectId: string;
    /** Your Fluxbase API Key (fl_...). */
    apiKey: string;
    /** Optional: Enable verbose debug logging to console. */
    debug?: boolean;
    /** Optional: Global default timeout in ms for all requests (default: 10000). */
    timeout?: number;
    /** Optional: Global default max retries for failed requests (default: 2). */
    retries?: number;
}
interface FluxbaseError {
    message: string;
    code?: ErrorCode | string;
    hint?: string;
}
interface FluxbaseResponse<T = any> {
    success: boolean;
    data?: T[];
    count?: number;
    error?: FluxbaseError;
}
interface RealtimePayload<T = Record<string, any>> {
    event_type: string;
    table_id?: string;
    table_name?: string;
    operation?: 'INSERT' | 'UPDATE' | 'DELETE';
    timestamp: string;
    project_id: string;
    data?: {
        new?: T;
        old?: T;
    };
    record?: T;
}
type RealtimeEvent = 'row.inserted' | 'row.updated' | 'row.deleted' | '*';
type RealtimeCallback<T = Record<string, any>> = (payload: RealtimePayload<T>) => void;
type AuthErrorCallback = (error: FluxbaseError) => void;

declare class Logger {
    private enabled;
    private prefix;
    constructor(enabled: boolean, prefix?: string);
    info(message: string, data?: any): void;
    warn(message: string, data?: any): void;
    error(message: string, data?: any): void;
    debug(message: string, data?: any): void;
    private _log;
}

declare class Deduplicator {
    private _inflight;
    /**
     * Execute a fetch function, deduplicating identical concurrent calls.
     * @param key - Unique cache key (e.g. hash of SQL + projectId)
     * @param fn - The async function to execute
     */
    execute<T>(key: string, fn: () => Promise<T>): Promise<T>;
    /** Returns how many requests are currently in-flight */
    get size(): number;
}

declare class QueryBuilder<T = Record<string, any>> {
    private _table;
    private _config;
    private _log;
    private _dedup;
    private _onAuthError?;
    private _select;
    private _filters;
    private _order;
    private _limitVal;
    private _offsetVal;
    private _single;
    private _countOnly;
    private _retries;
    private _timeout;
    private _abortSignal?;
    constructor(table: string, config: FluxbaseConfig, log: Logger, dedup: Deduplicator, onAuthError?: (err: FluxbaseError) => void);
    select(columns?: string | string[]): this;
    count(): this;
    eq(column: string, value: any): this;
    neq(column: string, value: any): this;
    gt(column: string, value: any): this;
    gte(column: string, value: any): this;
    lt(column: string, value: any): this;
    lte(column: string, value: any): this;
    like(column: string, pattern: string): this;
    ilike(column: string, pattern: string): this;
    private _addFilter;
    order(column: string, direction?: 'asc' | 'desc'): this;
    limit(n: number): this;
    /** Fetch a specific page of results (1-indexed). */
    page(pageNumber: number, pageSize?: number): this;
    /** Return only 1 row (throws if none found). */
    single(): this;
    /** Override the global retry count for this query only. */
    retry(times: number): this;
    /** Override the global timeout (ms) for this query only. */
    timeout(ms: number): this;
    /** Attach an AbortSignal to cancel the request on demand. */
    signal(signal: AbortSignal): this;
    insert(data: Partial<T> | Partial<T>[]): Promise<FluxbaseResponse<T>>;
    update(data: Partial<T>): Promise<FluxbaseResponse<T>>;
    delete(): Promise<FluxbaseResponse<T>>;
    then<TResult1 = FluxbaseResponse<T>, TResult2 = never>(onfulfilled?: ((value: FluxbaseResponse<T>) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
    private _runSelect;
    private _executeWithRetry;
    private _executeFetch;
    private _buildWhere;
    private _escape;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'paused';
declare class RealtimeChannel {
    private _config;
    private _channelName;
    private _table;
    private _log;
    private _onAuthError?;
    private _subscriptions;
    private _sse;
    private _state;
    private _reconnectAttempt;
    private _reconnectTimer;
    private _maxReconnectDelay;
    private _baseReconnectDelay;
    private _onConnectCallback?;
    private _onDisconnectCallback?;
    private _onReconnectCallback?;
    private _onlineHandler?;
    private _offlineHandler?;
    constructor(channelName: string, config: FluxbaseConfig, log: Logger, table?: string, onAuthError?: (err: FluxbaseError) => void);
    on<T = Record<string, any>>(event: RealtimeEvent, callback: RealtimeCallback<T>): this;
    onConnect(callback: () => void): this;
    onDisconnect(callback: () => void): this;
    /** Called every time a reconnect is attempted. Useful for showing UI indicators. */
    onReconnect(callback: (attempt: number, delayMs: number) => void): this;
    subscribe(): this;
    unsubscribe(): void;
    /** Temporarily pause the connection (e.g. tab hidden, offline). */
    pause(): void;
    /** Resume a previously paused connection. */
    resume(): void;
    get state(): ConnectionState;
    private _connect;
    private _handleMessage;
    private _scheduleReconnect;
    private _setupOnlineOffline;
    private _removeOnlineOffline;
    private _cleanup;
}

declare class FluxbaseClient {
    private _config;
    private _log;
    private _dedup;
    private _authErrorCallback?;
    constructor(config: FluxbaseConfig);
    /**
     * Register a global handler called whenever any request returns a 401/403.
     * Use this to redirect users to login when their session expires.
     *
     * @example
     * flux.onAuthError((err) => router.push('/login'));
     */
    onAuthError(callback: AuthErrorCallback): this;
    /**
     * Build a chainable query for a table.
     *
     * @example
     * const { data } = await flux.from('messages').select('*').eq('room', 'A1').limit(50);
     */
    from<T = Record<string, any>>(table: string): QueryBuilder<T>;
    /**
     * Execute raw SQL directly.
     *
     * @example
     * const { data } = await flux.sql('SELECT COUNT(*) FROM messages');
     */
    sql<T = Record<string, any>>(query: string, params?: any[]): Promise<{
        success: boolean;
        data?: T[];
        error?: FluxbaseError;
    }>;
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
    channel(channelName: string, table?: string): RealtimeChannel;
}
/**
 * Create a Fluxbase client instance.
 *
 * @param url       - Your Fluxbase backend URL.
 * @param projectId - Your Fluxbase Project ID.
 * @param apiKey    - Your Fluxbase API Key (fl_...).
 * @param options   - Optional config: debug, timeout, retries.
 *
 * @example
 * import { createClient } from '@fluxbaseteam/fluxbase';
 *
 * const flux = createClient(
 *   'https://your-app.vercel.app',
 *   'your-project-id',
 *   'fl_your-api-key',
 *   { debug: true, timeout: 8000, retries: 3 }
 * );
 */
declare function createClient(url: string, projectId: string, apiKey: string, options?: Pick<FluxbaseConfig, 'debug' | 'timeout' | 'retries'>): FluxbaseClient;

export { type AuthErrorCallback, Deduplicator, ERROR_CODES, type ErrorCode, FluxbaseClient, type FluxbaseConfig, type FluxbaseError, type FluxbaseResponse, Logger, QueryBuilder, type RealtimeCallback, RealtimeChannel, type RealtimeEvent, type RealtimePayload, createClient };
