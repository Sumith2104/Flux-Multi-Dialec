import { NextRequest } from 'next/server';

interface OAuthConfig {
    clientId: string | undefined;
    clientSecret: string | undefined;
}

export function getBaseOrigin(request: NextRequest): string {
    // 1. Priority 1: Render's platform-provided public URL (Guaranteed correct on Render)
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
    }

    // 2. Priority 2: Standard header detection (standard for proxies/local)
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';
    const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
    
    let origin = `${proto}://${host}`;

    // 3. Fallback/Sync: Ensure protocol matches the environment strictly
    if (!host.includes('localhost') && !host.includes('127.0.0.1')) {
        origin = origin.replace('http://', 'https://');
    } else {
        origin = origin.replace('https://', 'http://');
    }

    return origin;
}

export function getOAuthConfig(request: NextRequest, provider: 'github' | 'google'): OAuthConfig & { redirectUri: string } {
    const baseOrigin = getBaseOrigin(request);
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000';

    // Determine Environment Prefix based on the detected host
    let envPrefix = 'LOCAL';
    if (host.includes('vercel.app')) {
        envPrefix = 'VERCEL';
    } else if (host.includes('render.com')) {
        envPrefix = 'RENDER';
    }

    const redirectUri = `${baseOrigin}/api/auth/${provider}/callback`.replace('//api', '/api');

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
