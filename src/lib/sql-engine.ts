
import { Parser, AST, Create } from 'node-sql-parser';
import { getTableData, getTablesForProject, getColumnsForTable, createTable, deleteTable, addColumn, updateColumn, deleteColumn, addConstraint, Table, Column, Row } from '@/lib/data';
import { getCurrentUserId } from '@/lib/auth';
import { trackApiRequest } from '@/lib/analytics';
import fs from 'fs/promises';
import path from 'path';
import { adminDb } from '@/lib/firebase-admin';

export interface SqlResult {
    rows: any[];
    columns: string[];
    message?: string;
    explanation?: string[];
}

export class SqlEngine {
    private projectId: string;
    private userId: string | null = null;
    private parser: Parser;

    constructor(projectId: string, userId?: string) {
        this.projectId = projectId;
        this.userId = userId || null;
        this.parser = new Parser();
    }

    private async init() {
        if (!this.userId) {
            this.userId = await getCurrentUserId();
        }
        if (!this.userId) throw new Error("Unauthorized");
    }

    private getDbOption(dialect?: string): string {
        if (dialect === 'mysql') return 'MySQL';
        if (dialect === 'oracle') return 'Oracle';
        return 'PostgreSQL';
    }

    public async execute(query: string): Promise<SqlResult> {
        await this.init();
        if (!this.userId) throw new Error("Unauthorized");

        const queryCleaned = query.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        // Split by semicolon, handling simple cases
        // Bypass parser for custom GENERATE_DATA command
        const generateMatch = queryCleaned.match(/^CALL\s+GENERATE_DATA\s*\(\s*'([^']+)'\s*,\s*(\d+)\s*\)/i);
        if (generateMatch) {
            const tableName = generateMatch[1];
            const count = parseInt(generateMatch[2], 10);
            return this.handleGenerateData(tableName, count);
        }

        const statements = queryCleaned.split(';').map(s => s.trim()).filter(s => s.length > 0);

        let lastResult: SqlResult = { rows: [], columns: [], explanation: [] };

        for (const statement of statements) {
            let astArray: AST[] | AST;
            try {
                try {
                    astArray = this.parser.astify(statement, { database: 'PostgreSQL' });
                } catch {
                    astArray = this.parser.astify(statement, { database: 'MySQL' });
                }
            } catch (e: any) {
                throw new Error(`SQL Syntax Error in statement "${statement.substring(0, 50)}...": ${e.message}`);
            }

            const asts = Array.isArray(astArray) ? astArray : [astArray];

            for (const ast of asts) {
                const type = (ast as any).type?.toUpperCase();

                await trackApiRequest(this.projectId, 'sql_execution');
                await trackApiRequest(this.projectId, 'api_call');

                let result: SqlResult;
                switch (type) {
                    case 'SELECT': result = await this.handleSelect(ast); break;
                    case 'INSERT': result = await this.handleInsert(ast); break;
                    case 'UPDATE': result = await this.handleUpdate(ast); break;
                    case 'DELETE': result = await this.handleDelete(ast); break;
                    case 'CREATE': result = await this.handleCreate(ast as Create); break;
                    case 'DROP': result = await this.handleDrop(ast); break;
                    case 'ALTER': result = await this.handleAlter(ast); break;
                    default: throw new Error(`Unsupported SQL command: ${type}`);
                }
                lastResult = result;
            }
        }

        return lastResult;
    }

    // --- Data Access Helpers (Hybrid CSV/Firestore) ---
    // These abstract the read/write logic so commands don't care about storage



    private async saveAllRows(tableName: string, rows: Row[], columns: Column[]) {
        const projectPath = path.join(process.cwd(), 'src', 'database', this.userId!, this.projectId);
        const dataFilePath = path.join(projectPath, `${tableName}.csv`);

        try {
            await fs.access(dataFilePath);
            // CSV Mode: Rewrite file
            const header = columns.map(c => c.column_name).join(',');
            const lines = rows.map(row => {
                return columns.map(c => {
                    const val = row[c.column_name];
                    return val === null || val === undefined ? '' : String(val);
                }).join(',');
            });
            await fs.writeFile(dataFilePath, [header, ...lines].join('\n'));
        } catch {
            // Firestore Mode:
            // This is expensive for full rewrites. 
            // Better to only perform on specific IDs.
            // But for generic "Engine" abstraction simplify to:
            // If we are here, we probably did an UPDATE/DELETE.
            // We should use individual updates if possible.
            // Refactoring to support bulk updates later.
            // For now, assume this is only called for CSV updates in this simplified engine,
            // OR we handle Firestore updates individually in the handlers.
        }
    }

    // --- Command Handlers ---

