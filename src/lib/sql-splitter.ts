export interface ParsedColumn {
    name: string;
    type: string;
    nullable: boolean;
}

export interface ParsedTable {
    tableName: string;
    columns: ParsedColumn[];
}

/**
 * Splits a SQL script into individual executable statements.
 * Handles strings, dollar quotes ($$...$$), comments (-- and /* ... *\/), and backticks.
 */
export function splitSqlStatements(sql: string): string[] {
    if (!sql || !sql.trim()) return [];

    const statements: string[] = [];
    let current = '';
    let i = 0;
    const len = sql.length;

    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;
    let dollarTag: string | null = null;

    while (i < len) {
        const char = sql[i];
        const next = i + 1 < len ? sql[i + 1] : '';

        // Line comment end
        if (inLineComment) {
            current += char;
            if (char === '\n') {
                inLineComment = false;
            }
            i++;
            continue;
        }

        // Block comment end
        if (inBlockComment) {
            current += char;
            if (char === '*' && next === '/') {
                current += next;
                i += 2;
                inBlockComment = false;
                continue;
            }
            i++;
            continue;
        }

        // Single quote string
        if (inSingleQuote) {
            current += char;
            if (char === '\\') {
                // Escaped char
                if (i + 1 < len) {
                    current += next;
                    i += 2;
                    continue;
                }
            } else if (char === "'") {
                if (next === "'") {
                    // Escaped quote ''
                    current += next;
                    i += 2;
                    continue;
                }
                inSingleQuote = false;
            }
            i++;
            continue;
        }

        // Double quote string / identifier
        if (inDoubleQuote) {
            current += char;
            if (char === '\\') {
                if (i + 1 < len) {
                    current += next;
                    i += 2;
                    continue;
                }
            } else if (char === '"') {
                inDoubleQuote = false;
            }
            i++;
            continue;
        }

        // Backtick identifier
        if (inBacktick) {
            current += char;
            if (char === '`') {
                inBacktick = false;
            }
            i++;
            continue;
        }

        // Dollar quote block ($tag$...$tag$)
        if (dollarTag !== null) {
            current += char;
            if (char === '$' && sql.startsWith(dollarTag, i)) {
                current += dollarTag.slice(1);
                i += dollarTag.length;
                dollarTag = null;
                continue;
            }
            i++;
            continue;
        }

        // Check comment start
        if (char === '-' && next === '-') {
            current += '--';
            i += 2;
            inLineComment = true;
            continue;
        }
        if (char === '#') {
            current += '#';
            i++;
            inLineComment = true;
            continue;
        }
        if (char === '/' && next === '*') {
            current += '/*';
            i += 2;
            inBlockComment = true;
            continue;
        }

        // Check quote start
        if (char === "'") {
            current += char;
            inSingleQuote = true;
            i++;
            continue;
        }
        if (char === '"') {
            current += char;
            inDoubleQuote = true;
            i++;
            continue;
        }
        if (char === '`') {
            current += char;
            inBacktick = true;
            i++;
            continue;
        }

        // Check dollar quote start (e.g. $$ or $func$)
        if (char === '$') {
            const dollarMatch = sql.slice(i).match(/^(\$[a-zA-Z0-9_]*\$)/);
            if (dollarMatch) {
                dollarTag = dollarMatch[1];
                current += dollarTag;
                i += dollarTag.length;
                continue;
            }
        }

        // Semicolon statement boundary
        if (char === ';') {
            const trimmed = current.trim();
            if (trimmed) {
                statements.push(trimmed);
            }
            current = '';
            i++;
            continue;
        }

        current += char;
        i++;
    }

    const remaining = current.trim();
    if (remaining) {
        statements.push(remaining);
    }

    return statements;
}

/**
 * Parses CREATE TABLE statements to extract table names and columns for dry-run preview.
 */
export function parseCreateTables(sql: string): ParsedTable[] {
    const statements = splitSqlStatements(sql);
    const tables: ParsedTable[] = [];

    for (const stmt of statements) {
        // Match CREATE [TEMPORARY] TABLE [IF NOT EXISTS] [schema.]tableName
        const match = stmt.match(/CREATE\s+(?:TEMPORARY\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["`]?\w+["`]?\.)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([\s\S]*)\)/i);
        if (!match) continue;

        const tableName = match[1];
        const body = match[2];

        const columns: ParsedColumn[] = [];
        // Split columns by comma outside parenthesis
        const colDefs = splitColumnsBody(body);

        for (const colDef of colDefs) {
            const trimmed = colDef.trim();
            // Skip constraints like PRIMARY KEY (...), CONSTRAINT ..., FOREIGN KEY ...
            if (/^(CONSTRAINT|PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|KEY|INDEX)\b/i.test(trimmed)) {
                continue;
            }

            const colMatch = trimmed.match(/^["`]?([a-zA-Z0-9_]+)["`]?\s+([a-zA-Z0-9_]+(?:\([^)]*\))?)/);
            if (colMatch) {
                const colName = colMatch[1];
                const colType = colMatch[2];
                const notNull = /\bNOT\s+NULL\b/i.test(trimmed);
                columns.push({
                    name: colName,
                    type: colType,
                    nullable: !notNull
                });
            }
        }

        tables.push({
            tableName,
            columns
        });
    }

    return tables;
}

function splitColumnsBody(body: string): string[] {
    const cols: string[] = [];
    let cur = '';
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === '(') depth++;
        else if (c === ')') depth--;
        else if (c === ',' && depth === 0) {
            if (cur.trim()) cols.push(cur.trim());
            cur = '';
            continue;
        }
        cur += c;
    }
    if (cur.trim()) cols.push(cur.trim());
    return cols;
}

/**
 * Analyzes SQL content for warnings (e.g. destructive commands).
 */
export function detectSqlWarnings(sql: string): string[] {
    const warnings: string[] = [];
    const upper = sql.toUpperCase();

    if (/\bDROP\s+TABLE\b/.test(upper)) {
        warnings.push('DROP TABLE detected in SQL script');
    }
    if (/\bDROP\s+DATABASE\b/.test(upper)) {
        warnings.push('DROP DATABASE detected in SQL script');
    }
    if (/\bTRUNCATE\b/.test(upper)) {
        warnings.push('TRUNCATE table detected in SQL script');
    }
    if (/\bDROP\s+SCHEMA\b/.test(upper)) {
        warnings.push('DROP SCHEMA detected in SQL script');
    }
    if (/\bALTER\s+TABLE\s+.*\bDROP\s+COLUMN\b/i.test(upper)) {
        warnings.push('DROP COLUMN detected in SQL script');
    }

    return warnings;
}
