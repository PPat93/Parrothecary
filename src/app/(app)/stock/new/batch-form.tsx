'use client';

import { useActionState, useState } from 'react';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { CURRENCIES } from '@/db/schema';
import { addBatch, type FormResult } from '../../actions';
import type { VariantRow } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function BatchForm({ variants }: { variants: VariantRow[] }) {
  const [state, formAction, pending] = useActionState(addBatch, initialState);

  /**
   * React resets a form once its action returns, so every field reads its value
   * back from `state.values` — otherwise one mistyped expiry date wipes the
   * whole box, including the pack you carefully chose.
   */
  const prev = state.values ?? {};

  const defaultVariantId = prev.variantId ?? String(variants[0]?.id ?? '');

  /**
   * Uncontrolled on purpose. A controlled select desyncs after a server action:
   * React resets the form, the browser snaps the select back to its first
   * option, and React sees no state change so never puts it right — which lost
   * the chosen pack every time a date was mistyped. With defaultValue the reset
   * restores whatever the server echoed back, exactly as the text fields do.
   *
   * The state below only drives the quantity hint, never the select's value.
   */
  const [variantId, setVariantId] = useState(defaultVariantId);
  const [seenValues, setSeenValues] = useState(state.values);
  if (state.values !== seenValues) {
    setSeenValues(state.values);
    if (prev.variantId && prev.variantId !== variantId) setVariantId(prev.variantId);
  }

  const selected = variants.find((v) => String(v.id) === variantId);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Which pack">
        <Select
          /*
           * Keyed on the value the server echoed back. React's form reset runs
           * before a re-render can update the defaultValue attribute, so the
           * select would otherwise snap to whatever it mounted with. Changing
           * the key remounts it and applies the right default from scratch.
           */
          key={`variant-${defaultVariantId}`}
          name="variantId"
          defaultValue={defaultVariantId}
          onChange={(e) => setVariantId(e.target.value)}
          required
        >
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.productLabel}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Quantity"
        hint={
          selected
            ? `In ${selected.unitName}s. A full sealed pack is ${selected.packSize}.`
            : 'In base units — tablets, ml, sachets.'
        }
      >
        <TextInput
          name="quantityRemaining"
          inputMode="decimal"
          required
          // Remount when the pack changes so the default follows the new pack
          // size, but keep whatever the user typed after a failed submit.
          key={`${variantId}-${prev.quantityRemaining ?? ''}`}
          defaultValue={prev.quantityRemaining ?? (selected ? String(selected.packSize) : '')}
        />
      </Field>

      <Field label="Expiry" hint="11/2027 if the box only shows a month, or 15.11.2027 for a full date.">
        <TextInput name="expiry" placeholder="11/2027" defaultValue={prev.expiry ?? ''} />
      </Field>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Price paid">
          <TextInput
            name="price"
            inputMode="decimal"
            placeholder="24,99"
            defaultValue={prev.price ?? ''}
          />
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={prev.currency ?? 'PLN'}>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Purchase date">
        <TextInput name="purchaseDate" type="date" defaultValue={prev.purchaseDate ?? ''} />
      </Field>

      <Field label="Batch / lot number" hint="Optional. Scanned automatically once barcodes land.">
        <TextInput name="lotNumber" defaultValue={prev.lotNumber ?? ''} />
      </Field>

      <Field label="Where it lives" hint="Optional.">
        <TextInput
          name="location"
          placeholder="bathroom cabinet"
          defaultValue={prev.location ?? ''}
        />
      </Field>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Add box</SubmitButton>
    </form>
  );
}
