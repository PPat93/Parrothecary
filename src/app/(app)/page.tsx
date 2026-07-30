import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { ExpiryBadge } from '@/components/expiry-badge';
import { RunOutBadge } from '@/components/run-out-badge';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { SearchBox } from '@/components/search-box';
import { SymptomTags } from '@/components/symptom-tags';
import { todayIso } from '@/domain/date';
import { totalAvailable } from '@/domain/fefo';
import { formatQuantity } from '@/domain/quantity';
import { projectRunOut } from '@/domain/runout';
import {
  getBatchesForProducts,
  getProductDailyRates,
  getProductSymptoms,
  getStock,
  groupByProduct,
  toExpiryInput,
} from '@/lib/queries';
import { adjustBatch } from './actions';

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const search = q ?? '';
  const today = todayIso();
  const [rows, symptomsByProduct, dailyRates] = await Promise.all([
    getStock(search),
    getProductSymptoms(),
    getProductDailyRates(),
  ]);
  const groups = groupByProduct(rows, today);

  // Only products with an active dose schedule get projected — a rate we
  // do not have is not a rate of zero, so this stays a separate lookup rather
  // than a fallback default.
  const scheduledProductIds = groups.map((g) => g.productId).filter((id) => dailyRates.has(id));
  const batchesByProduct = await getBatchesForProducts(scheduledProductIds);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Stock</h1>
        <Link href="/stock/new" className={LINK_BUTTON} style={toneStyle('accent')}>
          Add box
        </Link>
      </header>

      <SearchBox action="/" value={search} placeholder="Name, brand, substance or symptom…" />

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

            const dailyRate = dailyRates.get(group.productId);
            const projection = dailyRate
              ? projectRunOut(
                  totalAvailable(batchesByProduct.get(group.productId) ?? [], today),
                  dailyRate,
                  today,
                )
              : null;

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
                <span className="shrink-0 text-right text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                  {formatQuantity(group.totalUnits, group.unitName)}
                  {/* Past-date stock is real and still in the cupboard, so it is
                      not hidden — but it is never folded into the number that
                      drives "do I need to buy more". */}
                  {group.pastDateUnits > 0 ? (
                    <span className="block text-xs" style={{ color: 'var(--color-warning)' }}>
                      +{group.pastDateUnits} past date
                    </span>
                  ) : null}
                </span>
              </div>

              {group.nameAlt ? (
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  {group.nameAlt}
                </p>
              ) : null}

              <SymptomTags names={symptomsByProduct.get(group.productId)} />
              {projection ? (
                <p className="mt-1">
                  <RunOutBadge projection={projection} />
                </p>
              ) : null}

              <ul className="mt-3 flex flex-col gap-2">
                {group.boxes.map((box) => (
                  <li key={box.batchId} className="flex flex-wrap items-center gap-2">
                    <ExpiryBadge today={today} input={toExpiryInput(box)} />

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

                    {/* Correcting a mistyped quantity must not go through the
                        steppers — ninety taps would log ninety doses. */}
                    <Link
                      href={`/stock/${box.batchId}/edit`}
                      aria-label={`Correct this box of ${group.name}`}
                      title="Correct this box"
                      className="is-action flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                      style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                    >
                      <svg
                        aria-hidden
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.9"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
                      </svg>
                    </Link>
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
