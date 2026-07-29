'use client';

import { useActionState } from 'react';
import { ErrorText, Field, SubmitButton, TextInput } from '@/components/form';
import { createMember, type FormResult } from '../../actions';

const initialState: FormResult = { error: null };

export function MemberForm() {
  const [state, formAction, pending] = useActionState(createMember, initialState);
  const prev = state.values ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Name">
        <TextInput name="name" required autoFocus defaultValue={prev.name ?? ''} />
      </Field>
      <Field label="Notes" hint="Optional — allergies, a GP's advice, anything worth remembering.">
        <TextInput name="notes" defaultValue={prev.notes ?? ''} />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Add person</SubmitButton>
    </form>
  );
}
