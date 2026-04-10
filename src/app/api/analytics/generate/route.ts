import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getTablesForProject, getColumnsForTable, getProjectById } from '@/lib/data';
import { ai } from '@/ai/genkit';
import { z } from 'zod';

const OutputSchema = z.object({
    schema_analysis: z.string().describe("CRITICAL FIRST STEP: Explain step-by-step how you analyzed the schema to select valid tables, relations, and columns for this specific chart. You MUST write this before configuring widgets to ensure no hallucination."),
    widgets: z.array(z.object({
        title: z.string().describe("A short, descriptive title for the chart"),
        query: z.string().describe("The raw SQL query to execute (must be read-only SELECT)"),
        chart_type: z.string().describe("The best recharts type: 'bar', 'line', 'pie', 'area', 'scatter', 'radar', 'treemap', 'number', 'table'"),
        config: z.object({
            xAxisKey: z.string().describe("The column name to map to the X-axis (or nameKey for pie/treemap)"),
            dataKeys: z.array(z.string()).describe("The column name(s) to map to the Y-axis (or dataKey for pie/treemap). Multiple for stacked/multi-line."),
        })
    })).describe("An array of 1 to 4 distinct analytical widgets that best answer the user's overall prompt.")
});

export async function POST(req: Request) {
    const userId = await getCurrentUserId();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    try {
        const { prompt, projectId } = await req.json();
        if (!prompt || !projectId) return NextResponse.json({ error: 'Missing prompt or projectId' }, { status: 400 });

        const project = await getProjectById(projectId, userId);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // Get Database Schema Context
        const tables = await getTablesForProject(projectId, userId);
        let schemaString = '';
        for (const table of tables) {
            const columns = await getColumnsForTable(projectId, table.table_id, userId);
            const colDefs = columns.map(c => `${c.column_name} (${c.data_type})`).join(', ');
            schemaString += `Table: ${table.table_name}\nColumns: ${colDefs}\n\n`;
        }

        const dialectPrompt = project.dialect === 'mysql' ? 'MySQL' : 'PostgreSQL';

        const fullPrompt = `You are an expert Data Analyst & BI Developer.
The user wants to create an analytical dashboard widget for their database. You must generate the exact ${dialectPrompt} query to fetch this data, and determine the optimal Recharts visualization type.

### Database Schema:
${schemaString}

### User Request:
"${prompt}"

### Rules:
1. The query MUST be a valid, entirely read-only SELECT statement.
2. Do NOT qualify table names with database/schema prefixes! For example, do NOT write \`project_123\`.\`users\`. Just use the raw table name (e.g., SELECT * FROM users). In postgres, do NOT use "public.users".
3. If they ask for 'counts', use COUNT() and GROUP BY.
4. Ensure alias names in the query EXACTLY match the xAxisKey and dataKeys in your config.`;

        const response = await ai.generate({
            prompt: fullPrompt,
            output: { schema: OutputSchema }
        });

        if (!response.output) {
            throw new Error("AI failed to generate structural configuration.");
        }

        return NextResponse.json({ 
            success: true, 
            widgets: response.output.widgets
        });

    } catch (error: any) {
        console.error('Analytics Generate Error:', error);
        return NextResponse.json({ error: error.message || 'AI Generation failed' }, { status: 500 });
    }
}
