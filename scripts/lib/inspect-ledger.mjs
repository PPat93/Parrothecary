/**
 * Read a database and ask every box whether its own number still adds up.
 *
 * Two scripts want this: `check-ledger.mjs`, which is the question itself, and
 * `backup.mjs`, which asks it of the copy it has just written. The query is
 * here rather than in both because that is the mistake this whole area of the
 * code was built out of — the rule lived in SQL in one place and in TypeScript
 * in another, and the two immediately disagreed about what a binned box should
 * look like. `src/domain/integrity.ts` fixed the rule; this fixes the query
 * that feeds it.
 *
 * Read-only, and takes an open connection rather than a path, because the
 * backup script already has two of them and neither is the default one.
 */
import { checkBox } from '../../src/domain/integrity.ts';

const BOXES = `
  select b.id,
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
  order by b.id`;

/**
 * Every box, every movement total, and the ones that do not agree.
 *
 * `problems` are already sentences: the two kinds read quite differently and
 * both callers print them verbatim, so composing them twice would be a third
 * copy of something to keep in step.
 */
export function inspectLedger(db) {
  const rows = db.prepare(BOXES).all();

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

  return {
    boxes: rows.length,
    movements: totals.reduce((sum, t) => sum + t.n, 0),
    totals,
    problems,
  };
}