    private async handleSelect(ast: any): Promise<SqlResult> {
        // Similar to existing logic, but using class methods

        const from = ast.from;
        if (!from || from.length === 0) throw new Error("FROM clause is required.");

        const mainTableDef = from[0];
        let processedRows: any[] = [];
        let explanation: string[] = [];

        // Catch GENERATE_SERIES
        let funcName = '';
        if (mainTableDef.expr && mainTableDef.expr.type === 'function') {
            if (typeof mainTableDef.expr.name === 'string') {
                funcName = mainTableDef.expr.name;
            } else if (mainTableDef.expr.name && mainTableDef.expr.name.name && Array.isArray(mainTableDef.expr.name.name)) {
                funcName = mainTableDef.expr.name.name[0]?.value;
            }
        }

        if (!mainTableDef.table && funcName && funcName.toUpperCase() === 'GENERATE_SERIES') {
            const args = mainTableDef.expr.args.value;
            // Expecting 2 args: start, end. (Optional step).
            const start = parseInt(args[0].value);
            const end = parseInt(args[1].value);
            const step = args[2] ? parseInt(args[2].value) : 1;

            const alias = mainTableDef.as || 'generate_series';

            processedRows = [];
            for (let i = start; i <= end; i += step) {
                processedRows.push({ [alias]: i });
            }
            explanation.push(`Generated ${processedRows.length} rows sequence.`);

        } else if (!mainTableDef.table) {
            throw new Error("Detailed error: " + JSON.stringify(mainTableDef));
        } else {
            processedRows = await this.getAllRows(mainTableDef.table);
            explanation.push(`Fetched ${processedRows.length} rows from '${mainTableDef.table}'`);
        }

        if (from.length > 1) {
            for (let i = 1; i < from.length; i++) {
                const joinDef = from[i];
                const joinRows = await this.getAllRows(joinDef.table);
                processedRows = this.performJoin(processedRows, joinRows, joinDef.on, joinDef.join);
                explanation.push(`Joined with '${joinDef.table}' (${joinDef.join})`);
            }
        }

        if (ast.where) {
            const originalCount = processedRows.length;
            processedRows = processedRows.filter(row => this.evaluateWhereClause(ast.where, row));
            explanation.push(`Filtered rows (Where clause). ${originalCount} -> ${processedRows.length}`);
        }

        if (ast.orderby) {
            processedRows = this.applyOrderBy(processedRows, ast.orderby);
            explanation.push("Sorted rows");
        }

        const limit = (ast.limit && ast.limit.value && ast.limit.value.length > 0) ? ast.limit.value[0].value : undefined;
        let finalRows = limit !== undefined ? processedRows.slice(0, limit) : processedRows;

        let resultColumns: string[];
        const extractColName = (col: any): string => {
            if (!col) return '';
            if (typeof col === 'string') return col;
            if (col.expr && col.expr.type === 'default' && col.expr.value) return col.expr.value;
            if (col.expr && col.expr.value) return col.expr.value;
            return col.column || col.value || col.name || JSON.stringify(col);
        };

        if (ast.columns.length === 1 && ast.columns[0].expr && ast.columns[0].expr.column === '*') {
            resultColumns = finalRows.length > 0 ? Object.keys(finalRows[0]).filter(k => k !== '_csv_index') : [];
        } else {
            resultColumns = ast.columns.map((c: any, i: number) => c.as || extractColName(c.expr?.column) || `col_${i}`);
            finalRows = finalRows.map(row => {
                const projected: any = {};
                ast.columns.forEach((c: any, i: number) => {
                    let colName = extractColName(c.expr?.column);

                    if (c.expr?.type === 'function') {
                        colName = c.as || c.expr.name?.name?.[0]?.value || c.expr.name;
                    }

                    const alias = c.as || (typeof colName === 'string' ? colName : `col_${i}`);
                    projected[alias] = this.evaluateExpression(c.expr, row);
                });
                return projected;
            });
        }

        return { rows: finalRows, columns: resultColumns, explanation };
    }

    // ... (rest of methods)

    private applyOrderBy(rows: any[], orderBy: any[]): any[] {
        if (!orderBy || orderBy.length === 0) return rows;
        return [...rows].sort((a, b) => {
            for (const order of orderBy) {
                const { expr, type } = order;
                const col = expr?.column; // Safely access column
                if (!col) continue; // Skip complex expressions we can't evaluate yet

                const dir = type === 'DESC' ? -1 : 1;

                const valA = a[col];
                const valB = b[col];

                // Generic Compare
                if (valA < valB) return -1 * dir;
                if (valA > valB) return 1 * dir;
            }
            return 0;
        });
    }

