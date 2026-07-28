'use client';

import { useActionState } from 'react';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { CURRENCIES } from '@/db/schema';
import { updateBatch, type FormResult } from '../../../actions';
import type { BatchDetail } from '@/lib/queries';

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

export function BatchEditForm({ box }: { box: BatchDetail }) {
  const [state, formAction, pending] = useActionState(updateBatch, initialState);

  // On a rejected submit show what they typed; otherwise what is stored.
  const prev = state.values ?? {};
  const rejected = state.error !== null;
  const value = (key: string, stored: string) => (rejected ? (prev[key] ?? '') : stored);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={box.batchId} />

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

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Price paid">
          <TextInput
            name="price"
            inputMode="decimal"
            placeholder="24,99"
            defaultValue={value('price', formatAmount(box.purchasePriceMinor))}
          />
        </Field>
        <Field label="Currency">
          <Select
            name="currency"
            defaultValue={rejected ? (prev.currency ?? 'PLN') : (box.purchaseCurrency ?? 'PLN')}
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Purchase date">
        <TextInput
          name="purchaseDate"
          type="date"
          defaultValue={value('purchaseDate', box.purchaseDate ?? '')}
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
