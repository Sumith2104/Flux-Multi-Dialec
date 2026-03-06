import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import { SqlEngine } from '@/lib/sql-engine';
import { getProjectById } from '@/lib/data';

// Response Schema: { tables: { tableName: ["col1", "col2"] } }
export async function GET(request: Request) {
    try {
        const auth = await getAuthContextFromRequest(request);
        if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        let projectId = searchParams.get('projectId');

        if (auth.allowedProjectId && projectId !== auth.allowedProjectId) {
            projectId = auth.allowedProjectId;
        }

        if (!projectId) {
            return NextResponse.json({ success: false, error: 'Missing projectId' }, { status: 400 });
        }

        const project = await getProjectById(projectId, auth.userId);
        if (!project) {
            return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
        }

        const engine = new SqlEngine(projectId, auth.userId);

        // Fetch tables and their columns efficiently
        // We do not use the AST here because we want raw information_schema querying
        // We use the tenant isolation capabilities of the engine.
        const dbQuery = `
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE table_schema = 'project_${projectId}'
            ORDER BY table_name, ordinal_position;
        `;

        // Use the raw connection execution to bypass AST validation since this is an internal query
        let result;
        if (project.dialect === 'mysql') {
            result = await engine.execute(`
                SELECT table_name, column_name, data_type 
                FROM information_schema.columns 
                WHERE table_schema = 'project_${projectId}';
            `);
        } else {
            result = await engine.execute(dbQuery);
        }

        const schemaGraph: Record<string, any[]> = {};

        if (result && result.rows) {
            for (const row of result.rows) {
                const tName = row.table_name || row.TABLE_NAME;
                const cName = row.column_name || row.COLUMN_NAME;
                const dType = row.data_type || row.DATA_TYPE;

                if (!schemaGraph[tName]) schemaGraph[tName] = [];
                schemaGraph[tName].push({ name: cName, type: dType });
            }
        }

        return NextResponse.json({
            success: true,
            tables: schemaGraph
        });

    } catch (error: any) {
        console.error('[Schema API Error]', error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Error' }, { status: 500 });
    }
}
