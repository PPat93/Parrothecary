'use client';

import { useActionState } from 'react';
import { Checkbox, ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { DOSE_FORMS, UNIT_NAMES } from '@/db/schema';
import { createProduct } from '../../actions';
import type { FormResult } from '../../actions';

const initialState: FormResult = { error: null };

export function ProductForm() {
  const [state, formAction, pending] = useActionState(createProduct, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Name" hint="Exactly as printed on the box, whatever language that is.">
        <TextInput name="name" required autoFocus placeholder="Ibuprom Max" />
      </Field>

      <Field label="Other name" hint="Optional — the Polish or Irish equivalent. Search matches both.">
        <TextInput name="nameAlt" placeholder="Nurofen" />
      </Field>

      <Field label="Strength" hint="Free text — combination products are fine: 500 mg + 65 mg.">
        <TextInput name="strength" placeholder="400 mg" />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Form">
          <Select name="form" defaultValue="tablet">
            {DOSE_FORMS.map((form) => (
              <option key={form} value={form}>
                {form}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Counted in">
          <Select name="unitName" defaultValue="tablet">
            {UNIT_NAMES.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Manufacturer">
        <TextInput name="manufacturer" placeholder="US Pharmacia" />
      </Field>

      <Field label="Notes">
        <TextInput name="notes" placeholder="anything worth remembering" />
      </Field>

      <Checkbox name="isPrescription" label="Prescription only" />
      <Checkbox name="hasExpiry" label="This expires (uncheck for plasters, thermometers…)" />

      <fieldset
        className="flex flex-col gap-3 rounded-xl border p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <legend className="px-1 text-sm font-medium">First pack size (optional)</legend>
        <Field label="Units per pack" hint="Tablets, ml or sachets in one sealed pack.">
          <TextInput name="packSize" inputMode="decimal" placeholder="60" />
        </Field>
        <Field label="Pack label">
          <TextInput name="packLabel" placeholder="60 tabl." />
        </Field>
      </fieldset>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Save product</SubmitButton>
    </form>
  );
}
