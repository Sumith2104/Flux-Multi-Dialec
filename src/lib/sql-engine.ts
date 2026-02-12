
import { Parser, AST, Create } from 'node-sql-parser';
import { getTableData, getTablesForProject, getColumnsForTable, createTable, deleteTable, addColumn, updateColumn, deleteColumn, Table, Column, Row } from '@/lib/data';
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

    constructor(projectId: string) {
        this.projectId = projectId;
        this.parser = new Parser();
    }

    private async init() {
        this.userId = await getCurrentUserId();
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

        let astArray: AST[] | AST;
        try {
            // Try PostgreSQL first as it has better INSERT support in node-sql-parser
            try {
                astArray = this.parser.astify(queryCleaned, { database: 'PostgreSQL' });
            } catch {
                // Fallback to MySQL
                astArray = this.parser.astify(queryCleaned, { database: 'MySQL' });
            }
        } catch (e: any) {
            throw new Error(`SQL Syntax Error: ${e.message}`);
        }

        const ast = Array.isArray(astArray) ? astArray[0] : astArray;
        const type = (ast as any).type?.toUpperCase();

        await trackApiRequest(this.projectId, 'sql_execution');
        await trackApiRequest(this.projectId, 'api_call');

        switch (type) {
            case 'SELECT': return this.handleSelect(ast);
            case 'INSERT': return this.handleInsert(ast);
            case 'UPDATE': return this.handleUpdate(ast);
            case 'DELETE': return this.handleDelete(ast);
            case 'CREATE': return this.handleCreate(ast as Create);
            case 'DROP': return this.handleDrop(ast);
            case 'ALTER': return this.handleAlter(ast);
            default: throw new Error(`Unsupported SQL command: ${type}`);
        }
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
        let processedRows = await this.getAllRows(mainTableDef.table);
        let explanation = [`Fetched ${processedRows.length} rows from '${mainTableDef.table}'`];

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

        const limit = (ast.limit && ast.limit.value && ast.limit.value.length > 0) ? ast.limit.value[0].value : 100;
        let finalRows = processedRows.slice(0, limit);

        let resultColumns: string[];
        if (ast.columns.length === 1 && ast.columns[0].expr && ast.columns[0].expr.column === '*') {
            resultColumns = finalRows.length > 0 ? Object.keys(finalRows[0]).filter(k => k !== '_csv_index') : [];
        } else {
            resultColumns = ast.columns.map((c: any) => c.as || c.expr?.column || 'unknown');
            finalRows = finalRows.map(row => {
                const projected: any = {};
                ast.columns.forEach((c: any) => {
                    const colName = c.expr?.column;
                    const alias = c.as || colName || 'unknown';
                    projected[alias] = colName ? row[colName] : null;
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

        const tables = await getTablesForProject(this.projectId);
        const table = tables.find(t => t.table_name === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found.`);
        const columns = await getColumnsForTable(this.projectId, table.table_id);

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
            targetCols.forEach((col: string, i: number) => row[col] = values[i]);



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
        const tables = await getTablesForProject(this.projectId);
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
        const tables = await getTablesForProject(this.projectId);
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
            const tables = await getTablesForProject(this.projectId);
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

        const columns: Column[] = [];

        if (ast.create_definitions) {
            for (const def of ast.create_definitions) {
                if (def.resource === 'column') {
                    const colName = (def.column as any)?.column;
                    const dataType = def.definition?.dataType;

                    if (!colName || !dataType) continue;

                    let mappedType: any = 'VARCHAR';
                    const upperType = dataType.toUpperCase();

                    if (['INT', 'INTEGER', 'SMALLINT', 'BIGINT'].includes(upperType)) mappedType = 'INT';
                    else if (['FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC'].includes(upperType)) mappedType = 'FLOAT';
                    else if (['BOOLEAN', 'BOOL'].includes(upperType)) mappedType = 'BOOLEAN';
                    else if (['DATE', 'DATETIME'].includes(upperType)) mappedType = 'DATE'; // Simply map to DATE for now
                    else if (['TIMESTAMP'].includes(upperType)) mappedType = 'TIMESTAMP';
                    else if (['TEXT'].includes(upperType)) mappedType = 'TEXT';

                    // Check constraints (Primary Key, Not Null)
                    let isPrimaryKey = false;
                    let isNullable = true;

                    // node-sql-parser puts constraints in `def.definition.suffix` usually, 
                    // or sometimes directly if simple?
                    // It seems to be in `def.nullable` object { type: 'not null', value: 'not null' }
                    if (def.nullable?.type === 'not null') {
                        isNullable = false;
                    }

                    // PK might be a separate constraint definition or inline?
                    // Parser often puts inline PK in `auto_increment` or special flags, 
                    // but for `node-sql-parser` it's often in constraints list.
                    // Let's check `def.primary_key`? mostly `resource: 'constraint'` handle it.


                    columns.push({
                        column_id: '', // Generated by createTable
                        table_id: '',  // Generated by createTable
                        column_name: colName,
                        data_type: mappedType,
                        is_primary_key: isPrimaryKey,
                        is_nullable: isNullable,
                        created_at: new Date().toISOString()
                    });
                } else if (def.resource === 'constraint' && def.constraint_type === 'primary key') {
                    // Update existing columns to be PK
                    // def.definition is list of columns
                    const pkCols = def.definition.map((c: any) => c.column);
                    columns.forEach(c => {
                        if (pkCols.includes(c.column_name)) c.is_primary_key = true;
                    });
                }
            }
        }

        // Inline PK check (some parsers might put it on column definition)
        // Adjust if needed based on `node-sql-parser` specific behavior for inline PKs

        try {
            await createTable(this.projectId, tableName, '', columns);
        } catch (e: any) {
            throw new Error(`Failed to create table: ${e.message}`);
        }

        return { rows: [], columns: [], message: `Table '${tableName}' created successfully.` };
    }

    private async handleDrop(ast: any): Promise<SqlResult> {
        const tableName = ast.table?.[0].table;
        const tables = await getTablesForProject(this.projectId);
        const table = tables.find(t => t.table_name === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found.`);

        // Delete Firestore Metadata
        await deleteTable(this.projectId, table.table_id);

        // Delete CSV if exists
        const projectPath = path.join(process.cwd(), 'src', 'database', this.userId!, this.projectId);
        const dataFilePath = path.join(projectPath, `${tableName}.csv`);
        try { await fs.unlink(dataFilePath); } catch { }

        return { rows: [], columns: [], message: `Table '${tableName}' dropped.` };
    }

    private async handleAlter(ast: any): Promise<SqlResult> {
        const tableName = ast.table?.[0].table;
        const tables = await getTablesForProject(this.projectId);
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
                });

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

                const colName = left.column;
                // Handle table.column format
                const actualCol = colName.includes('.') ? colName.split('.')[1] : colName;

                if (row[actualCol] === undefined && row[colName] === undefined) return false;
                const val = row[actualCol] !== undefined ? row[actualCol] : row[colName];

                let rVal;
                if (right.type === 'column_ref') {
                    const rightCol = right.column.includes('.') ? right.column.split('.')[1] : right.column;
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
                const colName = left.column.includes('.') ? left.column.split('.')[1] : left.column;
                return !!row[colName];
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


        const leftNum = parseFloat(left);
        const rightNum = parseFloat(right);

        if (!isNaN(leftNum) && !isNaN(rightNum)) {
            left = leftNum;
            right = rightNum;
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

    private evaluateFunction(funcNode: any): any {
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
                        if (arg.value !== undefined) return String(arg.value);
                        if (arg.type === 'function') return this.evaluateFunction(arg);
                        return String(arg);
                    }).join('');
                }
                return '';

            case 'DATE_SUB':
            case 'DATE_ADD':
                // Simplified: just return current date for now
                // Full implementation would parse interval and do date math
                return new Date().toISOString();

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
                // Add nulls for right columns? (Implicitly undefined is null-ish in UI)
            }
        });

        return joinedRows;
    }


}
