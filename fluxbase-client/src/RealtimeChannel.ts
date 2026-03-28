// ============================================================
// Fluxbase Client SDK v1.1.0 - Realtime Channel
// Full upgrade: exponential backoff, online/offline detection,
// Node.js EventSource ponyfill, auth error handling,
// pause/resume, per-event table scoping.
// ============================================================

import type {
  FluxbaseConfig,
  RealtimePayload,
  RealtimeEvent,
  RealtimeCallback,
  FluxbaseError,
} from './types.js';
import { ERROR_CODES } from './types.js';
import type { Logger } from './logger.js';

// ─── Node.js SSE Ponyfill ──────────────────────────────────
// EventSource is a browser API. In Node.js we dynamically import
// the 'eventsource' package so the SDK works server-side too.
async function getEventSource(): Promise<typeof EventSource> {
  if (typeof EventSource !== 'undefined') {
    return EventSource; // Browser native
  }
  try {
    const { EventSource: NodeEventSource } = await import('eventsource');
    return NodeEventSource as unknown as typeof EventSource;
  } catch {
    throw new Error(
      '[Fluxbase] EventSource is not available in this environment. ' +
      'In Node.js, install the ponyfill: npm install eventsource'
    );
  }
}

interface ChannelSubscription<T> {
  event: RealtimeEvent;
  table?: string;
  callback: RealtimeCallback<T>;
}

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'paused';

export class RealtimeChannel {
  private _config: FluxbaseConfig;
  private _channelName: string;
  private _table: string | undefined;
  private _log: Logger;
  private _onAuthError?: (err: FluxbaseError) => void;

  private _subscriptions: ChannelSubscription<any>[] = [];
  private _sse: EventSource | null = null;
  private _state: ConnectionState = 'disconnected';

  // Backoff state
  private _reconnectAttempt: number = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _maxReconnectDelay: number = 30000;
  private _baseReconnectDelay: number = 1000;

  // Lifecycle callbacks
  private _onConnectCallback?: () => void;
  private _onDisconnectCallback?: () => void;
  private _onReconnectCallback?: (attempt: number, delayMs: number) => void;

  // Online/offline listeners (stored so we can remove them)
  private _onlineHandler?: () => void;
  private _offlineHandler?: () => void;

  constructor(
    channelName: string,
    config: FluxbaseConfig,
    log: Logger,
    table?: string,
    onAuthError?: (err: FluxbaseError) => void
  ) {
    this._channelName = channelName;
    this._config = config;
    this._log = log;
    this._table = table;
    this._onAuthError = onAuthError;
  }

  // ─── Event Registration ────────────────────────────────────

  on<T = Record<string, any>>(event: RealtimeEvent, callback: RealtimeCallback<T>): this {
    this._subscriptions.push({ event, table: this._table, callback });
    return this;
  }

  onConnect(callback: () => void): this {
    this._onConnectCallback = callback;
    return this;
  }

  onDisconnect(callback: () => void): this {
    this._onDisconnectCallback = callback;
    return this;
  }

  /** Called every time a reconnect is attempted. Useful for showing UI indicators. */
  onReconnect(callback: (attempt: number, delayMs: number) => void): this {
    this._onReconnectCallback = callback;
    return this;
  }

  // ─── Connect ───────────────────────────────────────────────

  subscribe(): this {
    this._setupOnlineOffline();
    this._connect();
    return this;
  }

  // ─── Disconnect ────────────────────────────────────────────

  unsubscribe(): void {
    this._log.info(`Channel '${this._channelName}' unsubscribed.`);
    this._cleanup();
    this._state = 'disconnected';
    this._subscriptions = [];
    this._removeOnlineOffline();
  }

  // ─── Pause / Resume ────────────────────────────────────────

  /** Temporarily pause the connection (e.g. tab hidden, offline). */
  pause(): void {
    if (this._state === 'connected' || this._state === 'connecting') {
      this._log.debug(`Channel '${this._channelName}' paused.`);
      this._cleanup();
      this._state = 'paused';
    }
  }

  /** Resume a previously paused connection. */
  resume(): void {
    if (this._state === 'paused') {
      this._log.debug(`Channel '${this._channelName}' resuming...`);
      this._reconnectAttempt = 0;
      this._connect();
    }
  }

  get state(): ConnectionState {
    return this._state;
  }

  // ─── Internal: Connect ─────────────────────────────────────

