/**
 * Does the ledger still agree with the shelf?
 *
 *   npm run db:check-ledger
 *
 * The ledger is only worth having if its sum matches the number the app shows,
 * so that claim gets checked rather than assumed.
 *
 * The rules themselves live in src/domain/integrity.ts and are imported rather
 * than restated: this script had them in SQL, the Audit screen wanted the same
 * question, and a second copy immediately disagreed with the first about what a
 * binned box should look like. One definition, two callers.
 *
 * The query that feeds them moved to scripts/lib/inspect-ledger.mjs for the
 * same reason, once the backup script needed to ask it of the copy it writes.
 *
 * Read-only. Exits non-zero when something disagrees, so it can be wired into
 * a check step later without changing anything here.
 *
 * Importing a `.ts` file from a plain script needs Node 22.18 or newer, which
 * is why package.json now says so. Worth knowing before choosing the runtime on
 * the machine this ends up on: everything else here would run on anything.
 */
import Database from 'better-sqlite3';
import { databasePath } from '../src/lib/data-paths.ts';
import { inspectLedger } from './lib/inspect-ledger.mjs';

const dbPath = databasePath();
const db = new Database(dbPath, { readonly: true });

const { boxes, movements, totals, problems } = inspectLedger(db);

console.log(`Ledger check on ${dbPath}`);
console.log(`  ${boxes} boxes, ${movements} movements`);
for (const t of totals) console.log(`    ${t.reason}: ${t.n} rows, ${t.units} units`);

if (problems.length === 0) {
  console.log('  every box agrees with its ledger.');
  process.exit(0);
}

console.error(`\n  ${problems.length} box(es) disagree:`);
for (const problem of problems) console.error(problem);
process.exit(1);
