import { NextResponse, type NextRequest } from 'next/server';

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  const sessionCookie = request.cookies.get('session')?.value;
  const userId = !!sessionCookie; // Simple presence check for Edge compatibility
  const { pathname } = request.nextUrl;

  const isAuthPage = ['/login', '/signup'].includes(pathname);

  // If user is logged in...
  if (userId) {
    // and tries to access an auth page (login/signup), redirect to dashboard.
    if (isAuthPage) {
      return NextResponse.redirect(new URL('/dashboard/projects', request.url));
    }
  }
  // If user is not logged in...
  else {
    // and tries to access a protected page, redirect to login.
    // The root page `/` should be accessible to all.
    if (!isAuthPage && pathname !== '/') {
      return NextResponse.redirect(new URL('/login', request.url));
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
