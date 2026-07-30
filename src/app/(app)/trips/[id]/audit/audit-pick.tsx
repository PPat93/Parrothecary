'use client';

import { useState } from 'react';
import { packsNeeded, withBuffer } from '@/domain/quantity';

export interface PickVariant {
  id: number;
  packSize: number;
  packLabel: string | null;
}

/**
 * The quantity control for one worksheet row.
 *
 * Client-side because the pack size is a choice, not a fact: you might want the
 * ninety but the chemist only has the thirty, and how many packs you need
 * depends on which one you end up buying. A server-rendered number would go
 * stale the moment the select changed — and a stale number that looks computed
 * is worse than no number, because you would buy 2 × 20 thinking it was 2 × 60.
 *
 * Everything is named after the product rather than the variant, so the chosen
 * pack travels with the row instead of being baked into the field names.
 */
export function AuditPick({
  productId,
  productName,
  unitName,
  variants,
  shortBy,
  low,
}: {
  productId: number;
  productName: string;
  unitName: string;
  variants: PickVariant[];
  shortBy: number;
  low: boolean;
}) {
  // Biggest pack first: usually the better price per unit, and the one you
  // would rather have. Dropping to a smaller one is the compromise, so that is
  // the direction the list is arranged in.
  const ordered = [...variants].sort((a, b) => b.packSize - a.packSize);
  const first = ordered[0]!;

  const suggestedFor = (packSize: number) =>
    shortBy > 0 ? packsNeeded(withBuffer(shortBy), packSize) : low ? 1 : 0;

  const [variantId, setVariantId] = useState(first.id);
  const [packs, setPacks] = useState(suggestedFor(first.packSize));
  const [picked, setPicked] = useState(suggestedFor(first.packSize) > 0);

  const label = (variant: PickVariant) =>
    variant.packLabel ?? `${variant.packSize} ${unitName}`;

  function chooseVariant(id: number) {
    setVariantId(id);
    const chosen = ordered.find((v) => v.id === id);
    // Recount for the new pack — two of a sixty is not two of a twenty.
    if (chosen) setPacks(suggestedFor(chosen.packSize));
  }

  /*
   * Typing a real quantity means you want the thing, so it ticks itself. Only
   * upwards: clearing the field mid-edit briefly reads as 0, and un-ticking a
   * row because someone was half way through retyping "12" would be worse than
   * the extra tap it saves.
   */
  function changePacks(value: number) {
    setPacks(value);
    if (value >= 1) setPicked(true);
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <input type="hidden" name={`variant-${productId}`} value={variantId} />

      <input
        type="number"
        name={`packs-${productId}`}
        value={packs}
        onChange={(event) => changePacks(Number(event.target.value))}
        /*
         * Only a ticked row has to hold a real number. Most of the cabinet sits
         * here at zero and unticked — with a flat min of 1 the browser refused
         * to submit the whole worksheet until every one of those was corrected,
         * which is a demand to fix rows you have already said you do not want.
         */
        min={picked ? 1 : 0}
        step={1}
        inputMode="numeric"
        aria-label={`Packs of ${productName} to buy`}
        className="w-14 rounded-lg border px-2 py-1.5 text-right text-sm tabular-nums"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
      />

      {ordered.length === 1 ? (
        <span className="whitespace-nowrap text-xs" style={{ color: 'var(--muted)' }}>
          × {label(first)}
        </span>
      ) : (
        <select
          value={variantId}
          onChange={(event) => chooseVariant(Number(event.target.value))}
          aria-label={`Pack size of ${productName}`}
          className="max-w-[9rem] rounded-lg border px-2 py-1.5 text-xs"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
        >
          {ordered.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {label(variant)}
            </option>
          ))}
        </select>
      )}

      <input
        type="checkbox"
        name="pick"
        value={productId}
        checked={picked}
        onChange={(event) => {
          setPicked(event.target.checked);
          // Ticking a row that sits at zero means "one of these" — asking for a
          // number first would just be a validation error you have to go back
          // and clear.
          if (event.target.checked && packs < 1) setPacks(1);
        }}
        aria-label={`Add ${productName} to the list`}
        className="h-5 w-5 shrink-0"
      />
    </div>
  );
}
