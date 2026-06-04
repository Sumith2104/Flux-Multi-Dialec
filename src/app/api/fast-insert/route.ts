import { NextRequest } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import { ensureNotSuspended } from "@/lib/data";
import { pool } from "@/lib/pg";
import { requireProjectAccess } from "@/lib/project-auth";
import { quotePgIdentifier, quotePgProjectSchema } from "@/lib/sql-safety";

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
    let body;

    try {
        body = await req.json();
    } catch {
        return sendResponse("Invalid JSON", { status: 400 });
    }

    const { customer_id, order_date, status, projectId: bodyProjectId } = body;
    const headerProjectId = req.headers.get('x-project-id');
    const projectId = bodyProjectId || headerProjectId;

    if (!projectId) {
        return sendResponse("projectId is required", { status: 400 });
    }

    // Security Check
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) return sendResponse("Unauthorized", { status: 401 });

        const project = await requireProjectAccess(projectId, auth, ['admin', 'developer']);
        if (project.dialect?.toLowerCase() === 'mysql') {
            return sendResponse("fast-insert is only supported for PostgreSQL projects", { status: 400 });
        }

        await ensureNotSuspended(project);
    } catch (err: any) {
        return sendResponse(err.message || "Forbidden", { status: err.status || 403 });
    }

    // Fast-fail validation
    if (
        typeof customer_id !== "number" ||
        typeof order_date !== "string" ||
        typeof status !== "string"
    ) {
        return sendResponse("Invalid payload: customer_id (int), order_date (str), status (str) required.", { status: 400 });
    }

    // DB Watchdog
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
        const start = Date.now();
        const schemaIdent = quotePgProjectSchema(projectId);
        const tableIdent = quotePgIdentifier('orders1', 'tableName');

        // Safe Parameterized Query (No String Building)
        const result = await pool.query(
            `INSERT INTO ${schemaIdent}.${tableIdent} (customer_id, order_date, status) VALUES ($1, $2, $3)`,
            [customer_id, order_date, status]
        );

        const duration = Date.now() - start;

        // Minimal Response
        return sendResponse(
            JSON.stringify({ 
                success: true, 
                t: duration,
                rowCount: result.rowCount 
            }),
            { 
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );

    } catch (err: any) {
        if (err.name === 'AbortError') {
            return sendResponse("Database Timeout", { status: 504 });
        }
        console.error('[Fast Insert Error]', err);
        return sendResponse("Database Error", { status: 500 });
    } finally {
        clearTimeout(timeout);
    }
}
