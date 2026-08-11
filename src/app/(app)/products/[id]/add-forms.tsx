'use client';

import { useActionState } from 'react';
import { toneStyle } from '@/components/tone';
import { Datalist, ErrorText, Field, Select, TextInput } from '@/components/form';
import { ALTERNATIVE_RELATION_LABELS } from '@/lib/labels';
import {
  addAlternative,
  addBarcode,
  addSubstanceToProduct,
  addSymptomToProduct,
  createVariant,
  type FormResult,
} from '../../actions';

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

export function AddSymptomForm({
  productId,
  symptomNames,
}: {
  productId: number;
  symptomNames: string[];
}) {
  const [state, formAction, pending] = useActionState(addSymptomToProduct, initialState);
  const prev = state.values ?? {};

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />
      <div className="flex gap-2">
        <TextInput
          name="symptom"
          list="symptoms"
          required
          placeholder="sore throat"
          aria-label="What it is used for"
          defaultValue={prev.symptom ?? ''}
        />
        <Datalist id="symptoms" options={symptomNames} />
        <Submit pending={pending}>Add</Submit>
      </div>

      {/* Same rule as substances: fills a blank alias, never replaces one. */}
      <TextInput
        name="symptomPl"
        placeholder="ból gardła — optional, so a Polish search finds it"
        aria-label="Polish name for this tag, optional"
        defaultValue={prev.symptomPl ?? ''}
      />
      <ErrorText>{state.error}</ErrorText>
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

      {/*
        Optional, and only fills a blank: typing a substance that already exists
        is the usual way here, and an alias somebody set deliberately should not
        be replaced from a field they were not thinking about. Changing one is
        the pencil's job.
      */}
      <Field label="Polish name" hint="Optional. Lets a search in Polish find it.">
        <TextInput name="substancePl" placeholder="Paracetamol" defaultValue={prev.substancePl ?? ''} />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <Submit pending={pending}>Add substance</Submit>
    </form>
  );
}

/**
 * Link something that could stand in for this.
 *
 * A picker rather than free text: an alternative has to be a product the app
 * already knows, or it could not tell you whether any is on the shelf — which
 * is the only reason to ask the question.
 */
export function AddAlternativeForm({
  productId,
  candidates,
}: {
  productId: number;
  candidates: { id: number; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(addAlternative, initialState);
  const prev = state.values ?? {};

  if (candidates.length === 0) return null;

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="productId" value={productId} />

      <Select name="alternativeId" required defaultValue={prev.alternativeId ?? ''}
              aria-label="Which product could stand in for this">
        <option value="">Pick a product…</option>
        {candidates.map((candidate) => (
          <option key={candidate.id} value={candidate.id}>
            {candidate.label}
          </option>
        ))}
      </Select>

      <div className="flex gap-2">
        <Select name="relation" required defaultValue={prev.relation ?? 'same_substance'}
                aria-label="How the two are related">
          {Object.entries(ALTERNATIVE_RELATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Submit pending={pending}>Link</Submit>
      </div>

      <TextInput
        name="note"
        placeholder="half the price, needs a prescription…"
        aria-label="Note about this alternative"
        defaultValue={prev.note ?? ''}
      />

      <ErrorText>{state.error}</ErrorText>
    </form>
  );
}
