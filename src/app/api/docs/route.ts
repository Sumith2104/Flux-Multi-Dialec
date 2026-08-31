import { NextRequest, NextResponse } from 'next/server';
import { generateOpenAPISpec } from '@/lib/openapi-generator';
import { getCorsOrigin, buildCorsHeaders } from '@/lib/cors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const spec = generateOpenAPISpec();
    return NextResponse.json(spec, {
        headers: {
            ...buildCorsHeaders(getCorsOrigin(req.headers.get('origin'))),
            'Cache-Control': 'public, max-age=300',
        },
    });
}