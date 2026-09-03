import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { createSessionCookie, createRefreshToken } from '@/lib/auth';
import crypto from 'crypto';
import logger from '@/lib/logger';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');
    const email = searchParams.get('email');
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin || 'http://localhost:3000';

    if (!token || !email) {
        return NextResponse.redirect(`${baseUrl}/?error=missing_token`);
    }

    try {
        const pool = getPgPool();

        // 1. Ensure table exists
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fluxbase_global.magic_logins (
                email VARCHAR(255) PRIMARY KEY,
                otp_code VARCHAR(10) NOT NULL,
                magic_token VARCHAR(255) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            )
        `);

        // 2. Look up magic token
        const result = await pool.query(
            'SELECT otp_code, magic_token, expires_at FROM fluxbase_global.magic_logins WHERE email = $1 AND magic_token = $2',
            [email, token]
        );

        if (result.rows.length === 0) {
            return NextResponse.redirect(`${baseUrl}/?error=invalid_or_consumed_token`);
        }

        const record = result.rows[0];
        if (new Date() > new Date(record.expires_at)) {
            await pool.query('DELETE FROM fluxbase_global.magic_logins WHERE email = $1', [email]);
            return NextResponse.redirect(`${baseUrl}/?error=expired_token`);
        }

        // 3. Clear consumed token (single-use)
        await pool.query('DELETE FROM fluxbase_global.magic_logins WHERE email = $1', [email]);

        // 4. Find or create user
        let userResult = await pool.query(
            'SELECT id, display_name, two_factor_enabled FROM fluxbase_global.users WHERE email = $1',
            [email]
        );

        let user;
        if (userResult.rows.length === 0) {
            const userId = crypto.randomUUID();
            const displayName = email.split('@')[0];
            await pool.query(
                'INSERT INTO fluxbase_global.users (id, email, display_name) VALUES ($1::text, $2, $3)',
                [userId, email, displayName]
            );
            user = { id: userId, display_name: displayName, two_factor_enabled: false };
        } else {
            user = userResult.rows[0];
        }

        // 5. Check 2FA
        if (user.two_factor_enabled) {
            return NextResponse.redirect(`${baseUrl}/?requires2FA=true&userId=${user.id}`);
        }

        // 6. Create session cookie and redirect to dashboard
        await createSessionCookie(user.id, true);

        const refreshToken = await createRefreshToken(user.id);
        const isProd = process.env.NODE_ENV === 'production';
        const response = NextResponse.redirect(`${baseUrl}/dashboard/projects`);
        response.cookies.set('refresh_token', refreshToken, {
            httpOnly: true,
            secure: isProd,
            path: '/',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60,
        });
        return response;
    } catch (error: any) {
        logger.error("Magic Login Error:", error);
        return NextResponse.redirect(`${baseUrl}/?error=authentication_failed`);
    }
}
