import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getTablesForProject, getColumnsForTable, getProjectById } from '@/lib/data';
import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || ''
});

const SuggestionSchema = z.object({
    suggestions: z.array(z.string()).length(3).describe("Exactly 3 distinct analytical quick-prompt suggestions based entirely on the provided schema.")
});

export async function POST(req: Request) {
    const userId = await getCurrentUserId();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    try {
        const { projectId } = await req.json();
        if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

        const project = await getProjectById(projectId, userId);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // 1. Check Cache
        const cacheKey = `ai_suggestions_${projectId}`;
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                return NextResponse.json({ success: true, suggestions: cached });
            }
        } catch (e) {
            console.error('Cache read error:', e);
        }

        // 2. Introspect Schema
        const tables = await getTablesForProject(projectId, userId);
        let schemaString = '';
        
        if (tables.length === 0) {
            return NextResponse.json({ 
                success: true, 
                suggestions: [
                    "Create your first database table",
                    "How to define table columns",
                    "Import an existing SQL schema"
                ] 
            });
        }

        for (const table of tables) {
            const columns = await getColumnsForTable(projectId, table.table_id, userId);
            const colDefs = columns.map(c => `${c.column_name} (${c.data_type})`).join(', ');
            schemaString += `Table: ${table.table_name}\nColumns: ${colDefs}\n\n`;
        }

        // 3. AI Generation
        const prompt = `You are a strict Data Analyst. 
The user needs "Quick Prompts" for their SQL dashboard.
Read their exact database schema below:

### Schema:
${schemaString}

Provide exactly 3 English questions that are fundamentally solvable using ONLY the tables and columns provided above.
If the schema only has 'users', ask about user counts. 
Do not suggest queries for tables that do not exist.`;

        const response = await ai.generate({
            prompt: prompt,
            output: { schema: SuggestionSchema }
        });

        if (!response.output || !response.output.suggestions) {
            throw new Error("AI failed to generate suggestions.");
        }

        // 4. Update Cache (60 seconds)
        try {
            await redis.set(cacheKey, JSON.stringify(response.output.suggestions), { ex: 60 });
        } catch (e) {
            console.error('Cache write error:', e);
        }

        return NextResponse.json({ 
            success: true, 
            suggestions: response.output.suggestions
        });

    } catch (error: any) {
        console.error('Analytics Suggestions Error:', error);
        return NextResponse.json({ error: error.message || 'AI Generation failed' }, { status: 500 });
    }
}
