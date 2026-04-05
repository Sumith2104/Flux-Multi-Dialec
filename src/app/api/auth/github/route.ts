import { NextRequest, NextResponse } from 'next/server';
import { getOAuthConfig } from '@/lib/oauth-config';

export async function GET(request: NextRequest) {
    const { clientId, redirectUri } = getOAuthConfig(request, 'github');
    
    if (!clientId) {
        return NextResponse.json({ error: "GitHub Client ID is not configured for this environment" }, { status: 500 });
    }

    const scope = 'read:user user:email';
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

    return NextResponse.redirect(githubAuthUrl);
}
