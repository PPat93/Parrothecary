'use client';

import { useActionState } from 'react';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { CURRENCIES } from '@/db/schema';
import { receiveShoppingItem, type FormResult } from '../../../actions';
import type { ShoppingRow } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function ReceiveForm({ item }: { item: ShoppingRow }) {
  const [state, formAction, pending] = useActionState(receiveShoppingItem, initialState);
  const prev = state.values ?? {};

  const expectedUnits = item.quantityPacks * item.packSize;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="itemId" value={item.id} />
      <input type="hidden" name="variantId" value={item.variantId} />

      <Field
        label="How much arrived"
        hint={`In ${item.unitName}s. ${item.quantityPacks} × ${item.packLabel ?? `${item.packSize} ${item.unitName}`} is ${expectedUnits}.`}
      >
        <TextInput
          name="quantityRemaining"
          inputMode="decimal"
          required
          defaultValue={prev.quantityRemaining ?? String(expectedUnits)}
        />
      </Field>

      {item.hasExpiry ? (
        <Field
          label="Expiry"
          hint="11/2027 if the box only shows a month, or 15.11.2027 for a full date."
        >
          <TextInput name="expiry" placeholder="11/2027" defaultValue={prev.expiry ?? ''} />
        </Field>
      ) : null}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Price paid">
          <TextInput
            name="price"
            inputMode="decimal"
            placeholder="24,99"
            defaultValue={prev.price ?? ''}
          />
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={prev.currency ?? 'PLN'}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Purchase date">
        <TextInput name="purchaseDate" type="date" defaultValue={prev.purchaseDate ?? ''} />
      </Field>

      <Field label="Batch / lot number" hint="Optional.">
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
      <SubmitButton pending={pending}>Add to stock</SubmitButton>
    </form>
  );
}
