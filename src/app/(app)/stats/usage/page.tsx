import Link from 'next/link';
import { formatQuantity } from '@/domain/quantity';
import { getRestockWindows, getUsageByProduct } from '@/lib/queries';
import { StatsTabs } from '../tabs';

/** How far back to look. Days, or null for everything on record. */
const RANGES: { key: string; label: string; days: number | null }[] = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '12 months', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

const DEFAULT_RANGE = '90';

/**
 * What the cupboard actually gets through.
 *
 * Read from the stock ledger rather than the purchase history, which makes it
 * the half that fills in over time: a box bought two years ago has a price
 * attached from the day it was entered, but nothing knows how fast it empties
 * until somebody starts pressing buttons.
 *
 * Nothing on this page adds units across products. Sixty tablets, thirty
 * millilitres and one emergency blanket are not ninety-one of anything — units
 * are only comparable within a product, so the per-product table carries them
 * and everything wider counts boxes and movements instead.
 */
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const selected = RANGES.find((r) => r.key === range) ?? RANGES.find((r) => r.key === DEFAULT_RANGE)!;

  const to = new Date();
  const from =
    selected.days === null ? new Date(0) : new Date(to.getTime() - selected.days * 86_400_000);

  const [usage, windows] = await Promise.all([getUsageByProduct(from, to), getRestockWindows()]);

  const moved = usage.filter(
    (row) =>
      row.summary.used !== 0 ||
      row.summary.received !== 0 ||
      row.summary.binned !== 0 ||
      row.summary.corrected !== 0 ||
      row.summary.drift !== 0,
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight" test-data="usage-title">
        Statistics
      </h1>

      <StatsTabs active="usage" />

      <div
        className="mb-4 grid grid-cols-4 gap-1 rounded-xl border p-1 text-center text-sm"
        test-data="usage-range"
        style={{ borderColor: 'var(--border)' }}
      >
        {RANGES.map((option) => (
          <Link
            key={option.key}
            href={`/stats/usage?range=${option.key}`}
            className="rounded-lg px-2 py-1.5"
            style={{
              background: option.key === selected.key ? 'var(--bg)' : 'transparent',
              color: option.key === selected.key ? 'var(--text)' : 'var(--muted)',
              fontWeight: option.key === selected.key ? 600 : 400,
            }}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {moved.length > 0 ? (
        <section
          className="mb-4 rounded-2xl border p-4"
          test-data="usage-by-product"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">What moved</h2>

          <ul className="flex flex-col gap-2">
            {moved.map((row) => (
              <li key={row.productId} className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/products/${row.productId}`}
                  className="min-w-0 text-sm underline-offset-4 hover:underline"
                >
                  {row.name}
                  {row.strength ? (
                    <span style={{ color: 'var(--muted)' }}> {row.strength}</span>
                  ) : null}
                </Link>

                <span className="shrink-0 text-right text-xs tabular-nums">
                  {/*
                    Either sign, like corrected and drift below it. Undoing a
                    dose in a window that does not contain the dose itself nets
                    negative, and only this line dropped that silently — the row
                    stayed, with nothing where its figure should be.
                  */}
                  {row.summary.used !== 0 ? (
                    <span className="block">
                      {row.summary.used > 0
                        ? `used ${formatQuantity(row.summary.used, row.unitName)}`
                        : `put back ${formatQuantity(-row.summary.used, row.unitName)}`}
                    </span>
                  ) : null}
                  {row.summary.received > 0 ? (
                    <span className="block" style={{ color: 'var(--muted)' }}>
                      in {formatQuantity(row.summary.received, row.unitName)}
                    </span>
                  ) : null}
                  {row.summary.binned > 0 ? (
                    <span className="block" style={{ color: 'var(--color-critical)' }}>
                      binned {formatQuantity(row.summary.binned, row.unitName)}
                    </span>
                  ) : null}
                  {/* Kept apart from "used": stock that was never there is not
                      stock anybody got through. */}
                  {row.summary.corrected !== 0 ? (
                    <span className="block" style={{ color: 'var(--muted)' }}>
                      corrected {row.summary.corrected > 0 ? '+' : ''}
                      {row.summary.corrected}
                    </span>
                  ) : null}
                  {row.summary.drift !== 0 ? (
                    <span className="block" style={{ color: 'var(--color-warning)' }}>
                      {row.summary.drift < 0 ? 'missing ' : 'found +'}
                      {row.summary.drift < 0 ? -row.summary.drift : row.summary.drift}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        The question the ledger was built for. Counts rather than units, since
        a window spans every product in the cabinet at once.
      */}
      {windows.length > 0 ? (
        <section
          className="mb-4 rounded-2xl border p-4"
          test-data="usage-restock-windows"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">Between restocks</h2>

          <ul className="flex flex-col gap-3">
            {windows.map((window) => (
              <li key={`${window.fromDate}-${window.toDate}`}>
                <p className="text-sm font-medium">
                  {window.fromLabel} → {window.toLabel}
                </p>
                <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                  {window.days} days ·{' '}
                  {[
                    window.boxesReceived > 0
                      ? `${window.boxesReceived} ${window.boxesReceived === 1 ? 'box' : 'boxes'} in`
                      : null,
                    window.timesTaken > 0 ? `${window.timesTaken} taken` : null,
                    window.boxesBinned > 0 ? `${window.boxesBinned} binned` : null,
                    window.corrections > 0 ? `${window.corrections} corrections` : null,
                    window.countDifferences > 0
                      ? `${window.countDifferences} count ${window.countDifferences === 1 ? 'difference' : 'differences'}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
