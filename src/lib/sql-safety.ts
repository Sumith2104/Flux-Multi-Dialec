import { Parser } from 'node-sql-parser';
import { ERROR_CODES, FluxbaseError } from '@/lib/error-codes';

const PG_PROJECT_ID_RE = /^[A-Za-z0-9_-]+$/;
const SQL_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const RLS_COMMANDS = new Set(['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']);

export function quotePgIdentifier(identifier: string, label: string = 'identifier'): string {
    if (typeof identifier !== 'string' || !SQL_IDENTIFIER_RE.test(identifier)) {
        throw new FluxbaseError(`Invalid ${label}.`, ERROR_CODES.BAD_REQUEST, 400);
    }
    return `"${identifier.replace(/"/g, '""')}"`;
}

export function quoteMysqlIdentifier(identifier: string, label: string = 'identifier'): string {
    if (typeof identifier !== 'string' || !SQL_IDENTIFIER_RE.test(identifier)) {
        throw new FluxbaseError(`Invalid ${label}.`, ERROR_CODES.BAD_REQUEST, 400);
    }
    return `\`${identifier.replace(/`/g, '``')}\``;
}

export function quotePgProjectSchema(projectId: string): string {
    if (typeof projectId !== 'string' || !PG_PROJECT_ID_RE.test(projectId)) {
        throw new FluxbaseError('Invalid projectId.', ERROR_CODES.BAD_REQUEST, 400);
    }
    const schema = projectId.startsWith('flux_tenant_') || projectId.startsWith('project_')
        ? projectId
        : `project_${projectId}`;
    return `"${schema.replace(/"/g, '""')}"`;
}

export function quoteMysqlProjectSchema(projectId: string): string {
    if (typeof projectId !== 'string' || !PG_PROJECT_ID_RE.test(projectId)) {
        throw new FluxbaseError('Invalid projectId.', ERROR_CODES.BAD_REQUEST, 400);
    }
    const schema = projectId.startsWith('flux_tenant_') || projectId.startsWith('project_')
        ? projectId
        : `project_${projectId}`;
    return `\`${schema.replace(/`/g, '``')}\``;
}

export function validateRlsCommand(command: unknown): string {
    const normalized = String(command || 'ALL').toUpperCase();
    if (!RLS_COMMANDS.has(normalized)) {
        throw new FluxbaseError('Invalid RLS command.', ERROR_CODES.BAD_REQUEST, 400);
    }
    return normalized;
}

export function validateRlsExpression(expression: unknown): string {
    if (typeof expression !== 'string') {
        throw new FluxbaseError('RLS expression must be a string.', ERROR_CODES.BAD_REQUEST, 400);
    }

    const trimmed = expression.trim();
    if (!trimmed || trimmed.length > 2000) {
        throw new FluxbaseError('Invalid RLS expression length.', ERROR_CODES.BAD_REQUEST, 400);
    }

    // Layer 1: Regex quick-reject for obviously dangerous tokens
    if (/[;\u0000]/.test(trimmed) || /--|\/\*|\*\/|\$\$/i.test(trimmed)) {
        throw new FluxbaseError('RLS expression contains unsafe SQL tokens.', ERROR_CODES.BAD_REQUEST, 400);
    }

    // Layer 2: AST-based validation — reject anything that isn't a simple boolean expression
    try {
        const parser = new Parser();
        // Wrap in a WHERE clause so the parser can parse it as a full statement
        const wrapped = `SELECT 1 FROM rls_check WHERE ${trimmed}`;
        const ast = parser.astify(wrapped, { database: 'Postgresql' } as any);
        const statements = Array.isArray(ast) ? ast : [ast];
        
        if (statements.length !== 1 || statements[0]?.type !== 'select') {
            throw new FluxbaseError('RLS expression must be a valid boolean expression.', ERROR_CODES.BAD_REQUEST, 400);
        }

        const where = statements[0].where;
        if (!where) {
            throw new FluxbaseError('RLS expression must contain a condition.', ERROR_CODES.BAD_REQUEST, 400);
        }

        // Reject subqueries in RLS expressions
        const jsonStr = JSON.stringify(where);
        if (jsonStr.includes('"type":"select"') || jsonStr.includes('"type":"insert"') || 
            jsonStr.includes('"type":"update"') || jsonStr.includes('"type":"delete"') ||
            jsonStr.includes('"type":"drop"') || jsonStr.includes('"type":"create"') ||
            jsonStr.includes('"type":"alter"') || jsonStr.includes('"type":"truncate"') ||
            jsonStr.includes('"type":"copy"') || jsonStr.includes('"type":"execute"') ||
            jsonStr.includes('"type":"grant"') || jsonStr.includes('"type":"revoke"')) {
            throw new FluxbaseError('RLS expressions cannot contain subqueries or DDL/DML operations.', ERROR_CODES.BAD_REQUEST, 400);
        }

        // Reject dangerous function calls
        const dangerousFunctions = ['pg_read_file', 'pg_write_file', 'pg_exec', 'pg_sleep', 
            'lo_import', 'lo_export', 'pg_ls_dir', 'pg_stat_file', 'copy', 'execute',
            'current_database', 'current_user', 'session_user', 'pg_terminate_backend'];
        if (dangerousFunctions.some(fn => jsonStr.toLowerCase().includes(`"${fn}"`))) {
            throw new FluxbaseError('RLS expression references a forbidden function.', ERROR_CODES.BAD_REQUEST, 400);
        }

    } catch (e: any) {
        // If our AST validation threw, re-throw it
        if (e instanceof FluxbaseError) throw e;
        // If the parser can't parse it, it's not a valid boolean expression
        throw new FluxbaseError('RLS expression is not a valid SQL boolean expression.', ERROR_CODES.BAD_REQUEST, 400);
    }

    return trimmed;
}

export function assertReadOnlySelectQuery(query: unknown, dialect: 'mysql' | 'postgresql' | 'oracle' | undefined = 'postgresql'): asserts query is string {
    if (typeof query !== 'string' || !query.trim()) {
        throw new FluxbaseError('Query must be a non-empty string.', ERROR_CODES.BAD_REQUEST, 400);
    }

    const trimmed = query.trim();
    if (trimmed.replace(/;+$/g, '').includes(';')) {
        throw new FluxbaseError('Analytics queries must contain exactly one SELECT statement.', ERROR_CODES.FORBIDDEN, 403);
    }

    const parser = new Parser();
    let ast: any;
    try {
        ast = parser.astify(trimmed, {
            database: dialect?.toLowerCase() === 'mysql' ? 'MySQL' : 'Postgresql',
        } as any);
    } catch {
        throw new FluxbaseError('Analytics queries must be valid SELECT SQL.', ERROR_CODES.BAD_REQUEST, 400);
    }

    const statements = Array.isArray(ast) ? ast : [ast];
    if (statements.length !== 1 || statements[0]?.type !== 'select') {
        throw new FluxbaseError('Analytics queries must be SELECT operations only.', ERROR_CODES.FORBIDDEN, 403);
    }
}
