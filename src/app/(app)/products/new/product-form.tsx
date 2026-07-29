'use client';

import { useActionState } from 'react';
import {
  Checkbox,
  Datalist,
  ErrorText,
  Field,
  Select,
  SubmitButton,
  TextInput,
} from '@/components/form';
import { DOSE_FORMS, UNIT_NAMES } from '@/db/schema';
import { createProduct, type FormResult } from '../../actions';

const initialState: FormResult = { error: null };

export function ProductForm({
  manufacturers,
  substanceNames,
  symptomNames,
}: {
  manufacturers: string[];
  substanceNames: string[];
  symptomNames: string[];
}) {
  const [state, formAction, pending] = useActionState(createProduct, initialState);

  // React resets the form once the action returns, so every field reads back
  // from the rejected submission rather than starting blank.
  const prev = state.values ?? {};
  const submitted = state.error !== null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Name" hint="Exactly as printed on the box, whatever language that is.">
        <TextInput
          name="name"
          required
          autoFocus
          placeholder="Ibuprom Max"
          defaultValue={prev.name ?? ''}
        />
      </Field>

      <Field label="Other name" hint="Optional — the Polish or Irish equivalent. Search matches both.">
        <TextInput name="nameAlt" placeholder="Nurofen" defaultValue={prev.nameAlt ?? ''} />
      </Field>

      <Field label="Strength" hint="Free text — combination products are fine: 500 mg + 65 mg.">
        <TextInput name="strength" placeholder="400 mg" defaultValue={prev.strength ?? ''} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Form">
          <Select name="form" defaultValue={prev.form ?? 'tablet'}>
            {DOSE_FORMS.map((form) => (
              <option key={form} value={form}>
                {form}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Counted in">
          <Select name="unitName" defaultValue={prev.unitName ?? 'tablet'}>
            {UNIT_NAMES.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Manufacturer" hint="Pick one you have used before, or type a new one.">
        <TextInput
          name="manufacturer"
          list="manufacturers"
          placeholder="US Pharmacia"
          defaultValue={prev.manufacturer ?? ''}
        />
        <Datalist id="manufacturers" options={manufacturers} />
      </Field>

      <Field label="Notes">
        <TextInput
          name="notes"
          placeholder="anything worth remembering"
          defaultValue={prev.notes ?? ''}
        />
      </Field>

      <Checkbox
        name="isPrescription"
        label="Prescription only"
        defaultChecked={submitted ? prev.isPrescription === 'on' : false}
      />
      <Checkbox
        name="hasExpiry"
        label="This expires (uncheck for plasters, thermometers…)"
        // Almost everything expires, so this is on unless the user says otherwise.
        defaultChecked={submitted ? prev.hasExpiry === 'on' : true}
      />

      <fieldset
        className="flex flex-col gap-3 rounded-xl border p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <legend className="px-1 text-sm font-medium">Active substance (optional)</legend>
        <Field label="Substance" hint="Pick one already used, or type a new one.">
          <TextInput
            name="substance"
            list="substances"
            placeholder="Paracetamol"
            defaultValue={prev.substance ?? ''}
          />
          <Datalist id="substances" options={substanceNames} />
        </Field>
        <Field label="Amount per unit" hint="Free text: 500 mg, 4000 IU, 0,9%.">
          <TextInput
            name="substanceAmount"
            placeholder="500 mg"
            defaultValue={prev.substanceAmount ?? ''}
          />
        </Field>
      </fieldset>

      <fieldset
        className="flex flex-col gap-3 rounded-xl border p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <legend className="px-1 text-sm font-medium">Used for (optional)</legend>
        <Field
          label="Symptom"
          hint="Tagging now is what makes “what do we have for a sore throat” work later. More can be added afterwards."
        >
          <TextInput
            name="symptom"
            list="symptoms"
            placeholder="sore throat"
            defaultValue={prev.symptom ?? ''}
          />
          <Datalist id="symptoms" options={symptomNames} />
        </Field>
      </fieldset>

      <fieldset
        className="flex flex-col gap-3 rounded-xl border p-3"
        style={{ borderColor: 'var(--border)' }}
      >
        <legend className="px-1 text-sm font-medium">Pack size</legend>
        <Field
          label="Units per pack"
          hint="Required — without a pack size this product cannot hold boxes or be shopped for."
        >
          <TextInput
            name="packSize"
            inputMode="decimal"
            required
            placeholder="60"
            defaultValue={prev.packSize ?? ''}
          />
        </Field>
        <Field label="Pack label">
          <TextInput name="packLabel" placeholder="60 tabl." defaultValue={prev.packLabel ?? ''} />
        </Field>
      </fieldset>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Save product</SubmitButton>
    </form>
  );
}
