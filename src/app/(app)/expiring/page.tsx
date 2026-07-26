import { ExpiryBadge } from '@/components/expiry-badge';
import { todayIso } from '@/domain/date';
import { daysUntilExpiry, expiryStatus, type ExpiryStatus } from '@/domain/expiry';
import { formatQuantity } from '@/domain/quantity';
import { getExpiringStock, type StockRow } from '@/lib/queries';
import { setBatchStatus } from '../actions';

const SECTIONS: { status: ExpiryStatus; title: string; blurb: string }[] = [
  { status: 'expired', title: 'Expired', blurb: 'Past its date — bin it and record the waste.' },
  {
    status: 'critical',
    title: 'Going soon',
    blurb: 'Will not survive until the next restock trip.',
  },
  { status: 'warning', title: 'Watch', blurb: 'Use these before buying more.' },
];

export default async function ExpiringPage() {
  const today = todayIso();
  const rows = await getExpiringStock();

  const byStatus = new Map<ExpiryStatus, StockRow[]>();
  for (const row of rows) {
    const status = expiryStatus(
      { expiryDate: row.expiryDate, precision: row.expiryPrecision, hasExpiry: row.hasExpiry },
      today,
    );
    byStatus.set(status, [...(byStatus.get(status) ?? []), row]);
  }

  const anything = SECTIONS.some((s) => (byStatus.get(s.status) ?? []).length > 0);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Expiring</h1>

      {!anything ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Nothing expiring in the next six months.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {SECTIONS.map((section) => {
            const items = byStatus.get(section.status) ?? [];
            if (items.length === 0) return null;

            return (
              <section key={section.status}>
                <h2 className="text-sm font-semibold uppercase tracking-wide">{section.title}</h2>
                <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                  {section.blurb}
                </p>

                <ul className="flex flex-col gap-2">
                  {items.map((row) => {
                    const days = daysUntilExpiry(
                      {
                        expiryDate: row.expiryDate,
                        precision: row.expiryPrecision,
                        hasExpiry: row.hasExpiry,
                      },
                      today,
                    );

                    return (
                      <li
                        key={row.batchId}
                        className="flex items-center gap-2 rounded-xl border p-3"
                        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                      >
                        <ExpiryBadge
                          today={today}
                          input={{
                            expiryDate: row.expiryDate,
                            precision: row.expiryPrecision,
                            hasExpiry: row.hasExpiry,
                          }}
                        />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {row.namePl}
                            {row.strength ? (
                              <span className="font-normal" style={{ color: 'var(--muted)' }}>
                                {' '}
                                {row.strength}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                            {formatQuantity(row.quantityRemaining, row.unitName, row.packSize)}
                            {days !== null
                              ? days < 0
                                ? ` · ${Math.abs(days)} days ago`
                                : ` · ${days} days left`
                              : null}
                          </p>
                        </div>

                        <form action={setBatchStatus}>
                          <input type="hidden" name="id" value={row.batchId} />
                          <input
                            type="hidden"
                            name="status"
                            value={section.status === 'expired' ? 'expired' : 'discarded'}
                          />
                          <button
                            type="submit"
                            className="rounded-lg border px-3 py-1.5 text-xs"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            Binned
                          </button>
                        </form>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
