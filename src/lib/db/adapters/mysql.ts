import { Pool as MysqlPool, PoolConnection } from 'mysql2/promise';
import {
  DatabaseAdapter,
  QueryResult,
  TransactionClient,
  BulkInsertResult,
  ColumnInfo,
  TableInfo,
  SchemaInfo,
} from './types';

export class MySqlAdapter implements DatabaseAdapter {
  readonly dialect = 'mysql' as const;
  private pool: MysqlPool;

  constructor(pool: MysqlPool) {
    this.pool = pool;
  }

  private formatSql(sql: string): string {
    // Converts $1, $2, ... placeholders to ? for MySQL
    return sql.replace(/\$\d+/g, '?');
  }

  async query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
    const formatted = this.formatSql(sql);
    const [rows] = await this.pool.execute(formatted, params);
    return {
      rows: rows as T[],
      rowCount: Array.isArray(rows) ? rows.length : (rows as any).affectedRows || 0,
    };
  }

  async transaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const txClient: TransactionClient = {
        query: async (sql, params) => {
          const formatted = this.formatSql(sql);
          const [rows] = await conn.execute(formatted, params);
          return { rows: rows as any[], rowCount: Array.isArray(rows) ? rows.length : (rows as any).affectedRows || 0 };
        },
        release: () => {},
      };
      const result = await fn(txClient);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
  }

  async bulkInsert(table: string, rows: Record<string, any>[], schema?: string): Promise<BulkInsertResult> {
    if (!rows.length) return { insertedRows: 0, durationMs: 0 };

    const start = Date.now();
    const qualifiedTable = schema ? `\`${schema}\`.\`${table}\`` : `\`${table}\``;

    const columns = Object.keys(rows[0]);
    const columnNames = columns.map(c => `\`${c}\``).join(', ');
    const valuePlaceholders = columns.map(() => '?').join(', ');

    const sql = `INSERT INTO ${qualifiedTable} (${columnNames}) VALUES (${valuePlaceholders})`;

    let insertedRows = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const values = columns.map(c => rows[i][c]);
      try {
        await this.pool.execute(sql, values);
        insertedRows++;
      } catch (e: any) {
        errors.push({ row: i, message: e.message });
      }
    }

    return { insertedRows, durationMs: Date.now() - start, errors };
  }

  async getSchema(schema?: string): Promise<SchemaInfo> {
    const dbFilter = schema || (this.pool as any).config?.database || 'fluxbase';
    const tables = await this.query<{ TABLE_NAME: string }>(`
      SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `, [dbFilter]);

    const tableInfos: TableInfo[] = [];
    for (const t of tables.rows) {
      const columns = await this.getColumns(t.TABLE_NAME, dbFilter);
      tableInfos.push({ name: t.TABLE_NAME, columns });
    }

    return { tables: tableInfos };
  }

  async getColumns(table: string, schema?: string): Promise<ColumnInfo[]> {
    const dbFilter = schema || (this.pool as any).config?.database || 'fluxbase';
    const result = await this.query(`
      SELECT
        COLUMN_NAME AS name,
        DATA_TYPE AS type,
        IS_NULLABLE = 'YES' AS nullable,
        COLUMN_DEFAULT AS defaultValue,
        CASE WHEN COLUMN_KEY = 'PRI' THEN true ELSE false END AS is_primary,
        CHARACTER_MAXIMUM_LENGTH AS characterMaximumLength,
        NUMERIC_PRECISION AS numericPrecision,
        NUMERIC_SCALE AS numericScale
      FROM information_schema.COLUMNS
      WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ?
      ORDER BY ORDINAL_POSITION
    `, [table, dbFilter]);

    return result.rows;
  }

  async getRowCount(table: string, schema?: string): Promise<number> {
    const qualifiedTable = schema ? `\`${schema}\`.\`${table}\`` : `\`${table}\``;
    const result = await this.query(`SELECT COUNT(*) AS count FROM ${qualifiedTable}`);
    return parseInt(result.rows[0]?.count || '0', 10);
  }

  async createSchema(name: string): Promise<void> {
    // MySQL uses databases instead of schemas — create a database
    await this.pool.execute(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
  }

  async dropSchema(name: string, cascade = false): Promise<void> {
    const cascadeSql = cascade ? '' : '';
    await this.pool.execute(`DROP DATABASE IF EXISTS \`${name}\`` + cascadeSql);
  }

  async schemaExists(name: string): Promise<boolean> {
    const result = await this.query(
      `SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [name]
    );
    return result.rowCount > 0;
  }

  async tableExists(table: string, schema?: string): Promise<boolean> {
    const dbFilter = schema || (this.pool as any).config?.database || 'fluxbase';
    const result = await this.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_NAME = ? AND TABLE_SCHEMA = ?`,
      [table, dbFilter]
    );
    return result.rowCount > 0;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.pool.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
