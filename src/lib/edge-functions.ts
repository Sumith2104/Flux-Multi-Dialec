import type { DatabaseAdapter } from './db/adapters/types';

/**
 * Edge Function trigger points.
 */
export type EdgeFunctionTrigger =
  | 'before-insert'
  | 'after-insert'
  | 'before-update'
  | 'after-update'
  | 'before-delete'
  | 'after-delete'
  | 'http-request';

export interface EdgeFunctionContext {
  /** The authenticated user ID, if any */
  userId?: string;
  /** The project ID */
  projectId: string;
  /** The table name (for data triggers) */
  table?: string;
  /** The trigger type */
  trigger: EdgeFunctionTrigger;
  /** The operation being performed (for data triggers) */
  operation?: 'insert' | 'update' | 'delete';
  /** The row data (before for update/delete, after for insert/update) */
  row?: Record<string, any>;
  /** The previous row data (only for update/delete) */
  oldRow?: Record<string, any>;
  /** HTTP request info (for http-request trigger) */
  request?: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: any;
    query?: Record<string, string>;
  };
  /** Database adapter for performing queries */
  db: DatabaseAdapter;
  /** Current timestamp */
  timestamp: Date;
}

export interface EdgeFunctionResult {
  /** For data triggers: modified row data (return to override) */
  row?: Record<string, any>;
  /** For data triggers: set to false to cancel the operation */
  cancel?: boolean;
  /** For data triggers: error message to return */
  error?: string;
  /** For HTTP triggers: response body */
  body?: any;
  /** For HTTP triggers: response status code */
  status?: number;
  /** For HTTP triggers: response headers */
  headers?: Record<string, string>;
}

/**
 * Edge function definition stored in the database.
 */
export interface EdgeFunctionDef {
  id: string;
  project_id: string;
  name: string;
  trigger: EdgeFunctionTrigger;
  /** Optional table filter (only fire for this table) */
  table_filter?: string;
  /** TypeScript source code of the function */
  source: string;
  /** Whether the function is enabled */
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Edge function execution options.
 */
export interface EdgeFunctionExecOptions {
  /** Maximum execution time in milliseconds */
  timeoutMs?: number;
  /** Maximum memory in MB */
  memoryLimitMb?: number;
}

/**
 * Interface for the edge function runtime.
 * Implementation can use vm2, isolate-vm, or @edge-runtime/node.
 */
export interface EdgeFunctionRuntime {
  /** Register a function definition */
  register(fn: EdgeFunctionDef): void;
  /** Unregister a function */
  unregister(id: string): void;
  /** Execute a function in the sandbox */
  execute(
    fn: EdgeFunctionDef,
    ctx: EdgeFunctionContext,
    options?: EdgeFunctionExecOptions
  ): Promise<EdgeFunctionResult>;
  /** Get all functions for a project and trigger */
  getFunctions(projectId: string, trigger?: EdgeFunctionTrigger, table?: string): EdgeFunctionDef[];
}

/**
 * Create the edge_functions table if it doesn't exist.
 */
export const EDGE_FUNCTIONS_DDL = `
CREATE TABLE IF NOT EXISTS fluxbase_global.edge_functions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL REFERENCES fluxbase_global.projects(project_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN (
    'before-insert', 'after-insert',
    'before-update', 'after-update',
    'before-delete', 'after-delete',
    'http-request'
  )),
  table_filter TEXT,
  source TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_edge_functions_project_trigger
  ON fluxbase_global.edge_functions (project_id, trigger, table_filter);
`;