    private async handleInsert(ast: any): Promise<SqlResult> {
        const tableName = ast.table?.[0].table;
        if (!tableName) throw new Error("Table name required");

        const tables = await getTablesForProject(this.projectId, this.userId!);
        const table = tables.find(t => t.table_name === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found.`);
        const columns = await getColumnsForTable(this.projectId, table.table_id, this.userId!);

        // Extract column names - ast.columns may be objects like { type: 'default', value: 'colname' }
        let targetCols: string[];
        if (ast.columns && Array.isArray(ast.columns)) {
            targetCols = ast.columns.map((col: any) => {
                if (typeof col === 'string') return col;
                if (col.column) return col.column;
                if (col.value) return col.value;
                return String(col);
            });
        } else {
            targetCols = columns.map(c => c.column_name);
        }

        // Check if this is INSERT ... SELECT
        let valuesList: any[] = [];
        let rowsToInsert: any[] = [];

        if (ast.type === 'insert' && ast.values && ast.values.type === 'select') {
            // INSERT INTO ... SELECT case
            // Execute the SELECT query to get the data
            const selectResult = await this.handleSelect(ast.values);

            // Convert SELECT results to rows for insertion
            rowsToInsert = selectResult.rows.map(row => {
                const newRow: any = {};
                targetCols.forEach((col: string, i: number) => {
                    // Map from SELECT columns to INSERT columns
                    const selectCol = selectResult.columns[i];
                    newRow[col] = row[selectCol];
                });
                return newRow;
            });
        } else if (ast.values) {
            // INSERT INTO ... VALUES case
            // Handle different structures: array of values, single value_list, or expr_list
            if (ast.values.type === 'values' && Array.isArray(ast.values.values)) {
                // PostgreSQL structure: { type: 'values', values: [{ type: 'expr_list', value: [...] }, ...] }
                valuesList = ast.values.values;
            } else if (Array.isArray(ast.values)) {
                valuesList = ast.values;
            } else if (ast.values.type === 'expr_list') {
                // Single row: { type: 'expr_list', value: [...] }
                valuesList = [ast.values];
            } else {
                // Try to extract from other structures
                valuesList = [ast.values];
            }
        }

        // Check for CSV
        const projectPath = path.join(process.cwd(), 'src', 'database', this.userId!, this.projectId);
        const dataFilePath = path.join(projectPath, `${tableName}.csv`);
        let isCsv = false;
        try { await fs.access(dataFilePath); isCsv = true; } catch { }

        console.log('INSERT Debug:', {
            rowsToInsert: rowsToInsert.length,
            valuesList: valuesList.length,
            isCsv
        });

        let insertedCount = 0;

        // Process INSERT ... SELECT rows
        for (const row of rowsToInsert) {
            if (isCsv) {
                // Append to CSV
                // Just constructing the line matches the columns order?
                // NO, CSV has a fixed schema order. We must align with it.
                // Read header to know order
                const content = await fs.readFile(dataFilePath, 'utf8');
                const fileHeader = content.split('\n')[0].split(',').map(h => h.trim());

                const line = fileHeader.map(h => row[h] || '').join(',');
                await fs.appendFile(dataFilePath, '\n' + line);
            } else {
                // Firestore Insert
                await adminDb
                    .collection('users').doc(this.userId!)
                    .collection('projects').doc(this.projectId)
                    .collection('tables').doc(table.table_id)
                    .collection('rows').add(row);
            }
            insertedCount++;
        }

        // Process INSERT ... VALUES rows
        for (const valuesNode of valuesList) {
            // Handle different AST structures from different parsers
            let values: any[];

            if (valuesNode.value && Array.isArray(valuesNode.value)) {
                // MySQL/PostgreSQL structure: { type: 'expr_list', value: [...] }
                values = valuesNode.value.map((v: any) => {
                    // Handle nested value objects
                    if (v && typeof v === 'object') {
                        // Check if it's a function call (e.g., NOW(), CONCAT())
                        if (v.type === 'function') {
                            return this.evaluateFunction(v);
                        } else if ('value' in v) {
                            return v.value;
                        }
                    }
                    return v;
                });
            } else if (Array.isArray(valuesNode)) {
                // Direct array structure
                values = valuesNode.map((v: any) => {
                    if (v && typeof v === 'object' && v.type === 'function') {
                        return this.evaluateFunction(v);
                    }
                    return v?.value ?? v;
                });
            } else if (valuesNode.type === 'expr_list' && !valuesNode.value) {
                // Empty expr_list - skip
                continue;
            } else {
                // Log the unexpected structure for debugging
                console.error('Unexpected INSERT values structure:', valuesNode);
                throw new Error(`Unexpected INSERT values structure: ${JSON.stringify(valuesNode)}`);
            }


            const row: any = {};
            targetCols.forEach((col: string, i: number) => {
                // Find matching column in schema (case-insensitive)
                const matchingCol = columns.find(c => c.column_name.toLowerCase() === col.toLowerCase());
                if (matchingCol) {
                    row[matchingCol.column_name] = values[i];
                } else {
                    // Fallback to provided name if not found (though validation might catch this)
                    row[col] = values[i];
                }
            });



            if (isCsv) {
                // Append to CSV
                // Just constructing the line matches the columns order?
                // NO, CSV has a fixed schema order. We must align with it.
                // Read header to know order
                const content = await fs.readFile(dataFilePath, 'utf8');
                const fileHeader = content.split('\n')[0].split(',').map(h => h.trim());

                const line = fileHeader.map(h => row[h] || '').join(',');
                await fs.appendFile(dataFilePath, '\n' + line);
            } else {
                // Firestore Insert
                console.log(`Inserting row ${insertedCount + 1}:`, row);
                await adminDb
                    .collection('users').doc(this.userId!)
                    .collection('projects').doc(this.projectId)
                    .collection('tables').doc(table.table_id)
                    .collection('rows').add(row);
            }
            insertedCount++;
        }

        console.log(`Total rows inserted: ${insertedCount}`);
        return { rows: [], columns: [], message: `${insertedCount} rows inserted.` };
    }

    private async handleUpdate(ast: any): Promise<SqlResult> {
        const tableName = ast.table?.[0].table;
        const tables = await getTablesForProject(this.projectId, this.userId!);
        const table = tables.find(t => t.table_name === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found.`);

        let rows = await this.getAllRows(tableName);
        const toUpdateIndices: number[] = [];
        const toUpdateIds: string[] = [];

        // Filter rows to update
        rows.forEach((row, idx) => {
            if (this.evaluateWhereClause(ast.where, row)) {
                if (row._csv_index !== undefined) toUpdateIndices.push(row._csv_index);
                if (row.id) toUpdateIds.push(row.id);
            }
        });

        // Parse assignments
        // ast.set is array of { column, value }
        const updates: any = {};
        ast.set.forEach((s: any) => {
            updates[s.column] = s.value?.value; // Simplified value extraction
            // Ideally use `compare` or expression evaluator for `SET col = col + 1` support
            // For now, support literal values only
        });

        // Apply Updates
        const projectPath = path.join(process.cwd(), 'src', 'database', this.userId!, this.projectId);
        const dataFilePath = path.join(projectPath, `${tableName}.csv`);
        let isCsv = false;
        try { await fs.access(dataFilePath); isCsv = true; } catch { }

        if (isCsv) {
            // Read, Modify, Rewriter (Inefficient but correct for this architecture)
            // Re-read strictly to preserve lines
            const content = await fs.readFile(dataFilePath, 'utf8');
            let lines = content.split(/\r\n|\n|\r/);
            const header = lines[0].split(',');

            toUpdateIndices.forEach(idx => {
                const lineIdx = idx + 1; // +1 for header
                if (lines[lineIdx]) {
                    const currentVals = lines[lineIdx].split(',');
                    const row: any = {};
                    header.forEach((h, i) => row[h.trim()] = currentVals[i]);

                    // Apply updates
                    Object.keys(updates).forEach(k => row[k] = updates[k]);

                    // Reconstruct line
                    lines[lineIdx] = header.map(h => row[h.trim()] ?? '').join(',');
                }
            });
            await fs.writeFile(dataFilePath, lines.join('\n'));
        } else {
            // Firestore Batch Update
            const batch = adminDb.batch();
            toUpdateIds.forEach(id => {
                const ref = adminDb
                    .collection('users').doc(this.userId!)
                    .collection('projects').doc(this.projectId)
                    .collection('tables').doc(table.table_id)
                    .collection('rows').doc(id);
                batch.update(ref, updates);
            });
            await batch.commit();
        }

        return { rows: [], columns: [], message: `Updated ${isCsv ? toUpdateIndices.length : toUpdateIds.length} rows.` };
    }

