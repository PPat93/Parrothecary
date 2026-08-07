'use client';

import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { isTrackableQuantity, parseUnits } from '@/domain/quantity';
import { setKitUnits } from '../../../actions';

/**
 * How much of this to take.
 *
 * Editable because the computed number is a starting point, not an instruction:
 * a spare day's worth for a delayed flight is a judgement the app has no
 * business making silently. Save only appears once the number has changed, so
 * the row stays quiet until there is something to do.
 */
export function KitUnits({
  id,
  units,
  unitName,
}: {
  id: number;
  units: number;
  unitName: string;
}) {
  const [value, setValue] = useState(String(units));

  const parsed = parseUnits(value.trim());
  const usable = parsed !== null && parsed >= 0 && (parsed === 0 || isTrackableQuantity(parsed));
  const changed = usable && parsed !== units;

  return (
    <form action={setKitUnits} className="flex shrink-0 items-center gap-1">
      <input type="hidden" name="id" value={id} />

      <div className="w-16">
        <input
          name="units"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          inputMode="decimal"
          aria-label={`How many ${unitName} to take`}
          className="h-9 w-full rounded-lg border px-2 text-center text-sm outline-none focus:ring-2"
          style={{
            background: 'var(--surface)',
            borderColor: usable ? 'var(--border)' : 'var(--color-critical)',
            color: usable ? 'var(--text)' : 'var(--color-critical)',
          }}
        />
      </div>

      {changed ? (
        <ActionButton tone="accent" aria-label="Save the amount" className="rounded-lg border px-2 py-1 text-xs">
          Save
        </ActionButton>
      ) : null}
    </form>
  );
}
