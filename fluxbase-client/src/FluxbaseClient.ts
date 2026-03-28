// ============================================================
// Fluxbase Client SDK v1.1.0 - Core Client
// ============================================================

import { QueryBuilder } from './QueryBuilder.js';
import { RealtimeChannel } from './RealtimeChannel.js';
import { Logger } from './logger.js';
import { Deduplicator } from './deduplicator.js';
import type { FluxbaseConfig, FluxbaseError, AuthErrorCallback } from './types.js';

export class FluxbaseClient {
  private _config: FluxbaseConfig;
  private _log: Logger;
  private _dedup: Deduplicator;
  private _authErrorCallback?: AuthErrorCallback;

  constructor(config: FluxbaseConfig) {
    if (!config.url) throw new Error('[Fluxbase] url is required.');
    if (!config.projectId) throw new Error('[Fluxbase] projectId is required.');
    if (!config.apiKey) throw new Error('[Fluxbase] apiKey is required.');

    this._config = {
      ...config,
      url: config.url.replace(/\/$/, ''),
      realtimeUrl: config.realtimeUrl ? config.realtimeUrl.replace(/\/$/, '') : config.url.replace(/\/$/, ''),
      timeout: config.timeout ?? 10000,
      retries: config.retries ?? 2,
      debug: config.debug ?? false,
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
  onAuthError(callback: AuthErrorCallback): this {
    this._authErrorCallback = callback;
    return this;
  }

  /**
   * Build a chainable query for a table.
   *
   * @example
   * const { data } = await flux.from('messages').select('*').eq('room', 'A1').limit(50);
   */
  from<T = Record<string, any>>(table: string): QueryBuilder<T> {
    return new QueryBuilder<T>(
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
  async sql<T = Record<string, any>>(query: string, params?: any[]): Promise<{
    success: boolean;
    data?: T[];
    error?: FluxbaseError;
  }> {
    this._log.debug('RAW SQL', { query });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this._config.timeout ?? 10000);

    try {
      const res = await fetch(`${this._config.url}/api/execute-sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this._config.apiKey}`,
        },
        body: JSON.stringify({ projectId: this._config.projectId, query, params }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 401 || res.status === 403) {
        const err: FluxbaseError = {
          message: 'Unauthorized: Invalid or expired API Key.',
          code: 'UNAUTHORIZED',
        };
        this._authErrorCallback?.(err);
        return { success: false, error: err };
      }

      const json = await res.json() as any;
      if (!json.success) return { success: false, error: json.error };
      return { success: true, data: json.result?.rows || [] };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return { success: false, error: { message: err?.message || 'Network error', code: 'NETWORK_ERROR' } };
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
  channel(channelName: string, table?: string): RealtimeChannel {
    return new RealtimeChannel(
      channelName,
      this._config,
      this._log,
      table,
      this._authErrorCallback
    );
  }
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
export function createClient(
  url: string,
  projectId: string,
  apiKey: string,
  options?: Pick<FluxbaseConfig, 'debug' | 'timeout' | 'retries' | 'realtimeUrl'>
): FluxbaseClient {
  return new FluxbaseClient({ url, projectId, apiKey, ...options });
}
