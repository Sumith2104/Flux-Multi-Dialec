import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { getAuthContextFromRequest } from '@/lib/auth';
import { sendClassifiedFeedbackEmail } from '@/lib/email';
import { classifyFeedbackMessage } from '@/lib/feedback-classifier';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const auth = await getAuthContextFromRequest(req);
        const body = await req.json();
        const { mood, message } = body;

        if (!message) {
            return NextResponse.json({ success: false, error: 'Message is required' }, { status: 400 });
        }

        const pool = getPgPool();

        // 1. Ensure all schema tables exist and match the user's diagram
        await pool.query(`
            -- client_queries
            CREATE TABLE IF NOT EXISTS fluxbase_global.client_queries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                message TEXT NOT NULL,
                processed BOOLEAN DEFAULT FALSE
            );

            -- classified_queries
            CREATE TABLE IF NOT EXISTS fluxbase_global.classified_queries (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                query_id UUID REFERENCES fluxbase_global.client_queries(id) ON DELETE CASCADE,
                message TEXT NOT NULL,
                intent VARCHAR(100),
                priority VARCHAR(50),
                intent_confidence DOUBLE PRECISION,
                priority_confidence DOUBLE PRECISION,
                flagged BOOLEAN DEFAULT FALSE,
                error TEXT
            );
        `);

        // Handle dropping old SERIAL-id feedback table if it exists
        await pool.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 
                    FROM information_schema.columns 
                    WHERE table_schema = 'fluxbase_global' 
                      AND table_name = 'feedback' 
                      AND column_name = 'id' 
                      AND data_type = 'integer'
                ) THEN
                    DROP TABLE fluxbase_global.feedback CASCADE;
                END IF;
            END $$;
        `);

        // Ensure new feedback table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.feedback (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                query TEXT NOT NULL,
                expected_intent VARCHAR(100),
                expected_priority VARCHAR(50),
                source VARCHAR(255)
            );
        `);

        // 2. Insert query into client_queries
        const clientQueryRes = await pool.query(
            `INSERT INTO fluxbase_global.client_queries (message, processed) VALUES ($1, false) RETURNING id`,
            [message]
        );
        const queryId = clientQueryRes.rows[0].id;

        // 3. Insert query into feedback table (as benchmark/evaluation placeholder)
        const referer = req.headers.get('referer') || '';
        const sourceStr = mood ? `Mood: ${mood} | Referer: ${referer}` : referer || 'Widget';
        await pool.query(
            `INSERT INTO fluxbase_global.feedback (query, source) VALUES ($1, $2)`,
            [message, sourceStr.slice(0, 255)]
        );

        // 4. Classify query using external AI service
        let classification;
        let classificationError = null;

        try {
            classification = await classifyFeedbackMessage(message);
        } catch (err: any) {
            console.error('Failed to run AI classifier:', err);
            classificationError = err.message || 'Unknown classification error';
        }

        // 5. Store results in classified_queries
        if (classification && !classificationError) {
            await pool.query(
                `INSERT INTO fluxbase_global.classified_queries (
                    query_id, message, intent, priority, intent_confidence, priority_confidence, flagged, error
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)`,
                [
                    queryId,
                    message,
                    classification.intent,
                    classification.priority,
                    classification.intent_confidence,
                    classification.priority_confidence,
                    classification.flagged
                ]
            );

            // Update processed status
            await pool.query(
                `UPDATE fluxbase_global.client_queries SET processed = true WHERE id = $1`,
                [queryId]
            );
        } else {
            // Save classification failure
            await pool.query(
                `INSERT INTO fluxbase_global.classified_queries (
                    query_id, message, error, flagged
                ) VALUES ($1, $2, $3, false)`,
                [queryId, message, classificationError || 'Failed to generate classification']
            );
        }

        // 6. Send email notification
        if (process.env.SMTP_USER) {
            try {
                const mailRecipient = process.env.SMTP_USER;
                const userIdStr = auth?.userId || 'Anonymous';
                
                if (classification && !classificationError) {
                    await sendClassifiedFeedbackEmail(
                        mailRecipient,
                        message,
                        classification.intent,
                        classification.priority,
                        classification.intent_confidence,
                        classification.priority_confidence,
                        classification.flagged,
                        userIdStr,
                        mood,
                        referer
                    );
                } else {
                    // Fallback to basic email if AI classification failed
                    const fallbackHtml = `
                        <div style="text-align: left; background: rgba(255,255,255,0.03); border-radius: 12px; padding: 24px; border: 1px solid #27272a;">
                            <p style="margin: 0 0 16px 0; font-size: 14px; color: #f87171;">⚠️ AI Classification Failed: ${classificationError || 'Unknown error'}</p>
                            <p style="margin: 0 0 8px 0; font-size: 14px; color: #71717a;">Message:</p>
                            <p style="margin: 0; font-size: 16px; color: #ffffff;">${message}</p>
                        </div>
                    `;
                    const { sendEmail } = await import('@/lib/email');
                    await sendEmail(mailRecipient, `[Fluxbase Feedback] AI Classification Failed for feedback from ${userIdStr}`, fallbackHtml);
                }
            } catch (emailErr) {
                console.error('Failed to send feedback email:', emailErr);
                // Don't fail the client request if email fails
            }
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        console.error('Feedback API error:', e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
