/**
 * DatabaseAdapter — unified interface for PostgreSQL and MySQL operations.
 * All tenant-engine, sql-engine, and data-layer code should use this interface
 * instead of direct pool.query() calls.
 */

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimary?: boolean;
  isUnique?: boolean;
  characterMaximumLength?: number | null;
  numericPrecision?: number | null;
  numericScale?: number | null;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  rowCount?: number;
}

export interface SchemaInfo {
  tables: TableInfo[];
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: Array<{ name: string; dataTypeID?: number }>;
}

export interface TransactionClient {
  query(sql: string, params?: any[]): Promise<QueryResult>;
  release(): void;
}

export interface BulkInsertResult {
  insertedRows: number;
  durationMs: number;
  errors?: Array<{ row: number; message: string }>;
}

export interface DatabaseAdapter {
  /** The database dialect identifier */
  readonly dialect: 'postgresql' | 'mysql';

  /** Execute a SQL query with optional parameters */
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;

  /** Execute a function within a transaction */
  transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T>;

  /** Bulk insert rows into a table using the fastest available method */
  bulkInsert(table: string, rows: Record<string, any>[], schema?: string): Promise<BulkInsertResult>;

  /** Get the full schema information (all tables and columns) */
  getSchema(schema?: string): Promise<SchemaInfo>;

  /** Get columns for a specific table */
  getColumns(table: string, schema?: string): Promise<ColumnInfo[]>;

  /** Get row count for a table */
  getRowCount(table: string, schema?: string): Promise<number>;

  /** Create a schema/namespace */
  createSchema(name: string): Promise<void>;

  /** Drop a schema/namespace */
  dropSchema(name: string, cascade?: boolean): Promise<void>;

  /** Check if a schema/namespace exists */
  schemaExists(name: string): Promise<boolean>;

  /** Check if a table exists in a schema */
  tableExists(table: string, schema?: string): Promise<boolean>;

  /** Health check — returns true if the connection is alive */
  healthCheck(): Promise<boolean>;

  /** Close the underlying pool/connection */
  close(): Promise<void>;
}
