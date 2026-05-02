import { NextRequest } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import { ensureNotSuspended } from "@/lib/data";
import { pool } from "@/lib/pg";
import { requireProjectAccess } from "@/lib/project-auth";
import { quotePgIdentifier, quotePgProjectSchema } from "@/lib/sql-safety";

export const dynamic = 'force-dynamic';

// Toggle for heavy background tasks
const FAST_MODE = true;

export async function POST(req: NextRequest) {
    let body;

    try {
        body = await req.json();
    } catch {
        return new Response("Invalid JSON", { status: 400 });
    }

    const { customer_id, order_date, status, projectId: bodyProjectId } = body;
    const headerProjectId = req.headers.get('x-project-id');
    const projectId = bodyProjectId || headerProjectId;

    if (!projectId) {
        return new Response("projectId is required", { status: 400 });
    }

    // Security Check
    try {
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) return new Response("Unauthorized", { status: 401 });

        const project = await requireProjectAccess(projectId, auth, ['admin', 'developer']);
        if (project.dialect?.toLowerCase() === 'mysql') {
            return new Response("fast-insert is only supported for PostgreSQL projects", { status: 400 });
        }

        await ensureNotSuspended(project);
    } catch (err: any) {
        return new Response(err.message || "Forbidden", { status: err.status || 403 });
    }

    // Fast-fail validation
    if (
        typeof customer_id !== "number" ||
        typeof order_date !== "string" ||
        typeof status !== "string"
    ) {
        return new Response("Invalid payload: customer_id (int), order_date (str), status (str) required.", { status: 400 });
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
        return new Response(
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
            return new Response("Database Timeout", { status: 504 });
        }
        console.error('[Fast Insert Error]', err);
        return new Response("Database Error", { status: 500 });
    } finally {
        clearTimeout(timeout);
    }
}
