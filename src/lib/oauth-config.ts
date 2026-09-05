import { NextRequest } from 'next/server';

interface OAuthConfig {
    clientId: string | undefined;
    clientSecret: string | undefined;
}

export function isAllowedOrigin(origin: string): boolean {
    if (!origin) return false;
    try {
        const url = new URL(origin);
        const hostname = url.hostname.toLowerCase();

        // 1. Local development
        if (hostname === 'localhost' || hostname === '127.0.0.1') return true;

        // 2. Custom domain fluxbasedb.me and subdomains
        if (hostname === 'fluxbasedb.me' || hostname.endsWith('.fluxbasedb.me')) return true;

        // 3. Vercel deployments
        if (hostname === 'vercel.app' || hostname.endsWith('.vercel.app')) return true;

        // 4. Render deployments
        if (hostname.endsWith('.onrender.com') || hostname.endsWith('.render.com')) return true;

        // 5. Explicitly listed origins in ALLOWED_ORIGINS env variable
        const envAllowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (envAllowed.some(allowed => {
            try {
                return new URL(allowed).origin.toLowerCase() === url.origin.toLowerCase();
            } catch {
                return false;
            }
        })) {
            return true;
        }

        // 6. Configured NEXT_PUBLIC_APP_URL
        if (process.env.NEXT_PUBLIC_APP_URL) {
            try {
                if (new URL(process.env.NEXT_PUBLIC_APP_URL).origin.toLowerCase() === url.origin.toLowerCase()) {
                    return true;
                }
            } catch {}
        }

        return false;
    } catch {
        return false;
    }
}

export function encodeOAuthState(origin: string, returnTo?: string): string {
    const payload = JSON.stringify({
        origin,
        returnTo: returnTo || '/dashboard/projects',
        t: Date.now()
    });
    return Buffer.from(payload, 'utf-8').toString('base64url');
}

export function decodeOAuthState(stateParam: string | null): { origin?: string; returnTo?: string } {
    if (!stateParam) return {};
    try {
        const decoded = Buffer.from(stateParam, 'base64url').toString('utf-8');
        const parsed = JSON.parse(decoded);
        if (parsed && typeof parsed === 'object') {
            const origin = typeof parsed.origin === 'string' && isAllowedOrigin(parsed.origin) ? parsed.origin : undefined;
            const returnTo = typeof parsed.returnTo === 'string' && parsed.returnTo.startsWith('/') ? parsed.returnTo : undefined;
            return { origin, returnTo };
        }
    } catch {
        // Not base64url JSON, ignore
    }
    return {};
}

export function getBaseOrigin(request: NextRequest): string {
    // 1. Priority 1: Render's platform-provided public URL (Guaranteed correct on Render)
    if (process.env.RENDER_EXTERNAL_URL) {
        return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, "");
    }

    // 1.5. Priority 1.5: Netlify's platform-provided public URL
    // Netlify injects `URL` (main site) and `DEPLOY_URL` (specific deploy).
    if (process.env.NETLIFY) {
        const netlifyUrl = process.env.URL || process.env.DEPLOY_URL;
        if (netlifyUrl) {
            return netlifyUrl.replace(/\/$/, "");
        }
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
    if (host.includes('vercel.app') || host.includes('fluxbasedb.me')) {
        envPrefix = 'VERCEL';
    } else if (host.includes('render.com')) {
        envPrefix = 'RENDER';
    } else if (host.includes('netlify.app')) {
        envPrefix = 'NETLIFY';
    }

    // Explicit redirect URI override if configured, otherwise dynamically match host origin
    const explicitRedirect = provider === 'github' 
        ? (process.env[`GITHUB_REDIRECT_URI_${envPrefix}`] || process.env.GITHUB_REDIRECT_URI)
        : (process.env[`GOOGLE_REDIRECT_URI_${envPrefix}`] || process.env.GOOGLE_REDIRECT_URI);
        
    const redirectUri = explicitRedirect || `${baseOrigin}/api/auth/${provider}/callback`.replace('//api', '/api');

    if (provider === 'github') {
        return {
            clientId: process.env[`GITHUB_CLIENT_ID_${envPrefix}`] || process.env.GITHUB_CLIENT_ID_VERCEL || process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env[`GITHUB_CLIENT_SECRET_${envPrefix}`] || process.env.GITHUB_CLIENT_SECRET_VERCEL || process.env.GITHUB_CLIENT_SECRET,
            redirectUri
        };
    }

    if (provider === 'google') {
        return {
            clientId: process.env[`GOOGLE_CLIENT_ID_${envPrefix}`] || process.env.GOOGLE_CLIENT_ID_VERCEL || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            clientSecret: process.env[`GOOGLE_CLIENT_SECRET_${envPrefix}`] || process.env.GOOGLE_CLIENT_SECRET_VERCEL || process.env.GOOGLE_CLIENT_SECRET,
            redirectUri
        };
    }

    return { clientId: undefined, clientSecret: undefined, redirectUri };
}

