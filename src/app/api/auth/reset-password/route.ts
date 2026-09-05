import { NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { sendPasswordResetEmail } from '@/lib/email';
import crypto from 'crypto';
import logger from '@/lib/logger';

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { email } = body;

        if (!email) {
            return NextResponse.json({ error: "Email is required" }, { status: 400 });
        }

        const pool = getPgPool();
        const userResult = await pool.query('SELECT id FROM fluxbase_global.users WHERE email = $1', [email]);

        if (userResult.rows.length === 0) {
            // Security Best Practice: Don't reveal if an email is registered or not
            return NextResponse.json({ success: true });
        }

        // Generate high-entropy reset token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60000); // 1 hour expiration

        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.password_resets (
                email VARCHAR(255) PRIMARY KEY,
                token VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL
            )
        `);

        await pool.query(`
            INSERT INTO fluxbase_global.password_resets (email, token, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT (email) DO UPDATE SET
            token = EXCLUDED.token,
            expires_at = EXCLUDED.expires_at
        `, [email, token, expiresAt]);

        const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
        const proto = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
        const detectedOrigin = `${proto}://${host}`;
        const baseUrl = detectedOrigin || process.env.NEXT_PUBLIC_APP_URL || 'https://www.fluxbasedb.me';
        const resetLink = `${baseUrl}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

        // Send beautifully styled email layout using our standardized Email template engine
        await sendPasswordResetEmail(email, resetLink);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        logger.error("Password reset request error:", error);
        return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
    }
}
