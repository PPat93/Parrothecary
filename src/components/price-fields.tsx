import { Field, Select, TextInput } from '@/components/form';
import { CURRENCIES } from '@/db/schema';
import type { SuggestedFxRate } from '@/lib/queries';

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
 */
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

export function PriceFields({
  price,
  currency,
  fxRate,
  suggestedRate = null,
  submitted = false,
}: {
  price: string;
  currency: string;
  fxRate: string;
  /**
   * What this box's neighbours were bought at. Filled into the field when there
   * is nothing there yet — see `getSuggestedFxRate` for why the app usually
   * already knows this, and why it is offered rather than applied.
   */
  suggestedRate?: SuggestedFxRate | null;
  /** Has this form been sent once already? Then an empty field is a choice. */
  submitted?: boolean;
}) {
  const { value, offered } = fxRateField(fxRate, suggestedRate, { submitted, currency });

  const hint =
    offered !== null
      ? `Filled in from ${offered.sameDay ? 'another box bought that day' : `the last rate recorded, on ${offered.fromDate}`}. Change it if it was different, or clear it to leave this price in złoty.`
      : 'Złoty only: what one złoty was worth in euro that day, around 0,23. Leave it blank and this price stays in złoty, out of the euro totals.';

  return (
    <>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Price paid">
          <TextInput name="price" inputMode="decimal" placeholder="24,99" defaultValue={price} />
        </Field>
        <Field label="Currency">
          <Select name="currency" defaultValue={currency}>
            {CURRENCIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Rate to euro" hint={hint}>
        <TextInput name="fxRate" inputMode="decimal" placeholder="0,23" defaultValue={value} />
      </Field>
    </>
  );
}
