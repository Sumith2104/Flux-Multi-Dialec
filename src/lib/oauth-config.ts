import { NextRequest } from 'next/server';

interface OAuthConfig {
    clientId: string | undefined;
    clientSecret: string | undefined;
}

export function getOAuthConfig(request: NextRequest, provider: 'github' | 'google'): OAuthConfig & { redirectUri: string } {
    let origin = request.nextUrl.origin;
    
    // Force HTTPS for any production environment to prevent proxy-related protocol mismatches
    if (!origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        origin = origin.replace('http://', 'https://');
    }

    let envPrefix = 'LOCAL';

    if (origin.includes('vercel.app') || process.env.VERCEL) {
        envPrefix = 'VERCEL';
    } else if (origin.includes('render.com') || process.env.RENDER) {
        envPrefix = 'RENDER';
    }

    const redirectUri = `${origin}/api/auth/${provider}/callback`;

    if (provider === 'github') {
        return {
            clientId: process.env[`GITHUB_CLIENT_ID_${envPrefix}`] || process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env[`GITHUB_CLIENT_SECRET_${envPrefix}`] || process.env.GITHUB_CLIENT_SECRET,
            redirectUri
        };
    }

    if (provider === 'google') {
        return {
            clientId: process.env[`GOOGLE_CLIENT_ID_${envPrefix}`] || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            clientSecret: process.env[`GOOGLE_CLIENT_SECRET_${envPrefix}`] || process.env.GOOGLE_CLIENT_SECRET,
            redirectUri
        };
    }

    return { clientId: undefined, clientSecret: undefined, redirectUri };
}
