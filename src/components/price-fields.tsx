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
export function PriceFields({
  price,
  currency,
  fxRate,
  suggestedRate = null,
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
}) {
  // Comma, like every other number this app shows and accepts.
  const suggested = suggestedRate === null ? '' : String(suggestedRate.rate).replace('.', ',');
  const value = fxRate === '' ? suggested : fxRate;

  const hint =
    suggestedRate !== null && fxRate === ''
      ? `Filled in from ${suggestedRate.sameDay ? 'the other boxes bought that day' : `the last rate recorded, on ${suggestedRate.fromDate}`}. Change it if it was different, or clear it to leave this price in złoty.`
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