  private async _connect(): Promise<void> {
    if (this._state === 'paused') return;
    this._state = 'connecting';

    const ESClass = await getEventSource().catch((err) => {
      this._log.error(err.message);
      this._state = 'disconnected';
      return null;
    });

    if (!ESClass) return;

    const url = new URL(`${this._config.url}/api/realtime/subscribe`);
    url.searchParams.set('projectId', this._config.projectId);
    url.searchParams.set('apiKey', this._config.apiKey);

    this._log.info(`Channel '${this._channelName}' connecting to SSE...`);
    this._sse = new ESClass(url.toString()) as EventSource;

    this._sse.onopen = () => {
      this._state = 'connected';
      this._reconnectAttempt = 0;
      this._log.info(`Channel '${this._channelName}' connected. ✓`);
      this._onConnectCallback?.();
    };

    this._sse.onerror = (err: any) => {
      // Check if it's an auth error (SSE doesn't give HTTP status directly,
      // but we know the connection was rejected if it closes immediately)
      if (this._state === 'connecting') {
        this._log.error(`Channel '${this._channelName}' failed to connect. Check your API Key and Project ID.`);
      } else {
        this._log.warn(`Channel '${this._channelName}' connection lost.`);
      }

      this._state = 'disconnected';
      this._onDisconnectCallback?.();
      this._sse?.close();
      this._sse = null;
      this._scheduleReconnect();
    };

    this._sse.onmessage = (event: MessageEvent) => {
      this._handleMessage(event);
    };
  }

  // ─── Internal: Message Handling ────────────────────────────

  private _handleMessage(event: MessageEvent): void {
    try {
      const payload: RealtimePayload = JSON.parse(event.data);

      // Ignore heartbeat frames
      if ((payload as any).type === 'connected') return;

      this._log.debug(`Channel '${this._channelName}' received event`, payload);

      const row = payload.data?.new ?? payload.data?.old ?? (payload as any).record;

      for (const sub of this._subscriptions) {
        // Table filter
        if (sub.table && payload.table_name !== sub.table && payload.table_id !== sub.table) {
          continue;
        }

        // Event matching
        const op = payload.operation;
        const et = payload.event_type;

        const matchesEvent =
          sub.event === '*' ||
          (sub.event === 'row.inserted' && (et === 'row.inserted' || (et === 'raw_sql_mutation' && op === 'INSERT'))) ||
          (sub.event === 'row.updated' && (et === 'row.updated' || (et === 'raw_sql_mutation' && op === 'UPDATE'))) ||
          (sub.event === 'row.deleted' && (et === 'row.deleted' || (et === 'raw_sql_mutation' && op === 'DELETE')));

        if (!matchesEvent) continue;

        // Skip empty data payloads (structural notifications)
        if (row && Object.keys(row).length === 0) continue;

        sub.callback(payload);
      }
    } catch {
      // Silently discard malformed frames
    }
  }

  // ─── Internal: Exponential Backoff Reconnect ───────────────

  private _scheduleReconnect(): void {
    if (this._state === 'paused' || this._state === 'disconnected' && this._subscriptions.length === 0) return;

    this._reconnectAttempt++;
    const delay = Math.min(
      this._baseReconnectDelay * Math.pow(2, this._reconnectAttempt - 1),
      this._maxReconnectDelay
    );

    this._log.warn(`Reconnecting channel '${this._channelName}' in ${delay}ms (attempt ${this._reconnectAttempt})...`);
    this._onReconnectCallback?.(this._reconnectAttempt, delay);

    this._reconnectTimer = setTimeout(() => {
      if (this._state !== 'paused') {
        this._connect();
      }
    }, delay);
  }

  // ─── Internal: Online / Offline ────────────────────────────

  private _setupOnlineOffline(): void {
    if (typeof window === 'undefined') return; // Node.js - skip

    this._offlineHandler = () => {
      this._log.warn(`Network offline — pausing channel '${this._channelName}'.`);
      this.pause();
    };

    this._onlineHandler = () => {
      this._log.info(`Network online — resuming channel '${this._channelName}'.`);
      this.resume();
    };

    window.addEventListener('offline', this._offlineHandler);
    window.addEventListener('online', this._onlineHandler);
  }

  private _removeOnlineOffline(): void {
    if (typeof window === 'undefined') return;
    if (this._offlineHandler) window.removeEventListener('offline', this._offlineHandler);
    if (this._onlineHandler) window.removeEventListener('online', this._onlineHandler);
  }

  // ─── Internal: Cleanup ─────────────────────────────────────

  private _cleanup(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._sse) {
      this._sse.close();
      this._sse = null;
    }
  }
}
