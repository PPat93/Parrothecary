import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/action-button';
import { BackLink } from '@/components/back-link';
import { ConfirmButton } from '@/components/confirm-button';
import { ExpiryBadge } from '@/components/expiry-badge';
import { todayIso } from '@/domain/date';
import { formatDoseFrequency } from '@/domain/dosing';
import { formatMoney, formatPricePerUnit, money, pricePerUnit, toEur } from '@/domain/money';
import { formatQuantity } from '@/domain/quantity';
import { batchStatusLabel } from '@/lib/labels';
import {
  getProduct,
  getProductPurchases,
  getSubstanceNames,
  getSymptomNames,
  type ProductDetail,
  type PurchaseRow,
} from '@/lib/queries';
import {
  archiveProduct,
  deleteProduct,
  removeBarcode,
  removeProductPhoto,
  removeSubstanceFromProduct,
  removeSymptomFromProduct,
  unarchiveProduct,
} from '../../actions';
import { AddBarcodeForm, AddPackForm, AddSubstanceForm, AddSymptomForm } from './add-forms';
import { PhotoForm } from './photo-form';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, substanceNames, symptomNames, purchases] = await Promise.all([
    getProduct(Number(id)),
    getSubstanceNames(),
    getSymptomNames(),
    getProductPurchases(Number(id)),
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
        {product.hasExpiry ? (
          <Row
            label="Usable past date"
            value={
              product.expiryGraceDays > 0
                ? `${product.expiryGraceDays} days — doses still come out of a box this far past its date`
                : 'no — the printed date is the limit'
            }
          />
        ) : null}
        <Row
          label="In stock"
          value={
            formatQuantity(product.inStockUnits, product.unitName) +
            (product.pastDateUnits > 0 ? ` · plus ${product.pastDateUnits} past date` : '')
          }
        />
        {product.notes ? <Row label="Notes" value={product.notes} /> : null}
      </Section>

      <Section title="What it costs">
        <PurchaseHistory purchases={purchases} unitName={product.unitName} />
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

      <Section title="Used for">
        {product.symptoms.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Not tagged yet. Tags are what make “what do we have for a sore throat” work — the
            question you actually ask, when you cannot remember the brand.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {product.symptoms.map((s) => (
              <li key={s.id}>
                <form action={removeSymptomFromProduct} className="flex">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="symptomId" value={s.id} />
                  <span
                    className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    {s.nameEn}
                    <button
                      type="submit"
                      aria-label={`Remove ${s.nameEn}`}
                      className="is-action rounded px-1"
                      style={{ color: 'var(--color-critical)', minHeight: 0 }}
                    >
                      ×
                    </button>
                  </span>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddSymptomForm productId={product.id} symptomNames={symptomNames} />
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
                            graceDays: product.expiryGraceDays,
                          }}
                        />
                        <span className="text-sm tabular-nums">
                          {formatQuantity(box.quantityRemaining, product.unitName, pack.packSize)}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>
                          {[
                            batchStatusLabel(box.status),
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
        product.activeDoses.length > 0 ? (
          <p
            className="mt-6 text-center text-xs"
            style={{ color: 'var(--muted)' }}
          >
            This cannot be archived yet — {describeActiveDoses(product.activeDoses)}. Archiving
            would take it off the dose board, so stop the dose under{' '}
            <Link href="/household" className="underline underline-offset-4">
              Household
            </Link>{' '}
            first.
          </p>
        ) : (
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
        )
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2">
          {product.hasBatches || product.hasDoseSchedules ? (
            <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
              {product.hasBatches
                ? 'This product cannot be deleted because boxes of it exist — including used-up and binned ones. Those records are your consumption and spend history.'
                : 'This product cannot be deleted because a dose schedule still points to it — remove that schedule first.'}
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

/** "Żona takes it twice a day", or "2 people take it" once it is a list. */
function describeActiveDoses(doses: ProductDetail['activeDoses']): string {
  const [only] = doses;
  if (doses.length === 1 && only) {
    return `${only.memberName} takes it ${formatDoseFrequency(only.timesPerDay, only.intervalDays)}`;
  }
  // Two names read fine; more would just be a wall in the middle of a sentence.
  const names = [...new Set(doses.map((d) => d.memberName))];
  if (names.length <= 2) return `${names.join(' and ')} are on it`;
  return `${names.length} people are on it`;
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

/**
 * What each box cost, and what that works out at per tablet.
 *
 * Per-unit is the number that actually decides anything: it is the only way to
 * compare a 20-pack against a 50-pack, or a złoty price against a euro one.
 * Everything is also shown in euro, converted at the rate recorded on the day
 * of purchase rather than today's — otherwise last year's spend would change
 * every time the exchange rate moved.
 */
function PurchaseHistory({
  purchases,
  unitName,
}: {
  purchases: PurchaseRow[];
  unitName: string;
}) {
  if (purchases.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        No prices recorded. Add one when you receive a box and this starts being able to answer
        “is the big pack actually cheaper”.
      </p>
    );
  }

  const priced = purchases.map((purchase) => {
    const paid = money(purchase.priceMinor, purchase.currency);
    const eur = toEur(paid, purchase.fxRateToEur);
    return {
      ...purchase,
      paid,
      eur,
      // Per unit in euro, so rows in different currencies are comparable.
      perUnitEur: pricePerUnit(eur, purchase.packSize),
    };
  });

  const cheapest = Math.min(...priced.map((p) => p.perUnitEur));

  return (
    <ul className="flex flex-col gap-2">
      {priced.map((purchase) => (
        <li
          key={purchase.batchId}
          className="flex flex-wrap items-baseline justify-between gap-2 border-b pb-2 last:border-0 last:pb-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="min-w-0">
            <p className="text-sm tabular-nums">
              {formatMoney(purchase.paid, { showCurrency: true })}
              {purchase.currency !== 'EUR' ? (
                <span style={{ color: 'var(--muted)' }}>
                  {' '}
                  ≈ {formatMoney(purchase.eur, { showCurrency: true })}
                </span>
              ) : null}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {purchase.purchaseDate ?? 'date unknown'}
              {purchase.tripLabel ? ` · ${purchase.tripLabel}` : ''} ·{' '}
              {purchase.packLabel ?? `${purchase.packSize} ${unitName}`}
              {purchase.status !== 'in_stock' ? ` · ${batchStatusLabel(purchase.status)}` : ''}
            </p>
          </div>

          <span
            className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
            style={
              // Only worth colouring when there is something to compare against.
              priced.length > 1 && purchase.perUnitEur === cheapest
                ? {
                    background: 'color-mix(in oklch, var(--color-ok) 18%, transparent)',
                    color: 'var(--color-ok)',
                  }
                : { color: 'var(--muted)' }
            }
            title={`Per ${unitName}, converted at the rate recorded when it was bought`}
          >
            {formatPricePerUnit(purchase.perUnitEur, 'EUR')} / {unitName}
          </span>
        </li>
      ))}
    </ul>
  );
}
