'use client';

import { useActionState } from 'react';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { addShoppingItem, type FormResult } from '../actions';
import type { VariantRow } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function AddShoppingForm({ variants }: { variants: VariantRow[] }) {
  const [state, formAction, pending] = useActionState(addShoppingItem, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="What to buy">
        <Select name="variantId" required>
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.productLabel}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Packs">
          <TextInput name="quantityPacks" inputMode="numeric" defaultValue="1" required />
        </Field>
        <Field label="Note">
          <TextInput name="notes" placeholder="ask Mama to order" />
        </Field>
      </div>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Add to list</SubmitButton>
    </form>
  );
}
