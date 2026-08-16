import { getPgPool } from '@/lib/pg';

export interface AiErrorLesson {
    id: string;
    projectId?: string;
    dialect: string;
    errorCategory: string;
    errorMessage: string;
    failedInput: string;
    resolutionFix: string;
    occurredAt: string;
    successCount: number;
}

// Built-in foundational rules for PostgreSQL and MySQL
const DEFAULT_FOUNDATIONAL_LESSONS: Omit<AiErrorLesson, 'id' | 'occurredAt' | 'successCount'>[] = [
    {
        dialect: 'mysql',
        errorCategory: 'syntax_reserved_keyword',
        errorMessage: "You have an error in your SQL syntax near 'rows'",
        failedInput: 'SELECT table_name AS name, table_rows AS rows FROM information_schema.tables',
        resolutionFix: 'In MySQL 8.0+, `rows` is a reserved keyword. Always quote it as `rows` or alias as `row_count`.'
    },
    {
        dialect: 'mysql',
        errorCategory: 'schema_creation',
        errorMessage: 'Unknown database project_xxx',
        failedInput: 'CREATE TABLE project_xxx.users (...)',
        resolutionFix: 'In MySQL, schemas are databases. Use `CREATE DATABASE IF NOT EXISTS \`db_name\`` before creating tables.'
    },
    {
        dialect: 'postgresql',
        errorCategory: 'uuid_generation',
        errorMessage: 'function uuid_generate_v4() does not exist',
        failedInput: 'id UUID PRIMARY KEY DEFAULT uuid_generate_v4()',
        resolutionFix: 'In modern PostgreSQL (v13+), use native `DEFAULT gen_random_uuid()` without requiring the uuid-ossp extension.'
    },
    {
        dialect: 'postgresql',
        errorCategory: 'column_quotes',
        errorMessage: 'column "CreatedAt" does not exist',
        failedInput: 'SELECT CreatedAt FROM users',
        resolutionFix: 'PostgreSQL lowercases unquoted identifiers. If columns are camelCase, wrap them in double quotes `"createdAt"`.'
    },
    {
        dialect: 'postgresql',
        errorCategory: 'relation_does_not_exist',
        errorMessage: 'relation "table_editor" does not exist',
        failedInput: 'SELECT date_column, balance_column FROM Table_Editor',
        resolutionFix: 'NEVER invent fake table names like "Table_Editor" or fake column names like "date_column" or "balance_column". Always use real table names and column names from the REAL DATABASE SCHEMA.'
    },
    {
        dialect: 'mysql',
        errorCategory: 'table_does_not_exist',
        errorMessage: "Table 'project_xxx.table_editor' doesn't exist",
        failedInput: 'SELECT * FROM Table_Editor',
        resolutionFix: 'NEVER invent placeholder table names like "Table_Editor". Always inspect real existing tables from the REAL DATABASE SCHEMA.'
    }
];

/**
 * Records a resolved error and its verified fix into persistent global memory.
 */
