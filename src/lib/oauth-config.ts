import { NextRequest } from 'next/server';

interface OAuthConfig {
    clientId: string | undefined;
    clientSecret: string | undefined;
}

export function getOAuthConfig(request: NextRequest, provider: 'github' | 'google'): OAuthConfig & { redirectUri: string } {
    // 1. Determine the Origin with priority:
    //    A. Render/Vercel platform-provided external URL (Best for proxies)
    //    B. NEXT_PUBLIC_APP_URL (User's manually specified base)
    //    C. request.nextUrl (Fallback mechanism)
    
    let baseOrigin = process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Clean up protocol for local development (MUST be http for localhost)
    if (baseOrigin.includes('localhost') || baseOrigin.includes('127.0.0.1')) {
        baseOrigin = baseOrigin.replace('https://', 'http://');
    } else {
        // Force HTTPS for everything else to match Google/GitHub configuration on production
        baseOrigin = baseOrigin.replace('http://', 'https://');
    }

    // 2. Determine Environment Prefix
    let envPrefix = 'LOCAL';
    if (baseOrigin.includes('vercel.app') || process.env.VERCEL) {
        envPrefix = 'VERCEL';
    } else if (baseOrigin.includes('render.com') || process.env.RENDER) {
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
