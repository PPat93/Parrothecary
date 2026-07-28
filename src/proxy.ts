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
     * Everything except the login route, Next's own assets, and any static file
     * in public/.
     *
     * That last exclusion matters more than it looks: Next's image optimizer
     * fetches the source image back over HTTP with no session cookie. While
     * public files were gated, that fetch was redirected to /login and the
     * optimizer received an HTML page — "the requested resource isn't a valid
     * image". Static assets are not secret; the real gate is requireSession().
     */
    /*
     * `login$|login/` rather than plain `login`: a bare prefix also excluded
     * /loginsomething, /login-history and anything else starting with those
     * five letters. Harmless while no such route exists, but it is exactly the
     * kind of hole a future route falls into silently.
     *
     * The extension list covers Phase 2 too — a service worker at /sw.js and a
     * PWA manifest both have to be fetchable without a session.
     */
    '/((?!login$|login/|_next/|.*\\.(?:png|jpg|jpeg|webp|svg|gif|ico|webmanifest|json|txt|xml|js|css|html|woff|woff2|map)$).*)',
  ],
};
