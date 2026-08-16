import { money, toEurOrNull, unusedValue } from './money';

/**
 * What a binned box costs, and which of the two figures it belongs in.
 *
 * Here rather than in the query layer because it is a rule, not a query: two
 * screens read it, it touches no database, and the last thing that went wrong
 * with it was a rule drifting away from its twin. The query layer supplies the
 * rows; what they mean is decided once, here.
 */
export interface BinnedBox {
  quantityRemaining: number;
  /** Units a full one of these holds — three packs on one line is one box. */
  unitsWhenFull: number;
  priceMinor: number | null;
  currency: 'PLN' | 'EUR' | null;
  fxRateToEur: number | null;
  /** Null when the box was never opened. The whole basis of the split. */
  openedAt: string | null;
}

export interface WasteSummary {
  /** Bought, never opened, binned. The figure worth pushing down. */
  thrownAwayMinorEur: number;
  neverOpenedBoxes: number;
  /** Left in packs that were opened and used. Not really waste. */
  leftInOpenedMinorEur: number;
  openedBoxes: number;
  /**
   * Binned boxes the two figures cannot account for: no price recorded, or a
   * złoty price with no exchange rate against it.
   *
   * The same population `StockValue.uncostedBoxes` counts, and deliberately so.
   * They carried the same name and meant different things: this one used to
   * count only the exchange-rate failures and drop a box with no price at all
   * before reaching the counter, so a binned box nobody had priced left no
   * trace on the page whatsoever — not in a figure, and not in the line that
   * exists to say what the figures leave out.
   */
  uncostedBoxes: number;
}

/**
 * The two waste figures, deliberately not added together.
 *
 * A sealed box that expired is money thrown away. A box that was opened is
 * not: half a bottle left at its expiry date did its job on the wounds it was
 * opened for, and that size was the smallest one sold. Adding them would
 * flatter one and slander the other.
 *
 * Every box holding something lands in exactly one of the three counts. That
 * is the property to preserve when changing anything here.
 */
export function summariseWaste(rows: BinnedBox[]): WasteSummary {
  const summary: WasteSummary = {
    thrownAwayMinorEur: 0,
    neverOpenedBoxes: 0,
    leftInOpenedMinorEur: 0,
    openedBoxes: 0,
    uncostedBoxes: 0,
  };

  for (const row of rows) {
    /*
     * A box binned with nothing left in it was used up, not wasted. It costs
     * zero either way, but counting it inflates the box count next to the
     * figure — "€2.76 left in 2 opened packs" when only one pack had anything
     * in it reads as if the money were spread over both.
     */
    if (row.quantityRemaining <= 0) continue;

    /*
     * A box with no price is counted as uncosted, not skipped. Skipping it left
     * it out of both figures and out of the sentence that says what is missing
     * from them, which is the one outcome worse than either.
     */
    const eur =
      row.priceMinor === null || row.currency === null
        ? null
        : toEurOrNull(
            unusedValue(
              money(row.priceMinor, row.currency),
              row.unitsWhenFull,
              row.quantityRemaining,
            ),
            row.fxRateToEur,
          );

    if (eur === null) {
      summary.uncostedBoxes++;
      continue;
    }

    if (row.openedAt === null) {
      summary.thrownAwayMinorEur += eur.amountMinor;
      summary.neverOpenedBoxes++;
    } else {
      summary.leftInOpenedMinorEur += eur.amountMinor;
      summary.openedBoxes++;
    }
  }

  return summary;
}
