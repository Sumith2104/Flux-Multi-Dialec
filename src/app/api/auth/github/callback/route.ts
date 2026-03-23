import { NextRequest, NextResponse } from 'next/server';
import { getPgPool } from '@/lib/pg';
import { createSessionCookie } from '@/lib/auth';
import { sendWelcomeEmail } from '@/lib/email';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!code || !clientId || !clientSecret) {
        console.error("Missing GitHub OAuth variables or code");
        return NextResponse.redirect(new URL('/?error=GithubAuthFailed', request.url));
    }

    try {
        // 1. Exchange code for access token
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({
                client_id: clientId,
                client_secret: clientSecret,
                code,
            }),
        });
        
        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;
        
        if (!accessToken) {
            console.error("GitHub OAuth Error:", tokenData);
            return NextResponse.redirect(new URL('/?error=GithubTokenFailed', request.url));
        }

        // 2. Fetch User Profile
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });
        
        const userData = await userResponse.json();
        
        // 3. Fetch User Emails (GitHub sometimes hides primary email in profile)
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/vnd.github.v3+json',
            },
        });
        
        const emailsData = await emailsResponse.json();
        const primaryEmailObj = Array.isArray(emailsData) ? emailsData.find(e => e.primary) || emailsData[0] : null;
        const email = userData.email || (primaryEmailObj ? primaryEmailObj.email : null);
        
        if (!email) {
            return NextResponse.redirect(new URL('/?error=GithubEmailMissing', request.url));
        }

        const name = userData.name || userData.login || "GitHub User";
        const photoUrl = userData.avatar_url || null;

        const pool = getPgPool();

        // 4. Check if user exists
        const existing = await pool.query('SELECT id FROM fluxbase_global.users WHERE email = $1', [email]);
        let userId = '';
        let isNewUser = false;

        if (existing.rows.length > 0) {
            userId = existing.rows[0].id;
        } else {
            isNewUser = true;
            userId = crypto.randomUUID();
            await pool.query(
                `INSERT INTO fluxbase_global.users (id, email, display_name, photo_url) 
                 VALUES ($1, $2, $3, $4)`,
                [userId, email, name, photoUrl]
            );

            // Send Welcome Email natively (like Google Auth)
            sendWelcomeEmail(email, name).catch(console.error);
        }

        // 5. Create active session cookie identically to native login systems
        await createSessionCookie(userId);

        // 6. Redirect seamlessly
        const redirectPath = isNewUser ? '/pricing?onboarding=true' : '/dashboard/projects';
        return NextResponse.redirect(new URL(redirectPath, request.url));

    } catch (error) {
        console.error("GitHub Auth Exception:", error);
        return NextResponse.redirect(new URL('/?error=GithubServerException', request.url));
    }
}
