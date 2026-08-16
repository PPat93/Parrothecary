'use client';

import { useActionState, useState } from 'react';
import { ErrorText, Field, SubmitButton, TextInput } from '@/components/form';
import { PriceFields } from '@/components/price-fields';
import { updateBatch, type FormResult } from '../../../actions';
import type { BatchDetail } from '@/lib/queries';
import type { FxRateOnDate } from '@/domain/money';

const initialState: FormResult = { error: null };

/** Minor units back to something typeable: 2499 -> "24,99". */
function formatAmount(minor: number | null): string {
  if (minor === null) return '';
  return `${Math.floor(minor / 100)},${String(Math.abs(minor % 100)).padStart(2, '0')}`;
}

/** "2027-11-30" + month precision reads back as "11.2027", as it was entered. */
function formatExpiryInput(box: BatchDetail): string {
  if (!box.expiryDate) return '';
  const [year, month, day] = box.expiryDate.split('-');
  return box.expiryPrecision === 'month' ? `${month}.${year}` : `${day}.${month}.${year}`;
}

export function BatchEditForm({
  box,
  from,
  rateHistory,
}: {
  box: BatchDetail;
  from: string | null;
  /*
   * Only ever consulted for a box that has no rate of its own — `PriceFields`
   * leaves a stored value alone. This is the screen that repairs a złoty box
   * sitting outside the euro totals, so the rate its neighbours were bought at
   * is exactly what is wanted here.
   */
  rateHistory: FxRateOnDate[];
}) {
  const [state, formAction, pending] = useActionState(updateBatch, initialState);

  // On a rejected submit show what they typed; otherwise what is stored.
  const prev = state.values ?? {};
  const rejected = state.error !== null;
  const value = (key: string, stored: string) => (rejected ? (prev[key] ?? '') : stored);

  // Controlled, because the offered rate follows it: repairing a 2024 box has
  // to reach for the 2024 rate, and moving the date has to move the answer.
  const [purchaseDate, setPurchaseDate] = useState(value('purchaseDate', box.purchaseDate ?? ''));
  const [seenValues, setSeenValues] = useState(state.values);
  if (state.values !== seenValues) {
    setSeenValues(state.values);
    if (prev.purchaseDate !== undefined && prev.purchaseDate !== purchaseDate) {
      setPurchaseDate(prev.purchaseDate);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={box.batchId} />
      {from ? <input type="hidden" name="from" value={from} /> : null}

      <Field
        label="Quantity"
        hint={`In ${box.unitName}s. A full sealed pack is ${box.packSize}.`}
      >
        <TextInput
          name="quantityRemaining"
          inputMode="decimal"
          required
          defaultValue={value('quantityRemaining', String(box.quantityRemaining))}
        />
      </Field>

      {box.hasExpiry ? (
        <Field label="Expiry" hint="11.2027 if the box only shows a month, or 15.11.2027 for a full date.">
          <TextInput
            name="expiry"
            placeholder="11.2027"
            defaultValue={value('expiry', formatExpiryInput(box))}
          />
        </Field>
      ) : null}

      <PriceFields
        price={value('price', formatAmount(box.purchasePriceMinor))}
        currency={rejected ? (prev.currency ?? 'PLN') : (box.purchaseCurrency ?? 'PLN')}
        fxRate={value('fxRate', box.fxRateToEur === null ? '' : String(box.fxRateToEur))}
        rateHistory={rateHistory}
        purchaseDate={purchaseDate === '' ? null : purchaseDate}
        submitted={state.values !== undefined}
      />

      <Field label="Purchase date">
        <TextInput
          name="purchaseDate"
          type="date"
          value={purchaseDate}
          onChange={(event) => setPurchaseDate(event.target.value)}
        />
      </Field>

      <Field label="Batch / lot number">
        <TextInput name="lotNumber" defaultValue={value('lotNumber', box.lotNumber ?? '')} />
      </Field>

      <Field label="Where it lives">
        <TextInput
          name="location"
          placeholder="bathroom cabinet"
          defaultValue={value('location', box.location ?? '')}
        />
      </Field>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Save changes</SubmitButton>
    </form>
  );
}
