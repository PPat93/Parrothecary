import { describe, expect, it } from 'vitest';
import { summariseWaste, type BinnedBox } from './waste';

/**
 * The two waste figures and the sentence that says what they leave out.
 *
 * `WasteSummary.uncostedBoxes` and `StockValue.uncostedBoxes` carried the same
 * name and counted different things: the cupboard value counted a box with no
 * price at all, while the waste summary dropped it before reaching the counter.
 * A binned box nobody had priced left no trace on the Expiring page — not in a
 * figure, and not in the line explaining what the figures are missing.
 *
 * Every binned box holding something must land in exactly one of the three
 * buckets. That is the property worth pinning, rather than any one case.
 */
function binned(over: Partial<BinnedBox> = {}): BinnedBox {
  return {
    quantityRemaining: 10,
    unitsWhenFull: 20,
    priceMinor: 1000,
    currency: 'EUR',
    fxRateToEur: null,
    openedAt: null,
    ...over,
  };
}

describe('the waste summary', () => {
  it('counts a box with no price at all, rather than losing it', () => {
    const summary = summariseWaste([binned({ priceMinor: null, currency: null })]);

    expect(summary.uncostedBoxes).toBe(1);
    expect(summary.neverOpenedBoxes).toBe(0);
    expect(summary.openedBoxes).toBe(0);
  });

  it('counts a złoty price with no exchange rate the same way', () => {
    const summary = summariseWaste([binned({ currency: 'PLN', fxRateToEur: null })]);
    expect(summary.uncostedBoxes).toBe(1);
  });

  it('costs a złoty box once it has a rate', () => {
    const summary = summariseWaste([binned({ currency: 'PLN', priceMinor: 2000, fxRateToEur: 0.25 })]);

    expect(summary.uncostedBoxes).toBe(0);
    expect(summary.neverOpenedBoxes).toBe(1);
    // Half the box left, quarter-rate: 2000 × 0.5 × 0.25.
    expect(summary.thrownAwayMinorEur).toBe(250);
  });

  it('keeps opened packs out of the money-thrown-away figure', () => {
    const summary = summariseWaste([binned({ openedAt: '2026-01-02' })]);

    expect(summary.neverOpenedBoxes).toBe(0);
    expect(summary.openedBoxes).toBe(1);
    expect(summary.thrownAwayMinorEur).toBe(0);
    expect(summary.leftInOpenedMinorEur).toBe(500);
  });

  it('ignores a box binned with nothing left in it', () => {
    const summary = summariseWaste([binned({ quantityRemaining: 0, priceMinor: null, currency: null })]);

    expect(summary.uncostedBoxes).toBe(0);
    expect(summary.neverOpenedBoxes).toBe(0);
    expect(summary.openedBoxes).toBe(0);
  });

  it('accounts for every binned box holding something', () => {
    const rows = [
      binned(),
      binned({ openedAt: '2026-01-02' }),
      binned({ priceMinor: null, currency: null }),
      binned({ currency: 'PLN', fxRateToEur: null }),
      binned({ quantityRemaining: 0 }),
    ];
    const summary = summariseWaste(rows);
    const holdingSomething = rows.filter((r) => r.quantityRemaining > 0).length;

    expect(summary.neverOpenedBoxes + summary.openedBoxes + summary.uncostedBoxes).toBe(
      holdingSomething,
    );
  });
});
