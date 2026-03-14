import { NextResponse, type NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Only create ratelimiter if we have env vars, otherwise bypass locally to avoid breaking dev
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let ratelimit: Ratelimit | null = null;
if (redisUrl && redisToken) {
    ratelimit = new Ratelimit({
        redis: new Redis({ url: redisUrl, token: redisToken }),
        limiter: Ratelimit.slidingWindow(50, '10 s'), // 50 requests per 10s per IP globally
        analytics: true,
    });
}

export async function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('session')?.value;
  const userId = !!sessionCookie; // Simple presence check for Edge compatibility
  const { pathname } = request.nextUrl;

  const isAuthPage = ['/login', '/signup', '/reset-password'].includes(pathname);

  // Global API Rate Limiting for all /api/ endpoints to prevent brute-force and DDoS
  if (pathname.startsWith('/api/') && ratelimit) {
      const ip = (request as any).ip || request.headers.get('x-forwarded-for') || '127.0.0.1';
      const { success, limit, reset, remaining } = await ratelimit.limit(`global_api_${ip}`);
      
      if (!success) {
          return NextResponse.json({ success: false, error: 'Too Many Requests from your IP zone.' }, { 
              status: 429,
              headers: {
                  'X-RateLimit-Limit': limit.toString(),
                  'X-RateLimit-Remaining': remaining.toString(),
                  'X-RateLimit-Reset': reset.toString()
              }
          });
      }
      // If successful, we just fall through and let Next.js handle the actual route
  }

  // If user is logged in...
  if (userId) {
    // and tries to access an auth page (login/signup), redirect to dashboard.
    // We allow /reset-password so users can reset from their email link even if they have an active session
    if (isAuthPage && pathname !== '/reset-password') {
      return NextResponse.redirect(new URL('/dashboard/projects', request.url));
    }
  }
  // If user is not logged in...
  else {
    // Intercept standalone /login and /signup requests and send to homepage modals
    if (pathname === '/login' || pathname === '/signup') {
        return NextResponse.redirect(new URL('/', request.url));
    }

    // allow public access to marketing pages: '/', '/pricing', etc.
    const isPublicStaticPage = ['/', '/pricing', '/privacy', '/terms', '/docs', '/contact', '/reset-password'].includes(pathname);

    // and tries to access a protected page, redirect to root
    if (!isPublicStaticPage && !pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  const response = NextResponse.next();
  return response;
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    // Update the matcher to exclude public assets and apply middleware to other routes.
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
