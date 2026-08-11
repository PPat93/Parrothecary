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
  /**
   * Taken by hand from the stock list, off any schedule — two vitamin C
   * because you felt like it. Negative going out, positive putting one back.
   *
   * Separate from `adjust` because most of the cabinet is never on a schedule,
   * so without this the app would report that the plasters and the painkillers
   * are never used at all. The two were one reason to begin with, and that made
   * a swallowed tablet indistinguishable from a typo.
   */
  'taken',
  /** The quantity on a box was wrong and got corrected. Not consumption. */
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
 * Bounded at both ends, because a box is a physical thing: it cannot give out
 * more than it holds, and it cannot take back more than it can hold. Putting a
 * thousand tablets into a pack of fifty used to be allowed silently, leaving a
 * single box reading "20 packs + 22 tablets".
 *
 * "What it can hold" is a full pack, or more if more than a pack ever came in —
 * not the amount this particular box arrived with. So a box entered part-used
 * at six of a fifty-pack will accept `+` up to fifty. That is deliberate: the
 * stricter rule would leave the `+` dead on a box whose incoming movements
 * predate the ledger, which is how an emptied box is put back into use. The
 * pencil is the tool for correcting a quantity that was never right.
 *
 * `capacity` is the pack size. Omit it for a box with no meaningful ceiling.
 * Correcting a quantity that genuinely exceeds the pack belongs on the edit
 * form, which is the tool for fixing records rather than moving stock.
 *
 * Returns the new quantity and the delta that got it there, both rounded, so
 * the caller writes one number to the batch and the other to the ledger and
 * they cannot disagree.
 */
export function applyAdjustment(
  current: number,
  requested: number,
  capacity?: number,
): { next: number; applied: number } {
  let next = Math.max(0, roundUnits(current + requested));

  // Never pulls a box below what it already holds: an over-full box stays as
  // it is rather than being quietly trimmed by an unrelated press.
  if (capacity !== undefined && capacity > 0) {
    next = Math.min(next, Math.max(roundUnits(capacity), roundUnits(current)));
  }

  return { next, applied: roundUnits(next - current) };
}

/**
 * The row a physical count owes the ledger.
 *
 * Counting is absolute where the stepper is relative: you are not saying "one
 * less", you are saying "there are nine". The difference from what the app
 * believed is the movement, and its sign is the interesting part — stock
 * quietly leaves cupboards far more often than it appears in them.
 *
 * Null when the count agrees, which is most rows most of the time. Agreement
 * is not an event and does not belong in the ledger.
 */
export function movementForCount(expected: number, counted: number): Movement | null {
  const delta = roundUnits(counted - expected);
  if (delta === 0) return null;
  return { delta, reason: 'audit' };
}

/**
 * The row needed to keep a box that has already left stock balanced at zero.
 *
 * Things still happen to a binned box: its quantity gets corrected because the
 * original entry was a typo, or a dose taken out of it weeks ago gets undone.
 * Each of those is a real movement and gets its own row — but the box is not
 * back in the cupboard, so the running total has to come back to zero or it
 * starts claiming units that are in the bin.
 *
 * Null for a box still in stock, where the movement stands on its own.
 */
export function closureMovement(
  status: LedgerBatchStatus,
  delta: number,
): Movement | null {
  if (!isOutOfStock(status)) return null;

  const rounded = roundUnits(delta);
  if (rounded === 0) return null;

  return { delta: -rounded, reason: 'binned' };
}

export interface MovementSummary {
  /** Units that came into the house. */
  received: number;
  /**
   * Units actually consumed — scheduled doses and hand-taken alike. Positive:
   * an amount used, not a balance. Putting one back reduces it.
   */
  used: number;
  /** Units thrown away. Positive, and reduced by anything taken back out of the bin. */
  binned: number;
  /** Quantity corrections, signed. Stock that was never there, or always was. */
  corrected: number;
  /** What a physical count could not explain, signed. Usually stock gone missing. */
  drift: number;
  /** Everything together: how much the cupboard grew or shrank. */
  net: number;
}

/**
 * What happened over a set of movements — the shape every "between these two
 * dates" and "between these two trips" question reduces to.
 *
 * Deliberately several separate figures rather than one total. Buying thirty
 * and binning thirty is not the same as a quiet six months, and a single net
 * number would report them identically.
 *
 * The three ways stock can leave without being thrown out are kept apart on
 * purpose. Consumed, mis-entered, and unaccounted-for are different facts about
 * a household, and only the first one answers "how fast do we get through this".
 */
export function summariseMovements(movements: Movement[]): MovementSummary {
  let received = 0;
  let used = 0;
  let binned = 0;
  let corrected = 0;
  let drift = 0;

  for (const movement of movements) {
    switch (movement.reason) {
      case 'opening':
      case 'received':
        received += movement.delta;
        break;
      case 'dose':
      case 'taken':
        // Both are consumption. Undoing either is a positive row, so this nets
        // down correctly without a separate case.
        used -= movement.delta;
        break;
      case 'binned':
        binned -= movement.delta;
        break;
      case 'adjust':
        corrected += movement.delta;
        break;
      case 'audit':
        drift += movement.delta;
        break;
    }
  }

  return {
    received: roundUnits(received),
    used: roundUnits(used),
    binned: roundUnits(binned),
    corrected: roundUnits(corrected),
    drift: roundUnits(drift),
    net: netUnits(movements),
  };
}
