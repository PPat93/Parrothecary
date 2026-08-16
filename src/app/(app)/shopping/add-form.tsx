'use client';

import { useActionState } from 'react';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { addShoppingItem, type FormResult } from '../actions';
import type { TripOption, VariantRow } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function AddShoppingForm({
  variants,
  trips,
}: {
  variants: VariantRow[];
  trips: TripOption[];
}) {
  const [state, formAction, pending] = useActionState(addShoppingItem, initialState);
  const prev = state.values ?? {};

  // The next planned trip, because that is what almost everything added today
  // is for. Still changeable, and "no trip" stays available for local buys.
  const defaultTripId = trips[0] ? String(trips[0].id) : '';

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="What to buy">
        {/*
          The empty option is what makes `required` mean anything. Without it
          the browser had nothing blank to land on, so the field opened already
          showing whichever product sorts first — and a form filled in from the
          top down (packs, note, Add) put that product on the list without
          anybody choosing it. The same picker on the product page has always
          had its "Pick a product…" row; this one was the odd one out, which is
          also why the action's "Pick which pack to buy" error was unreachable.
        */}
        <Select name="variantId" required defaultValue={prev.variantId ?? ''}>
          <option value="">Pick a pack…</option>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.productLabel}
            </option>
          ))}
        </Select>
      </Field>

      {trips.length > 0 ? (
        <Field label="For which trip" hint="Leave as “no trip” for anything bought locally.">
          <Select name="tripId" defaultValue={prev.tripId ?? defaultTripId}>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.label} — collect {trip.collectionDate}
              </option>
            ))}
            <option value="">No trip</option>
          </Select>
        </Field>
      ) : null}

      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Packs">
          <TextInput
            name="quantityPacks"
            inputMode="numeric"
            defaultValue={prev.quantityPacks ?? '1'}
            required
          />
        </Field>
        <Field label="Note">
          <TextInput name="notes" placeholder="optional note" defaultValue={prev.notes ?? ''} />
        </Field>
      </div>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Add to list</SubmitButton>
    </form>
  );
}
