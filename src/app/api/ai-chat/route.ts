import { NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import fs from 'fs';
import path from 'path';
import { getAuthContextFromRequest } from '@/lib/auth';
import logger from '@/lib/logger';

// ── Schema Cache ──────────────────────────────────────────────────────────────
// Avoids querying information_schema on every chat message.
// TTL: 60 seconds per project.
const schemaCache = new Map<string, { data: string; expires: number }>();
const SCHEMA_TTL_MS = 60_000;

async function getSchemaContext(projectId: string | undefined, userId: string, projectInfo: any): Promise<string> {
    if (!projectId) return '';

    const cached = schemaCache.get(projectId);
    if (cached && Date.now() < cached.expires) return cached.data;

    try {
        const { SqlEngine } = await import('@/lib/sql-engine');
        const { getProjectById } = await import('@/lib/data');
        const { getProjectDbAndSchema } = await import('@/lib/tenant-pools');

        const project = await getProjectById(projectId, userId);
        if (!project) return '';

        const { dbName, schemaName } = getProjectDbAndSchema(project);
        const isMysql = project.dialect?.toLowerCase() === 'mysql';
        const targetSchemaOrDb = isMysql ? dbName : schemaName;
        const engine = new SqlEngine(projectId, userId, undefined, undefined, project);

        const colQuery = isMysql
            ? `SELECT table_name, column_name, data_type, is_nullable, column_key FROM information_schema.columns WHERE table_schema = ? AND table_name NOT LIKE '\_flux\_internal\_%' ORDER BY table_name, ordinal_position;`
            : `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = $1 AND table_name NOT LIKE '\_flux\_internal\_%' ORDER BY table_name, ordinal_position;`;

        const fkQuery = isMysql
            ? `SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name, REFERENCED_TABLE_NAME as referenced_table, REFERENCED_COLUMN_NAME as referenced_column
               FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
               WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL;`
            : `SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
               FROM information_schema.table_constraints AS tc
               JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
               JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
               WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1;`;

        const [colRes, fkRes] = await Promise.all([
            engine.execute(colQuery, [targetSchemaOrDb]).catch(() => null),
            engine.execute(fkQuery, [targetSchemaOrDb]).catch(() => null)
        ]);

        let result = '';
        if (colRes?.rows?.length) {
            const schemaMap: Record<string, string[]> = {};
            colRes.rows.forEach((r: any) => {
                const t = r.table_name || r.TABLE_NAME;
                const c = r.column_name || r.COLUMN_NAME;
                const dt = r.data_type || r.DATA_TYPE || '';
                const key = (r.column_key || r.COLUMN_KEY) === 'PRI' ? ' [PK]' : '';
                if (!schemaMap[t]) schemaMap[t] = [];
                schemaMap[t].push(`${c} (${dt}${key})`);
            });

            const fkList: string[] = [];
            if (fkRes?.rows?.length) {
                fkRes.rows.forEach((r: any) => {
                    fkList.push(`  ${r.table_name}.${r.column_name} -> ${r.referenced_table}.${r.referenced_column}`);
                });
            }

            result = `\n\n=== LIVE DATABASE SCHEMA ===\n` +
                Object.entries(schemaMap)
                    .map(([tbl, cols]) => `- ${tbl}: [${cols.join(', ')}]`)
                    .join('\n') +
                (fkList.length > 0 ? `\n- Foreign Keys:\n${fkList.join('\n')}` : '') +
                `\n\nCRITICAL: Use EXACT table/column names above. NEVER invent fake tables or columns.\n============================\n`;
        }

        schemaCache.set(projectId, { data: result, expires: Date.now() + SCHEMA_TTL_MS });
        return result;
    } catch (err) {
        logger.warn('[AI Chat] Schema introspection failed:', err);
        return '';
    }
}

// ── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { messages, currentPath, model, activeProject, screenContext } = await req.json();

        // RAG Error Memory
        let ragLessonsPrompt = '';
        try {
            const { getRelevantErrorLessons, formatLessonsForPrompt } = await import('@/lib/ai-memory');
            const userLastMsg = messages[messages.length - 1]?.content || '';
            const dialect = activeProject?.dialect || 'postgresql';
            const lessons = await getRelevantErrorLessons(activeProject?.project_id, dialect, userLastMsg);
            ragLessonsPrompt = formatLessonsForPrompt(lessons, dialect);
        } catch (memErr) {
            logger.warn('[AI Chat] RAG fetch failed:', memErr);
        }

        // Integration guide (cached in memory)
        let docsContext = '';
        try {
            const docsPath = path.join(process.cwd(), 'fluxbase-client', 'INTEGRATION_GUIDE.md');
            if (fs.existsSync(docsPath)) {
                docsContext = fs.readFileSync(docsPath, 'utf-8').substring(0, 6000);
            } else {
                docsContext = 'Fluxbase API: POST /api/execute-sql {query}, POST /api/storage/upload (multipart), SSE /api/realtime/subscribe.';
            }
        } catch {}

        // Project context
        const projectContext = activeProject
            ? `\nPROJECT: "${activeProject.display_name || ''}" (ID: ${activeProject.project_id}) | Dialect: ${activeProject.dialect || 'postgresql'} | TZ: ${activeProject.timezone || 'UTC'}\n`
            : '\nNo active project. Ask user to select/create one first for SQL operations.\n';

        const screenContextStr = screenContext
            ? `\nSCREEN: Table="${screenContext.activeTable || 'none'}" Cols=${JSON.stringify(screenContext.visibleColumns?.slice(0, 15) || [])} Rows=${screenContext.rowCount || 0}${screenContext.activeError ? ` Error="${screenContext.activeError.slice(0, 100)}"` : ''}\n`
            : '';

        // Schema (cached)
        const schemaContext = await getSchemaContext(activeProject?.project_id, auth.userId, activeProject);

        const systemPrompt = `You are Flux AI, an autonomous agent inside the Fluxbase database platform. You can navigate pages, execute SQL, create tables, insert data, and analyze results.

AVAILABLE ROUTES (use exact paths — never wrap in angle brackets):
/ (Home — landing page, demo showcases, auth dialogs)
/dashboard (Real-time analytics, API throughput, query metrics)
/dashboard/projects (Project switcher, database management)
/editor (Spreadsheet-style interactive data grid for viewing/editing table rows)
/query (Monaco SQL editor with AI query generation, explain plans, data exports)
/database (Visual schema explorer, tables, relationships)
/storage (AWS S3 file browser, drag-and-drop uploader, presigned URLs)
/scraper (Automated web data scraping into database tables)
/docs (Interactive REST API & SDK developer documentation)
/settings (Project configurations, API keys, team members, backups)

RULES:
1. Use ONLY real table/column names from the LIVE DATABASE SCHEMA below. Never invent names.
2. When the user asks about data, write a precise SQL query with WHERE/ORDER BY/LIMIT. Never do bare SELECT * unless asked.
3. When query results are in the conversation, READ them and answer directly.
4. Be concise. No 4-step plans for simple queries. Execute directly.
5. For destructive operations (DROP, DELETE, TRUNCATE, ALTER), warn the user in your response text. The query will be loaded into the editor where the user reviews before executing.
6. Use exact route paths from the AVAILABLE ROUTES list above. Never guess or fabricate paths.

CURRENT PATH: ${currentPath}
${projectContext}${screenContextStr}${schemaContext}${ragLessonsPrompt}

ACTION TAGS (output at end of response if needed):
- Run safe SQL directly and show results: [EXECUTE_SQL:<query>]
  Use for ALL read-only queries: SELECT, SHOW, EXPLAIN, DESCRIBE, WITH/CTE.
  This executes immediately and returns results in the chat. No user review needed.
- Load dangerous SQL into editor for review: [CONFIRM_ACTION:INJECT_SQL:<query>]
  Use ONLY for data-modifying or destructive operations: DROP, DELETE, TRUNCATE, ALTER, INSERT, UPDATE, CREATE TABLE.
  The user reviews and executes manually.
- Create project: [CONFIRM_ACTION:CREATE_PROJECT:<name>:<postgresql|mysql>]
- Navigate: [NAVIGATE:/path] — NEVER wrap the path in angle brackets. Use [NAVIGATE:/editor] NOT [NAVIGATE:</editor>]
- Click: [CLICK:<label>]
- Type: [TYPE:<value>:<field>]

--- INTEGRATION GUIDE ---
${docsContext}
--- END GUIDE ---

7. NEVER output only navigation tags without text. Always explain what you're doing and why.
8. When the user asks to query, analyze, or read data, use EXECUTE_SQL to run the query immediately. Use INJECT_SQL ONLY for writes/destructive ops.
9. Respond in Markdown. No HTML. No emojis.

Respond in Markdown. No HTML. No emojis.`;

        // Build conversation (last 10 messages for token efficiency)
        const recentMessages = messages.slice(-10);
        let fullPrompt = systemPrompt + '\n\n--- CONVERSATION ---\n';
        for (const msg of recentMessages) {
            // Skip hidden system messages from the history we send to the model
            if (msg.hidden) continue;
            const role = msg.role.toUpperCase();
            fullPrompt += `${role}: ${msg.content}\n\n`;
        }
        fullPrompt += 'ASSISTANT: ';

        const { fluxTools } = await import('@/ai/tools');

        const response = await ai.generate({
            model: model || 'glm',
            prompt: fullPrompt,
            tools: fluxTools,
            config: { temperature: 0.2 }
        });

        let responseText = response.text;

        // Extract tool calls and append as action tags
        try {
            const actionTags: string[] = [];
            const content = response.message?.content || (response as any).output?.content || [];
            if (Array.isArray(content)) {
                for (const part of content) {
                    if (!part.toolRequest) continue;
                    const req = part.toolRequest;
                    if (req.name === 'navigatePageTool' && req.input?.path) {
                        const p = req.input.path.replace(/^<\/+/, '/').replace(/>+$/, '');
                        actionTags.push(`[NAVIGATE:${p}]`);
                    } else if (req.name === 'clickElementTool' && req.input?.elementId) {
                        actionTags.push(`[CLICK:${req.input.elementId}]`);
                    } else if (req.name === 'typeInputTool' && req.input?.value && req.input?.locator) {
                        actionTags.push(`[TYPE:${req.input.value}:${req.input.locator}]`);
                    } else if (req.name === 'createProjectTool' && req.input?.projectName) {
                        actionTags.push(`[CONFIRM_ACTION:CREATE_PROJECT:${req.input.projectName}:${req.input.dialect || 'postgresql'}]`);
                    } else if (req.name === 'runSqlTool' && req.input?.query) {
                        actionTags.push(`[CONFIRM_ACTION:INJECT_SQL:${req.input.query}]`);
                    } else if (req.name === 'createTableDirectTool') {
                        const input = req.input as any;
                        const isM = (input.dialect || 'postgresql').toLowerCase() === 'mysql';
                        const q = isM ? '`' : '"';
                        const cols = (input.columns || []).map((c: any) => {
                            let d = `${q}${c.name}${q} ${c.type}`;
                            if (c.isPrimaryKey) d += isM && c.type.toUpperCase().includes('INT') ? ' AUTO_INCREMENT PRIMARY KEY' : ' PRIMARY KEY';
                            if (c.isNullable === false) d += ' NOT NULL';
                            if (c.defaultValue) d += ` DEFAULT ${c.defaultValue}`;
                            return d;
                        });
                        const sql = `CREATE TABLE IF NOT EXISTS ${q}${input.tableName}${q} (\n  ${cols.join(',\n  ')}\n);`;
                        actionTags.push(`[CONFIRM_ACTION:INJECT_SQL:${sql}]`);
                    } else if (req.name === 'insertRowsTool') {
                        const input = req.input as any;
                        const rows = input.rows || [];
                        if (rows.length) {
                            const columns = Object.keys(rows[0]);
                            const fmt = (v: any) => v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
                            const vals = rows.map((r: any) => `(${columns.map((c: string) => fmt(r[c])).join(', ')})`).join(',\n  ');
                            const sql = `INSERT INTO "${input.tableName}" (${columns.map((c: string) => `"${c}"`).join(', ')})\nVALUES\n  ${vals};`;
                            actionTags.push(`[CONFIRM_ACTION:INJECT_SQL:${sql}]`);
                        }
                    }
                }
            }
            const uniqueTags = [...new Set(actionTags.filter(Boolean))];
            if (uniqueTags.length > 0) {
                responseText += '\n' + uniqueTags.join('\n');
            }
        } catch (toolErr) {
            logger.error('[AI Chat] Tool extraction failed:', toolErr);
        }

        return NextResponse.json({ success: true, text: responseText });
    } catch (error: any) {
        logger.error('AI Chat Error:', error);
        let userFacingError = error.message || 'Failed to process request.';
        if (userFacingError.includes('1113') || userFacingError.includes('余额不足')) {
            userFacingError = 'GLM quota exhausted. Add GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY to .env.local.';
        } else if (userFacingError.includes('API_KEY_INVALID') || userFacingError.includes('API key not valid')) {
            userFacingError = 'API key invalid. Configure GEMINI_API_KEY, GROQ_API_KEY, or GLM_API_KEY in .env.local.';
        }
        return NextResponse.json({ success: false, error: userFacingError }, { status: 500 });
    }
}

// Allow schema cache invalidation via POST (called after DDL operations)
export async function DELETE(req: Request) {
    try {
        const { projectId } = await req.json();
        if (projectId) {
            schemaCache.delete(projectId);
            logger.info('[AI Chat] Schema cache invalidated for', projectId);
        }
        return NextResponse.json({ success: true });
    } catch {
        return NextResponse.json({ success: false }, { status: 400 });
    }
}
