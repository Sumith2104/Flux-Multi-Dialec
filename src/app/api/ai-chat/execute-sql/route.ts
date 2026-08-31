import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth';
import logger from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const auth = await getAuthContextFromRequest(req);
    if (!auth?.userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { query, projectId } = await req.json();
    if (!query || !projectId) {
      return NextResponse.json({ success: false, error: 'Missing query or projectId' }, { status: 400 });
    }

    // Only allow read-only queries
    const normalized = query.replace(/\s+/g, ' ').trim().toUpperCase();
    const forbidden = ['DROP ', 'DELETE ', 'TRUNCATE ', 'ALTER ', 'INSERT ', 'UPDATE ', 'CREATE ', 'GRANT ', 'REVOKE ', 'CALL '];
    for (const kw of forbidden) {
      if (normalized.startsWith(kw) || normalized.includes(';' + kw)) {
        return NextResponse.json({ success: false, error: 'Only read-only queries are allowed here. Use INJECT_SQL for modifications.' }, { status: 400 });
      }
    }

    const { SqlEngine } = await import('@/lib/sql-engine');
    const { getProjectById } = await import('@/lib/data');

    const project = await getProjectById(projectId, auth.userId);
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const engine = new SqlEngine(projectId, auth.userId, undefined, undefined, project);
    const result = await engine.execute(query);

    // Return up to 50 rows to keep the chat response manageable
    const rows = (result.rows || []).slice(0, 50);
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    const rowCount = result.rows?.length || 0;

    return NextResponse.json({
      success: true,
      columns,
      rows,
      rowCount,
      truncated: rowCount > 50
    });
  } catch (error: any) {
    logger.error('[AI Execute SQL] Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Query execution failed.' }, { status: 500 });
  }
}
