import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { sendFeedbackEmail } from '@/lib/email';

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

        // Send email notification
        if (process.env.SMTP_USER) {
            try {
                await sendFeedbackEmail(
                    process.env.SMTP_USER,
                    mood,
                    message,
                    req.headers.get('referer'),
                    auth?.userId || 'Anonymous'
                );
            } catch (emailErr) {
                console.error('Failed to send feedback email:', emailErr);
                // Don't fail the whole request if email fails
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Feedback API error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
