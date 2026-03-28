// ============================================================
// Fluxbase Client SDK v1.1.0 - Public Exports
// ============================================================

export { createClient, FluxbaseClient } from './FluxbaseClient.js';
export { QueryBuilder } from './QueryBuilder.js';
export { RealtimeChannel } from './RealtimeChannel.js';
export { Logger } from './logger.js';
export { Deduplicator } from './deduplicator.js';
export { ERROR_CODES } from './types.js';
export type {
  FluxbaseConfig,
  FluxbaseResponse,
  FluxbaseError,
  RealtimePayload,
  RealtimeEvent,
  RealtimeCallback,
  AuthErrorCallback,
  ErrorCode,
} from './types.js';
