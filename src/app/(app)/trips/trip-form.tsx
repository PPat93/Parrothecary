'use client';

import { useActionState, useState } from 'react';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { createTrip, updateTrip, type FormResult } from '../actions';
import type { TripDetail } from '@/lib/queries';

const initialState: FormResult = { error: null };

/**
 * One form for both create and edit, and for both kinds of journey.
 *
 * The two kinds need different dates, so the fields swap rather than sitting
 * there greyed out: a holiday has no order deadline to miss, and a restock has
 * no return date to pack for. Asking for both would make each trip half a form
 * of things that do not apply to it.
 *
 * The order-by field is deliberately optional: left blank the server derives it
 * from the midpoint since the last trip, which is also when the cabinet audit
 * falls.
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

  const [kind, setKind] = useState<string>(
    (rejected ? prev.kind : trip?.kind) ?? 'restock',
  );
  const travelling = kind === 'travel';

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

      <Field
        label="What kind"
        hint="A restock brings stock in. Ordinary travel takes a kit out and mostly brings it back."
      >
        <Select name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="restock">Restock</option>
          <option value="travel">Ordinary travel</option>
        </Select>
      </Field>

      <Field
        label={travelling ? 'Leaving' : 'Collection date'}
        hint={travelling ? 'The first day away.' : 'When it all gets picked up.'}
      >
        <TextInput
          name="collectionDate"
          type="date"
          required
          defaultValue={value('collectionDate', trip?.collectionDate)}
        />
      </Field>

      {travelling ? (
        <Field
          label="Coming back"
          hint="Both days count as days away, so this is what decides how many tablets go in the bag."
        >
          <TextInput
            name="returnDate"
            type="date"
            required
            defaultValue={value('returnDate', trip?.returnDate)}
          />
        </Field>
      ) : (
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
      )}

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
