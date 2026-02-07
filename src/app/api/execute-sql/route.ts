import { NextResponse } from 'next/server';
import { getTableData, getTablesForProject, getColumnsForTable, getProjectById } from '@/lib/data';
import { createTableAction } from '@/app/(app)/dashboard/tables/create/actions';
import { addRowAction } from '@/app/(app)/editor/actions';
import { getCurrentUserId } from '@/lib/auth';
import { Parser, AST, Create } from 'node-sql-parser';

export const maxDuration = 60; // 1 minute

const sqlParser = new Parser();

// --- Helper Functions (compare, evaluateWhereClause, applyOrderBy, performJoin) ---
// Kept inline for simplicity, but ideally should be in a separate lib/sql-engine.ts
// for cleaner code. For Phase 3, we keep them here but wrap responses.

const compare = (left: any, operator: string, right: any): boolean => {
    if (operator === 'IS' && right === null) return left === null || left === undefined || left === '';
    if (operator === 'IS NOT' && right === null) return left !== null && left !== undefined && left !== '';
    if (left === null || right === null || left === undefined || right === undefined) return false;

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
            const regex = new RegExp("^" + right.replace(/%/g, '.*') + "$");
            return regex.test(left);
        default: throw new Error(`Unsupported operator: ${operator}`);
    }
};

const evaluateWhereClause = (whereNode: any, row: Record<string, any>): boolean => {
    if (!whereNode) return true;
    const { type, operator, left, right } = whereNode;

    if (type === 'binary_expr') {
        if (['AND', 'OR'].includes(operator.toUpperCase())) {
            const leftValue = evaluateWhereClause(left, row);
            if (operator.toUpperCase() === 'AND' && !leftValue) return false;
            if (operator.toUpperCase() === 'OR' && leftValue) return true;
            const rightValue = evaluateWhereClause(right, row);
            if (operator.toUpperCase() === 'AND') return leftValue && rightValue;
            if (operator.toUpperCase() === 'OR') return leftValue || rightValue;
        }

        const colName = left.column;
        if (row[colName] === undefined) return false;

        let rVal;
        if (right.type === 'column_ref') {
            rVal = row[right.column];
        } else if (right.type === 'value_list') {
            rVal = right.value.map((v: any) => v.value);
        } else if (right.type === 'null') {
            rVal = null;
        } else {
            rVal = right.value;
        }
        return compare(row[colName], operator, rVal);
    }

    if (type === 'column_ref') {
        return !!row[left.column];
    }
    throw new Error(`Unsupported WHERE clause node type: ${type}`);
};

const applyOrderBy = (rows: any[], orderBy: any[]) => {
    if (!orderBy || orderBy.length === 0) return rows;
    return [...rows].sort((a, b) => {
        for (const order of orderBy) {
            const { expr, type } = order;
            const col = expr.column;
            const dir = type === 'DESC' ? -1 : 1;
            const valA = a[col];
            const valB = b[col];
            const valANum = parseFloat(valA);
            const valBNum = parseFloat(valB);

            if (!isNaN(valANum) && !isNaN(valBNum)) {
                if (valANum < valBNum) return -1 * dir;
                if (valANum > valBNum) return 1 * dir;
            } else {
                if (String(valA).localeCompare(String(valB)) < 0) return -1 * dir;
                if (String(valA).localeCompare(String(valB)) > 0) return 1 * dir;
            }
        }
        return 0;
    });
};

const performJoin = (leftTable: any[], rightTable: any[], joinCondition: any, joinType: 'INNER JOIN' | 'LEFT JOIN') => {
    const joinedRows: any[] = [];
    const { left, right, operator } = joinCondition;
    const leftCol = left.column;
    const rightCol = right.column;

    const rightTableMap = new Map();
    for (const row of rightTable) {
        if (!rightTableMap.has(row[rightCol])) rightTableMap.set(row[rightCol], []);
        rightTableMap.get(row[rightCol]).push(row);
    }

    for (const leftRow of leftTable) {
        const joinValue = leftRow[leftCol];
        const matchingRightRows = rightTableMap.get(joinValue) || [];

        if (matchingRightRows.length > 0) {
            for (const rightRow of matchingRightRows) joinedRows.push({ ...leftRow, ...rightRow });
        } else if (joinType === 'LEFT JOIN') {
            const nullPaddedRightRow: Record<string, null> = {};
            if (rightTable.length > 0) Object.keys(rightTable[0]).forEach(key => nullPaddedRightRow[key] = null);
            joinedRows.push({ ...leftRow, ...nullPaddedRightRow });
        }
    }
    return joinedRows;
};

