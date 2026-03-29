import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthContextFromRequest(req);
        const body = await req.json();
        const { mood, message } = body;

        const pool = getPgPool();

        // Ensure feedback table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.feedback (
                id SERIAL PRIMARY KEY,
                user_id TEXT,
                mood INT,
                message TEXT,
                page TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            )
        `);

        await pool.query(
            `INSERT INTO fluxbase_global.feedback (user_id, mood, message, page) VALUES ($1, $2, $3, $4)`,
            [auth?.userId || 'anonymous', mood ?? null, message || null, req.headers.get('referer') || null]
        );

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Feedback API error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
