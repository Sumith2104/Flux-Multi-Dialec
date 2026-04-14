import { NextRequest } from "next/server";
import { pool } from "@/lib/pg";

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

    const { customer_id, order_date, status } = body;

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

        // Safe Parameterized Query (No String Building)
        const result = await pool.query({
            text: "INSERT INTO orders1 (customer_id, order_date, status) VALUES ($1, $2, $3)",
            values: [customer_id, order_date, status],
            signal: controller.signal,
        });

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