// --- Command Handlers ---

const handleSelectQuery = async (ast: any, projectId: string) => {
    const from = ast.from;
    if (!from || from.length === 0) throw new Error("FROM clause is required.");

    const mainTableDef = from[0];
    const { rows: mainTableData } = await getTableData(projectId, mainTableDef.table, 1, 10000);
    let processedRows = mainTableData;

    let explanation = [`Fetched ${mainTableData.length} rows from '${mainTableDef.table}'`];

    if (from.length > 1) {
        let currentLeftTable = mainTableData;
        for (let i = 1; i < from.length; i++) {
            const joinDef = from[i];
            const { rows: rightTableData } = await getTableData(projectId, joinDef.table, 1, 10000);
            currentLeftTable = performJoin(currentLeftTable, rightTableData, joinDef.on, joinDef.join);
            explanation.push(`Joined with '${joinDef.table}' (${joinDef.join})`);
        }
        processedRows = currentLeftTable;
    }

    if (ast.where) {
        const originalCount = processedRows.length;
        processedRows = processedRows.filter(row => evaluateWhereClause(ast.where, row));
        explanation.push(`Filtered rows (Where clause). ${originalCount} -> ${processedRows.length}`);
    }

    if (ast.orderby) {
        processedRows = applyOrderBy(processedRows, ast.orderby);
        explanation.push("Sorted rows");
    }

    const limit = ast.limit ? ast.limit.value[0].value : 100;
    if (ast.limit) explanation.push(`Limited to ${limit} rows`);
    let finalRows: any[] = processedRows.slice(0, limit);

    let resultColumns: string[];
    if (ast.columns.length === 1 && ast.columns[0].expr.column === '*') {
        resultColumns = finalRows.length > 0 ? Object.keys(finalRows[0]) : [];
    } else {
        resultColumns = ast.columns.map((c: any) => c.as || c.expr.column);
        finalRows = finalRows.map(row => {
            const projectedRow: Record<string, any> = {};
            ast.columns.forEach((c: any) => projectedRow[c.as || c.expr.column] = row[c.expr.column]);
            return projectedRow;
        });
        explanation.push(`Selected specific columns: ${resultColumns.join(', ')}`);
    }

    return {
        rows: finalRows,
        columns: resultColumns,
        explanation
    };
};

const handleCreateQuery = async (ast: Create, projectId: string) => {
    if (ast.keyword !== 'table' || !ast.table) throw new Error("Only CREATE TABLE statements are supported.");
    const tableName = (Array.isArray(ast.table) ? ast.table[0] : ast.table).table;
    const columns = ast.create_definitions?.map(def => {
        if (def.resource !== 'column') return null;
        let dataType = def.definition.dataType.toLowerCase();
        // Simplified mapping logic
        if (['int', 'integer', 'smallint', 'bigint'].includes(dataType)) dataType = 'int';
        else if (['decimal', 'numeric', 'float', 'double'].includes(dataType)) dataType = 'float';
        else if (['boolean', 'bool'].includes(dataType)) dataType = 'boolean';
        else if (['timestamptz', 'timestamp', 'date', 'datetime'].includes(dataType)) dataType = 'date';
        else dataType = 'varchar'; // default handles uuid, text, char, etc
        return `${(def.column as any).column}:${dataType}`;
    }).filter(Boolean).join(',');

    if (!columns) throw new Error("CREATE TABLE statement must include column definitions.");

    const formData = new FormData();
    formData.append('tableName', tableName);
    formData.append('projectId', projectId);
    formData.append('columns', columns);
    formData.append('description', 'Created via SQL Editor');
    const result = await createTableAction(formData);

    if (!result.success) throw new Error(result.error || 'Failed to create table via server action.');
    return {
        rows: [],
        columns: [],
        explanation: [`Created table '${tableName}' with columns: ${columns}`],
        message: `Table '${tableName}' created successfully.`
    };
};

