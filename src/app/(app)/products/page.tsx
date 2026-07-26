import Link from 'next/link';
import { ConfirmButton } from '@/components/confirm-button';
import { formatQuantity } from '@/domain/quantity';
import { getProducts } from '@/lib/queries';
import { archiveProduct, logout } from '../actions';

export default async function ProductsPage() {
  const rows = await getProducts();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <Link href="/products/new" className="text-sm font-medium underline underline-offset-4">
          New product
        </Link>
      </header>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          The product database is empty.
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-xl border p-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {row.name}
                  {row.strength ? (
                    <span className="font-normal" style={{ color: 'var(--muted)' }}>
                      {' '}
                      {row.strength}
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                  {[
                    row.nameAlt,
                    row.form,
                    row.manufacturer,
                    row.isPrescription ? 'Rx' : null,
                    !row.hasExpiry ? 'never expires' : null,
                    `${row.variantCount} ${row.variantCount === 1 ? 'pack' : 'packs'}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <span className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                {formatQuantity(row.inStockUnits, row.unitName)}
              </span>

              <form action={archiveProduct}>
                <input type="hidden" name="id" value={row.id} />
                <ConfirmButton
                  label="Archive"
                  title="Archive this product?"
                  message={`${row.name} will disappear from the product list and from the "add box" picker. Its history and past spend are kept.`}
                  confirmLabel="Yes, archive"
                  className="rounded-lg border px-3 py-1.5 text-xs"
                  style={{ borderColor: 'var(--border)' }}
                />
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={logout} className="mt-8 flex justify-center">
        <button type="submit" className="text-sm underline underline-offset-4" style={{ color: 'var(--muted)' }}>
          Lock WyDawka
        </button>
      </form>
    </div>
  );
}
