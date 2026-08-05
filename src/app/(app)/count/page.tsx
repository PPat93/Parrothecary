import { BackLink } from '@/components/back-link';
import { formatExpiry } from '@/domain/expiry';
import { getCountDrift, getLastStockCount, getStock, toExpiryInput } from '@/lib/queries';
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

  const [rows, lastCount, drift] = await Promise.all([
    getStock(),
    getLastStockCount(),
    getCountDrift(),
  ]);

  // One line per box; grouped only so the name is not repeated down the page.
  const groups = new Map<string, CountRow[]>();
  for (const row of rows) {
    const label = [row.name, row.strength].filter(Boolean).join(' ');
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
