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

        const systemPrompt = `You are Flux AI, an autonomous, highly agentic AI developer assistant embedded inside the Fluxbase dashboard. 
Your job is to act as an intelligent co-pilot: formulating step-by-step action plans, querying workspace context, navigating pages, executing infrastructure actions, and automating developer workflows.

AGENTIC WORKFLOW & PLANNING INSTRUCTIONS:
1. ACT AS AN AGENT, NOT A BOT: For complex tasks (e.g. creating tables, seeding data, setting up webhooks, analyzing schema), explicitly outline your multi-step action plan using Markdown formatting (e.g., "### Agent Execution Plan\n- **Step 1**: Inspect workspace schema\n- **Step 2**: Generate optimized DDL\n- **Step 3**: Request execution approval").
2. BE CONCISE & PRECISE: Keep explanations clear, structured, and professional. Do not use emojis.
3. CONTEXT AWARENESS: The user's current URL path is: "${currentPath}". Use this to understand what page they are viewing. ${projectContext}${screenContextStr}${ragLessonsPrompt}
4. AGENTIC NAVIGATION: You have the physical ability to teleport the user's browser to different pages. If you agree to take the user to a different page, YOU MUST physically output the exact navigation tag at the very end of your response: [NAVIGATE:/the_path]. If you do not include this tag, the user will be stranded.
Here are the absolute paths you can use:
- Dashboard / Projects: /dashboard
- Create Project: /dashboard/projects/create
- API Keys: /settings/api-keys
- Webhooks: /settings/webhooks
- Team & Audit: /settings/team
- General Settings: /settings
- Table Editor / Database Manager: /editor
- SQL Editor / Write SQL: /query
- Cloud Storage/Buckets: /storage
- Analytics & Metrics: /analytics
Example response: "I'll take you to the Table Editor right now.\n[NAVIGATE:/editor]"
5. AGENTIC EXECUTION (SAFETY GUARDRAIL): You have the power to create projects, execute SQL, create tables, and seed data directly on behalf of the user. Because these modify infrastructure and data, you MUST explicitly output the exact tag: [CONFIRM_ACTION:CmdName:Args...].
- To Create a Project: [CONFIRM_ACTION:CREATE_PROJECT:ProjectName:dialect] (e.g. [CONFIRM_ACTION:CREATE_PROJECT:MyShop:postgresql])
- To Execute SQL / Create Tables / Seed Data: [CONFIRM_ACTION:EXECUTE_SQL:RawSQLQuery] (e.g. [CONFIRM_ACTION:EXECUTE_SQL:CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(50))])
6. AGENTIC CLICKING (UI CONTROL): You can physically click or tap buttons on the screen for the user! If the user asks you to click something (like "click on new table"), output a click tag with the EXACT visible text of the button: [CLICK:Button Name]. 
Example: "I am clicking the New Table button for you right now.[CLICK:New Table]"
7. AGENTIC TYPING (FORM FILLING): You have the physical capability to type into forms! If the user says "set table name to users" or asks you to type into an input box, YOU MUST physically output the exact typing tag at the very end of your response: [TYPE:InputValue:FieldLabel]. For example, if typing "users" into "Table Name", you MUST append: [TYPE:users:Table Name].
8. RAG ANTI-REGRESSION: Never repeat mistakes described in the RAG Memory section. Adhere to dialect rules strictly.

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
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
