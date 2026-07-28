import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSession, destroySession, sessionMaxAgeSeconds, validateSession } from './auth';
import { SESSION_COOKIE } from './session-cookie';

export { SESSION_COOKIE };

export async function startSession(): Promise<void> {
  const headerList = await headers();
  const token = await createSession(headerList.get('user-agent'));
  const jar = await cookies();

  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // Served over HTTPS via Caddy's internal CA. Camera access, passkeys and
    // service workers all require a secure context anyway.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionMaxAgeSeconds(),
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

export async function isLoggedIn(): Promise<boolean> {
  const jar = await cookies();
  return validateSession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Real gate for every protected page. The middleware only checks that a cookie
 * is present — it runs on the edge runtime and cannot reach SQLite — so the
 * database-backed check has to happen here.
 */
export async function requireSession(): Promise<void> {
  if (!(await isLoggedIn())) redirect('/login');
}

/** Best-effort client IP for rate limiting. Behind Caddy on our own LAN. */
export async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return headerList.get('x-real-ip') ?? 'unknown';
}
