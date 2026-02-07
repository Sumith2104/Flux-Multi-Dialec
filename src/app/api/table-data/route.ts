
import { NextResponse } from 'next/server';
import { getTableData } from '@/lib/data';
import { getCurrentUserId } from '@/lib/auth';

export const maxDuration = 60; // 1 minute

export async function GET(request: Request) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    const tableName = searchParams.get('tableName');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '100', 10);

    if (!projectId || !tableName) {
      return NextResponse.json({ error: 'Missing required query parameters: projectId and tableName' }, { status: 400 });
    }

    if (isNaN(page) || page < 1 || isNaN(pageSize) || pageSize < 1) {
        return NextResponse.json({ error: 'Invalid pagination parameters.' }, { status: 400 });
    }

    const data = await getTableData(projectId, tableName, page, pageSize);

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('Failed to fetch table data:', error);
    return NextResponse.json({ error: `An unexpected error occurred: ${error.message}` }, { status: 500 });
  }
}

    