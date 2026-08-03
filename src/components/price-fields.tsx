import { Field, Select, TextInput } from '@/components/form';
import { CURRENCIES } from '@/db/schema';

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
}: {
  price: string;
  currency: string;
  fxRate: string;
}) {
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

      <Field
        label="Rate to euro"
        hint="Złoty only: what one złoty was worth in euro that day, around 0,23. Leave it blank and this price stays in złoty, out of the euro totals."
      >
        <TextInput name="fxRate" inputMode="decimal" placeholder="0,23" defaultValue={fxRate} />
      </Field>
    </>
  );
}
