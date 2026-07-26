import Link from 'next/link';
import { ConfirmButton } from '@/components/confirm-button';
import { SHOPPING_STATUSES } from '@/db/schema';
import { getShoppingList, getVariantOptions, type ShoppingRow } from '@/lib/queries';
import { removeShoppingItem, setShoppingStatus } from '../actions';
import { AddShoppingForm } from './add-form';

/**
 * Most stock is ordered online to family in Poland and collected on the trip,
 * so an item passes through four states rather than being simply ticked off.
 */
const STAGES: { status: (typeof SHOPPING_STATUSES)[number]; title: string; blurb: string }[] = [
  { status: 'to_buy', title: 'To buy', blurb: 'Not ordered yet.' },
  { status: 'ordered', title: 'Ordered', blurb: 'Placed online, on its way to Poland.' },
  { status: 'arrived', title: 'Arrived', blurb: 'Waiting at family — collect on the trip.' },
  { status: 'in_stock', title: 'Collected', blurb: 'Home. Add the boxes to stock.' },
];

export default async function ShoppingPage() {
  const [items, variants] = await Promise.all([getShoppingList(), getVariantOptions()]);

  const byStatus = new Map<string, ShoppingRow[]>();
  for (const item of items) {
    byStatus.set(item.status, [...(byStatus.get(item.status) ?? []), item]);
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Shopping</h1>

      {variants.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Add a{' '}
          <Link href="/products/new" className="underline underline-offset-4">
            product with a pack size
          </Link>{' '}
          before building a list.
        </div>
      ) : (
        <details
          className="mb-6 rounded-2xl border p-3"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <summary className="cursor-pointer text-sm font-medium">Add an item</summary>
          <div className="mt-3">
            <AddShoppingForm variants={variants} />
          </div>
        </details>
      )}

      <div className="flex flex-col gap-6">
        {STAGES.map((stage, index) => {
          const stageItems = byStatus.get(stage.status) ?? [];
          if (stageItems.length === 0) return null;

          const next = STAGES[index + 1];
          const previous = STAGES[index - 1];

          return (
            <section key={stage.status}>
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                {stage.title}{' '}
                <span className="font-normal tabular-nums" style={{ color: 'var(--muted)' }}>
                  {stageItems.length}
                </span>
              </h2>
              <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                {stage.blurb}
              </p>

              <ul className="flex flex-col gap-2">
                {stageItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-xl border p-3"
                    style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.quantityPacks} × {item.name}
                        {item.strength ? (
                          <span className="font-normal" style={{ color: 'var(--muted)' }}>
                            {' '}
                            {item.strength}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                        {[item.packLabel ?? `${item.packSize} ${item.unitName}`, item.notes]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>

                    {previous ? (
                      <StatusButton id={item.id} status={previous.status} label="←" title={`Back to ${previous.title}`} />
                    ) : null}

                    {next ? (
                      <StatusButton id={item.id} status={next.status} label={next.title} title={`Move to ${next.title}`} />
                    ) : (
                      <form action={removeShoppingItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <ConfirmButton
                          label="Done"
                          title="Remove from the list?"
                          message={`${item.quantityPacks} × ${item.name} will be deleted from the shopping list. This one really is a delete — add the boxes to stock first if you have not.`}
                          confirmLabel="Yes, remove"
                          className="rounded-lg border px-3 py-1.5 text-xs"
                          style={{ borderColor: 'var(--border)' }}
                        />
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        {items.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed p-8 text-center text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Nothing on the list.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
  title,
}: {
  id: number;
  status: string;
  label: string;
  title: string;
}) {
  return (
    <form action={setShoppingStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        title={title}
        className="rounded-lg border px-3 py-1.5 text-xs"
        style={{ borderColor: 'var(--border)' }}
      >
        {label}
      </button>
    </form>
  );
}
