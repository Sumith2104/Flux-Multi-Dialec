import { Pool, PoolClient } from 'pg';
import {
  DatabaseAdapter,
  QueryResult,
  TransactionClient,
  BulkInsertResult,
  ColumnInfo,
  TableInfo,
  SchemaInfo,
} from './types';

export class PostgresAdapter implements DatabaseAdapter {
  readonly dialect = 'postgresql' as const;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const result = await this.pool.query(sql, params);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount ?? 0,
      fields: result.fields?.map(f => ({ name: f.name, dataTypeID: f.dataTypeID })),
    };
  }

  async transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const txClient: TransactionClient = {
        query: (sql, params) => client.query(sql, params).then(r => ({
          rows: r.rows,
          rowCount: r.rowCount ?? 0,
        })),
        release: () => {},
      };
      const result = await fn(txClient);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async bulkInsert(table: string, rows: Record<string, any>[], schema?: string): Promise<BulkInsertResult> {
    if (!rows.length) return { insertedRows: 0, durationMs: 0 };

    const start = Date.now();
    const qualifiedTable = schema ? `"${schema}"."${table}"` : `"${table}"`;

    // Get column names from first row
    const columns = Object.keys(rows[0]);
    const columnNames = columns.map(c => `"${c}"`).join(', ');
    const valuePlaceholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    // Build the parameterized INSERT
    const sql = `INSERT INTO ${qualifiedTable} (${columnNames}) VALUES (${valuePlaceholders})`;

    let insertedRows = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const values = columns.map(c => rows[i][c]);
      try {
        await this.pool.query(sql, values);
        insertedRows++;
      } catch (e: any) {
        errors.push({ row: i, message: e.message });
      }
    }

    return { insertedRows, durationMs: Date.now() - start, errors };
  }

  async getSchema(schema?: string): Promise<SchemaInfo> {
    const schemaFilter = schema || 'public';
    const tables = await this.query<{ table_name: string }>(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [schemaFilter]);

    const tableInfos: TableInfo[] = [];
    for (const t of tables.rows) {
      const columns = await this.getColumns(t.table_name, schema);
      tableInfos.push({ name: t.table_name, columns });
    }

    return { tables: tableInfos };
  }

  async getColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    const schemaFilter = schema || 'public';
    const result = await this.query(`
      SELECT
        c.column_name AS name,
        c.data_type AS type,
        c.is_nullable = 'YES' AS nullable,
        c.column_default AS "defaultValue",
        CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END AS is_primary,
        c.character_maximum_length AS "characterMaximumLength",
        c.numeric_precision AS "numericPrecision",
        c.numeric_scale AS "numericScale"
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name, ku.table_name, ku.table_schema
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
      ) pk ON c.table_name = pk.table_name AND c.table_schema = pk.table_schema AND c.column_name = pk.column_name
      WHERE c.table_name = $1 AND c.table_schema = $2
      ORDER BY c.ordinal_position
    `, [table, schemaFilter]);

    return result.rows;
  }

  async getRowCount(table: string, schema?: string): Promise<number> {
    const qualifiedTable = schema ? `"${schema}"."${table}"` : `"${table}"`;
    const result = await this.query(`SELECT COUNT(*)::int AS count FROM ${qualifiedTable}`);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async createSchema(name: string): Promise<void> {
    await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${name}"`);
  }

  async dropSchema(name: string, cascade = false): Promise<void> {
    const cascadeSql = cascade ? ' CASCADE' : '';
    await this.pool.query(`DROP SCHEMA IF EXISTS "${name}"${cascadeSql}`);
  }

  async schemaExists(name: string): Promise<boolean> {
    const result = await this.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [name]
    );
    return result.rowCount > 0;
  }

  async tableExists(table: string, schema?: string): Promise<boolean> {
    const schemaFilter = schema || 'public';
    const result = await this.query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1 AND table_schema = $2`,
      [table, schemaFilter]
    );
    return result.rowCount > 0;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
