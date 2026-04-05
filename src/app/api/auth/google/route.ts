import { NextRequest, NextResponse } from 'next/server';
import { getOAuthConfig } from '@/lib/oauth-config';

export async function GET(request: NextRequest) {
    const { clientId, redirectUri } = getOAuthConfig(request, 'google');
    
    if (!clientId) {
        return NextResponse.json({ error: "Google Client ID is not configured for this environment" }, { status: 500 });
    }

    const scope = 'openid email profile';
    
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=select_account`;

    return NextResponse.redirect(googleAuthUrl);
}
