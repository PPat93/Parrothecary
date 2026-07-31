'use client';

import { useActionState, useState } from 'react';
import { ErrorText, Field, Select, SubmitButton, TextInput } from '@/components/form';
import { createSchedule, type FormResult } from '../../actions';
import type { ProductRow } from '@/lib/queries';

const initialState: FormResult = { error: null };

export function ScheduleForm({
  memberId,
  products,
  today,
}: {
  memberId: number;
  products: ProductRow[];
  today: string;
}) {
  const [state, formAction, pending] = useActionState(createSchedule, initialState);
  const prev = state.values ?? {};

  const defaultProductId = prev.productId ?? String(products[0]?.id ?? '');
  const [productId, setProductId] = useState(defaultProductId);
  const selected = products.find((p) => String(p.id) === productId);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="memberId" value={memberId} />

      <Field label="What is being taken">
        <Select
          name="productId"
          defaultValue={defaultProductId}
          onChange={(e) => setProductId(e.target.value)}
          required
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
              {product.strength ? ` ${product.strength}` : ''}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Dose"
        hint={selected ? `In ${selected.unitName}s per time.` : 'In base units per time.'}
      >
        <TextInput
          name="doseUnits"
          inputMode="decimal"
          required
          placeholder="1"
          defaultValue={prev.doseUnits ?? ''}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Times per dosing day" hint="Morning and evening is 2, not one split dose.">
          <TextInput
            name="timesPerDay"
            inputMode="numeric"
            defaultValue={prev.timesPerDay ?? '1'}
          />
        </Field>

        <Field label="Every … days" hint="1 for daily, 7 for weekly, 2 for alternate days.">
          <TextInput
            name="intervalDays"
            inputMode="numeric"
            defaultValue={prev.intervalDays ?? '1'}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Start date"
          hint="Also the day every interval counts from — a weekly dose repeats on this weekday."
        >
          <TextInput name="startDate" type="date" required defaultValue={prev.startDate ?? today} />
        </Field>
        <Field label="End date" hint="Optional — for a course or a season.">
          <TextInput name="endDate" type="date" defaultValue={prev.endDate ?? ''} />
        </Field>
      </div>

      <Field label="Notes">
        <TextInput name="notes" placeholder="with food, morning only…" defaultValue={prev.notes ?? ''} />
      </Field>

      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pending={pending}>Add schedule</SubmitButton>
    </form>
  );
}