    private async handleDelete(ast: any): Promise<SqlResult> {
        const tableName = ast.table?.[0].table;
        const tables = await getTablesForProject(this.projectId, this.userId!);
        const table = tables.find(t => t.table_name === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found.`);

        const rows = await this.getAllRows(tableName);
        const toDeleteIndices = new Set<number>();
        const toDeleteIds: string[] = [];

        rows.forEach((row) => {
            if (this.evaluateWhereClause(ast.where, row)) {
                if (row._csv_index !== undefined) toDeleteIndices.add(row._csv_index);
                // Use _id (Firestore ID) if available, otherwise fallback to id (CSV or legacy)
                const idToDelete = row._id || row.id;
                if (idToDelete) toDeleteIds.push(idToDelete);
            }
        });

        const projectPath = path.join(process.cwd(), 'src', 'database', this.userId!, this.projectId);
        const dataFilePath = path.join(projectPath, `${tableName}.csv`);
        let isCsv = false;
        try { await fs.access(dataFilePath); isCsv = true; } catch { }

        if (isCsv) {
            const content = await fs.readFile(dataFilePath, 'utf8');
            let lines = content.split(/\r\n|\n|\r/);
            const newLines = lines.filter((_, idx) => idx === 0 || !toDeleteIndices.has(idx - 1));
            await fs.writeFile(dataFilePath, newLines.join('\n'));
        } else {
            const batch = adminDb.batch();
            toDeleteIds.forEach(id => {
                const ref = adminDb
                    .collection('users').doc(this.userId!)
                    .collection('projects').doc(this.projectId)
                    .collection('tables').doc(table.table_id)
                    .collection('rows').doc(id);
                batch.delete(ref);
            });
            await batch.commit();
        }

        return { rows: [], columns: [], message: `Deleted ${isCsv ? toDeleteIndices.size : toDeleteIds.length} rows.` };
    }

    private async getAllRows(tableName: string): Promise<Row[]> {
        const projectPath = path.join(process.cwd(), 'src', 'database', this.userId!, this.projectId);
        const dataFilePath = path.join(projectPath, `${tableName}.csv`);

        try {
            await fs.access(dataFilePath);
            // CSV Mode
            const fileContent = await fs.readFile(dataFilePath, 'utf8');
            const lines = fileContent.split(/\r\n|\n|\r/).filter(line => line.trim() !== '');
            if (lines.length === 0) return [];

            const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            return lines.slice(1).map((line, idx) => {
                const values = line.split(',');
                const row: any = { _csv_index: idx }; // Keep track of index for updates
                header.forEach((col, i) => row[col] = values[i] ? values[i].trim() : null);
                return row;
            });
        } catch {
            // Firestore Mode
            const tables = await getTablesForProject(this.projectId, this.userId!);
            const table = tables.find(t => t.table_name === tableName);
            if (!table) throw new Error(`Table '${tableName}' not found.`);

            const snapshot = await adminDb
                .collection('users').doc(this.userId!)
                .collection('projects').doc(this.projectId)
                .collection('tables').doc(table.table_id)
                .collection('rows')
                .get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    ...data,
                    id: data.id,
                    _id: doc.id
                } as any;
            });
        }
    }

    private async handleCreate(ast: Create): Promise<SqlResult> {
        const tableName = (Array.isArray(ast.table) ? ast.table[0] : ast.table as any)?.table;
        if (!tableName) throw new Error("Table name is required.");

        // Check for duplicate table
        const existingTables = await getTablesForProject(this.projectId, this.userId!);
        if (existingTables.some(t => t.table_name === tableName)) {
            throw new Error(`Table '${tableName}' already exists.`);
        }

        const columns: Column[] = [];
        const constraintsToAdd: { type: 'PRIMARY KEY' | 'FOREIGN KEY', columns: string[], refTable?: string, refCols?: string[] }[] = [];

        if (ast.create_definitions) {
            console.log('[DEBUG] handleCreate Definitions:', JSON.stringify(ast.create_definitions, null, 2));
            for (const def of ast.create_definitions) {
                if (def.resource === 'column') {
                    let colNameRaw = (def.column as any)?.column;
                    // Sanitize colName
                    if (colNameRaw && typeof colNameRaw === 'object') {
                        const extractVal = (obj: any): any => {
                            if (!obj || typeof obj !== 'object') return obj;
                            return obj.value || obj.name || obj.column || (obj.expr ? extractVal(obj.expr) : null) || JSON.stringify(obj);
                        };
                        colNameRaw = extractVal(colNameRaw);
                    }
                    const colName = String(colNameRaw);
                    const dataType = def.definition?.dataType;

                    if (!colName || !dataType) continue;

                    let mappedType: any = 'VARCHAR';
                    const upperType = dataType.toUpperCase();
                    if (['INT', 'INTEGER', 'SMALLINT', 'BIGINT'].includes(upperType)) mappedType = 'INT';
                    else if (['FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC'].includes(upperType)) mappedType = 'FLOAT';
                    else if (['BOOLEAN', 'BOOL'].includes(upperType)) mappedType = 'BOOLEAN';
                    else if (['DATE', 'DATETIME'].includes(upperType)) mappedType = 'DATE';
                    else if (['TIMESTAMP'].includes(upperType)) mappedType = 'TIMESTAMP';
                    else if (['TEXT'].includes(upperType)) mappedType = 'TEXT';

                    let isPrimaryKey = false;
                    let isNullable = true;

                    if (def.nullable?.type === 'not null') {
                        isNullable = false;
                    }

                    // Inline Primary Key
                    // node-sql-parser puts `primary_key` directly on the definition object for inline PKs
                    if ((def as any).primary_key) {
                        isPrimaryKey = true;
                        constraintsToAdd.push({ type: 'PRIMARY KEY', columns: [colName] });
                    }

                    // Inline Foreign Key (references)
                    const refDef = (def as any).reference_definition;
                    if (refDef) {
                        const refTable = refDef.table?.[0]?.table;
                        const refCols = refDef.definition?.map((c: any) => c.column);
                        if (refTable && refCols) {
                            constraintsToAdd.push({
                                type: 'FOREIGN KEY',
                                columns: [colName],
                                refTable,
                                refCols
                            });
                        }
                    }

                    columns.push({
                        column_id: '',
                        table_id: '',
                        column_name: colName,
                        data_type: mappedType,
                        is_primary_key: isPrimaryKey,
                        is_nullable: isNullable,
                        created_at: new Date().toISOString()
                    });
                } else if (def.resource === 'constraint') {
                    const type = def.constraint_type?.toUpperCase();
                    if (type === 'PRIMARY KEY') {
                        const pkCols = def.definition.map((c: any) => c.column);
                        // Update columns
                        columns.forEach(c => {
                            if (pkCols.includes(c.column_name)) c.is_primary_key = true;
                        });
                        // Add to constraints list
                        constraintsToAdd.push({ type: 'PRIMARY KEY', columns: pkCols });

                    } else if (type === 'FOREIGN KEY') {
                        const fkCols = def.definition.map((c: any) => c.column);
                        const refTable = def.reference_definition?.table?.[0]?.table;
                        const refCols = def.reference_definition?.definition?.map((c: any) => c.column);

                        if (refTable && refCols) {
                            constraintsToAdd.push({
                                type: 'FOREIGN KEY',
                                columns: fkCols,
                                refTable,
                                refCols
                            });
                        }
                    }
                }
            }
        }

        console.log('[DEBUG] handleCreate Columns:', JSON.stringify(columns, null, 2));
        console.log('[DEBUG] handleCreate Constraints:', JSON.stringify(constraintsToAdd, null, 2));

        try {
            // 1. Create Table & Columns
            const newTable = await createTable(this.projectId, tableName, '', columns, this.userId!);

            // 2. Create Constraints (Now that we have table_id)
            // We need to resolve refTable name to refTable ID for FKs
            const allTables = await getTablesForProject(this.projectId, this.userId!);

            for (const c of constraintsToAdd) {
                let refTableId = undefined;
                if (c.type === 'FOREIGN KEY' && c.refTable) {
                    // Case-insensitive lookup for referenced table
                    const refTableObj = allTables.find(t => t.table_name.toLowerCase() === c.refTable?.toLowerCase());
                    if (refTableObj) {
                        refTableId = refTableObj.table_id;
                    } else {
                        console.warn(`[WARNING] Referenced table '${c.refTable}' not found. Skipping FK constraint.`);
                        continue; // Skip if referenced table doesn't exist to avoid bad metadata
                    }
                }

                const newConstraint: any = {
                    table_id: newTable.table_id,
                    type: c.type,
                    column_names: c.columns.join(','),
                    referenced_table_id: refTableId,
                    referenced_column_names: c.refCols?.join(',')
                };

                // Sanitize undefined (duplicate logic from data.ts but safer to do here too before passing if we used data.ts types strictness)
                Object.keys(newConstraint).forEach(key => newConstraint[key] === undefined && delete newConstraint[key]);

                await addConstraint(this.projectId, newConstraint);
            }

        } catch (e: any) {
            throw new Error(`Failed to create table: ${e.message}`);
        }

        return { rows: [], columns: [], message: `Table '${tableName}' created successfully with ${constraintsToAdd.length} constraints.` };
    }

    private async handleDrop(ast: any): Promise<SqlResult> {
        const tableName = ast.table?.[0].table;
        const tables = await getTablesForProject(this.projectId, this.userId!);
        const table = tables.find(t => t.table_name === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found.`);

        // Delete Firestore Metadata
        await deleteTable(this.projectId, table.table_id, this.userId!);

        // Delete CSV if exists
        const projectPath = path.join(process.cwd(), 'src', 'database', this.userId!, this.projectId);
        const dataFilePath = path.join(projectPath, `${tableName}.csv`);
        try { await fs.unlink(dataFilePath); } catch { }

        return { rows: [], columns: [], message: `Table '${tableName}' dropped.` };
    }

