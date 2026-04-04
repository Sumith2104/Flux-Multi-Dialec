import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
        return NextResponse.json({ error: "NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured" }, { status: 500 });
    }

    const redirectUri = `${request.nextUrl.origin}/api/auth/google/callback`;
    const scope = 'openid email profile';
    
    // Construct the Google OAuth authorization URL
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=select_account`;

    return NextResponse.redirect(googleAuthUrl);
}
