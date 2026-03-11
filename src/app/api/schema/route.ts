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
        let resultTables, resultViews, resultIndexes, resultFunctions, resultExtensions;
        
        if (project.dialect === 'mysql') {
            [resultTables, resultViews, resultIndexes, resultFunctions] = await Promise.all([
                engine.execute(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'project_${projectId}';`),
                engine.execute(`SELECT table_name FROM information_schema.views WHERE table_schema = 'project_${projectId}';`),
                engine.execute(`SELECT index_name, table_name FROM information_schema.statistics WHERE table_schema = 'project_${projectId}';`),
                engine.execute(`SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'project_${projectId}' AND routine_type = 'FUNCTION';`)
            ]);
            resultExtensions = { rows: [] }; // MySQL doesn't natively use Extensions in this standard format
        } else {
            [resultTables, resultViews, resultIndexes, resultFunctions, resultExtensions] = await Promise.all([
                engine.execute(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'project_${projectId}' ORDER BY table_name, ordinal_position;`),
                engine.execute(`SELECT table_name FROM information_schema.views WHERE table_schema = 'project_${projectId}';`),
                engine.execute(`SELECT indexname, tablename FROM pg_indexes WHERE schemaname = 'project_${projectId}';`),
                engine.execute(`SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'project_${projectId}' AND routine_type = 'FUNCTION';`),
                engine.execute(`SELECT extname FROM pg_extension;`)
            ]);
        }

        const schemaGraph: Record<string, any[]> = {};
        if (resultTables && resultTables.rows) {
            for (const row of resultTables.rows) {
                const tName = row.table_name || row.TABLE_NAME;
                const cName = row.column_name || row.COLUMN_NAME;
                const dType = row.data_type || row.DATA_TYPE;

                if (!schemaGraph[tName]) schemaGraph[tName] = [];
                schemaGraph[tName].push({ name: cName, type: dType });
            }
        }

        const views = (resultViews?.rows || []).map((r: any) => r.table_name || r.TABLE_NAME);
        const indexes = (resultIndexes?.rows || []).map((r: any) => ({
            name: r.indexname || r.index_name || r.INDEX_NAME, 
            table: r.tablename || r.table_name || r.TABLE_NAME
        }));
        const functions = (resultFunctions?.rows || []).map((r: any) => r.routine_name || r.ROUTINE_NAME);
        const extensions = (resultExtensions?.rows || []).map((r: any) => r.extname || r.EXTNAME);

        return NextResponse.json({
            success: true,
            tables: schemaGraph,
            views,
            indexes,
            functions,
            extensions
        });

    } catch (error: any) {
        console.error('[Schema API Error]', error);
        return NextResponse.json({ success: false, error: error.message || 'Internal Error' }, { status: 500 });
    }
}
