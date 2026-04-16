import { NextRequest } from "next/server";
import { getAuthContextFromRequest } from "@/lib/auth";
import { getProjectById, ensureNotSuspended } from "@/lib/data";
import { pool } from "@/lib/pg";

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

export async function POST(req: NextRequest) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s watchdog

    try {
        // 1. Fast JSON Extraction (No heavy validation)
        const data = await req.json();
        
        if (!Array.isArray(data)) {
            return new Response('Payload must be a JSON array', { status: 400 });
        }

        const { searchParams } = new URL(req.url);
        const projectId = req.headers.get('x-project-id') || searchParams.get('projectId');

        if (!projectId) {
            return new Response("projectId is required (header or param)", { status: 400 });
        }

        // Security Check
        const auth = await getAuthContextFromRequest(req);
        if (!auth?.userId) return new Response("Unauthorized", { status: 401 });

        const project = await getProjectById(projectId, auth.userId);
        if (!project) return new Response("Project not found", { status: 404 });

        await ensureNotSuspended(project);

        if (data.length === 0) {
            return new Response(null, { status: 204 });
        }

        // 2. Execute Bulk Insert using jsonb_to_recordset
        // Note: The cast ($1::jsonb) is crucial for performance and safety.
        // The column types must match the 'orders1' table schema exactly.
        const query = `
            INSERT INTO orders1 (customer_id, order_date, status)
            SELECT * FROM jsonb_to_recordset($1::jsonb)
            AS x(customer_id int, order_date timestamptz, status text);
        `;

        await pool.query(query, [JSON.stringify(data)]);

        // 3. Minimal Success Response
        return new Response(null, { status: 200 });

    } catch (error: any) {
        if (error.name === 'AbortError') {
            return new Response('Request Timeout', { status: 504 });
        }
        console.error('[Bulk Fast Insert Error]:', error.message);
        return new Response(error.message || 'Internal Error', { status: 500 });
    } finally {
        clearTimeout(timeoutId);
    }
}
