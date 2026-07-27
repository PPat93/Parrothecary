import Link from 'next/link';
import { formatQuantity } from '@/domain/quantity';
import { getProducts } from '@/lib/queries';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === '1';
  const rows = await getProducts(showArchived);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
        <Link href="/products/new" className="text-sm font-medium underline underline-offset-4">
          New product
        </Link>
      </header>

      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-xl border p-1 text-center text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <Tab href="/products" label="Active" active={!showArchived} />
        <Tab href="/products?archived=1" label="Archived" active={showArchived} />
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          {showArchived ? 'Nothing archived.' : 'The product database is empty.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/products/${row.id}`}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">
                    {row.name}
                    {row.strength ? (
                      <span className="font-normal" style={{ color: 'var(--muted)' }}>
                        {' '}
                        {row.strength}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs break-words" style={{ color: 'var(--muted)' }}>
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

                <span
                  className="shrink-0 text-sm tabular-nums"
                  style={{ color: 'var(--muted)' }}
                >
                  {formatQuantity(row.inStockUnits, row.unitName)}
                </span>

                <span aria-hidden style={{ color: 'var(--muted)' }}>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5"
      style={{
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)',
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </Link>
  );
}
