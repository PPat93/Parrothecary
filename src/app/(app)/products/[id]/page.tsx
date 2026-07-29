import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/action-button';
import { BackLink } from '@/components/back-link';
import { ConfirmButton } from '@/components/confirm-button';
import { ExpiryBadge } from '@/components/expiry-badge';
import { todayIso } from '@/domain/date';
import { formatMoney, money } from '@/domain/money';
import { formatQuantity } from '@/domain/quantity';
import { getProduct, getSubstanceNames } from '@/lib/queries';
import {
  archiveProduct,
  deleteProduct,
  removeBarcode,
  removeProductPhoto,
  removeSubstanceFromProduct,
  unarchiveProduct,
} from '../../actions';
import { AddBarcodeForm, AddPackForm, AddSubstanceForm } from './add-forms';
import { PhotoForm } from './photo-form';

const STATUS_LABELS: Record<string, string> = {
  in_stock: 'in stock',
  consumed: 'used up',
  expired: 'binned, expired',
  discarded: 'discarded',
};

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, substanceNames] = await Promise.all([
    getProduct(Number(id)),
    getSubstanceNames(),
  ]);
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
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-lg border px-3 text-sm font-medium"
          style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}
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
            <ActionButton tone="ok">Restore</ActionButton>
          </form>
        </div>
      ) : null}

      <Section title="Photo">
        {product.photoPath ? (
          <div className="flex flex-col items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/photo/${product.photoPath}`}
              alt={`${product.name} packaging`}
              className="max-h-64 w-auto rounded-xl border"
              style={{ borderColor: 'var(--border)' }}
            />
            <form action={removeProductPhoto}>
              <input type="hidden" name="productId" value={product.id} />
              <ActionButton tone="critical">Remove photo</ActionButton>
            </form>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            No photo. A picture of the box is often quicker to recognise than the name,
            especially on Polish packaging.
          </p>
        )}
        <PhotoForm productId={product.id} hasPhoto={product.photoPath !== null} />
      </Section>

      <Section title="Details">
        <Row label="Form" value={product.form} />
        <Row label="Counted in" value={product.unitName} />
        <Row label="Manufacturer" value={product.manufacturer ?? '—'} />
        <Row label="Prescription" value={product.isPrescription ? 'yes' : 'no'} />
        <Row label="Expires" value={product.hasExpiry ? 'yes' : 'no'} />
        <Row label="In stock" value={formatQuantity(product.inStockUnits, product.unitName)} />
        {product.notes ? <Row label="Notes" value={product.notes} /> : null}
      </Section>

      <Section title="Active substances">
        {product.substances.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            None recorded.
          </p>
        ) : (
          product.substances.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="min-w-0 break-words">
                {s.namePl && s.namePl !== s.name ? `${s.name} (${s.namePl})` : s.name}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span style={{ color: 'var(--muted)' }}>
                  {s.amountText ?? (s.amountMg !== null ? `${s.amountMg} mg` : '—')}
                </span>
                <form action={removeSubstanceFromProduct}>
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="substanceId" value={s.id} />
                  <ActionButton
                    aria-label={`Remove ${s.name}`}
                    tone="critical"
                    className="rounded-lg border px-2 py-1 text-xs"
                  >
                    Remove
                  </ActionButton>
                </form>
              </span>
            </div>
          ))
        )}
        <AddSubstanceForm productId={product.id} substanceNames={substanceNames} />
      </Section>

      <Section title={`Packs (${product.packs.length})`}>
        {product.packs.length === 0 ? (
          <p
            className="rounded-xl border p-3 text-sm"
            style={{
              borderColor: 'var(--color-warning)',
              color: 'var(--color-warning)',
            }}
          >
            This product has no pack size, so it cannot hold boxes or go on a shopping list. Add one
            below to make it usable.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {product.packs.map((pack) => (
              <div key={pack.id}>
                <p className="text-sm font-medium">
                  {pack.packLabel ?? `${pack.packSize} ${product.unitName}`}
                </p>

                {pack.barcodes.length > 0 ? (
                  <ul className="mt-1 flex flex-col gap-1">
                    {pack.barcodes.map((b) => (
                      <li key={b.code} className="flex items-center gap-2 text-xs">
                        <span className="tabular-nums">{b.code}</span>
                        <span style={{ color: 'var(--muted)' }}>{b.type}</span>
                        <form action={removeBarcode}>
                          <input type="hidden" name="code" value={b.code} />
                          <ActionButton
                            aria-label={`Remove barcode ${b.code}`}
                            tone="critical"
                            className="rounded-lg border px-2 py-0.5 text-xs"
                          >
                            Remove
                          </ActionButton>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>
                    No barcode recorded — type the digits printed under the stripe, or scan the box.
                  </p>
                )}

                <AddBarcodeForm variantId={pack.id} />

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

        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium">Add another pack size</summary>
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            A pack size cannot be changed once it exists — boxes and past purchases are recorded
            against it, so editing it would rewrite what those numbers meant. Add a new pack size
            instead; the old one keeps its history.
          </p>
          <AddPackForm productId={product.id} unitName={product.unitName} />
        </details>
      </Section>

      {!product.archivedAt ? (
        <form action={archiveProduct} className="mt-6 flex justify-center">
          <input type="hidden" name="id" value={product.id} />
          <ConfirmButton
            label="Archive this product"
            title="Archive this product?"
            message={`${product.name} will disappear from the product list and the "add box" picker. Its history and past spend are kept, and you can restore it.`}
            confirmLabel="Yes, archive"
            tone="warning"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          />
        </form>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2">
          {product.hasBatches ? (
            <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
              This product cannot be deleted because boxes of it exist — including used-up and
              binned ones. Those records are your consumption and spend history.
            </p>
          ) : (
            <form action={deleteProduct}>
              <input type="hidden" name="id" value={product.id} />
              <ConfirmButton
                label="Delete permanently"
                title="Delete this product for good?"
                message={`${product.name} will be erased completely, along with its pack sizes and substance links. This cannot be undone. It is only offered because no boxes of it were ever recorded.`}
                confirmLabel="Yes, delete it"
                tone="critical"
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              />
            </form>
          )}
        </div>
      )}
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
