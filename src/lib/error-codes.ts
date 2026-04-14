/**
 * Fluxbase Structured Error Codes
 * Standardized error codes for REST APIs to improve Developer Experience (DX).
 */

export const ERROR_CODES = {
  // Authentication & Authorization
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // Request Validation
  BAD_REQUEST: 'BAD_REQUEST',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_PROJECT: 'INVALID_PROJECT',

  // Resource Management
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  BUCKET_NOT_FOUND: 'STORAGE_BUCKET_NOT_FOUND',
  FILE_NOT_FOUND: 'STORAGE_FILE_NOT_FOUND',
  BUCKET_NOT_EMPTY: 'STORAGE_BUCKET_NOT_EMPTY',

  // SQL Execution
  SQL_SYNTAX: 'SQL_SYNTAX',
  SQL_EXECUTION_ERROR: 'SQL_EXEC_ERROR',
  TRANSACTION_ERROR: 'TRANSACTION_ERROR',

  // Limits
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  STORAGE_QUOTA_EXCEEDED: 'STORAGE_FULL',
  FILE_SIZE_EXCEEDED: 'FILE_TOO_LARGE',
  MIME_TYPE_NOT_ALLOWED: 'INVALID_FILE_TYPE',

  // Server Errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_CONNECTION_ERROR: 'DB_CONNECTION_FAILURE',
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
