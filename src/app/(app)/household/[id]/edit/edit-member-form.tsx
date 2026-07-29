'use client';

import { useActionState } from 'react';
import { ErrorText, Field, SubmitButton, TextInput } from '@/components/form';
import { updateMember, type FormResult } from '../../../actions';
import type { HouseholdMemberRow } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function EditMemberForm({ member }: { member: HouseholdMemberRow }) {
  const [state, formAction, pending] = useActionState(updateMember, initialState);
  const prev = state.values ?? {};
  const rejected = state.error !== null;
  const value = (key: string, stored: string | null) => (rejected ? (prev[key] ?? '') : (stored ?? ''));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={member.id} />
      <Field label="Name">
        <TextInput name="name" required defaultValue={value('name', member.name)} />
      </Field>
      <Field label="Notes">
        <TextInput name="notes" defaultValue={value('notes', member.notes)} />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Save changes</SubmitButton>
    </form>
  );
}
