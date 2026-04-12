import { z } from 'zod';
import { ai } from './genkit';

export const getSchemaTool = ai.defineTool({
  name: "getSchemaTool",
  description: "Fetch the database schema for the workspace. Call this when you need to know exactly what tables and columns exist before writing a SQL query. YOU MUST EXACTLY EXTRACT THE PROJECT ID from your current dashboard URL to pass it in here.",
  inputSchema: z.object({
    projectId: z.string().describe("The exact Project UUID parsed from your dashboard URL (e.g. 404468060107...)"),
  }),
  outputSchema: z.object({
    schema: z.any()
  }),
}, async (input) => {
  try {
    const { SqlEngine } = await import('@/lib/sql-engine');
    const { getCurrentUserId } = await import('@/lib/auth');
    const engine = new SqlEngine(input.projectId, await getCurrentUserId() || 'system_ai'); 
    const tables = await engine.execute(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'project_${input.projectId}' AND table_name NOT LIKE '\\_flux\\_internal\\_%';`);
    
    if (tables && tables.rows) {
        const schemaGraph: Record<string, string[]> = {};
        tables.rows.forEach((r: any) => {
            const t = r.table_name || r.TABLE_NAME;
            const c = r.column_name || r.COLUMN_NAME;
            if (!schemaGraph[t]) schemaGraph[t] = [];
            schemaGraph[t].push(c);
        });
        return { schema: schemaGraph };
    }
    return { schema: { error: "No tables found" } };
  } catch(e: any) {
    return { schema: { error: e.message } };
  }
});

export const runSqlTool = ai.defineTool({
  name: "runSqlTool",
  description: "Executes a SQL query against the connected project database. ALWAYS requires explicit user approval before execution.",
  inputSchema: z.object({ 
    query: z.string().describe("The exact PostgreSQL query to execute."), 
    reason: z.string().describe("Explain to the user exactly why this query needs to run so they can approve it.") 
  }),
  outputSchema: z.object({
    action: z.string()
  }),
}, async (input) => {
  return { action: `[CONFIRM_ACTION:EXECUTE_SQL:${input.query}]` };
});

export const navigatePageTool = ai.defineTool({
  name: "navigatePageTool",
  description: "Physically teleport the user's browser to different pages in the application.",
  inputSchema: z.object({ 
    path: z.enum(['/dashboard', '/dashboard/projects/create', '/settings', '/editor', '/query', '/storage']).describe("The absolute path to navigate to.") 
  }),
  outputSchema: z.object({
    action: z.string()
  }),
}, async (input) => {
  return { action: `[NAVIGATE:${input.path}]` };
});

export const clickElementTool = ai.defineTool({
  name: "clickElementTool",
  description: "Simulates a click on a UI element designated by ID to change the visual context of the application for the user.",
  inputSchema: z.object({ 
    elementId: z.string().describe("The DOM id or EXACT visible text of the button to click") 
  }),
  outputSchema: z.object({
    action: z.string()
  }),
}, async (input) => {
  return { action: `[CLICK:${input.elementId}]` };
});

export const fluxTools = [getSchemaTool, runSqlTool, navigatePageTool, clickElementTool];
