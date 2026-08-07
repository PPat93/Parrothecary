import { differenceInDays, type IsoDate } from './date';

/**
 * Packing a bag.
 *
 * The list is two halves that meet here. One is arithmetic: a course of
 * something taken twice a day, for the number of days you will be away, is a
 * number nobody should have to work out at midnight. The other is judgement:
 * nothing can deduce that plasters belong in a suitcase, so those are marked on
 * the product once and turn up every time.
 *
 * Neither half is allowed to silently overrule the other — a product that is
 * both on a schedule and marked as a standing item appears once, with the
 * computed number, because that number is the more specific claim.
 */

/**
 * Days away, counting both the day you leave and the day you come back.
 *
 * Inclusive because doses are taken on both: leaving on Friday and returning
 * on Sunday is three days of tablets, not two. Off-by-one here is the
 * difference between packing enough and packing one short.
 */
export function daysAway(departure: IsoDate, returnDate: IsoDate): number {
  const days = differenceInDays(departure, returnDate) + 1;
  return days > 0 ? days : 0;
}

export type KitReason = 'scheduled' | 'standing';

export interface KitSuggestion {
  productId: number;
  /** Base units to take. Zero when only a person can say — see `reason`. */
  units: number;
  reason: KitReason;
}

/**
 * What to offer for a packing list that has not been built yet.
 *
 * `scheduled` may hold several rows for one product: two people can be taking
 * the same thing, and the bag needs both their courses. They are summed.
 *
 * A scheduled product whose course does not run during the trip contributes
 * nothing — but if it is also a standing item it still appears, because "always
 * take the antihistamines" does not stop being true in a week when none are
 * due.
 */
export function suggestKit(
  scheduled: { productId: number; units: number }[],
  standing: number[],
  alreadyOn: number[],
): KitSuggestion[] {
  const onList = new Set(alreadyOn);

  const scheduledUnits = new Map<number, number>();
  for (const row of scheduled) {
    if (row.units <= 0) continue;
    scheduledUnits.set(row.productId, (scheduledUnits.get(row.productId) ?? 0) + row.units);
  }

  const suggestions: KitSuggestion[] = [];

  for (const [productId, units] of scheduledUnits) {
    if (onList.has(productId)) continue;
    suggestions.push({
      productId,
      units: Math.round(units * 100) / 100,
      reason: 'scheduled',
    });
  }

  for (const productId of new Set(standing)) {
    // Already covered by a computed row, which knows how many.
    if (onList.has(productId) || scheduledUnits.has(productId)) continue;
    suggestions.push({ productId, units: 0, reason: 'standing' });
  }

  /*
   * Worked-out quantities first. They are the ones that would actually run out
   * mid-trip; a standing item forgotten is an inconvenience, a missed course is
   * not.
   */
  return suggestions.sort(
    (a, b) => Number(b.reason === 'scheduled') - Number(a.reason === 'scheduled') || a.productId - b.productId,
  );
}

/**
 * Will this box see out the trip?
 *
 * Packing something that expires while you are away is a particular kind of
 * annoying: it was fine when it went in the bag. Null when the product has no
 * expiry at all, which is most of the dressings.
 */
export function expiresDuringTrip(
  expiryDate: IsoDate | null,
  returnDate: IsoDate,
): boolean {
  if (expiryDate === null) return false;
  return expiryDate < returnDate;
}
