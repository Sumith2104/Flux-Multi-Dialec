import { createSessionCookie } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const { idToken, displayName, type = 'login' } = await request.json();

        if (!idToken) {
            return NextResponse.json({ error: 'Missing ID Token' }, { status: 400 });
        }

        // Verify token to get user details
        const { adminAuth } = await import('@/lib/firebase-admin');
        const decodedToken = await adminAuth.verifyIdToken(idToken);
        const { uid, email, name, picture } = decodedToken;

        if (!email) {
            console.error("No email in token");
            return NextResponse.json({ error: 'Invalid token: No email' }, { status: 400 });
        }

        // Database Flow Check
        const { createUserProfile, updateUserProfile } = await import('@/lib/data');
        const { sendEmail } = await import('@/lib/email');
        const { logLoginActivity } = await import('@/lib/activity');

        const userAgent = request.headers.get('user-agent') || 'Unknown Device';
        const ip = request.headers.get('x-forwarded-for') || 'Unknown IP';

        try {
            if (type === 'signup') {
                // Strict Signup: Expect new user
                await createUserProfile(uid, email, displayName || name, picture);

                // Send Welcome Email
                await sendEmail(
                    email,
                    'Welcome to Fluxbase! 🚀',
                    `
                    <div style="font-family: sans-serif; color: #333;">
                        <h1>Welcome to Fluxbase, ${displayName || name || 'Explorer'}!</h1>
                        <p>We're thrilled to have you on board. Fluxbase is your new home for intelligent data management.</p>
                        <p>Get started by creating your first project and exploring our AI-powered SQL editor.</p>
                        <br/>
                        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard" style="background: #ea580c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Go to Dashboard</a>
                    </div>
                    `
                );

            } else {
                // Login Flow
                // Try to update existing profile
                try {
                    await updateUserProfile(uid, displayName || name, picture);
                } catch (updateError: any) {
                    // Auto-heal: If user has valid token but no profile (legacy user or sync issue), create it.
                    if (updateError.message.includes('not found')) {
                        console.log(`Auto-healing missing profile for user ${email}`);
                        await createUserProfile(uid, email, displayName || name, picture);
                    } else {
                        throw updateError;
                    }
                }

                // Log Activity
                await logLoginActivity(uid, email, ip, userAgent);

                // Send Login Alert (Async, don't block response)
                sendEmail(
                    email,
                    'New Login to Fluxbase',
                    `
                    <div style="font-family: sans-serif; color: #333;">
                        <h2>New Login Detected</h2>
                        <p>We noticed a new login to your account <b>${email}</b>.</p>
                        <ul>
                            <li><b>Time:</b> ${new Date().toLocaleString()}</li>
                            <li><b>IP Address:</b> ${ip}</li>
                            <li><b>Device:</b> ${userAgent}</li>
                        </ul>
                        <p>If this was you, you can ignore this email.</p>
                    </div>
                    `
                ).catch(err => console.error("Failed to send login alert:", err));
            }
        } catch (dbError: any) {
            console.error('Database Check Failed:', dbError);

            // Handle specific cases based on user request ("before login... check database")
            if (dbError.message.includes('not found')) {
                return NextResponse.json({ error: 'User account not found. Please Sign Up first.' }, { status: 404 });
            }
            if (dbError.message.includes('already exists')) {
                // For signup, if they exist, it's usually fine to proceed as login, 
                // BUT user asked for "checks". Let's inform them.
                return NextResponse.json({ error: 'Account already exists. Please Log In.' }, { status: 409 });
            }

            // Fallback for other DB errors
            throw dbError;
        }

        await createSessionCookie(idToken);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Login error:', error);
        return NextResponse.json({ error: error.message || 'Authentication failed' }, { status: 401 });
    }
}
