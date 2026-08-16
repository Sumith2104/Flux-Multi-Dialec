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
    const { getProjectById } = await import('@/lib/data');
    const { getProjectDbAndSchema } = await import('@/lib/tenant-pools');

    const userId = await getCurrentUserId() || 'system_ai';
    const project = await getProjectById(input.projectId, userId);
    if (!project) throw new Error("Project not found");

    const { dbName, schemaName } = getProjectDbAndSchema(project);
    const isMysql = project.dialect?.toLowerCase() === 'mysql';
    const targetSchemaOrDb = isMysql ? dbName : schemaName;
    const engine = new SqlEngine(input.projectId, userId, undefined, undefined, project); 

    const query = isMysql
      ? `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = ? AND table_name NOT LIKE '\\_flux\\_internal\\_%';`
      : `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name NOT LIKE '\\_flux\\_internal\\_%';`;

    const tables = await engine.execute(query, [targetSchemaOrDb]);
    
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
    path: z.enum([
      '/dashboard', 
      '/dashboard/projects/create', 
      '/settings', 
      '/settings/api-keys', 
      '/settings/webhooks', 
      '/editor', 
      '/query', 
      '/storage'
    ]).describe("The absolute path to navigate to.") 
  }),
  outputSchema: z.object({
    action: z.string()
  }),
}, async (input) => {
  return { action: `[NAVIGATE:${input.path}]` };
});

export const clickElementTool = ai.defineTool({
  name: "clickElementTool",
  description: "Simulates a click on a UI element designated by ID or visible text to change the visual context of the application for the user.",
  inputSchema: z.object({ 
    elementId: z.string().describe("The DOM id or EXACT visible text of the button or link to click") 
  }),
  outputSchema: z.object({
    action: z.string()
  }),
}, async (input) => {
  return { action: `[CLICK:${input.elementId}]` };
});

export const typeInputTool = ai.defineTool({
  name: "typeInputTool",
  description: "Simulates typing text into a form input or textarea. Call this when you need to fill out a field (e.g. typing a project name, a table name, a query, or other inputs).",
  inputSchema: z.object({
    value: z.string().describe("The text value to type into the field."),
    locator: z.string().describe("The label, placeholder text, ID, or name of the input field to type into.")
  }),
  outputSchema: z.object({
    action: z.string()
  }),
}, async (input) => {
  return { action: `[TYPE:${input.value}:${input.locator}]` };
});

export const createProjectTool = ai.defineTool({
  name: "createProjectTool",
  description: "Creates a new database project in Fluxbase. Always requires explicit user approval before creation.",
  inputSchema: z.object({
    projectName: z.string().describe("The name of the new project to create."),
    dialect: z.enum(['postgresql', 'mysql']).describe("The database dialect to use ('postgresql' or 'mysql')."),
  }),
  outputSchema: z.object({
    action: z.string()
  }),
}, async (input) => {
  return { action: `[CONFIRM_ACTION:CREATE_PROJECT:${input.projectName}:${input.dialect}]` };
});

export const fluxTools = [getSchemaTool, runSqlTool, navigatePageTool, clickElementTool, typeInputTool, createProjectTool];
