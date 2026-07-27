import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { ConfirmButton } from '@/components/confirm-button';
import { ExpiryBadge } from '@/components/expiry-badge';
import { todayIso } from '@/domain/date';
import { formatMoney, money } from '@/domain/money';
import { formatQuantity } from '@/domain/quantity';
import { getProduct } from '@/lib/queries';
import { archiveProduct, unarchiveProduct } from '../../actions';

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'in stock',
  consumed: 'used up',
  expired: 'binned, expired',
  discarded: 'discarded',
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = await getProduct(Number(id));
  if (!product) notFound();

  const today = todayIso();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink href={product.archivedAt ? '/products?archived=1' : '/products'} label="Products" />

      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {product.name}
            {product.strength ? (
              <span className="font-normal" style={{ color: 'var(--muted)' }}>
                {' '}
                {product.strength}
              </span>
            ) : null}
          </h1>
          {product.nameAlt ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {product.nameAlt}
            </p>
          ) : null}
        </div>

        <Link
          href={`/products/${product.id}/edit`}
          className="shrink-0 rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--border)' }}
        >
          Edit
        </Link>
      </header>

      {product.archivedAt ? (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <span>This product is archived.</span>
          <form action={unarchiveProduct}>
            <input type="hidden" name="id" value={product.id} />
            <button
              type="submit"
              className="rounded-lg border px-3 py-1.5 text-xs"
              style={{ borderColor: 'var(--border)' }}
            >
              Restore
            </button>
          </form>
        </div>
      ) : null}

      <Section title="Details">
        <Row label="Form" value={product.form} />
        <Row label="Counted in" value={product.unitName} />
        <Row label="Manufacturer" value={product.manufacturer ?? '—'} />
        <Row label="Prescription" value={product.isPrescription ? 'yes' : 'no'} />
        <Row label="Expires" value={product.hasExpiry ? 'yes' : 'no'} />
        <Row label="In stock" value={formatQuantity(product.inStockUnits, product.unitName)} />
        {product.notes ? <Row label="Notes" value={product.notes} /> : null}
      </Section>

      {product.substances.length > 0 ? (
        <Section title="Active substances">
          {product.substances.map((s) => (
            <Row
              key={s.name}
              label={s.namePl && s.namePl !== s.name ? `${s.name} (${s.namePl})` : s.name}
              value={s.amountText ?? (s.amountMg !== null ? `${s.amountMg} mg` : '—')}
            />
          ))}
        </Section>
      ) : null}

      <Section title={`Packs (${product.packs.length})`}>
        {product.packs.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No pack sizes defined, so boxes cannot be added yet.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {product.packs.map((pack) => (
              <div key={pack.id}>
                <p className="text-sm font-medium">
                  {pack.packLabel ?? `${pack.packSize} ${product.unitName}`}
                </p>

                {pack.barcodes.length > 0 ? (
                  <p className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                    {pack.barcodes.map((b) => `${b.code} (${b.type})`).join(' · ')}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                    no barcode recorded
                  </p>
                )}

                <ul className="mt-2 flex flex-col gap-2">
                  {pack.boxes.length === 0 ? (
                    <li className="text-xs" style={{ color: 'var(--muted)' }}>
                      No boxes of this pack.
                    </li>
                  ) : (
                    pack.boxes.map((box) => (
                      <li
                        key={box.id}
                        className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        <ExpiryBadge
                          today={today}
                          input={{
                            expiryDate: box.expiryDate,
                            precision: box.expiryPrecision,
                            hasExpiry: product.hasExpiry,
                          }}
                        />
                        <span className="text-sm tabular-nums">
                          {formatQuantity(box.quantityRemaining, product.unitName, pack.packSize)}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          {[
                            STATUS_LABELS[box.status] ?? box.status,
                            box.openedAt ? 'opened' : null,
                            box.location,
                            box.lotNumber ? `lot ${box.lotNumber}` : null,
                            box.purchasePriceMinor !== null && box.purchaseCurrency
                              ? formatMoney(money(box.purchasePriceMinor, box.purchaseCurrency))
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {!product.archivedAt ? (
        <form action={archiveProduct} className="mt-6 flex justify-center">
          <input type="hidden" name="id" value={product.id} />
          <ConfirmButton
            label="Archive this product"
            title="Archive this product?"
            message={`${product.name} will disappear from the product list and the "add box" picker. Its history and past spend are kept, and you can restore it.`}
            confirmLabel="Yes, archive"
            className="rounded-lg border px-4 py-2 text-sm"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          />
        </form>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-4 rounded-2xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="shrink-0" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="text-right break-words">{value}</span>
    </div>
  );
}
