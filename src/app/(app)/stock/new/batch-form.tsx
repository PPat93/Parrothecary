'use client';

import { useActionState, useState } from 'react';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { CURRENCIES } from '@/db/schema';
import { addBatch, type FormResult } from '../../actions';
import type { VariantRow } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function BatchForm({ variants }: { variants: VariantRow[] }) {
  const [state, formAction, pending] = useActionState(addBatch, initialState);
  const [variantId, setVariantId] = useState(() => String(variants[0]?.id ?? ''));

  const selected = variants.find((v) => String(v.id) === variantId);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Which pack">
        <Select name="variantId" value={variantId} onChange={(e) => setVariantId(e.target.value)} required>
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
          defaultValue={selected ? String(selected.packSize) : ''}
          key={variantId}
        />
      </Field>

      <Field label="Expiry" hint="11/2027 if the box only shows a month, or 15.11.2027 for a full date.">
        <TextInput name="expiry" placeholder="11/2027" />
      </Field>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Price paid">
          <TextInput name="price" inputMode="decimal" placeholder="24,99" />
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue="PLN">
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Purchase date">
        <TextInput name="purchaseDate" type="date" />
      </Field>

      <Field label="Batch / lot number" hint="Optional. Scanned automatically once barcodes land.">
        <TextInput name="lotNumber" />
      </Field>

      <Field label="Where it lives" hint="Optional.">
        <TextInput name="location" placeholder="bathroom cabinet" />
      </Field>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Add box</SubmitButton>
    </form>
  );
}
