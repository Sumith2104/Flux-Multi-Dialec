import { NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import fs from 'fs';
import path from 'path';
import { getAuthContextFromRequest } from '@/lib/auth';

export async function POST(req: Request) {
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const { messages, currentPath, model, activeProject, screenContext } = await req.json();

        // Retrieve RAG Error Memory lessons
        let ragLessonsPrompt = '';
        try {
            const { getRelevantErrorLessons, formatLessonsForPrompt } = await import('@/lib/ai-memory');
            const userLastMsg = messages[messages.length - 1]?.content || '';
            const dialect = activeProject?.dialect || 'postgresql';
            const lessons = await getRelevantErrorLessons(activeProject?.project_id, dialect, userLastMsg);
            ragLessonsPrompt = formatLessonsForPrompt(lessons, dialect);
        } catch (memErr) {
            console.warn('[AI Chat] Could not fetch RAG lessons:', memErr);
        }

        // Load Integration Guide for context
        let docsContext = '';
        try {
            const docsPath = path.join(process.cwd(), 'fluxbase-client', 'INTEGRATION_GUIDE.md');
            if (fs.existsSync(docsPath)) {
                docsContext = fs.readFileSync(docsPath, 'utf-8');
            } else {
                docsContext = "Fluxbase Integration Guide: To upload files, POST to /api/storage/upload with multipart/form-data (bucketId, projectId, file). To execute SQL, POST to /api/execute-sql with JSON { query: '...' }. To listen for realtime changes, connect to /api/realtime/subscribe via SSE.";
            }
        } catch (e) {
            console.warn("Could not load integration guide for AI context", e);
        }

        let projectContext = '';
        if (activeProject) {
            projectContext = `\nACTIVE PROJECT CONTEXT:\n- Name: "${activeProject.display_name || ''}"\n- ID: "${activeProject.project_id || ''}"\n- Database Dialect: "${activeProject.dialect || 'postgresql'}"\n- Timezone: "${activeProject.timezone || 'UTC'}"\n`;
        } else {
            projectContext = `\nACTIVE PROJECT CONTEXT: No active project is currently selected by the user. If they want to perform project-specific actions or execute SQL, instruct them to select or create a project first.\n`;
        }

        let screenContextStr = '';
        if (screenContext) {
            screenContextStr = `\nLIVE SCREEN VISION & CONTEXT:\n- Active Table: "${screenContext.activeTable || 'none'}"\n- Open Columns: ${JSON.stringify(screenContext.visibleColumns || [])}\n- Total Rows in View: ${screenContext.rowCount || 0}\n${screenContext.activeError ? `- Active UI Error: "${screenContext.activeError}"\n` : ''}`;
        }

        let schemaContext = '';
        if (activeProject?.project_id) {
            try {
                const { SqlEngine } = await import('@/lib/sql-engine');
                const { getProjectById } = await import('@/lib/data');
                const { getProjectDbAndSchema } = await import('@/lib/tenant-pools');

                const project = await getProjectById(activeProject.project_id, auth.userId);
                if (project) {
                    const { dbName, schemaName } = getProjectDbAndSchema(project);
                    const isMysql = project.dialect?.toLowerCase() === 'mysql';
                    const targetSchemaOrDb = isMysql ? dbName : schemaName;
                    const engine = new SqlEngine(activeProject.project_id, auth.userId, undefined, undefined, project);

                    const query = isMysql
                        ? `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = ? AND table_name NOT LIKE '\\_flux\\_internal\\_%' ORDER BY table_name, ordinal_position;`
                        : `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = $1 AND table_name NOT LIKE '\\_flux\\_internal\\_%' ORDER BY table_name, ordinal_position;`;

                    const res = await engine.execute(query, [targetSchemaOrDb]);
                    if (res && res.rows && res.rows.length > 0) {
                        const schemaMap: Record<string, string[]> = {};
                        res.rows.forEach((r: any) => {
                            const t = r.table_name || r.TABLE_NAME;
                            const c = r.column_name || r.COLUMN_NAME;
                            const dt = r.data_type || r.DATA_TYPE || '';
                            if (!schemaMap[t]) schemaMap[t] = [];
                            schemaMap[t].push(`${c} (${dt})`);
                        });
                        schemaContext = `\n\nREAL DATABASE SCHEMA (LIVE TABLES & COLUMNS IN THIS PROJECT):\n` +
                            Object.entries(schemaMap)
                                .map(([tbl, cols]) => `- Table "${tbl}": [${cols.join(', ')}]`)
                                .join('\n') + `\n\nCRITICAL SQL ACCURACY MANDATE: You MUST strictly use the exact table names and column names listed in the schema above. NEVER invent placeholder table names like "Table_Editor" or placeholder column names like "date_column" or "balance_column". If the user asks for a balance or date, search the schema above for matching columns (e.g. amount, balance, total, timestamp, created_at, date in existing tables) and write the exact query using those actual columns.\n`;
                    }
                }
            } catch (schemaErr) {
                console.warn('[AI Chat] Failed to load live schema:', schemaErr);
            }
        }

        const systemPrompt = `You are Flux AI, an autonomous, highly agentic AI developer assistant embedded inside the Fluxbase dashboard. 
Your job is to act as an intelligent co-pilot: formulating queries, analyzing data, executing database actions, navigating pages, and directly solving developer requests.

AGENTIC WORKFLOW & ACTION INSTRUCTIONS:
1. TARGETED SQL & DIRECT DATA ANALYSIS:
   - When the user asks a question about their data (e.g. "when was my balance above 4570" or "show users from NY"), formulate the EXACT, TARGETED SQL query with appropriate WHERE conditions, ORDER BY, and LIMIT clauses matching the REAL DATABASE SCHEMA below.
   - NEVER generate generic "SELECT * FROM table" if the user specified a filter or condition.
   - When query results or data rows are provided in the conversation (e.g. from System feedback), READ and ANALYZE the returned data directly, and provide the user with the final answer in clear English.
2. ACCURACY & REAL SCHEMA GROUNDING:
   - Current URL path: "${currentPath}".
   - ${projectContext}${screenContextStr}${schemaContext}${ragLessonsPrompt}
   - STRICT MANDATE: ONLY query table names and column names that exist in the REAL DATABASE SCHEMA above. Never invent fake tables like "Table_Editor" or "balance_history" or columns like "date_column".
3. AGENTIC EXECUTION TAGS:
   - To Execute SQL / Create Tables / Seed Data: output the tag at the end of your response: [CONFIRM_ACTION:EXECUTE_SQL:RawSQLQuery]
   - To Create a Project: [CONFIRM_ACTION:CREATE_PROJECT:ProjectName:dialect]
   - To Teleport/Navigate: [NAVIGATE:/the_path] (/editor, /query, /settings, /storage, /analytics)
   - To Click UI: [CLICK:Button Label]
   - To Type into Forms: [TYPE:Value:Field Label]
4. BE DIRECT & CONCISE:
   - If a request can be answered or executed immediately, provide the action directly. Do not output repetitive boilerplate 4-step plans for straightforward queries.
   - Format cleanly in Markdown. Do not use emojis.

--- START OFFICIAL INTEGRATION GUIDE ---
${docsContext.substring(0, 8000)}
--- END OFFICIAL INTEGRATION GUIDE ---

Provide your response in Markdown formatting. Do NOT use HTML. Keep code snippets short and sweet.`;

        // Format conversation into a continuous prompt to ensure Genkit compatibility
        let fullPrompt = systemPrompt + "\n\n--- CONVERSATION HISTORY ---\n";
        
        // Take the last 6 messages for recent context to save tokens
        const recentMessages = messages.slice(-6);
        for (const msg of recentMessages) {
            fullPrompt += `${msg.role.toUpperCase()}: ${msg.content}\n\n`;
        }
        fullPrompt += "ASSISTANT: ";

        // Import our real physical constraints tools
        const { fluxTools } = await import('@/ai/tools');

        const response = await ai.generate({
            model: model || 'glm',
            prompt: fullPrompt,
            tools: fluxTools,
            config: {
                temperature: 0.2, // Be precise when executing tools
            }
        });

        let responseText = response.text;

        // Process tool requests from response to guarantee tags are returned even if the model omits them
        try {
            const actionTags: string[] = [];
            const content = response.message?.content || (response as any).output?.content || [];
            if (Array.isArray(content)) {
                for (const part of content) {
                    if (part.toolRequest) {
                        const req = part.toolRequest;
                        if (req.name === 'navigatePageTool' && req.input?.path) {
                            actionTags.push(`[NAVIGATE:${req.input.path}]`);
                        } else if (req.name === 'clickElementTool' && req.input?.elementId) {
                            actionTags.push(`[CLICK:${req.input.elementId}]`);
                        } else if (req.name === 'typeInputTool' && req.input?.value && req.input?.locator) {
                            actionTags.push(`[TYPE:${req.input.value}:${req.input.locator}]`);
                        } else if (req.name === 'createProjectTool' && req.input?.projectName && req.input?.dialect) {
                            actionTags.push(`[CONFIRM_ACTION:CREATE_PROJECT:${req.input.projectName}:${req.input.dialect}]`);
                        } else if (req.name === 'runSqlTool' && req.input?.query) {
                            actionTags.push(`[CONFIRM_ACTION:EXECUTE_SQL:${req.input.query}]`);
                        } else if (req.name === 'createTableDirectTool') {
                            const { createTableDirectTool } = await import('@/ai/tools');
                            const res = await (createTableDirectTool as any).fn?.(req.input);
                            if (res?.action) actionTags.push(res.action);
                        } else if (req.name === 'insertRowsTool') {
                            const { insertRowsTool } = await import('@/ai/tools');
                            const res = await (insertRowsTool as any).fn?.(req.input);
                            if (res?.action) actionTags.push(res.action);
                        }
                    }
                }
            }

            // Deduplicate tags to prevent rendering duplicate actions in one message turn
            const uniqueTags = Array.from(new Set(actionTags));
            if (uniqueTags.length > 0) {
                responseText += '\n' + uniqueTags.join('\n');
            }
        } catch (historyError) {
            console.error('[AI Chat] Failed to extract tool calls:', historyError);
        }

        return NextResponse.json({ success: true, text: responseText });
    } catch (error: any) {
        console.error('AI Chat Error:', error);
        let userFacingError = error.message || 'Failed to process AI chat request.';
        
        if (userFacingError.includes('1113') || userFacingError.includes('余额不足')) {
            userFacingError = "Zhipu/GLM quota is exhausted (Error 1113). Please add a free GEMINI_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY to your .env.local file to continue.";
        } else if (userFacingError.includes('API_KEY_INVALID') || userFacingError.includes('API key not valid')) {
            userFacingError = "Gemini API key is missing or invalid. Please configure a valid GEMINI_API_KEY, GROQ_API_KEY, or GLM_API_KEY in your .env.local file.";
        }

        return NextResponse.json({ success: false, error: userFacingError }, { status: 500 });
    }
}
