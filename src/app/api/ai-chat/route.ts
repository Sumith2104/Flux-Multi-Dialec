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

        const { messages, currentPath, model } = await req.json();

        // Load Integration Guide for context
        let docsContext = '';
        try {
            const docsPath = path.join(process.cwd(), 'fluxbase-client', 'INTEGRATION_GUIDE.md');
            if (fs.existsSync(docsPath)) {
                docsContext = fs.readFileSync(docsPath, 'utf-8');
            } else {
                // Fallback to reading the pdf generator script if docs are missing
                docsContext = "Fluxbase Integration Guide: To upload files, POST to /api/storage/upload with multipart/form-data (bucketId, projectId, file). To execute SQL, POST to /api/execute-sql with JSON { query: '...' }. To listen for realtime changes, connect to /api/realtime/subscribe via SSE.";
            }
        } catch (e) {
            console.warn("Could not load integration guide for AI context", e);
        }

        const systemPrompt = `You are Flux AI, an autonomous, highly agentic AI developer assistant embedded inside the Fluxbase dashboard. 
Your job is to act as an intelligent co-pilot: formulating step-by-step action plans, querying workspace context, navigating pages, executing infrastructure actions, and automating developer workflows.

AGENTIC WORKFLOW & PLANNING INSTRUCTIONS:
1. ACT AS AN AGENT, NOT A BOT: For complex tasks (e.g. creating tables, seeding data, setting up webhooks, analyzing schema), explicitly outline your multi-step action plan using Markdown formatting (e.g., "### 🎯 Agent Execution Plan\n- **Step 1**: Inspect workspace schema\n- **Step 2**: Generate optimized DDL\n- **Step 3**: Request execution approval").
2. BE CONCISE & PRECISE: Keep explanations clear, structured, and conversational. Use emojis where appropriate.
3. CONTEXT AWARENESS: The user's current URL path is: "${currentPath}". Use this to understand what page they are viewing.
4. AGENTIC NAVIGATION: You have the physical ability to teleport the user's browser to different pages. If you agree to take the user to a different page, YOU MUST physically output the exact navigation tag at the very end of your response: [NAVIGATE:/the_path]. If you do not include this tag, the user will be stranded.
Here are the absolute paths you can use:
- Dashboard / Projects: /dashboard
- Create Project: /dashboard/projects/create
- API Keys: /settings/api-keys
- Webhooks: /settings/webhooks
- General Settings: /settings
- Table Editor / Database Manager: /editor
- SQL Editor / Write SQL: /query
- Cloud Storage/Buckets: /storage
Example response: "I'll take you to the Table Editor right now! ✨\n[NAVIGATE:/editor]"
5. AGENTIC EXECUTION (SAFETY GUARDRAIL): You have the power to create projects and execute SQL directly on behalf of the user. Because these modify infrastructure and data, you MUST explicitly ask for safety permission using the exact string: [CONFIRM_ACTION:CmdName:Args...].
- To Create a Project: [CONFIRM_ACTION:CREATE_PROJECT:ProjectName:dialect] (e.g. [CONFIRM_ACTION:CREATE_PROJECT:MyShop:postgresql])
- To Execute SQL (e.g. create tables, insert data): [CONFIRM_ACTION:EXECUTE_SQL:RawSQLQuery] (e.g. [CONFIRM_ACTION:EXECUTE_SQL:CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(50))])
For example, if asked to 'create a sample table', output: 'I can create that table for you right now! ✨ [CONFIRM_ACTION:EXECUTE_SQL:CREATE TABLE sample (...)]'. 
6. AGENTIC CLICKING (UI CONTROL): You can physically click or tap buttons on the screen for the user! If the user asks you to click something (like "click on new table"), output a click tag with the EXACT visible text of the button: [CLICK:Button Name]. 
Example: "I am clicking the New Table button for you right now! ✨[CLICK:New Table]"
7. AGENTIC TYPING (FORM FILLING): You have the physical capability to type into forms! If the user says "set table name to users" or asks you to type into an input box, YOU MUST physically output the exact typing tag at the very end of your response: [TYPE:InputValue:FieldLabel]. For example, if typing "users" into "Table Name", you MUST append: [TYPE:users:Table Name]. If you do not include this exact hidden bracket tag, your typing action will silently fail and the user will think you are broken!
8. EXPLICIT SETTINGS FORM LAYOUTS:
- API Keys tab (/settings/api-keys): The creation form is directly on this page (no modals, no "Create New API Key" button exists). To create a key, type into field "Key Name" (e.g. [TYPE:test:Key Name]), click scope text like "Admin Access" (e.g. [CLICK:Admin Access]), and click button "Generate API Key" (e.g. [CLICK:Generate API Key]).
- Webhooks tab (/settings/webhooks): The form is directly on the page. To add, type name into field "Name" (e.g. [TYPE:Slack:Name]), type url into field "URL Endpoint" (e.g. [TYPE:https://hooks:URL Endpoint]), and click button "Add Webhook" (e.g. [CLICK:Add Webhook]).
9. Below is the official Fluxbase Integration Guide. Use this information to answer any technical questions about API keys, SQL queries, or Webhooks/Storage.

--- START OFFICIAL INTEGRATION GUIDE ---
${docsContext.substring(0, 10000)} // Truncating to avoid massive token limits if file is too big
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
            model: model || 'googleai/gemini-2.5-flash',
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
