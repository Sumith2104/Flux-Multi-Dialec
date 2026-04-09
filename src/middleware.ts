import { NextResponse, type NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fluxbase_dev_secret_key_123');

// Only create ratelimiter if we have env vars, otherwise bypass locally to avoid breaking dev
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let ratelimit: Ratelimit | null = null;
if (redisUrl && redisToken) {
    ratelimit = new Ratelimit({
        redis: new Redis({ url: redisUrl, token: redisToken }),
        limiter: Ratelimit.slidingWindow(50, '10 s'), // 50 requests per 10s per IP globally
        analytics: false, // Disabled: analytics: true writes extra data to Upstash on every request
    });
}

export async function middleware(request: NextRequest) {
  try {
    const sessionCookie = request.cookies.get('session')?.value;
    const { pathname } = request.nextUrl;
    
    // 0. Path normalization and exclusion
    // Skip static files, images, favicon etc. to avoid infinite loops or overhead
    if (
        pathname.startsWith('/_next/') || 
        pathname.startsWith('/static/') || 
        pathname === '/favicon.ico' || 
        pathname.includes('.')
    ) {
        return NextResponse.next();
    }

    const isAuthPage = ['/login', '/signup', '/reset-password'].includes(pathname);

    let userId = null;
    let isMfaVerified = false;

    if (sessionCookie) {
        try {
            const { payload } = await jwtVerify(sessionCookie, JWT_SECRET);
            userId = payload.uid;
            isMfaVerified = !!payload.mfa;
        } catch (error) {
            // Invalid or expired session
            // To prevent redirect loop on '/', we just clear the cookie and continue
            if (pathname === '/') {
                const response = NextResponse.next();
                response.cookies.delete('session');
                return response;
            }
            const response = NextResponse.redirect(new URL('/', request.url));
            response.cookies.delete('session');
            return response;
        }
    }

    // 1. Global API Rate Limiting for all /api/ endpoints
    if (pathname.startsWith('/api/') && ratelimit) {
        try {
            const ip = (request as any).ip || request.headers.get('x-forwarded-for') || '127.0.0.1';
            const { success, limit, reset, remaining } = await ratelimit.limit(`global_api_${ip}`);
            
            if (!success) {
                return NextResponse.json({ success: false, error: 'Too Many Requests' }, { 
                    status: 429,
                    headers: {
                        'X-RateLimit-Limit': limit.toString(),
                        'X-RateLimit-Remaining': remaining.toString(),
                        'X-RateLimit-Reset': reset.toString()
                    }
                });
            }
        } catch (rateError) {
            console.error('Ratelimit Error:', rateError);
            // Fall through let the request proceed if redis is down
        }
    }

    // 2. Auth Logic
    if (userId) {
        // SECURITY HARDENING: If session is present but MFA is not verified on a protected route, force login modal via root
        if (!isMfaVerified && !isAuthPage && pathname !== '/' && !pathname.startsWith('/api/auth')) {
            const response = NextResponse.redirect(new URL('/', request.url));
            response.cookies.delete('session');
            return response;
        }

        // and tries to access an auth page (login/signup), redirect to dashboard if fully verified
        if (isAuthPage && pathname !== '/reset-password' && isMfaVerified) {
            return NextResponse.redirect(new URL('/dashboard/projects', request.url));
        }
    }
    // If user is not logged in...
    else {
        // Intercept standalone /login and /signup requests and send to homepage modals if not there
        if (pathname === '/login' || pathname === '/signup') {
            return NextResponse.redirect(new URL('/', request.url));
        }

        // allow public access to marketing pages: '/', '/pricing', etc.
        const isPublicStaticPage = ['/', '/pricing', '/privacy', '/terms', '/docs', '/contact', '/reset-password'].includes(pathname);

        // and tries to access a protected page (non-public, non-api), redirect to root
        if (!isPublicStaticPage && !pathname.startsWith('/api/')) {
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    return NextResponse.next();
  } catch (globalError) {
    console.error('Middleware Critical Error:', globalError);
    // Safety net: allow the request to proceed if the middleware crashes to avoid site-wide 404/500
    return NextResponse.next();
  }
}

// Config matcher is still useful but simpler to avoid issues with standard assets
export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
