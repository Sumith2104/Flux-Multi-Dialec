import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json({
    resource: 'https://www.fluxbasedb.me/api/mcp',
    authorization_servers: ['https://www.fluxbasedb.me'],
    scopes_supported: ['read', 'write'],
    bearer_methods_supported: ['header']
  }, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=86400'
    }
  });
}
