'use client';

import { useCallback, useRef, useState } from 'react';
import { useActionState } from 'react';
import { ActionButton } from '@/components/action-button';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { Checkbox, ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { PriceFields } from '@/components/price-fields';
import { toneStyle } from '@/components/tone';
import { todayIso } from '@/domain/date';
import { addBatch, linkBarcode, resolveScan, type FormResult, type ScanResult } from '../../actions';
import type { VariantRow } from '@/lib/queries';
import type { FxRateOnDate } from '@/domain/money';

const initialState: FormResult = { error: null };

export function BatchForm({
  variants,
  rateHistory,
}: {
  variants: VariantRow[];
  rateHistory: FxRateOnDate[];
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

  /*
   * A mirror of the purchase-date field, kept only so the offered exchange rate
   * can follow it. The field itself stays uncontrolled; this is re-synced below
   * when the server echoes values back, because a rejected submit rebuilds that
   * input and the mirror has to move with it.
   */
  const [purchaseDate, setPurchaseDate] = useState(prev.purchaseDate ?? todayIso());

  const [seenValues, setSeenValues] = useState(state.values);
  if (state.values !== seenValues) {
    setSeenValues(state.values);
    if (prev.variantId && prev.variantId !== variantId) setVariantId(prev.variantId);
    if (prev.purchaseDate !== undefined && prev.purchaseDate !== purchaseDate) {
      setPurchaseDate(prev.purchaseDate);
    }
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

      {scan ? (
        <ScanSummary
          /*
           * Keyed by the code, so a new code gets a new panel and a new attach
           * state. Not fixing a live bug: opening the scanner sets `scan` to
           * null a few lines up, which unmounts this and discards that state
           * anyway. The key is here so the guarantee is local — otherwise a
           * refused attach ("already belongs to a different pack") would linger
           * over the next code, and nothing near this line would say why not.
           *
           * Attaching keeps the same code, so the panel is not remounted and
           * flips to "Recognised" in place, which is the intended behaviour.
           */
          key={scan.code}
          scan={scan}
          variantId={variantId}
          /*
           * The panel flips to "Recognised", because after attaching that is
           * simply true — and it is the same thing a second scan of the box
           * would now show. Clearing the panel instead would have been the
           * other honest option; this one leaves the expiry and lot number
           * from the scan on screen, which are still worth reading.
           */
          onAttached={() =>
            setScan({
              ...scan,
              variantId: Number(variantId),
              variantLabel: selected?.productLabel ?? scan.variantLabel,
            })
          }
        />
      ) : null}

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
          rateHistory={rateHistory}
          purchaseDate={purchaseDate}
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
          <TextInput
          /*
           * Uncontrolled, like the rest of this form and for the same reason:
           * a controlled field desyncs after a server action, because React
           * resets the form and then sees no state change to put it right. The
           * state below only mirrors it, so the offered exchange rate can
           * follow the date — the DOM stays in charge of the value.
           */
            key={`date-${prev.purchaseDate ?? ''}`}
            name="purchaseDate"
            type="date"
            defaultValue={prev.purchaseDate ?? todayIso()}
            onChange={(event) => setPurchaseDate(event.target.value)}
          />
        </Field>

        {/*
          The ledger has always had a word for a box that was in the drawer
          before the app existed — "already in the cupboard when this started" —
          and no way to say it. Setting up against a full cupboard is the case
          it was written for, and without this every box entered that day would
          have read "arrived" beside a purchase date from two years earlier.
        */}
        <Checkbox
          name="alreadyHad"
          label="Already in the cupboard (not a new arrival)"
          /*
           * The date above defaults to today, which is right for a box that
           * just came in and wrong for every box this tick describes. Entering
           * a full cupboard at setup without noticing would file three years of
           * purchases as this year's spending — the figure the money page leads
           * with. Cheap to say, expensive to discover later.
           */
          hint="Set the purchase date to when you actually bought it — it starts at today, which would count an old purchase as this year's spending."
          defaultChecked={state.values !== undefined && prev.alreadyHad === 'on'}
        />

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
 *
 * This panel is drawn entirely from client state, which is what made attaching
 * look broken. `linkBarcode` calls `refreshAll()`, and that re-renders server
 * components — but `scan` is a value held up in BatchForm, so it went on saying
 * "Unknown code" however many times the button was pressed. The row was written
 * every time; only leaving the page and coming back revealed it. Nothing tells
 * a person "that worked" less convincingly than a button that does nothing.
 *
 * So the action reports back and `onAttached` moves the state on, the same
 * shape the photo form uses for the same reason (see photo-form.tsx).
 */
function ScanSummary({
  scan,
  variantId,
  onAttached,
}: {
  scan: ScanResult;
  variantId: string;
  onAttached: () => void;
}) {
  const known = scan.variantId !== null;
  const [state, formAction] = useActionState(linkBarcode, initialState);

  /*
   * Runs once per action result, not once per render. Comparing the whole state
   * object works because useActionState hands back a new one each time — the
   * same latch as photo-form.tsx, and the reason a plain `if (state.ok)` would
   * loop forever here.
   */
  const [seenLink, setSeenLink] = useState(state);
  if (state !== seenLink) {
    setSeenLink(state);
    if (state.ok) onAttached();
  }

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
          <form action={formAction} className="mt-2">
            <input type="hidden" name="code" value={scan.code} />
            <input type="hidden" name="variantId" value={variantId} />
            <ActionButton tone="ok" pendingLabel="Attaching…">
              Attach to the selected pack
            </ActionButton>
          </form>
          {/* "Already on a different pack" used to be discarded by the action
              and never reached anybody. */}
          <ErrorText>{state.error}</ErrorText>
        </>
      )}
    </div>
  );
}
