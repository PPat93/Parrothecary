/**
 * Does the ledger still agree with the shelf?
 *
 *   npm run db:check-ledger
 *
 * The ledger is only worth having if its sum matches the number the app shows,
 * so that claim gets checked rather than assumed. Two rules, from
 * src/domain/ledger.ts:
 *
 *   a box in stock      ->  sum(delta) == quantity_remaining
 *   a box out of stock  ->  sum(delta) == 0
 *
 * Read-only. Exits non-zero when something disagrees, so it can be wired into
 * a check step later without changing anything here.
 */
import Database from 'better-sqlite3';
import path from 'node:path';

const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/parrothecary.db');
const db = new Database(dbPath, { readonly: true });

/** Floats: 0.1 + 0.2 is not 0.3, and quantities are stored to two decimals. */
const TOLERANCE = 0.005;

const rows = db
  .prepare(
    `select b.id,
            p.name,
            b.status,
            b.quantity_remaining as quantity,
            coalesce((select sum(m.delta) from stock_movements m where m.batch_id = b.id), 0) as ledger,
            (select count(*) from stock_movements m where m.batch_id = b.id) as movements
     from batches b
     join variants v on v.id = b.variant_id
     join products p on p.id = v.product_id
     order by b.id`,
  )
  .all();

const problems = [];

for (const row of rows) {
  const expected = row.status === 'in_stock' ? row.quantity : 0;
  if (Math.abs(row.ledger - expected) > TOLERANCE) {
    problems.push(
      `  batch ${row.id} (${row.name}, ${row.status}): ledger ${row.ledger}, expected ${expected}` +
        ` — ${row.movements} movement${row.movements === 1 ? '' : 's'}`,
    );
  }
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
