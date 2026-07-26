import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

type Db = ReturnType<typeof open>;

function open() {
  const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/wydawka.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  // WAL lets both phones read while one writes. At our scale that is all the
  // concurrency control we will ever need.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  // Wait rather than throw if the other phone happens to be mid-write.
  sqlite.pragma('busy_timeout = 5000');

  return drizzle(sqlite, { schema });
}

// Next's dev server re-evaluates modules on every edit, and `next build` spawns
// ten workers that each evaluate them once. Cache per process so we open at
// most one connection.
const globalForDb = globalThis as unknown as { __wydawkaDb?: Db };

function getDb(): Db {
  if (!globalForDb.__wydawkaDb) {
    globalForDb.__wydawkaDb = open();
  }
  return globalForDb.__wydawkaDb;
}

/**
 * Lazy on purpose. Opening the database at module-evaluation time makes
 * `next build` fail with SQLITE_BUSY, because collecting page data evaluates
 * these modules in every worker before a single query has been issued.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

export { schema };