const handleInsertQuery = async (ast: any, projectId: string) => {
    const tableName = ast.table?.[0].table;
    if (!tableName) throw new Error("INSERT statement must have a table name.");

    // (Simplified value parsing logic same as before, see original file)
    let valuesList: any[] = [];
    if (Array.isArray(ast.values)) valuesList = ast.values;
    else if (ast.values?.type === 'value_list') valuesList = [ast.values];
    else if (Array.isArray(ast.value)) valuesList = [{ type: 'value_list', value: ast.value }];

    if (valuesList.length === 0) throw new Error("Invalid INSERT format. No values found.");

    const tableCols = (await getColumnsForTable(projectId, (await getTablesForProject(projectId)).find(t => t.table_name === tableName)!.table_id)).map(c => c.column_name);
    const columnsToInsert = ast.columns || tableCols;

    const allTables = await getTablesForProject(projectId);
    const table = allTables.find(t => t.table_name === tableName);
    if (!table) throw new Error(`Table '${tableName}' not found.`);

    let insertedCount = 0;
    for (const valuesNode of valuesList) {
        const values = valuesNode.value.map((v: any) => v.value);
        if (columnsToInsert.length !== values.length) throw new Error(`Column count mismatch.`);

        const formData = new FormData();
        formData.append('projectId', projectId);
        formData.append('tableId', table.table_id);
        formData.append('tableName', tableName);
        columnsToInsert.forEach((col: string, index: number) => formData.append(col, String(values[index])));

        const result = await addRowAction(formData);
        if (!result.success) throw new Error(result.error || 'Failed to insert row.');
        insertedCount++;
    }

    return {
        rows: [],
        columns: [],
        explanation: [`Inserted ${insertedCount} row(s) into '${tableName}'`],
        message: `${insertedCount} row(s) inserted successfully.`
    };
};

// --- Main Handler ---

export async function POST(request: Request) {
    const startTime = Date.now();
    try {
        const userId = await getCurrentUserId();
        if (!userId) return NextResponse.json({ success: false, error: { message: 'User not authenticated', code: 'AUTH_REQUIRED' } }, { status: 401 });

        const { projectId, query } = await request.json();
        if (!projectId || !query) {
            return NextResponse.json({ success: false, error: { message: 'Missing projectId or query', code: 'BAD_REQUEST' } }, { status: 400 });
        }

        const project = await getProjectById(projectId);
        if (!project) return NextResponse.json({ success: false, error: { message: 'Project not found', code: 'NOT_FOUND' } }, { status: 404 });

        const dialect = project.dialect || 'postgresql';
        let dbOption = 'PostgreSQL';
        if (dialect === 'mysql') dbOption = 'MySQL';
        if (dialect === 'oracle') dbOption = 'Oracle';

        let astArray: AST[] | AST;
        try {
            const queryWithoutComments = query.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
            astArray = sqlParser.astify(queryWithoutComments, { database: dbOption });
        } catch (e: any) {
            return NextResponse.json({
                success: false,
                error: { message: `SQL Syntax Error (${dialect})`, code: 'SYNTAX_ERROR', hint: e.message }
            }, { status: 200 }); // Return 200 so frontend can parse JSON easily
        }

        const ast = Array.isArray(astArray) ? astArray[0] : astArray;
        const type = (ast as any).type?.toUpperCase();

        let result: any;

        switch (type) {
            case 'SELECT': result = await handleSelectQuery(ast as any, projectId); break;
            case 'CREATE': result = await handleCreateQuery(ast as Create, projectId); break;
            case 'INSERT': result = await handleInsertQuery(ast as any, projectId); break;
            default:
                throw new Error(`Unsupported SQL command: ${type}`);
        }

        const duration = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            result: {
                rows: result.rows,
                columns: result.columns,
                message: result.message
            },
            explanation: result.explanation || [`Executed ${type} statement`],
            executionInfo: {
                time: `${duration}ms`,
                rowCount: result.rows.length
            }
        });

    } catch (error: any) {
        console.error('SQL Execution Failed:', error);
        return NextResponse.json({
            success: false,
            error: {
                message: error.message || 'An unexpected error occurred',
                code: 'EXECUTION_ERROR',
                hint: 'Check your table names and column types.'
            }
        }, { status: 200 });
    }
}
