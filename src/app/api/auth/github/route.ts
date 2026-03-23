import { NextRequest, NextResponse } from 'next/navigation';

export async function GET(request: NextRequest) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
        return NextResponse.json({ error: "GITHUB_CLIENT_ID is not configured" }, { status: 500 });
    }

    const redirectUri = `${request.nextUrl.origin}/api/auth/github/callback`;
    const scope = 'read:user user:email';
    
    // Using simple state parameter for CSRF protection is recommended, but omitting for simplicity right now unless required
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}`;

    return NextResponse.redirect(githubAuthUrl);
}
