import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth';
import { getProjectById } from '@/lib/data';
import { getPgPool } from '@/lib/pg';

export async function POST(req: Request) {
    const userId = await getCurrentUserId();
    if (!userId) return new NextResponse('Unauthorized', { status: 401 });

    try {
        const { projectId, query } = await req.json();
        if (!projectId || !query) return NextResponse.json({ error: 'Missing projectId or query' }, { status: 400 });

        const project = await getProjectById(projectId, userId);
        if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

        // DDL/DML Guard: Prevent destructive queries in Analytics
        const isDestructive = /^\s*(insert|update|delete|drop|alter|create|truncate|grant|revoke|replace)/i.test(query);
        if (isDestructive) {
            return NextResponse.json({ error: 'Analytics queries must be SELECT operations only.' }, { status: 403 });
        }

        // EXECUTE QUERY on tenant database
        if (project.dialect === 'mysql') {
            const { getMysqlPool } = await import('@/lib/mysql');
            const mysqlPool = getMysqlPool();
            // Enforce schema sandbox natively
            await mysqlPool.query(`USE \`project_${projectId}\``);
            const [rows]: any = await mysqlPool.query(query);
            return NextResponse.json({ data: Array.isArray(rows) ? rows : [rows] });
        } else {
            const pool = getPgPool();
            // Secure Postgres execution (Setting search_path strictly to their schema)
            const client = await pool.connect();
            try {
                await client.query(`SET search_path TO "project_${projectId}"`);
                const res = await client.query(query);
                return NextResponse.json({ data: res.rows });
            } finally {
                client.release();
            }
        }

    } catch (e: any) {
        console.error('Analytics Execute Error:', e);
        return NextResponse.json({ error: e.message || 'Execution failed' }, { status: 500 });
    }
}
