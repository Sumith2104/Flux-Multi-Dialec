
import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { sendEmail } from '@/lib/email';

export async function POST(request: Request) {
    try {
        const { email } = await request.json();

        if (!email) {
            return NextResponse.json({ error: 'Email is required' }, { status: 400 });
        }

        // 1. Generate Password Reset Link via Firebase Admin
        const link = await adminAuth.generatePasswordResetLink(email);

        // 2. Send via SMTP
        await sendEmail(
            email,
            'Reset your Fluxbase Password',
            `
            <div style="font-family: sans-serif; color: #333;">
                <h2>Password Reset Request</h2>
                <p>We received a request to reset the password for <b>${email}</b>.</p>
                <p>Click the button below to reset it:</p>
                <br/>
                <a href="${link}" style="background: #ea580c; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
                <br/><br/>
                <p>Or copy this link: <a href="${link}">${link}</a></p>
                <p>If you didn't ask for this, you can safely ignore this email.</p>
            </div>
            `
        );

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Password reset error:", error);
        if (error.code === 'auth/user-not-found') {
            // Return success even if user not found to prevent enumeration, 
            // OR return error if user prefers UX over security. 
            // In this specific "user request" context, explicit error is often preferred by users.
            return NextResponse.json({ error: 'No account found with this email.' }, { status: 404 });
        }
        return NextResponse.json({ error: 'Failed to send reset email.' }, { status: 500 });
    }
}
