import type { QueryResult } from './db/adapters/types';

export interface Migration {
  /** Sequential version number */
  version: number;
  /** Human-readable description */
  name: string;
  /** SQL to apply this migration */
  up: string;
  /** SQL to revert this migration */
  down: string;
}

export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: string;
  execution_time_ms: number;
}

export interface MigrationResult {
  success: boolean;
  version: number;
  name: string;
  direction: 'up' | 'down';
  execution_time_ms: number;
  error?: string;
}

export interface SchemaDiff {
  table: string;
  type: 'create' | 'drop' | 'alter';
  details: string;
  sql?: string;
}

/**
 * Runs a single migration in the given schema.
 */
export async function runMigration(
  query: (sql: string, params?: any[]) => Promise<QueryResult>,
  schema: string,
  migration: Migration,
  direction: 'up' | 'down' = 'up'
): Promise<MigrationResult> {
  const start = Date.now();
  const sql = direction === 'up' ? migration.up : migration.down;

  try {
    // Ensure migration history table exists
    await query(`
      CREATE TABLE IF NOT EXISTS "${schema}"._flux_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        execution_time_ms INTEGER NOT NULL
      )
    `);

    if (direction === 'up') {
      // Check if already applied
      const existing = await query(
        `SELECT version FROM "${schema}"._flux_migrations WHERE version = $1`,
        [migration.version]
      );
      if (existing.rowCount > 0) {
        return { success: true, version: migration.version, name: migration.name, direction: 'up', execution_time_ms: 0 };
      }
    }

    // Execute migration SQL
    await query(sql);

    const duration = Date.now() - start;

    if (direction === 'up') {
      await query(
        `INSERT INTO "${schema}"._flux_migrations (version, name, execution_time_ms) VALUES ($1, $2, $3)`,
        [migration.version, migration.name, duration]
      );
    } else {
      await query(
        `DELETE FROM "${schema}"._flux_migrations WHERE version = $1`,
        [migration.version]
      );
    }

    return { success: true, version: migration.version, name: migration.name, direction, execution_time_ms: duration };
  } catch (e: any) {
    return { success: false, version: migration.version, name: migration.name, direction, execution_time_ms: Date.now() - start, error: e.message };
  }
}

/**
 * Get list of applied migrations.
 */
export async function getAppliedMigrations(
  query: (sql: string, params?: any[]) => Promise<QueryResult>,
  schema: string
): Promise<MigrationRecord[]> {
  try {
    const result = await query(
      `SELECT version, name, applied_at, execution_time_ms FROM "${schema}"._flux_migrations ORDER BY version`
    );
    return result.rows as MigrationRecord[];
  } catch {
    return [];
  }
}

/**
 * Generate a schema diff between two SQL DDL strings.
 * Returns a list of changes needed to go from current to target.
 */
export function diffSchemas(currentDDL: string, targetDDL: string): SchemaDiff[] {
  // Basic implementation: parse CREATE TABLE statements and compare
  const diffs: SchemaDiff[] = [];
  
  const extractTables = (ddl: string) => {
    const tables = new Map<string, string[]>();
    const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([^"`\s]+)["`]?\s*\(([^)]+)\)/gi;
    let match;
    while ((match = createRegex.exec(ddl)) !== null) {
      const tableName = match[1].replace(/^["`]|["`]$/g, '');
      const columns = match[2].split(',').map(c => c.trim()).filter(c => !c.toUpperCase().startsWith('CONSTRAINT') && !c.toUpperCase().startsWith('PRIMARY KEY') && !c.toUpperCase().startsWith('UNIQUE') && !c.toUpperCase().startsWith('CHECK') && !c.toUpperCase().startsWith('FOREIGN KEY'));
      tables.set(tableName, columns);
    }
    return tables;
  };

  const currentTables = extractTables(currentDDL);
  const targetTables = extractTables(targetDDL);

  // Find new tables
  for (const [table, cols] of targetTables) {
    if (!currentTables.has(table)) {
      diffs.push({ table, type: 'create', details: `New table with ${cols.length} columns`, sql: targetDDL.match(new RegExp(`CREATE TABLE[^;]*${table}[^;]*;`, 'i'))?.[0] });
    }
  }

  // Find dropped tables
  for (const [table] of currentTables) {
    if (!targetTables.has(table)) {
      diffs.push({ table, type: 'drop', details: 'Table removed' });
    }
  }

  // Find altered tables (column count changed)
  for (const [table, targetCols] of targetTables) {
    const currentCols = currentTables.get(table);
    if (currentCols && currentCols.length !== targetCols.length) {
      diffs.push({ table, type: 'alter', details: `Column count changed: ${currentCols.length} → ${targetCols.length}` });
    }
  }

  return diffs;
}
