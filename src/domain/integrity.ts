/**
 * Does a box's own number still agree with the record of how it got there?
 *
 * Every box carries the same fact twice: the quantity written on it, and the
 * ledger of every movement that ever touched it. They are written together and
 * stored apart, which is what makes them worth comparing — a quantity that
 * moved without a movement to explain it is the one kind of damage nothing else
 * in the app would notice.
 *
 * The rule lives here, in one place, because it is asked in two: the standalone
 * check script and the Audit screen. It was a script-only rule first, and a
 * page that re-derived it got it wrong — reading a correctly binned box as
 * broken — which is the argument for this file existing at all.
 *
 * Pure: numbers in, verdict out. No database, no framework.
 */

/** Floats: 0.1 + 0.2 is not 0.3, and quantities are stored to two decimals. */
export const INTEGRITY_TOLERANCE = 0.005;

export interface BoxNumbers {
  /** `in_stock`, or one of the statuses that mean it has left the cupboard. */
  status: string;
  /** What the box itself claims to hold. */
  quantity: number;
  /** Everything its movements add up to. */
  ledger: number;
  /**
   * The most it could hold: a full pack, or more if more ever came in. Optional
   * because the ledger comparison stands on its own.
   */
  capacity?: number;
}

export type IntegrityProblem =
  | {
      kind: 'ledger';
      /** What the movements should have come to for a box in this state. */
      expected: number;
      ledger: number;
    }
  | { kind: 'capacity'; quantity: number; capacity: number };

/**
 * What the movements ought to add up to.
 *
 * A box still in the cupboard should account for exactly what it holds. One
 * that has left closes out at zero — its remaining quantity is kept so the
 * waste figures can cost it, but those units are no longer in the cupboard and
 * the ledger must stop claiming them.
 */
export function expectedLedger(box: Pick<BoxNumbers, 'status' | 'quantity'>): number {
  return box.status === 'in_stock' ? box.quantity : 0;
}

/**
 * Reported numbers, not compared ones.
 *
 * Summing reals gives 21.900000000000002, and printing that in a warning
 * suggests a precision the cupboard does not have. Rounded to the two decimals
 * quantities are stored to.
 *
 * This cannot make a flagged box look sound: the threshold above is 0.005 and
 * the rounding granularity is 0.01, so any difference big enough to report is
 * still visible once rounded.
 */
const shown = (value: number) => Math.round(value * 100) / 100;

/** The first thing wrong with this box, or null when it is sound. */
export function checkBox(box: BoxNumbers): IntegrityProblem | null {
  const expected = expectedLedger(box);
  if (Math.abs(box.ledger - expected) > INTEGRITY_TOLERANCE) {
    return { kind: 'ledger', expected: shown(expected), ledger: shown(box.ledger) };
  }

  /*
   * A box cannot hold more than ever came into it. The comparison above cannot
   * see this: when a put-back was allowed past the ceiling, the quantity and
   * the ledger were raised together, so both agree and both are wrong.
   *
   * Only asked of boxes still in the cupboard — one that has left keeps the
   * quantity it held for costing, and that number is not a claim about a shelf.
   */
  if (
    box.status === 'in_stock' &&
    box.capacity !== undefined &&
    box.quantity - box.capacity > INTEGRITY_TOLERANCE
  ) {
    return { kind: 'capacity', quantity: shown(box.quantity), capacity: shown(box.capacity) };
  }

  return null;
}
