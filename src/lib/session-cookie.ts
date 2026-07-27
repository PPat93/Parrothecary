/**
 * Deliberately dependency-free.
 *
 * The middleware runs on the edge runtime and needs this name, but must not
 * transitively import anything Node-only — argon2 and better-sqlite3 both
 * resolve to empty browser builds there and the build fails.
 */
export const SESSION_COOKIE = 'parrothecary_session';
