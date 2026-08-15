import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import { and, eq, gte, lt } from 'drizzle-orm';
import { db } from '@/db';
import { loginAttempts, sessions } from '@/db/schema';

/**
 * One master password for the household — no accounts, as agreed. The password
 * is never stored; only its Argon2id hash, which lives in the environment
 * rather than the database so that a copy of the database file is not a copy
 * of the credentials.
 */

const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 90);
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

/**
 * A second ceiling, counted across every address at once.
 *
 * The per-address limit is keyed on `X-Forwarded-For`, which is a header the
 * caller sends — so anyone reaching this app directly rather than through the
 * reverse proxy can put a new address on every request and never be limited at
 * all. Tested: six wrong passwords under six invented addresses, six times
 * "wrong password", no lockout.
 *
 * Caddy should overwrite that header, and if it does the per-address limit is
 * the one that matters. This is the belt to that pair of braces: a total no
 * header can dodge. Set high enough that two people fumbling a password never
 * meet it, low enough that guessing at speed stops in seconds.
 *
 * The cost is that a flood locks the household out for the window as well. On
 * a machine holding what this one holds, that is the right way to fail.
 */
const RATE_LIMIT_MAX_TOTAL = 30;

export function sessionMaxAgeSeconds(): number {
  return SESSION_DAYS * 24 * 60 * 60;
}

/**
 * The cookie carries a random token; the database stores only its SHA-256.
 * A leaked database backup therefore cannot be used to mint a valid session.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function verifyMasterPassword(password: string): Promise<boolean> {
  const expected = process.env.MASTER_PASSWORD_HASH;
  if (!expected) {
    throw new Error(
      'MASTER_PASSWORD_HASH is not set. Generate one with: npm run auth:hash -- "your password"',
    );
  }

  // Next's env loader expands $VAR references, which quietly destroys an
  // unescaped Argon2 hash and makes every login fail for no visible reason.
  // Fail loudly and specifically instead.
  if (!expected.startsWith('$argon2')) {
    throw new Error(
      'MASTER_PASSWORD_HASH is malformed. Every $ in the hash must be escaped as \\$ in .env.local — ' +
        'run `npm run auth:hash` again and paste its output verbatim.',
    );
  }

  try {
    return await verify(expected, password);
  } catch {
    // A malformed hash in the environment must not read as a successful login.
    return false;
  }
}

export async function createSession(userAgent: string | null): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds() * 1000);

  await db.insert(sessions).values({
    id: hashToken(token),
    expiresAt,
    userAgent: userAgent?.slice(0, 255) ?? null,
  });

  await pruneExpiredSessions();
  return token;
}

export async function validateSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, hashToken(token)), gte(sessions.expiresAt, new Date())))
    .limit(1);

  return rows.length > 0;
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/** Log every phone out — useful if one is lost. */
export async function destroyAllSessions(): Promise<void> {
  await db.delete(sessions);
}

/** How many devices are signed in right now, so the About page can say. */
export async function countActiveSessions(): Promise<number> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(gte(sessions.expiresAt, new Date()));

  return rows.length;
}

async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

export async function isRateLimited(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);

  const recent = await db
    .select({ ip: loginAttempts.ip })
    .from(loginAttempts)
    .where(gte(loginAttempts.attemptedAt, since));

  // Both ceilings, in one pass over a table that only ever holds one window.
  if (recent.length >= RATE_LIMIT_MAX_TOTAL) return true;
  return recent.filter((row) => row.ip === ip).length >= RATE_LIMIT_MAX_ATTEMPTS;
}

export async function recordFailedAttempt(ip: string): Promise<void> {
  await db.insert(loginAttempts).values({ ip });

  // Housekeeping: nothing older than the window can matter.
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000);
  await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, cutoff));
}

export async function clearAttempts(ip: string): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.ip, ip));
}

export const RATE_LIMIT = {
  windowMinutes: RATE_LIMIT_WINDOW_MINUTES,
  maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
  maxTotal: RATE_LIMIT_MAX_TOTAL,
};
