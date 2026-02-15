
import { NextResponse } from 'next/server';
import { getTableData } from '@/lib/data';
import { trackApiRequest } from '@/lib/analytics';
import { getCurrentUserId, getAuthContextFromRequest } from '@/lib/auth';

export const maxDuration = 60; // 1 minute

export async function GET(request: Request) {
  try {
    const auth = await getAuthContextFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }
    const { userId, allowedProjectId } = auth;

    const { searchParams } = new URL(request.url);
    let projectId = searchParams.get('projectId');
    const tableName = searchParams.get('tableName');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '100', 10);

    // Enforce Scope
    if (allowedProjectId) {
      if (projectId && projectId !== allowedProjectId) {
        return NextResponse.json({ error: `API Key is scoped to project ${allowedProjectId}, but request specified ${projectId}` }, { status: 403 });
      }
      if (!projectId) {
        projectId = allowedProjectId;
      }
    }

    if (!projectId || !tableName) {
      return NextResponse.json({ error: 'Missing required query parameters: projectId and tableName' }, { status: 400 });
    }

    if (isNaN(page) || page < 1 || isNaN(pageSize) || pageSize < 1) {
      return NextResponse.json({ error: 'Invalid pagination parameters.' }, { status: 400 });
    }

    const data = await getTableData(projectId, tableName, page, pageSize, userId);
    if (data.rows.length > 0) {
      console.error(`[DEBUG] /api/table-data keys for ${tableName}:`, Object.keys(data.rows[0]));
      console.error(`[DEBUG] /api/table-data sample for ${tableName}:`, JSON.stringify(data.rows[0]));
    } else {
      console.error(`[DEBUG] /api/table-data No rows found for ${tableName}`);
    }

    // Track Analytics (Mainly for read operations)
    await trackApiRequest(projectId, 'storage_read');
    await trackApiRequest(projectId, 'api_call');

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Failed to fetch table data:', error);
    return NextResponse.json({ error: `An unexpected error occurred: ${error.message}` }, { status: 500 });
  }
}
