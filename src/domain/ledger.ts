/**
 * The stock ledger.
 *
 * Every change to how much is in a box gets a row. Before this, a tap on the
 * minus button rewrote `quantity_remaining` and left nothing behind — the
 * number was correct and the history was gone, so "what did we actually get
 * through between the last two restocks" had no answer at all. Doses were the
 * one exception, because `dose_events` happened to keep them.
 *
 * The rule the rest of the app can rely on:
 *
 *     sum(delta) for a batch  ==  what is in that box right now
 *
 * which is zero once the box is finished or thrown out, because leaving stock
 * is itself a movement. `quantity_remaining` keeps its old meaning — what is
 * physically in the box — so for a binned box it still reads as what was left
 * when it went in the bin, which is exactly what the waste figures cost.
 *
 * Kept deliberately dull: signed numbers and a reason. Anything cleverer
 * (running balances, per-day rollups) can be derived, and derived things do
 * not go stale.
 */

export const MOVEMENT_REASONS = [
  /** What was in the box when the ledger started counting. */
  'opening',
  /** A box arrived — bought, or collected from a trip. */
  'received',
  /** Taken as a scheduled dose. */
  'dose',
  /** Corrected by hand: the stepper, or an edit to the box. */
  'adjust',
  /** Left stock — thrown out, expired, or used up. Negative; positive undoes it. */
  'binned',
  /** Reconciled against a physical count. */
  'audit',
] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/**
 * Declared here rather than imported from the schema so this module keeps its
 * "no imports" property. The schema is the source of the database enum; this
 * is the same four values as far as the ledger is concerned, and the test
 * suite asserts the two agree.
 */
export type LedgerBatchStatus = 'in_stock' | 'consumed' | 'expired' | 'discarded';

export interface Movement {
  delta: number;
  reason: MovementReason;
}

/** Quantities are stored to two decimals; sums of floats must be too. */
function roundUnits(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Anything that is not `in_stock` is out of the cupboard, whatever the reason. */
export function isOutOfStock(status: LedgerBatchStatus): boolean {
  return status !== 'in_stock';
}

/** What the ledger says is in a box. Rounded, so 0.1 + 0.2 does not haunt us. */
export function netUnits(movements: Movement[]): number {
  return roundUnits(movements.reduce((total, movement) => total + movement.delta, 0));
}

/**
 * The row that a status change owes the ledger.
 *
 * Binning a box does not touch its quantity — the waste figures need to know
 * what was left in it — so the units leave the cupboard here instead, as a
 * closing row that takes the batch's running total to zero. Putting a box back
 * writes the same row with the sign flipped.
 *
 * Null when nothing moved: a status change that stays on the same side of "in
 * stock", or an empty box, which has no units left to take anywhere.
 */
export function movementForStatusChange(
  from: LedgerBatchStatus,
  to: LedgerBatchStatus,
  quantityRemaining: number,
): Movement | null {
  const wasOut = isOutOfStock(from);
  const isOut = isOutOfStock(to);
  if (wasOut === isOut) return null;

  const units = roundUnits(quantityRemaining);
  if (units <= 0) return null;

  return { delta: isOut ? -units : units, reason: 'binned' };
}

/**
 * What a stepper press actually does to a box.
 *
 * The button asks for -1; a box with half a tablet left can only give half.
 * The ledger has to record what moved rather than what was asked for, or the
 * two drift apart on the first press against an almost-empty box.
 *
 * Returns the new quantity and the delta that got it there, both rounded, so
 * the caller writes one number to the batch and the other to the ledger and
 * they cannot disagree.
 */
export function applyAdjustment(
  current: number,
  requested: number,
): { next: number; applied: number } {
  const next = Math.max(0, roundUnits(current + requested));
  return { next, applied: roundUnits(next - current) };
}

export interface MovementSummary {
  /** Units that came into the house. */
  received: number;
  /** Units taken as doses. Positive: it is an amount consumed, not a balance. */
  used: number;
  /** Units thrown away. Positive, and reduced by anything taken back out of the bin. */
  binned: number;
  /** Hand corrections and audit differences, signed — this one can go either way. */
  adjusted: number;
  /** Everything together: how much the cupboard grew or shrank. */
  net: number;
}

/**
 * What happened over a set of movements — the shape every "between these two
 * dates" and "between these two trips" question reduces to.
 *
 * Deliberately four separate figures rather than one total. Buying thirty and
 * binning thirty is not the same as a quiet six months, and a single net number
 * would report them identically.
 */
export function summariseMovements(movements: Movement[]): MovementSummary {
  let received = 0;
  let used = 0;
  let binned = 0;
  let adjusted = 0;

  for (const movement of movements) {
    switch (movement.reason) {
      case 'opening':
      case 'received':
        received += movement.delta;
        break;
      case 'dose':
        // Undoing a dose is a positive row, so this nets down correctly.
        used -= movement.delta;
        break;
      case 'binned':
        binned -= movement.delta;
        break;
      case 'adjust':
      case 'audit':
        adjusted += movement.delta;
        break;
    }
  }

  return {
    received: roundUnits(received),
    used: roundUnits(used),
    binned: roundUnits(binned),
    adjusted: roundUnits(adjusted),
    net: netUnits(movements),
  };
}
