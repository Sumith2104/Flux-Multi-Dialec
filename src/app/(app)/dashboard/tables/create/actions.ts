'use server';

import { createTable, Column, getTablesForProject } from '@/lib/data';

export async function createTableAction(formData: FormData) {
  const tableName = formData.get('tableName') as string;
  const description = formData.get('description') as string;
  const projectId = formData.get('projectId') as string;
  const columnsStr = formData.get('columns') as string;

  if (!tableName || !projectId || !columnsStr) {
    return { error: 'Missing required fields.' };
  }

  if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
    return { error: 'Table name can only contain letters, numbers, and underscores.' };
  }

  try {
    // Check for duplicate table name
    const existingTables = await getTablesForProject(projectId);
    if (existingTables.some(t => t.table_name.toLowerCase() === tableName.toLowerCase())) {
      return { success: false, error: `A table with the name '${tableName}' already exists in this project.` };
    }

    // Parse columns from the request (expected format: "name:type,name2:type2")
    // In Phase 2, we map these simple types to our strict Firestore types.
    // All valid PostgreSQL / SQL column types accepted by the UI
    const validTypes = new Set([
      // Special
      'gen_random_uuid()', 'now()',
      // Text
      'text', 'varchar', 'char', 'bpchar', 'name', 'citext',
      // Integer
      'integer', 'int', 'int2', 'int4', 'int8', 'bigint', 'smallint',
      'serial', 'bigserial', 'smallserial',
      // Decimal / Float
      'numeric', 'decimal', 'real', 'float4', 'float8', 'double precision', 'money',
      // Boolean
      'boolean', 'bool',
      // Date / Time
      'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval',
      // UUID
      'uuid',
      // JSON
      'json', 'jsonb',
      // Binary
      'bytea',
      // Network
      'inet', 'cidr', 'macaddr',
      // Geometric
      'point', 'line', 'lseg', 'box', 'path', 'polygon', 'circle',
      // Arrays
      'text[]', 'integer[]', 'boolean[]', 'jsonb[]',
      // Range
      'int4range', 'int8range', 'numrange', 'tsrange', 'tstzrange', 'daterange',
      // Full-text Search
      'tsvector', 'tsquery',
      // Other
      'xml', 'bit', 'varbit', 'oid',
      // Aliases (UI convenience)
      'number', 'string',
    ]);

    const columns: Column[] = columnsStr.split(',').map(c => {
      // New format: "name|type|pk|nullable|default:value"
      // Old format fallback: "name:type" (for CSV imports that still use the simple format)
      const parts = c.split('|');
      const isPipeFormat = parts.length > 1;

      let name: string;
      let rawType: string;
      let isPrimaryKey = false;
      let isNullable = true;
      let defaultValue: string | undefined = undefined;

      if (isPipeFormat) {
        name = parts[0]?.trim() || '';
        rawType = parts[1]?.trim() || 'text';
        isPrimaryKey = parts.includes('pk');
        isNullable = parts.includes('nullable');
        const defaultPart = parts.find(p => p.startsWith('default:'));
        if (defaultPart) defaultValue = defaultPart.slice('default:'.length);
      } else {
        // Legacy colon format from CSV import
        const colonParts = c.split(':');
        name = colonParts[0]?.trim() || '';
        rawType = colonParts[1]?.trim() || 'text';
      }

      let type = rawType.toLowerCase();

      // Normalize convenience aliases
      if (type === 'string') type = 'varchar';
      if (type === 'number') type = 'integer';
      if (type === 'bool') type = 'boolean';

      // Handle 'now()' magic type → timestamp with default
      if (type === 'now()') {
        type = 'timestamp';
        defaultValue = defaultValue ?? 'now()';
      }

      // Handle UUID auto-generation
      if (type === 'gen_random_uuid()') {
        type = 'uuid';
        defaultValue = defaultValue ?? 'gen_random_uuid()';
      }

      // If type is still not recognized, fall back to varchar safely
      if (!validTypes.has(type)) {
        console.warn(`Unknown column type "${type}" — falling back to varchar.`);
        type = 'varchar';
      }

      return {
        column_id: '',
        table_id: '',
        column_name: name,
        data_type: type.toUpperCase() as any,
        is_primary_key: isPrimaryKey,
        is_nullable: isPrimaryKey ? false : isNullable,
        default_value: defaultValue
      };
    });

    if (columns.length === 0) {
      return { error: 'You must define at least one column.' };
    }

    const table = await createTable(projectId, tableName, description || '', columns);
    return { success: true, tableId: table.table_id };

  } catch (error) {
    console.error('Table creation failed:', error);
    return { error: `An unexpected error occurred: ${(error as Error).message}` };
  }
}
