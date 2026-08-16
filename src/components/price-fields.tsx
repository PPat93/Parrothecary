'use client';

import { useState } from 'react';
import { Field, Select, TextInput } from '@/components/form';
import { CURRENCIES } from '@/db/schema';
import { suggestFxRate, type FxRateOnDate, type SuggestedFxRate } from '@/domain/money';

/**
 * What goes in the rate field, and whether it is being offered or repeated back.
 *
 * Three ways an empty field must NOT be filled in, all of them found by hunting
 * this feature straight after building it:
 *
 * - A euro purchase has no rate and never wants one. Prefilling anyway put a
 *   złoty conversion rate on all five of the cabinet's euro boxes — ignored on
 *   save, and simply wrong on screen.
 * - An empty field on a form that has already been submitted is a field
 *   somebody emptied. Refilling it undoes a deliberate act: clear the rate,
 *   mistype the expiry, and the rate the form bounces back has quietly returned.
 * - No suggestion to make. Then say the ordinary thing.
 *
 * Exported so those three can be tested without a browser, which is where the
 * second one lives — it only happens on a client re-render.
 */
export function fxRateField(
  stored: string,
  suggestion: SuggestedFxRate | null,
  context: { submitted: boolean; currency: string },
): { value: string; offered: SuggestedFxRate | null } {
  if (stored !== '') return { value: stored, offered: null };
  if (context.submitted || context.currency === 'EUR' || suggestion === null) {
    return { value: '', offered: null };
  }
  // Comma, like every other number this app shows and accepts.
  return { value: String(suggestion.rate).replace('.', ','), offered: suggestion };
}

/**
 * What a box cost: amount, currency, and the rate that ties the two together.
 *
 * The rate is what makes a złoty price comparable with a euro one, and it is
 * recorded per box rather than looked up, because "what did last year's restock
 * cost" must not change every time the exchange rate moves. Leaving it blank is
 * allowed — the price is still kept, it simply stays in złoty and sits out of
 * the euro totals, which say so where they are shown.
 *
 * Three forms describe the same arriving box (add, receive, correct), so this
 * lives in one place rather than being pasted into each of them.
 *
 * A client component because the offered rate depends on two fields that can
 * still change: the currency, which lives here, and the purchase date, which
 * the form above owns and passes down. Working that out once on the server left
 * a box backdated to an earlier trip holding the rate of whichever day the form
 * happened to open with.
 */
export function PriceFields({
  price,
  currency,
  fxRate,
  rateHistory = [],
  purchaseDate = null,
  submitted = false,
}: {
  price: string;
  currency: string;
  fxRate: string;
  /** Every day that has a rate on record, newest first. See `getFxRateHistory`. */
  rateHistory?: readonly FxRateOnDate[];
  /** The date currently in the form's purchase-date field, not the stored one. */
  purchaseDate?: string | null;
  /** Has this form been sent once already? Then an empty field is a choice. */
  submitted?: boolean;
}) {
  const [chosenCurrency, setChosenCurrency] = useState(currency);

  /*
   * Once somebody types in the rate box it is theirs, and the suggestion stops
   * having opinions. Without this, typing 0,25 and then correcting the purchase
   * date threw the 0,25 away: a new suggestion meant a new key, a new key meant
   * React rebuilt the input, and rebuilding an uncontrolled input discards
   * whatever was in it. Adjusting one field must not silently undo another.
   */
  const [typedTheirOwn, setTypedTheirOwn] = useState(false);

  const suggestion = suggestFxRate(rateHistory, purchaseDate);
  const { value, offered } = fxRateField(fxRate, typedTheirOwn ? null : suggestion, {
    submitted,
    currency: chosenCurrency,
  });

  const hint =
    offered !== null
      ? /*
         * The date is named in both cases. The person can move the purchase
         * date after reading this, and a sentence that only said "that day"
         * would quietly become untrue; naming it means the field and the
         * sentence can always be checked against each other.
         */
        `Filled in from what was paid on ${offered.fromDate}${offered.sameDay ? ', the same day as this box' : ', the last one recorded before this box'}. Change it if that day was different, or clear it to leave this price in złoty.`
      : 'Złoty only: what one złoty was worth in euro that day, around 0,23. Leave it blank and this price stays in złoty, out of the euro totals.';

  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Price paid">
          <TextInput name="price" inputMode="decimal" placeholder="24,99" defaultValue={price} />
        </Field>
        <Field label="Currency">
          <Select
            name="currency"
            value={chosenCurrency}
            onChange={(event) => setChosenCurrency(event.target.value)}
          >
            {CURRENCIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {/*
        Keyed on what is being offered, so React rebuilds the input when the
        suggestion changes. Without that, an uncontrolled field keeps whatever
        it was first given and a new date changes only the sentence under it —
        which is worse than not updating at all.

        The key stops moving the moment the person types their own rate, so the
        rebuild can never take it away from them.
      */}
      <Field label="Rate to euro" hint={hint}>
        <TextInput
          key={typedTheirOwn ? 'fx-theirs' : `fx-${value}`}
          name="fxRate"
          inputMode="decimal"
          placeholder="0,23"
          defaultValue={value}
          onChange={() => setTypedTheirOwn(true)}
        />
      </Field>
    </>
  );
}
