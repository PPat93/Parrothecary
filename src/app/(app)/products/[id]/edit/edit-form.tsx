'use client';

import { useActionState, useState } from 'react';
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
import { updateProduct, type FormResult } from '../../../actions';
import type { ProductDetail } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function EditProductForm({
  product,
  manufacturers,
}: {
  product: ProductDetail;
  manufacturers: string[];
}) {
  const [state, formAction, pending] = useActionState(updateProduct, initialState);

  // On a rejected submit show what they typed; otherwise show what is stored.
  const prev = state.values ?? {};
  const rejected = state.error !== null;
  const value = (key: string, stored: string | null) =>
    rejected ? (prev[key] ?? '') : (stored ?? '');
  const checked = (key: string, stored: boolean) =>
    rejected ? prev[key] === 'on' : stored;

  const [hasExpiry, setHasExpiry] = useState(checked('hasExpiry', product.hasExpiry));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={product.id} />

      <Field label="Name" hint="Exactly as printed on the box, whatever language that is.">
        <TextInput name="name" required defaultValue={value('name', product.name)} />
      </Field>

      <Field label="Other name" hint="Optional — what it is called in the other language.">
        <TextInput name="nameAlt" defaultValue={value('nameAlt', product.nameAlt)} />
      </Field>

      <Field label="Strength">
        <TextInput name="strength" defaultValue={value('strength', product.strength)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Form">
          <Select name="form" defaultValue={rejected ? (prev.form ?? product.form) : product.form}>
            {DOSE_FORMS.map((form) => (
              <option key={form} value={form}>
                {form}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Counted in">
          <Select
            name="unitName"
            defaultValue={rejected ? (prev.unitName ?? product.unitName) : product.unitName}
          >
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
          defaultValue={value('manufacturer', product.manufacturer)}
        />
        <Datalist id="manufacturers" options={manufacturers} />
      </Field>

      <Field label="Notes">
        <TextInput name="notes" defaultValue={value('notes', product.notes)} />
      </Field>

      <Checkbox
        name="isPrescription"
        label="Prescription only"
        defaultChecked={checked('isPrescription', product.isPrescription)}
      />
      <Checkbox
        name="hasExpiry"
        label="This expires (uncheck for plasters, thermometers…)"
        checked={hasExpiry}
        onChange={setHasExpiry}
      />

      {/*
        Hidden for things that do not expire — see the create form. Unticking
        also clears any grace already stored, which is right: it cannot apply to
        a product with no date to be past.
      */}
      {hasExpiry ? (
        <Field
          label="Still usable past its date (days)"
          hint="Leave blank for none. 60 suits paracetamol tablets; keep it at zero for eye drops, sprays, sterile dressings and antibiotics. Only affects what doses are taken from — the expiry list still calls the box expired."
        >
          <TextInput
            name="expiryGraceDays"
            inputMode="numeric"
            placeholder="0"
            defaultValue={value('expiryGraceDays', String(product.expiryGraceDays))}
          />
        </Field>
      ) : null}

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Save changes</SubmitButton>
    </form>
  );
}
