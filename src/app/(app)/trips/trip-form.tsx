'use client';

import { useActionState } from 'react';
import { ErrorText, Field, SubmitButton, TextInput } from '@/components/form';
import { createTrip, updateTrip, type FormResult } from '../actions';
import type { TripDetail } from '@/lib/queries';

const initialState: FormResult = { error: null };

/**
 * One form for both create and edit. The order-by field is deliberately
 * optional: left blank the server derives it from the midpoint since the last
 * trip, which is also when the cabinet audit falls.
 */
export function TripForm({ trip }: { trip?: TripDetail }) {
  const [state, formAction, pending] = useActionState(
    trip ? updateTrip : createTrip,
    initialState,
  );

  const prev = state.values ?? {};
  const rejected = state.error !== null;
  const value = (key: string, stored: string | null | undefined) =>
    rejected ? (prev[key] ?? '') : (stored ?? '');

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {trip ? <input type="hidden" name="id" value={trip.id} /> : null}

      <Field label="Name" hint="Whatever you call it — “October 2026” is enough.">
        <TextInput
          name="label"
          required
          autoFocus={!trip}
          placeholder="October 2026"
          defaultValue={value('label', trip?.label)}
        />
      </Field>

      <Field label="Collection date" hint="When it all gets picked up in Poland.">
        <TextInput
          name="collectionDate"
          type="date"
          required
          defaultValue={value('collectionDate', trip?.collectionDate)}
        />
      </Field>

      <Field
        label="Order by"
        hint="Leave blank to use the midpoint since the last trip — the same date the cabinet audit falls on."
      >
        <TextInput
          name="orderByDate"
          type="date"
          defaultValue={value('orderByDate', trip?.orderByDate)}
        />
      </Field>

      <Field label="Notes">
        <TextInput
          name="notes"
          placeholder="who is collecting, where it ships…"
          defaultValue={value('notes', trip?.notes)}
        />
      </Field>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>{trip ? 'Save changes' : 'Add trip'}</SubmitButton>
    </form>
  );
}
