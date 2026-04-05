import { NextRequest } from 'next/server';

interface OAuthConfig {
    clientId: string | undefined;
    clientSecret: string | undefined;
}

export function getOAuthConfig(request: NextRequest, provider: 'github' | 'google'): OAuthConfig & { redirectUri: string } {
    // Standard industry pattern for detecting the public URL behind a proxy (Render/Vercel/Local)
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    const baseOrigin = `${proto}://${host}`;

    // 2. Determine Environment Prefix based on the detected host
    let envPrefix = 'LOCAL';
    if (host.includes('vercel.app')) {
        envPrefix = 'VERCEL';
    } else if (host.includes('render.com')) {
        envPrefix = 'RENDER';
    }

    const redirectUri = `${baseOrigin}/api/auth/${provider}/callback`.replace('//api', '/api');

    // DEBUG LOG: This will show up in your Render Logs to see exactly what URI is being sent
    // console.log(`[OAuth Debug] Provider: ${provider}, Env: ${envPrefix}, Origin: ${baseOrigin}, RedirectURI: ${redirectUri}`);

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
