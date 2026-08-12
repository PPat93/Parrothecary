import Link from 'next/link';
import { BackLink } from '@/components/back-link';
import { formatExpiry } from '@/domain/expiry';
import {
  getCountDrift,
  getLastStockCount,
  getLedgerIntegrity,
  getStock,
  toExpiryInput,
} from '@/lib/queries';
import { CountForm } from './count-form';

export interface CountRow {
  batchId: number;
  quantityRemaining: number;
  unitName: string;
  packSize: number;
  packLabel: string | null;
  location: string | null;
  /** Two boxes of the same pack need telling apart in the hand. */
  expiryLabel: string;
}

/**
 * Counting the cupboard, box by box.
 *
 * Not to be confused with the cabinet audit on a trip, which asks what to buy.
 * This one asks a narrower and more awkward question: is what the app believes
 * actually on the shelf? Every difference becomes a movement in the ledger, so
 * over time it answers something neither screen could before — how much stock
 * leaves this house without anyone recording it.
 *
 * Every field is optional. A cupboard gets counted in stages, between other
 * things, and a form that wanted all thirty numbers before accepting any of
 * them would be abandoned halfway down the shelf.
 */
export default async function CountPage({
  searchParams,
}: {
  searchParams: Promise<{ counted?: string; changed?: string; net?: string }>;
}) {
  const { counted, changed, net } = await searchParams;

  const [rows, lastCount, drift, integrity] = await Promise.all([
    getStock(),
    getLastStockCount(),
    getCountDrift(),
    getLedgerIntegrity(),
  ]);

  // One line per box; grouped only so the name is not repeated down the page.
  const groups = new Map<string, CountRow[]>();
  for (const row of rows) {
    // Same rule as the stock list: an archived product's boxes are still on the
    // shelf and still need counting, so they are marked rather than dropped.
    const label =
      [row.name, row.strength].filter(Boolean).join(' ') +
      ((row.productArchivedAt ?? null) !== null ? ' (archived)' : '');
    const entry = groups.get(label) ?? [];
    entry.push({
      batchId: row.batchId,
      quantityRemaining: row.quantityRemaining,
      unitName: row.unitName,
      packSize: row.packSize,
      packLabel: row.packLabel,
      location: row.location,
      expiryLabel: formatExpiry(toExpiryInput(row)),
    });
    groups.set(label, entry);
  }

  const grouped = [...groups.entries()].map(([productLabel, rows]) => ({ productLabel, rows }));
  const justCounted = counted !== undefined;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink href="/" label="Stock" />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight" test-data="count-title">
        Stock count
      </h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }} test-data="count-description">
        Walk the cupboard and type what is actually in each box. Leave anything you have not
        counted blank. Differences are recorded, so the drift itself becomes something you can
        look at later.
      </p>

      {justCounted ? (
        <div
          className="mb-5 rounded-2xl border p-4 text-sm"
          test-data="count-result"
          style={{ borderColor: 'var(--color-ok)', color: 'var(--muted)' }}
        >
          <p>
            Counted {counted} {counted === '1' ? 'box' : 'boxes'}.{' '}
            {changed === '0' ? (
              <span style={{ color: 'var(--color-ok)' }}>Everything matched.</span>
            ) : (
              <>
                <span style={{ color: 'var(--color-warning)' }}>
                  {changed} {changed === '1' ? 'box' : 'boxes'} disagreed
                </span>{' '}
                — net {Number(net) > 0 ? '+' : ''}
                {net} units, now recorded.
              </>
            )}
          </p>
        </div>
      ) : null}

      {/*
        Whether the record is sound, said where the record gets corrected.

        This is the one number the app cannot check by looking at the shelf: two
        stored facts that should agree, compared. It sits here rather than on
        About because a disagreement is answered by counting, and that is the
        button on this page — an alarm with no next step is worse than none.
      */}
      <div
        className="mb-4 rounded-2xl border p-3 text-xs"
        test-data="integrity"
        style={{
          borderColor: integrity.problems.length === 0 ? 'var(--border)' : 'var(--color-warning)',
          color: 'var(--muted)',
        }}
      >
        {integrity.problems.length === 0 ? (
          <p>
            {/*
              "every box ever recorded", not just the ones countable below: the
              check covers used-up and binned boxes too, and 40 sitting above a
              form listing 16 would otherwise read as forty things to count.
            */}
            <span style={{ color: 'var(--color-ok)' }}>Records agree.</span> All{' '}
            {integrity.checked} boxes ever recorded add up to the movements behind them.
          </p>
        ) : (
          <>
            {/*
              The advice belongs on the row, not up here. Counting fixes a box
              that is still in the cupboard; one that has been used up or binned
              is not on the sheet below, so telling you to count it would be the
              same wrong turn the box history took — a next step that cannot be
              taken.
            */}
            <p style={{ color: 'var(--color-warning)' }}>
              {integrity.problems.length} of {integrity.checked} boxes ever recorded{' '}
              {integrity.problems.length === 1 ? 'does' : 'do'} not add up. Each one’s history shows
              where it went wrong.
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {integrity.problems.map((row) => (
                <li key={row.batchId}>
                  <Link
                    href={`/stock/${row.batchId}/edit`}
                    className="underline underline-offset-4"
                  >
                    {row.name}
                  </Link>{' '}
                  {row.problem.kind === 'ledger'
                    ? `— movements come to ${row.problem.ledger}, expected ${row.problem.expected}`
                    : `— holds ${row.problem.quantity}, but only ${row.problem.capacity} ever came in`}
                  {row.countable ? (
                    <span style={{ color: 'var(--muted)' }}> · counting it below puts it right</span>
                  ) : (
                    <span style={{ color: 'var(--muted)' }}>
                      {' '}
                      · this box has left the cupboard, so counting cannot reach it
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* A count means little without knowing when the last one was. */}
      <p className="mb-4 text-xs" style={{ color: 'var(--muted)' }} test-data="count-history">
        {lastCount === null
          ? 'Never counted. Whatever the first count turns up is a starting point, not drift.'
          : `Last counted ${lastCount.toISOString().slice(0, 10)}. ` +
            (drift.movements === 0
              ? 'Nothing has ever disagreed.'
              : `${drift.movements} difference${drift.movements === 1 ? '' : 's'} recorded so far, ` +
                `net ${drift.netUnits > 0 ? '+' : ''}${drift.netUnits} units.`)}
      </p>

      {grouped.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Nothing in stock to count.
        </div>
      ) : (
        <CountForm groups={grouped} />
      )}

      <p className="mt-4 text-xs" style={{ color: 'var(--muted)' }}>
        Counting a box as 0 retires it, the same as using it up. Nothing here is deleted — every
        correction is kept, including the ones that turn out to be typos.
      </p>
    </div>
  );
}
