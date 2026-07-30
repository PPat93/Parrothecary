import type { IsoDate } from './date';
import { isDosable, type ExpiryPrecision } from './expiry';

/**
 * FEFO — First Expired, First Out. Which box do we open?
 *
 * The rule is strict earliest-expiry-first, because that is what actually
 * minimises waste. Preferring already-opened boxes is only a tiebreaker: if a
 * sealed box expires next month and an opened one lasts two more years, the
 * sealed one has to go first or it gets thrown away.
 */

export interface FefoBatch {
  id: number;
  quantityRemaining: number;
  expiryDate: IsoDate | null;
  expiryPrecision: ExpiryPrecision | null;
  hasExpiry: boolean;
  openedAt: string | null;
  status: string;
  /**
   * Days past the printed date this product may still be dosed from. Comes
   * from the product, denormalised onto the batch. Required rather than
   * optional on purpose: a caller that forgets it should fail to compile, not
   * silently widen the window.
   */
  expiryGraceDays: number;
}

export interface Allocation {
  batchId: number;
  quantity: number;
}

export interface AllocationPlan {
  allocations: Allocation[];
  /** Units we could not cover from stock. Zero when fully satisfied. */
  shortfall: number;
}

export interface FefoOptions {
  /**
   * Include batches past their usable window entirely, grace and all. Off by
   * default. Not the same as the grace window — grace is the product's normal
   * tolerance, this is an override on top of it.
   */
  allowExpired?: boolean;
}

/**
 * Order batches by which should be used next. Exported so the UI can show
 * "open this one" without having to run a full allocation.
 */
export function sortByFefo(batches: FefoBatch[], today: IsoDate, options: FefoOptions = {}): FefoBatch[] {
  const { allowExpired = false } = options;

  const usable = batches.filter((b) => {
    if (b.status !== 'in_stock') return false;
    if (b.quantityRemaining <= 0) return false;
    if (!allowExpired && !stillUsable(b, today)) return false;
    return true;
  });

  return usable.sort((a, b) => {
    // 1. Earliest expiry wins. Non-expiring stock goes last — it can wait.
    const aDays = expiryRank(a);
    const bDays = expiryRank(b);
    if (aDays !== bDays) return aDays < bDays ? -1 : 1;

    // 2. Same expiry: finish what is already open rather than breaking a seal.
    const aOpen = a.openedAt !== null ? 0 : 1;
    const bOpen = b.openedAt !== null ? 0 : 1;
    if (aOpen !== bOpen) return aOpen - bOpen;

    // 3. Still tied: the one we have had longest.
    return a.id - b.id;
  });
}

/**
 * Work out which boxes to draw a given quantity from.
 *
 * Returns a shortfall rather than throwing when stock is insufficient — the
 * caller usually wants to record what was taken and flag the gap, not fail.
 */
export function allocateFefo(
  batches: FefoBatch[],
  quantityNeeded: number,
  today: IsoDate,
  options: FefoOptions = {},
): AllocationPlan {
  if (quantityNeeded < 0) throw new Error(`Quantity cannot be negative, got ${quantityNeeded}`);

  const allocations: Allocation[] = [];
  let remaining = quantityNeeded;

  for (const batch of sortByFefo(batches, today, options)) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantityRemaining, remaining);
    allocations.push({ batchId: batch.id, quantity: round(take) });
    remaining = round(remaining - take);
  }

  return { allocations, shortfall: Math.max(0, remaining) };
}

/** The single box to reach for next, or null when there is nothing usable. */
export function nextBatchToOpen(
  batches: FefoBatch[],
  today: IsoDate,
  options: FefoOptions = {},
): FefoBatch | null {
  return sortByFefo(batches, today, options)[0] ?? null;
}

/** Total usable units on hand, ignoring anything past its grace window. */
export function totalAvailable(batches: FefoBatch[], today: IsoDate, options: FefoOptions = {}): number {
  return round(
    sortByFefo(batches, today, options).reduce((sum, b) => sum + b.quantityRemaining, 0),
  );
}

/**
 * Whether this box may still be dosed from — delegated to `isDosable` rather
 * than compared here, so allocation and every screen answer with one rule.
 */
function stillUsable(batch: FefoBatch, today: IsoDate): boolean {
  return isDosable(
    {
      expiryDate: batch.expiryDate,
      precision: batch.expiryPrecision,
      hasExpiry: batch.hasExpiry,
      graceDays: batch.expiryGraceDays,
    },
    today,
  );
}

/** Sort key: non-expiring stock sorts last so perishable stock is used first. */
function expiryRank(batch: FefoBatch): number {
  if (!batch.hasExpiry || batch.expiryDate === null) return Number.POSITIVE_INFINITY;
  return Date.parse(`${batch.expiryDate}T00:00:00Z`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
