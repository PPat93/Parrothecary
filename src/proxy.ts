import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session-cookie';

/**
 * Cheap first pass only: bounce anyone with no session cookie at all, so
 * unauthenticated requests never reach a page render. This runs on the edge
 * runtime and cannot open SQLite, so the real validation lives in
 * requireSession() inside the protected layout.
 *
 * (Next 16 renamed the "middleware" file convention to "proxy".)
 */
export default function proxy(request: NextRequest) {
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  matcher: [
    /*
     * Everything except the login route, Next's own assets, and the icons the
     * PWA manifest will need before login.
     */
    '/((?!login|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)',
  ],
};