export async function recordAiErrorSolution(
    projectId: string | undefined,
    dialect: string,
    errorCategory: string,
    errorMessage: string,
    failedInput: string,
    resolutionFix: string
): Promise<boolean> {
    try {
        const pool = getPgPool();
        const cleanDialect = dialect?.toLowerCase() === 'mysql' ? 'mysql' : 'postgresql';

        // Check if a similar lesson already exists
        const existing = await pool.query(
            `SELECT id, success_count FROM fluxbase_global.ai_error_memory 
             WHERE dialect = $1 AND (error_message = $2 OR failed_input = $3) LIMIT 1`,
            [cleanDialect, errorMessage.trim(), failedInput.trim()]
        );

        if (existing.rows.length > 0) {
            await pool.query(
                `UPDATE fluxbase_global.ai_error_memory 
                 SET success_count = success_count + 1,
                     resolution_fix = $1,
                     occurred_at = NOW()
                 WHERE id = $2`,
                [resolutionFix.trim(), existing.rows[0].id]
            );
        } else {
            await pool.query(
                `INSERT INTO fluxbase_global.ai_error_memory 
                 (project_id, dialect, error_category, error_message, failed_input, resolution_fix)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    projectId || null,
                    cleanDialect,
                    errorCategory.trim() || 'general_sql',
                    errorMessage.trim(),
                    failedInput.trim(),
                    resolutionFix.trim()
                ]
            );
        }
        return true;
    } catch (e) {
        console.warn('[AiMemory] Failed to record error lesson:', e);
        return false;
    }
}

/**
 * Retrieves learned rules and error fixes relevant to the current dialect and user intent.
 */
export async function getRelevantErrorLessons(
    projectId: string | undefined,
    dialect: string,
    queryOrIntent?: string,
    limit: number = 6
): Promise<AiErrorLesson[]> {
    const cleanDialect = dialect?.toLowerCase() === 'mysql' ? 'mysql' : 'postgresql';
    const lessons: AiErrorLesson[] = [];

    // 1. Add matching built-in foundational lessons
    const relevantDefaults = DEFAULT_FOUNDATIONAL_LESSONS.filter(
        d => d.dialect === cleanDialect
    ).map((d, i) => ({
        id: `default_${i}`,
        projectId,
        dialect: d.dialect,
        errorCategory: d.errorCategory,
        errorMessage: d.errorMessage,
        failedInput: d.failedInput,
        resolutionFix: d.resolutionFix,
        occurredAt: new Date().toISOString(),
        successCount: 10
    }));

    lessons.push(...relevantDefaults);

    // 2. Fetch custom learned database lessons from PostgreSQL
    try {
        const pool = getPgPool();
        let dbQuery = `
            SELECT id, project_id, dialect, error_category, error_message, failed_input, resolution_fix, occurred_at, success_count
            FROM fluxbase_global.ai_error_memory
            WHERE dialect = $1
        `;
        const params: any[] = [cleanDialect];

        if (queryOrIntent && queryOrIntent.length > 3) {
            // Extract keywords for basic semantic relevance
            const keywords = queryOrIntent
                .replace(/[^a-zA-Z0-9_\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 3)
                .slice(0, 5);

            if (keywords.length > 0) {
                const keywordClauses = keywords.map((_, i) => `(error_message ILIKE $${i + 2} OR failed_input ILIKE $${i + 2} OR resolution_fix ILIKE $${i + 2})`);
                dbQuery += ` AND (${keywordClauses.join(' OR ')})`;
                keywords.forEach(k => params.push(`%${k}%`));
            }
        }

        dbQuery += ` ORDER BY success_count DESC, occurred_at DESC LIMIT $${params.length + 1}`;
        params.push(limit);

        const res = await pool.query(dbQuery, params);
        for (const row of res.rows) {
            lessons.push({
                id: row.id,
                projectId: row.project_id,
                dialect: row.dialect,
                errorCategory: row.error_category,
                errorMessage: row.error_message,
                failedInput: row.failed_input,
                resolutionFix: row.resolution_fix,
                occurredAt: row.occurred_at,
                successCount: row.success_count
            });
        }
    } catch (e) {
        console.warn('[AiMemory] Failed to query dynamic memory:', e);
    }

    // Deduplicate and limit
    const unique = new Map<string, AiErrorLesson>();
    for (const l of lessons) {
        const key = `${l.dialect}_${l.errorCategory}_${l.resolutionFix.slice(0, 30)}`;
        if (!unique.has(key)) {
            unique.set(key, l);
        }
    }

    return Array.from(unique.values()).slice(0, limit);
}

/**
 * Formats retrieved lessons into a prompt-ready markdown block.
 */
export function formatLessonsForPrompt(lessons: AiErrorLesson[], dialect: string): string {
    if (!lessons.length) return '';

    const formatted = lessons.map((l, i) => 
`Rule ${i + 1} (${l.errorCategory}):
- Common Pitfall: "${l.errorMessage}"
- Avoid Pattern: \`${l.failedInput.replace(/\n/g, ' ')}\`
- Verified Fix: ${l.resolutionFix}`
    ).join('\n\n');

    return `\n\n--- RAG MEMORY: LEARNED DATABASE RULES FOR ${dialect.toUpperCase()} ---
To ensure zero regressions and perfect execution accuracy, adhere strictly to these learned fixes from past database executions:

${formatted}
--- END RAG MEMORY ---\n`;
}
