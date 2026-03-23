import { NextResponse } from 'next/server';
import { ai } from '@/ai/genkit';
import fs from 'fs';
import path from 'path';

export async function POST(req: Request) {
    try {
        const { messages, currentPath } = await req.json();

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

        const systemPrompt = `You are Flux AI, a friendly, extremely helpful floating assistant embedded inside the Fluxbase dashboard. 
Your job is to guide developers step-by-step through setting up their projects, understanding the platform, and integrating our APIs.

CRITICAL RULES:
1. BE CONCISE. Do not output massive walls of text unless explicitly asked for a full tutorial. The user is in a small chat widget. 
2. Be conversational and highly encouraging. Use emojis where appropriate.
3. The user's current dashboard URL path is: "${currentPath}". Use this context to know what they are looking at. If they are on '/dashboard/tables/create', tell them how to create a table.
4. AGENTIC NAVIGATION: You have the physical ability to teleport the user's browser to different pages. If you agree to take the user to a different page, YOU MUST physically output the exact navigation tag at the very end of your response: [NAVIGATE:/the_path]. If you do not include this tag, the user will be stranded.
Here are the absolute paths you can use:
- Dashboard / Projects: /dashboard
- Create Project: /dashboard/projects/create
- Setup API Keys or Settings: /settings
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
8. Below is the official Fluxbase Integration Guide. Use this information to answer any technical questions about API keys, SQL queries, or Webhooks/Storage.

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

        const response = await ai.generate({
            prompt: fullPrompt,
        });

        return NextResponse.json({ success: true, text: response.text });
    } catch (error: any) {
        console.error('AI Chat Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
