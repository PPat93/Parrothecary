'use client';

import { useActionState } from 'react';
import { ErrorText, Field, SubmitButton, TextInput } from '@/components/form';
import { todayIso } from '@/domain/date';
import { PriceFields } from '@/components/price-fields';
import { receiveShoppingItem, type FormResult } from '../../../actions';
import type { ShoppingRow, SuggestedFxRate } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function ReceiveForm({
  item,
  suggestedRate,
}: {
  item: ShoppingRow;
  suggestedRate: SuggestedFxRate | null;
}) {
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

      <PriceFields
        price={prev.price ?? ''}
        currency={prev.currency ?? 'PLN'}
        fxRate={prev.fxRate ?? ''}
        suggestedRate={suggestedRate}
      />

      {/*
        Filled in from the trip, because the app already knows the answer and
        leaving it blank is not harmless: a box with a price and no date counts
        towards the trip's total and towards the cupboard's value, but belongs
        to no year on Statistics and to no price trend. Every ordinary restock
        produced one — tick, order, arrive, receive, and never think about a
        date nobody asked you for.

        Still editable: something collected late, or bought a week early, has
        its own date and this is where to say so.
      */}
      <Field
        label="Purchase date"
        hint={item.tripCollectionDate !== null ? 'From the trip. Change it if it was really another day.' : undefined}
      >
        <TextInput
          name="purchaseDate"
          type="date"
          defaultValue={prev.purchaseDate ?? item.tripCollectionDate ?? todayIso()}
        />
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
