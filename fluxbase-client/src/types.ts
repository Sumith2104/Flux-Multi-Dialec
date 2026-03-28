// ============================================================
// Fluxbase Client SDK v1.1.0 - Types & Interfaces
// ============================================================

// ─── Error Codes ─────────────────────────────────────────────
export const ERROR_CODES = {
  // Auth
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Request
  BAD_REQUEST: 'BAD_REQUEST',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  SQL_EXECUTION_ERROR: 'SQL_EXECUTION_ERROR',

  // Limits
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  ROW_LIMIT_EXCEEDED: 'ROW_LIMIT_EXCEEDED',

  // Network
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  CORS_ERROR: 'CORS_ERROR',
  ABORTED: 'ABORTED',

  // Server
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  REALTIME_CONNECTION_FAILED: 'REALTIME_CONNECTION_FAILED',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

// ─── Config ──────────────────────────────────────────────────
export interface FluxbaseConfig {
  /** The full URL of your Fluxbase backend (Vercel or local). Used for all SQL/REST queries. */
  url: string;
  /**
   * Optional: The URL of your Fluxbase Realtime sidecar (Render).
   * If not provided, falls back to `url` for SSE connections.
   * 
   * @example
   * realtimeUrl: 'https://fluxbase-realtime.onrender.com'
   */
  realtimeUrl?: string;
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

// ─── Response ────────────────────────────────────────────────
export interface FluxbaseError {
  message: string;
  code?: ErrorCode | string;
  hint?: string;
}

export interface FluxbaseResponse<T = any> {
  success: boolean;
  data?: T[];
  count?: number;
  error?: FluxbaseError;
}

// ─── Realtime ────────────────────────────────────────────────
export interface RealtimePayload<T = Record<string, any>> {
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

export type RealtimeEvent = 'row.inserted' | 'row.updated' | 'row.deleted' | '*';
export type RealtimeCallback<T = Record<string, any>> = (payload: RealtimePayload<T>) => void;
export type AuthErrorCallback = (error: FluxbaseError) => void;
