'use client';

import { useActionState } from 'react';
import { toneStyle } from '@/components/tone';
import { Datalist, ErrorText, Field, TextInput } from '@/components/form';
import { addBarcode, addSubstanceToProduct, createVariant, type FormResult } from '../../actions';

const initialState: FormResult = { error: null };

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-50"
      style={toneStyle('ok', 'solid')}
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}

export function AddPackForm({ productId, unitName }: { productId: number; unitName: string }) {
  const [state, formAction, pending] = useActionState(createVariant, initialState);
  const prev = state.values ?? {};

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Units per pack" hint={`In ${unitName}s.`}>
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
      </div>
      <ErrorText>{state.error}</ErrorText>
      <Submit pending={pending}>Add pack size</Submit>
    </form>
  );
}

export function AddBarcodeForm({ variantId }: { variantId: number }) {
  const [state, formAction, pending] = useActionState(addBarcode, initialState);
  const prev = state.values ?? {};

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="variantId" value={variantId} />
      <div className="flex gap-2">
        <TextInput
          name="code"
          inputMode="numeric"
          required
          placeholder="5909991434090"
          aria-label="Barcode digits"
          defaultValue={prev.code ?? ''}
        />
        <Submit pending={pending}>Add</Submit>
      </div>
      <ErrorText>{state.error}</ErrorText>
    </form>
  );
}

export function AddSubstanceForm({
  productId,
  substanceNames,
}: {
  productId: number;
  substanceNames: string[];
}) {
  const [state, formAction, pending] = useActionState(addSubstanceToProduct, initialState);
  const prev = state.values ?? {};

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="productId" value={productId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Substance">
          <TextInput
            name="substance"
            list="substances"
            required
            placeholder="Paracetamol"
            defaultValue={prev.substance ?? ''}
          />
          <Datalist id="substances" options={substanceNames} />
        </Field>
        <Field label="Amount per unit">
          <TextInput
            name="substanceAmount"
            placeholder="500 mg"
            defaultValue={prev.substanceAmount ?? ''}
          />
        </Field>
      </div>
      <ErrorText>{state.error}</ErrorText>
      <Submit pending={pending}>Add substance</Submit>
    </form>
  );
}
