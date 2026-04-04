import { NextRequest } from 'next/server';

interface OAuthConfig {
    clientId: string | undefined;
    clientSecret: string | undefined;
}

export function getOAuthConfig(request: NextRequest, provider: 'github' | 'google'): OAuthConfig {
    const origin = request.nextUrl.origin;
    let envPrefix = 'LOCAL';

    if (origin.includes('vercel.app') || process.env.VERCEL) {
        envPrefix = 'VERCEL';
    } else if (origin.includes('render.com') || process.env.RENDER) {
        envPrefix = 'RENDER';
    }

    if (provider === 'github') {
        return {
            clientId: process.env[`GITHUB_CLIENT_ID_${envPrefix}`] || process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env[`GITHUB_CLIENT_SECRET_${envPrefix}`] || process.env.GITHUB_CLIENT_SECRET
        };
    }

    if (provider === 'google') {
        return {
            clientId: process.env[`GOOGLE_CLIENT_ID_${envPrefix}`] || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            clientSecret: process.env[`GOOGLE_CLIENT_SECRET_${envPrefix}`] || process.env.GOOGLE_CLIENT_SECRET
        };
    }

    return { clientId: undefined, clientSecret: undefined };
}