    private async handleAlter(ast: any): Promise<SqlResult> {
        const tableName = ast.table?.[0].table;
        const tables = await getTablesForProject(this.projectId, this.userId!);
        const table = tables.find(t => t.table_name === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found.`);

        // Supports ADD COLUMN only for now
        // definition: { action: 'add', create_definitions: [ { col: ... } ] }
        // Node-sql-parser structure for ALTER is bit complex, simplifying checks

        const def = ast.expr?.[0]; // Usually list of changes
        if (def?.action?.toLowerCase() === 'add') {
            const colName = def.column?.column;
            const dataType = def.definition?.dataType || 'VARCHAR';

            if (colName) {
                await addColumn(this.projectId, table.table_id, {
                    column_name: colName,
                    data_type: dataType.toUpperCase() as any,
                    is_primary_key: false,
                    is_nullable: true
                }, this.userId!);

                // Update CSV header if exists??
                // Yes, append comma
                const projectPath = path.join(process.cwd(), 'src', 'database', this.userId!, this.projectId);
                const dataFilePath = path.join(projectPath, `${tableName}.csv`);
                try {
                    const content = await fs.readFile(dataFilePath, 'utf8');
                    const lines = content.split(/\r\n|\n|\r/);
                    lines[0] = lines[0] + `,${colName}`;
                    // Add empty commas to all data lines
                    for (let i = 1; i < lines.length; i++) {
                        if (lines[i]) lines[i] += ',';
                    }
                    await fs.writeFile(dataFilePath, lines.join('\n'));
                } catch { /* No CSV, ignore */ }
            }
        }

        return { rows: [], columns: [], message: `Table '${tableName}' altered.` };
    }


    // --- Utils (Logic ported from route.ts) ---

    private evaluateWhereClause(whereNode: any, row: any): boolean {
        if (!whereNode) return true;

        try {
            // console.log('evaluateWhereClause:', JSON.stringify(whereNode, null, 2));
            const { type, operator, left, right } = whereNode;

            if (type === 'binary_expr') {
                if (['AND', 'OR'].includes(operator.toUpperCase())) {
                    const leftValue = this.evaluateWhereClause(left, row);
                    if (operator.toUpperCase() === 'AND' && !leftValue) return false;
                    if (operator.toUpperCase() === 'OR' && leftValue) return true;
                    const rightValue = this.evaluateWhereClause(right, row);
                    if (operator.toUpperCase() === 'AND') return leftValue && rightValue;
                    if (operator.toUpperCase() === 'OR') return leftValue || rightValue;
                }

                let colName = left.column;

                // Helper to extract column string from AST object
                const extractColName = (col: any): string => {
                    if (!col) return '';
                    if (typeof col === 'string') return col;
                    if (col.expr && col.expr.type === 'default' && col.expr.value) return col.expr.value;
                    if (col.expr && col.expr.value) return col.expr.value;
                    return col.column || col.value || col.name || JSON.stringify(col);
                };

                colName = extractColName(colName);
                colName = String(colName);

                // Handle table.column format
                const actualCol = colName.includes('.') ? colName.split('.')[1] : colName;

                if (row[actualCol] === undefined && row[colName] === undefined) {
                    // Try case-insensitive lookup
                    const lowerCol = actualCol.toLowerCase();
                    const foundKey = Object.keys(row).find(k => k.toLowerCase() === lowerCol);
                    if (foundKey) {
                        colName = foundKey; // Use the actual key from the row
                    } else {
                        console.warn(`[DEBUG] Column '${actualCol}' (raw: ${left.column}) not found in row. Available keys:`, Object.keys(row));
                        return false;
                    }
                }
                const val = row[actualCol] !== undefined ? row[actualCol] : row[colName];

                let rVal;
                if (right.type === 'column_ref') {
                    let rightColName = extractColName(right.column);
                    rightColName = String(rightColName);
                    const rightCol = rightColName.includes('.') ? rightColName.split('.')[1] : rightColName;
                    rVal = row[rightCol];
                } else if (right.type === 'value_list') {
                    rVal = right.value.map((v: any) => v.value);
                } else if (right.type === 'null') {
                    rVal = null;
                } else {
                    rVal = right.value;
                }
                return this.compare(val, operator, rVal);
            }

            if (type === 'column_ref') {
                const extractColName = (col: any): string => {
                    if (!col) return '';
                    if (typeof col === 'string') return col;
                    if (col.expr && col.expr.type === 'default' && col.expr.value) return col.expr.value;
                    if (col.expr && col.expr.value) return col.expr.value;
                    return col.column || col.value || col.name || JSON.stringify(col);
                };

                let colName = extractColName(left.column);
                colName = String(colName);

                const actualCol = colName.includes('.') ? colName.split('.')[1] : colName;
                return !!row[actualCol];
            }

            // Simple fallback
            return true;
        } catch (e: any) {
            console.error('Error in evaluateWhereClause:', e.message);
            return false;
        }
    }

    private compare(left: any, operator: string, right: any): boolean {
        if (operator === 'IS' && right === null) return left === null || left === undefined || left === '';
        if (operator === 'IS NOT' && right === null) return left !== null && left !== undefined && left !== '';
        // Loose equality for nulls logic
        if ((left === null || left === undefined) && (right !== null && right !== undefined)) return false;
        if ((right === null || right === undefined) && (left !== null && left !== undefined)) return false;



        const isNumber = (n: any) => !isNaN(parseFloat(n)) && isFinite(n) && Number(n) == n;

        if (isNumber(left) && isNumber(right)) {
            left = Number(left);
            right = Number(right);
        } else {
            left = String(left).toLowerCase();
            right = Array.isArray(right) ? right.map(r => String(r).toLowerCase()) : String(right).toLowerCase();
        }

        switch (operator.toUpperCase()) {
            case '=': return left == right;
            case '!=':
            case '<>': return left != right;
            case '>': return left > right;
            case '<': return left < right;
            case '>=': return left >= right;
            case '<=': return left <= right;
            case 'IN': return Array.isArray(right) && right.includes(left);
            case 'NOT IN': return Array.isArray(right) && !right.includes(left);
            case 'LIKE':
                if (typeof right !== 'string') return false;
                // Escape regex special chars except %
                const escaped = right.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const pattern = "^" + escaped.replace(/%/g, '.*') + "$";
                const regex = new RegExp(pattern, 'i'); // Case insensitive LIKE
                return regex.test(String(left));
            default: return false;
        }
    }

    private evaluateExpression(expr: any, row: any): any {
        if (!expr) return null;

        if (expr.type === 'column_ref') {
            const extractColName = (col: any): string => {
                if (!col) return '';
                if (typeof col === 'string') return col;
                if (col.expr && col.expr.type === 'default' && col.expr.value) return col.expr.value;
                if (col.expr && col.expr.value) return col.expr.value;
                return col.column || col.value || col.name || JSON.stringify(col);
            };

            let col = extractColName(expr.column);
            col = String(col);
            // Handle table.column
            if (col.includes('.')) col = col.split('.')[1];

            if (row[col] !== undefined) return row[col];

            // Case-insensitive fallback
            const lowerCol = col.toLowerCase();
            const foundKey = Object.keys(row).find(k => k.toLowerCase() === lowerCol);
            return foundKey ? row[foundKey] : null;
        }

        if (expr.type === 'string' || expr.type === 'single_quote_string') return expr.value;
        if (expr.type === 'number') return parseFloat(expr.value);
        if (expr.type === 'bool') return expr.value === 'TRUE';
        if (expr.type === 'null') return null;

        if (expr.type === 'binary_expr') {
            const left = this.evaluateExpression(expr.left, row);
            const right = this.evaluateExpression(expr.right, row);

            if (expr.operator === '||') return String(left ?? '') + String(right ?? '');
            if (expr.operator === '+') return Number(left) + Number(right);
            if (expr.operator === '-') return Number(left) - Number(right);
            if (expr.operator === '*') return Number(left) * Number(right);
            if (expr.operator === '/') return Number(left) / Number(right);
        }

        if (expr.type === 'function') {
            return this.evaluateFunction(expr, row);
        }

        if (expr.type === 'cast') {
            // Basic CAST support: CAST(expr AS types)
            const val = this.evaluateExpression(expr.expr, row);
            const targetType = expr.target?.dataType;
            if (targetType === 'VARCHAR' || targetType === 'TEXT') return String(val);
            if (targetType === 'INT' || targetType === 'NUMBER') return Number(val);
            return String(val); // Fallback
        }

        return null;
    }

    private evaluateFunction(funcNode: any, row?: any): any {
        // Extract function name from nested structure
        let funcName: string | undefined;
        if (funcNode.name) {
            if (typeof funcNode.name === 'string') {
                funcName = funcNode.name;
            } else if (funcNode.name.name && Array.isArray(funcNode.name.name)) {
                // PostgreSQL structure: { name: { name: [{ type: 'default', value: 'NOW' }] } }
                funcName = funcNode.name.name[0]?.value;
            }
        }

        const upperFuncName = funcName?.toUpperCase();

        switch (upperFuncName) {
            case 'NOW':
            case 'CURRENT_TIMESTAMP':
                return new Date().toISOString();

            case 'CURDATE':
            case 'CURRENT_DATE':
                return new Date().toISOString().split('T')[0];

            case 'CONCAT':
                // Extract arguments and concatenate
                if (funcNode.args && Array.isArray(funcNode.args.value)) {
                    return funcNode.args.value.map((arg: any) => {
                        return this.evaluateExpression(arg, row);
                    }).join('');
                }
                return '';

            case 'CAST':
                // CAST as function call?
                if (funcNode.args && Array.isArray(funcNode.args.value)) {
                    // args[0] is expr, args[1] is type? NO, cast usually strictly parsed.
                    // But if parser returns it as function...
                    // Assume args[0] is value
                    return this.evaluateExpression(funcNode.args.value[0], row);
                }
                return null;

            case 'DATE_SUB':
            case 'DATE_ADD':
                // Simplified: just return current date for now
                // Full implementation would parse interval and do date math
                return new Date().toISOString().split('T')[0];

            case 'ADD_DAYS':
                if (funcNode.args && Array.isArray(funcNode.args.value) && funcNode.args.value.length === 2) {
                    const dateArg = this.evaluateExpression(funcNode.args.value[0], row);
                    const daysArg = this.evaluateExpression(funcNode.args.value[1], row);

                    const date = new Date(dateArg);
                    const days = parseInt(daysArg, 10);

                    if (!isNaN(date.getTime()) && !isNaN(days)) {
                        date.setDate(date.getDate() + days);
                        return date.toISOString().split('T')[0];
                    }
                }
                return new Date().toISOString().split('T')[0];

            case 'UUID':
                // Generate a simple UUID
                return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            default:
                // For unknown functions, return null or try to extract a simple value
                console.warn(`Unsupported function: ${funcName}`);
                return null;
        }
    }

    private performJoin(leftTable: any[], rightTable: any[], joinCondition: any, joinType: string): any[] {
        const joinedRows: any[] = [];
        if (!joinCondition) return leftTable; // Cartesian product not supported, return left

        const { left, right, operator } = joinCondition;
        const leftCol = left.column; // potentially alias.col
        const rightCol = right.column;

        // Naive Nested Loop Join (O(N*M)) - Optimization: Hash Join
        // Building Hash Map for Right Table
        const rightMap = new Map<string, any[]>();

        // Helper to extract value regardless of table prefix
        const getVal = (row: any, col: string) => {
            // If row has "table.col" keys? No, currently flat keys.
            // Assumption: Joined tables have unique column names or we need to handle aliases.
            // Current flat loaded rows just have "column_name".
            // So if condition is "t1.id = t2.user_id", we look for "id" in t1 and "user_id" in t2.
            const c = col.includes('.') ? col.split('.')[1] : col;
            return row[c];
        };

        rightTable.forEach(row => {
            const val = getVal(row, rightCol);
            const key = String(val);
            if (!rightMap.has(key)) rightMap.set(key, []);
            rightMap.get(key)!.push(row);
        });

        leftTable.forEach(leftRow => {
            const leftVal = getVal(leftRow, leftCol);
            const matchingRightRows = rightMap.get(String(leftVal)) || [];

            if (matchingRightRows.length > 0) {
                matchingRightRows.forEach(rightRow => {
                    // MERGE rows. Conflicts? Right overwrites left if same name.
                    // Ideally prefix.
                    joinedRows.push({ ...leftRow, ...rightRow });
                });
            } else if (joinType.toUpperCase().includes('LEFT')) {
                joinedRows.push({ ...leftRow });
            }
        });
        return joinedRows;
    }
    private async handleGenerateData(tableName: string, count: number): Promise<SqlResult> {
        const tables = await getTablesForProject(this.projectId, this.userId!);
        const table = tables.find(t => t.table_name === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found.`);

        const columns = await getColumnsForTable(this.projectId, table.table_id, this.userId!);
        const rows: any[] = [];

        for (let i = 0; i < count; i++) {
            const row: any = {};
            columns.forEach(col => {
                const type = col.data_type.toUpperCase();
                const colName = col.column_name;

                if (['INT', 'INTEGER', 'SERIAL', 'BIGINT', 'SMALLINT'].includes(type)) {
                    row[colName] = i + 1;
                } else if (['FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC'].includes(type)) {
                    row[colName] = parseFloat((Math.random() * 1000).toFixed(2));
                } else if (['VARCHAR', 'TEXT', 'CHAR'].includes(type)) {
                    if (colName.toLowerCase().includes('name')) {
                        row[colName] = `Name_${i + 1}`;
                    } else if (colName.toLowerCase().includes('email')) {
                        row[colName] = `user${i + 1}@example.com`;
                    } else {
                        row[colName] = `${colName}_${i + 1}`;
                    }
                } else if (['DATE'].includes(type)) {
                    const date = new Date();
                    date.setDate(date.getDate() - (i % 365));
                    row[colName] = date.toISOString().split('T')[0];
                } else if (['DATETIME', 'TIMESTAMP'].includes(type)) {
                    const date = new Date();
                    date.setDate(date.getDate() - (i % 365));
                    row[colName] = date.toISOString();
                } else if (['BOOLEAN', 'BOOL'].includes(type)) {
                    row[colName] = i % 2 === 0;
                } else {
                    row[colName] = null;
                }
            });
            rows.push(row);
        }

        // Batch Insert Logic (Chunked)
        const chunkSize = 400;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            const batch = adminDb.batch();
            chunk.forEach(row => {
                const ref = adminDb
                    .collection('users').doc(this.userId!)
                    .collection('projects').doc(this.projectId)
                    .collection('tables').doc(table.table_id)
                    .collection('rows').doc();
                batch.set(ref, row);
            });
            await batch.commit();
            inserted += chunk.length;
        }

        return { rows: [], columns: [], message: `Generated and inserted ${inserted} rows into '${tableName}'.` };
    }
}

