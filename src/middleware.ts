import { NextResponse, type NextRequest } from 'next/server';

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('session')?.value;
  const userId = !!sessionCookie; // Simple presence check for Edge compatibility
  const { pathname } = request.nextUrl;

  const isAuthPage = ['/login', '/signup', '/reset-password'].includes(pathname);

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
    // allow public access to marketing pages: '/', '/pricing', etc.
    const isPublicStaticPage = ['/', '/pricing', '/privacy', '/terms', '/docs', '/contact'].includes(pathname);

    // and tries to access a protected page, redirect to root
    if (!isAuthPage && !isPublicStaticPage) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
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
