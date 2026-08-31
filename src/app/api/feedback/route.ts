import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { sendFeedbackEmail } from '@/lib/email';
import logger from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthContextFromRequest(req);
        const body = await req.json();
        const { mood, message } = body;

        if (!message) {
            return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

        let storedInSupabase = false;

        // 1. If Supabase keys are configured, insert directly into external Supabase client_queries table
        if (supabaseUrl && supabaseKey) {
            try {
                logger.info('[Feedback] Inserting query into external Supabase client_queries...');
                const cleanedUrl = supabaseUrl.endsWith('/') ? supabaseUrl.slice(0, -1) : supabaseUrl;
                const supabaseRes = await fetch(`${cleanedUrl}/rest/v1/client_queries`, {
                    method: 'POST',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        message: message,
                        processed: false
                    })
                });

                if (!supabaseRes.ok) {
                    const errText = await supabaseRes.text();
                    throw new Error(`Supabase insert failed with status ${supabaseRes.status}: ${errText}`);
                }

                logger.info('[Feedback] Successfully saved query to Supabase client_queries!');
                storedInSupabase = true;
            } catch (supabaseErr: any) {
                logger.error('[Feedback] Supabase external insert error:', supabaseErr.message || supabaseErr);
                // Fallback to local DB storage if Supabase fails so we don't lose the feedback
            }
        }

        // 2. Fallback / Local Database Storage
        // If Supabase was not configured, or if the insert failed, store it in the local database
        if (!storedInSupabase) {
            const pool = getPgPool();
            
            // Ensure local client_queries table exists
            await pool.query(`
                CREATE TABLE IF NOT EXISTS fluxbase_global.client_queries (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    message TEXT NOT NULL,
                    processed BOOLEAN DEFAULT FALSE
                );
            `);

            await pool.query(
                `INSERT INTO fluxbase_global.client_queries (message, processed) VALUES ($1, false)`,
                [message]
            );
            logger.info('[Feedback] Saved query to local DB client_queries.');
        }

        // 3. Send email notification (keeps SMTP notification intact as requested)
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
                logger.error('Failed to send feedback email:', emailErr);
                // Don't fail the client request if email fails
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        logger.error('Feedback API error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
