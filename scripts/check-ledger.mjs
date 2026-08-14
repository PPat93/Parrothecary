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
 * Read-only. Exits non-zero when something disagrees, so it can be wired into
 * a check step later without changing anything here.
 *
 * Importing a `.ts` file from a plain script needs Node 22.18 or newer, which
 * is why package.json now says so. Worth knowing before choosing the runtime on
 * the machine this ends up on: everything else here would run on anything.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { checkBox } from '../src/domain/integrity.ts';

const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/parrothecary.db');
const db = new Database(dbPath, { readonly: true });

const rows = db
  .prepare(
    `select b.id,
            p.name,
            b.status,
            b.quantity_remaining as quantity,
            coalesce((select sum(m.delta) from stock_movements m where m.batch_id = b.id), 0) as ledger,
            (select count(*) from stock_movements m where m.batch_id = b.id) as movements,
            /*
             * What a full one of these holds — the pack, or more if more ever
             * came in. A box cannot hold more than that, and the sum check
             * above cannot notice when it does: a one-piece blanket recorded
             * as 1.5 has a ledger adding up to 1.5 too, so both agree and both
             * are wrong. Put-backs beyond capacity are refused now, but rows
             * written before that are still sitting there.
             */
            max(v.pack_size, coalesce((select sum(m.delta) from stock_movements m
                 where m.batch_id = b.id and m.delta > 0
                   and m.reason in ('opening','received','adjust','audit')), 0)) as capacity
     from batches b
     join variants v on v.id = b.variant_id
     join products p on p.id = v.product_id
     order by b.id`,
  )
  .all();

const problems = [];

for (const row of rows) {
  const problem = checkBox(row);
  if (!problem) continue;

  problems.push(
    problem.kind === 'ledger'
      ? `  batch ${row.id} (${row.name}, ${row.status}): ledger ${problem.ledger},` +
        ` expected ${problem.expected} — ${row.movements} movement${row.movements === 1 ? '' : 's'}`
      : `  batch ${row.id} (${row.name}): holds ${problem.quantity} but only ${problem.capacity}` +
        ` ever came in — more was put back than was taken out`,
  );
}

const totals = db
  .prepare(`select reason, count(*) n, round(sum(delta), 2) units from stock_movements group by reason`)
  .all();

console.log(`Ledger check on ${dbPath}`);
console.log(`  ${rows.length} boxes, ${totals.reduce((sum, t) => sum + t.n, 0)} movements`);
for (const t of totals) console.log(`    ${t.reason}: ${t.n} rows, ${t.units} units`);

if (problems.length === 0) {
  console.log('  every box agrees with its ledger.');
  process.exit(0);
}

console.error(`\n  ${problems.length} box(es) disagree:`);
for (const problem of problems) console.error(problem);
process.exit(1);
