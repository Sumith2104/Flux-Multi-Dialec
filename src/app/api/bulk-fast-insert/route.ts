import { NextRequest } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import { ensureNotSuspended } from "@/lib/data";
import { pool } from "@/lib/pg";
import { requireProjectAccess } from "@/lib/project-auth";
import { quotePgIdentifier, quotePgProjectSchema } from "@/lib/sql-safety";

/**
 * HIGH-THROUGHPUT BULK INSERT ENDPOINT
 * 
 * Optimized for:
 * - 0ms middleware overhead (excluded in middleware.ts)
 * - Connection reuse via global pool
 * - DB-native JSON-to-set transformation (jsonb_to_recordset)
 * - Minimal response latency
 */

export const runtime = 'nodejs'; // Use Node.js for persistent pool support
export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, x-project-id, x-api-key, apiKey, projectId',
    'Access-Control-Max-Age': '86400',
};

function sendResponse(body: string | null, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
    return new Response(body, { ...init, headers });
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

export async function POST(req: NextRequest) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s watchdog

    try {
        // 1. Fast JSON Extraction (No heavy validation)
        const data = await req.json();
        
        if (!Array.isArray(data)) {
            return sendResponse('Payload must be a JSON array', { status: 400 });
        }

        const { searchParams } = new URL(req.url);
        const projectId = req.headers.get('x-project-id') || searchParams.get('projectId');

        if (!projectId) {
            return sendResponse("projectId is required (header or param)", { status: 400 });
        }

        // Security Check
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) return sendResponse("Unauthorized", { status: 401 });

        const project = await requireProjectAccess(projectId, auth, ['admin', 'developer']);
        if (project.dialect?.toLowerCase() === 'mysql') {
            return sendResponse("bulk-fast-insert is only supported for PostgreSQL projects", { status: 400 });
        }

        await ensureNotSuspended(project);

        if (data.length === 0) {
            return sendResponse(null, { status: 204 });
        }

        // 2. Execute Bulk Insert using jsonb_to_recordset
        // Note: The cast ($1::jsonb) is crucial for performance and safety.
        // The column types must match the 'orders1' table schema exactly.
        const schemaIdent = quotePgProjectSchema(projectId);
        const tableIdent = quotePgIdentifier('orders1', 'tableName');
        const query = `
            INSERT INTO ${schemaIdent}.${tableIdent} (customer_id, order_date, status)
            SELECT * FROM jsonb_to_recordset($1::jsonb)
            AS x(customer_id int, order_date timestamptz, status text);
        `;

        await pool.query(query, [JSON.stringify(data)]);

        // 3. Minimal Success Response
        return sendResponse(null, { status: 200 });

    } catch (error: any) {
        if (error.name === 'AbortError') {
            return sendResponse('Request Timeout', { status: 504 });
        }
        console.error('[Bulk Fast Insert Error]:', error.message);
        return sendResponse(error.message || 'Internal Error', { status: 500 });
    } finally {
        clearTimeout(timeoutId);
    }
}
