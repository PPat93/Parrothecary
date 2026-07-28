import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { ExpiryBadge } from '@/components/expiry-badge';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { SearchBox } from '@/components/search-box';
import { todayIso } from '@/domain/date';
import { formatQuantity } from '@/domain/quantity';
import { getStock, groupByProduct } from '@/lib/queries';
import { adjustBatch } from './actions';

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q ?? '';
  const today = todayIso();
  const groups = groupByProduct(await getStock(search));

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
        <Link href="/stock/new" className={LINK_BUTTON} style={toneStyle('accent')}>
          Add box
        </Link>
      </header>

      <SearchBox action="/" value={search} placeholder="Name, brand or substance…" />

      {groups.length === 0 ? (
        search ? (
          <NoMatches search={search} />
        ) : (
          <EmptyState />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => {
            // With two APAP pack sizes in the cupboard, three rows of loose
            // tablets are indistinguishable without saying which pack each came
            // from.
            const hasSeveralPacks = new Set(group.boxes.map((b) => b.variantId)).size > 1;

            return (
            <li
              key={group.productId}
              className="rounded-2xl border p-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-medium">
                  {group.name}
                  {group.strength ? (
                    <span className="font-normal" style={{ color: 'var(--muted)' }}>
                      {' '}
                      {group.strength}
                    </span>
                  ) : null}
                </h2>
                <span className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                  {formatQuantity(group.totalUnits, group.unitName)}
                </span>
              </div>

              {group.nameAlt ? (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {group.nameAlt}
                </p>
              ) : null}

              <ul className="mt-3 flex flex-col gap-2">
                {group.boxes.map((box) => (
                  <li key={box.batchId} className="flex flex-wrap items-center gap-2">
                    <ExpiryBadge
                      today={today}
                      input={{
                        expiryDate: box.expiryDate,
                        precision: box.expiryPrecision,
                        hasExpiry: box.hasExpiry,
                      }}
                    />

                    <span className="min-w-0 flex-1 text-sm tabular-nums">
                      {formatQuantity(box.quantityRemaining, box.unitName, box.packSize)}
                      {/* Only when a product has more than one pack — otherwise
                          it repeats the same label on every row for no gain. */}
                      {hasSeveralPacks ? (
                        <span style={{ color: 'var(--muted)' }}>
                          {' '}
                          · {box.packLabel ?? `${box.packSize} ${box.unitName}`}
                        </span>
                      ) : null}
                      {box.openedAt ? (
                        <span style={{ color: 'var(--muted)' }}> · opened</span>
                      ) : null}
                      {box.location ? (
                        <span style={{ color: 'var(--muted)' }}> · {box.location}</span>
                      ) : null}
                    </span>

                    <Stepper batchId={box.batchId} delta={-1} label="−" />
                    <Stepper batchId={box.batchId} delta={1} label="+" />
                  </li>
                ))}
              </ul>
            </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stepper({ batchId, delta, label }: { batchId: number; delta: number; label: string }) {
  return (
    <form action={adjustBatch}>
      <input type="hidden" name="id" value={batchId} />
      <input type="hidden" name="delta" value={delta} />
      <ActionButton
        aria-label={delta > 0 ? 'Add one' : 'Take one'}
        tone={delta > 0 ? 'ok' : 'neutral'}
        className="h-9 w-9 rounded-lg border text-lg leading-none"
      >
        {label}
      </ActionButton>
    </form>
  );
}

function NoMatches({ search }: { search: string }) {
  return (
    <div
      className="rounded-2xl border border-dashed p-8 text-center text-sm"
      style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
    >
      Nothing in stock matches “{search}”.
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl border border-dashed p-8 text-center text-sm"
      style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
    >
      <p>Nothing in stock yet.</p>
      <p className="mt-2">
        Start by adding a{' '}
        <Link href="/products/new" className="underline underline-offset-4">
          product
        </Link>
        , then add the boxes you actually have.
      </p>
    </div>
  );
}
