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
    return `"project_${projectId.replace(/"/g, '""')}"`;
}

export function quoteMysqlProjectSchema(projectId: string): string {
    if (typeof projectId !== 'string' || !PG_PROJECT_ID_RE.test(projectId)) {
        throw new FluxbaseError('Invalid projectId.', ERROR_CODES.BAD_REQUEST, 400);
    }
    return `\`project_${projectId.replace(/`/g, '``')}\``;
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

    if (/[;\u0000]/.test(trimmed) || /--|\/\*|\*\/|\$\$/i.test(trimmed)) {
        throw new FluxbaseError('RLS expression contains unsafe SQL tokens.', ERROR_CODES.BAD_REQUEST, 400);
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
