import Link from 'next/link';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { formatQuantity } from '@/domain/quantity';
import { SearchBox } from '@/components/search-box';
import { Thumbnail } from '@/components/thumbnail';
import { SymptomTags } from '@/components/symptom-tags';
import { getProducts, getProductSymptoms } from '@/lib/queries';

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; q?: string }>;
}) {
  const { archived, q } = await searchParams;
  const showArchived = archived === '1';
  const search = q ?? '';
  const [rows, symptomsByProduct] = await Promise.all([
    getProducts(showArchived, search),
    getProductSymptoms(),
  ]);

  // Switching tabs keeps whatever you were searching for.
  const tabQuery = search ? `&q=${encodeURIComponent(search)}` : '';

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight" test-data="products-title">Products</h1>
        <Link href="/products/new" className={LINK_BUTTON} test-data="add-product-btn" style={toneStyle('accent')}>
          New product
        </Link>
      </header>

      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-xl border p-1 text-center text-sm"
        test-data="product-status-list-switch"
        style={{ borderColor: 'var(--border)' }}
      >
        <Tab
          href={`/products${search ? `?q=${encodeURIComponent(search)}` : ''}`}
          label="Active"
          active={!showArchived}
        />
        <Tab href={`/products?archived=1${tabQuery}`} label="Archived" active={showArchived} />
      </div>

      <SearchBox
        action="/products"
        value={search}
        placeholder="Name, brand, substance or symptom…"
        hidden={showArchived ? { archived: '1' } : undefined}
      />

      {rows.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          {search
            ? `No ${showArchived ? 'archived ' : ''}products match “${search}”.`
            : showArchived
              ? 'Nothing archived.'
              : 'The product database is empty.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2" test-data="main-products-list">
          {rows.map((row) => (
            <li key={row.id} test-data="main-products-list-item">
              <Link
                href={`/products/${row.id}`}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                {/* Recognising a box by sight beats reading a foreign name. */}
                {row.photoPath ? (
                  <Thumbnail
                    photoPath={row.photoPath}
                    className="h-11 w-11 shrink-0 rounded-lg border object-cover"
                  />
                ) : null}

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
                  <SymptomTags names={symptomsByProduct.get(row.id)} />
                </div>

                <span
                  className="shrink-0 text-right text-sm tabular-nums"
                  style={{ color: 'var(--muted)' }}
                >
                  {formatQuantity(row.inStockUnits, row.unitName)}
                  {row.pastDateUnits > 0 ? (
                    <span className="block text-xs" style={{ color: 'var(--color-warning)' }}>
                      +{row.pastDateUnits} past date
                    </span>
                  ) : null}
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
