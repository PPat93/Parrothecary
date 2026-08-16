'use client';

import { useCallback, useRef, useState } from 'react';
import { useActionState } from 'react';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { PriceFields } from '@/components/price-fields';
import { toneStyle } from '@/components/tone';
import { todayIso } from '@/domain/date';
import { addBatch, linkBarcode, resolveScan, type FormResult, type ScanResult } from '../../actions';
import type { SuggestedFxRate, VariantRow } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function BatchForm({
  variants,
  suggestedRate,
}: {
  variants: VariantRow[];
  suggestedRate: SuggestedFxRate | null;
}) {
  const [state, formAction, pending] = useActionState(addBatch, initialState);
  const prev = state.values ?? {};
  const defaultVariantId = prev.variantId ?? String(variants[0]?.id ?? '');

  /**
   * Uncontrolled on purpose. A controlled select desyncs after a server action:
   * React resets the form, the browser snaps the select back to its first
   * option, and React sees no state change so never puts it right. With
   * defaultValue the reset restores whatever the server echoed back.
   */
  const [variantId, setVariantId] = useState(defaultVariantId);
  const [seenValues, setSeenValues] = useState(state.values);
  if (state.values !== seenValues) {
    setSeenValues(state.values);
    if (prev.variantId && prev.variantId !== variantId) setVariantId(prev.variantId);
  }

  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const selected = variants.find((v) => String(v.id) === variantId);

  const handleScan = useCallback(async (raw: string, format: string) => {
    setScanning(false);
    const result = await resolveScan(raw, format);
    setScan(result);

    const form = formRef.current;
    if (!form) return;

    // These fields are uncontrolled, so writing straight to the DOM is the
    // honest way to fill them — React is not tracking their values.
    if (result.variantId !== null) {
      setVariantId(String(result.variantId));
      const select = form.elements.namedItem('variantId') as HTMLSelectElement | null;
      if (select) select.value = String(result.variantId);
    }
    if (result.expiry) {
      const field = form.elements.namedItem('expiry') as HTMLInputElement | null;
      if (field) field.value = result.expiry;
    }
    if (result.lotNumber) {
      const field = form.elements.namedItem('lotNumber') as HTMLInputElement | null;
      if (field) field.value = result.lotNumber;
    }
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {scanning ? (
        <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setScan(null);
            setScanning(true);
          }}
          className="is-action w-full rounded-xl border px-4 py-3 font-medium"
          style={toneStyle('accent')}
        >
          Scan the box
        </button>
      )}

      {scan ? <ScanSummary scan={scan} variantId={variantId} /> : null}

      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <Field label="Which pack">
          <Select
            key={`variant-${defaultVariantId}`}
            name="variantId"
            defaultValue={defaultVariantId}
            onChange={(e) => setVariantId(e.target.value)}
            required
          >
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.productLabel}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Quantity"
          hint={
            selected
              ? `In ${selected.unitName}s. A full sealed pack is ${selected.packSize}.`
              : 'In base units — tablets, ml, sachets.'
          }
        >
          <TextInput
            name="quantityRemaining"
            inputMode="decimal"
            required
            key={`${variantId}-${prev.quantityRemaining ?? ''}`}
            defaultValue={prev.quantityRemaining ?? (selected ? String(selected.packSize) : '')}
          />
        </Field>

        <Field label="Expiry" hint="11.2027 if the box only shows a month, or 15.11.2027 for a full date.">
          <TextInput name="expiry" placeholder="11.2027" defaultValue={prev.expiry ?? ''} />
        </Field>

        <PriceFields
          suggestedRate={suggestedRate}
          submitted={state.values !== undefined}
          price={prev.price ?? ''}
          currency={prev.currency ?? 'PLN'}
          fxRate={prev.fxRate ?? ''}
        />

        {/*
          Today, not blank. A price with no date behind it counts towards the
          cupboard's value but belongs to no year on Statistics and to no price
          trend — and nothing about an empty date field says that.
        */}
        <Field label="Purchase date">
          <TextInput name="purchaseDate" type="date" defaultValue={prev.purchaseDate ?? todayIso()} />
        </Field>

        <Field label="Batch / lot number" hint="Filled in automatically by a DataMatrix scan.">
          <TextInput name="lotNumber" defaultValue={prev.lotNumber ?? ''} />
        </Field>

        <Field label="Where it lives" hint="Optional.">
          <TextInput
            name="location"
            placeholder="bathroom cabinet"
            defaultValue={prev.location ?? ''}
          />
        </Field>

        <ErrorText>{state.error}</ErrorText>
        <SubmitButton pending={pending}>Add box</SubmitButton>
      </form>
    </div>
  );
}

/**
 * What the scan produced. An unknown code is the interesting case: attaching it
 * to the chosen pack is how the cabinet learns, so the next scan of the same
 * box just works.
 */
function ScanSummary({ scan, variantId }: { scan: ScanResult; variantId: string }) {
  const known = scan.variantId !== null;

  return (
    <div
      className="rounded-xl border p-3 text-sm"
      style={{
        borderColor: known ? 'var(--color-ok)' : 'var(--color-warning)',
        color: known ? 'var(--color-ok)' : 'var(--color-warning)',
      }}
    >
      {known ? (
        <p>
          Recognised: {scan.variantLabel}
          {scan.expiry ? ` · expiry ${scan.expiry}` : ''}
          {scan.lotNumber ? ` · lot ${scan.lotNumber}` : ''}
        </p>
      ) : (
        <>
          <p className="tabular-nums">Unknown code {scan.code}.</p>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            Pick the right pack below, then attach this code so the next scan
            recognises it.
          </p>
          <form action={linkBarcode} className="mt-2">
            <input type="hidden" name="code" value={scan.code} />
            <input type="hidden" name="variantId" value={variantId} />
            <button
              type="submit"
              className="is-action rounded-lg border px-3 py-1.5 text-xs font-medium"
              style={toneStyle('ok')}
            >
              Attach to the selected pack
            </button>
          </form>
        </>
      )}
    </div>
  );
}
