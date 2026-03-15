/**
 * Fluxbase Structured Error Codes
 * Standardized error codes for REST APIs to improve Developer Experience (DX).
 */

export const ERROR_CODES = {
  // Authentication & Authorization
  AUTH_REQUIRED: 'FLUX_AUTH_REQUIRED',
  AUTH_EXPIRED: 'FLUX_AUTH_EXPIRED',
  SCOPE_MISMATCH: 'FLUX_SCOPE_MISMATCH',
  UNAUTHORIZED: 'FLUX_UNAUTHORIZED',

  // Request Validation
  BAD_REQUEST: 'FLUX_BAD_REQUEST',
  MISSING_FIELD: 'FLUX_MISSING_FIELD',
  INVALID_PROJECT: 'FLUX_INVALID_PROJECT',

  // Resource Management
  PROJECT_NOT_FOUND: 'FLUX_PROJECT_NOT_FOUND',
  TABLE_NOT_FOUND: 'FLUX_TABLE_NOT_FOUND',
  BUCKET_NOT_FOUND: 'FLUX_STORAGE_BUCKET_NOT_FOUND',
  FILE_NOT_FOUND: 'FLUX_STORAGE_FILE_NOT_FOUND',
  BUCKET_NOT_EMPTY: 'FLUX_STORAGE_BUCKET_NOT_EMPTY',

  // SQL Execution
  SQL_SYNTAX: 'FLUX_SQL_SYNTAX',
  SQL_EXECUTION_ERROR: 'FLUX_SQL_ERROR',
  TRANSACTION_ERROR: 'FLUX_TRANSACTION_ERROR',

  // Limits
  RATE_LIMIT_EXCEEDED: 'FLUX_RATE_LIMIT',
  STORAGE_QUOTA_EXCEEDED: 'FLUX_STORAGE_FULL',
  FILE_SIZE_EXCEEDED: 'FLUX_FILE_TOO_LARGE',
  MIME_TYPE_NOT_ALLOWED: 'FLUX_INVALID_FILE_TYPE',

  // Server Errors
  INTERNAL_ERROR: 'FLUX_INTERNAL_ERROR',
  DATABASE_CONNECTION_ERROR: 'FLUX_DB_CONNECTION_FAILURE',
} as const;

export type FluxbaseErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export class FluxbaseError extends Error {
  code: FluxbaseErrorCode;
  status: number;

  constructor(message: string, code: FluxbaseErrorCode, status: number = 400) {
    super(message);
    this.name = 'FluxbaseError';
    this.code = code;
    this.status = status;
  }

  toJSON() {
    return {
      success: false,
      error: {
        message: this.message,
        code: this.code,
      }
    };
  }
}
