/**
 * Back up before migrating. Runs as part of `npm run db:migrate`.
 *
 * The README has promised this since Phase 1 — "migrations are forward-only and
 * get a backup taken immediately before anything is tried" — and nothing did it.
 * A promise in a readme is not a backup.
 *
 * Forward-only is the reason it matters. There is no `down` migration in this
 * project, so a migration that turns out to be wrong cannot be reversed; the copy
 * taken here is the only way back, and it is worth having on the one command in
 * the whole app that changes the shape of the data.
 *
 * Into `<BACKUP_DIR>/before-migrate/`, its own folder for the same reason the
 * restore keeps its safety copies apart: these are taken at odd moments, and
 * mixing them into the scheduled backups makes both harder to read. It also keeps
 * them clear of the retention count, so the nightly job cannot prune away the copy
 * that was taken before the schema changed.
 *
 * Skipped when there is nothing to lose — no database yet, or one with no tables
 * in it. That is the first migrate on a fresh machine, which is exactly when this
 * has to stay out of the way rather than fail.
 */
import Database from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { backupsPath, databasePath } from '../src/lib/data-paths.ts';

const dbPath = databasePath();

if (!fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath} yet — nothing to back up before migrating.`);
  process.exit(0);
}

/*
 * A file with no tables is a real thing to meet here: `drizzle-kit` and the app
 * both create an empty database simply by opening one. Backing it up would be a
 * folder holding nothing, and failing would stop the migration that is about to
 * put the tables in.
 */
const db = new Database(dbPath, { readonly: true });
const hasSchema = db
  .prepare(`select count(*) n from sqlite_master where type = 'table' and name = 'batches'`)
  .get().n;
db.close();

if (!hasSchema) {
  console.log('That database has no tables yet — nothing to back up before migrating.');
  process.exit(0);
}

console.log('Backing up before the migration.');

const backup = spawnSync(process.execPath, [path.join(import.meta.dirname, 'backup.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, BACKUP_DIR: path.join(backupsPath(), 'before-migrate') },
});

/*
 * A failure here stops the migration. That is the whole point: the alternative is
 * changing the shape of the data with no way back, which is the situation this
 * exists to prevent. Whatever stopped the backup — a full disk, a folder the
 * service user cannot write — is worth fixing before the schema moves.
 */
if (backup.status !== 0) {
  console.error('\nThe backup failed, so the migration was not run. Nothing has changed.');
  console.error('Fix that first — a forward-only migration with no copy behind it is not worth it.');
  process.exit(1);
}
