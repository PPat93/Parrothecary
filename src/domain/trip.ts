import { addDays, differenceInDays, midpoint, type IsoDate } from './date';

/**
 * Trips.
 *
 * Two of these a year, and the date that actually constrains us is NOT the day
 * we fly. Most stock is ordered online and shipped to family in Poland ahead of
 * the visit, so the deadline is the order-by date; collection is just when it
 * gets picked up. Everything time-critical — the cabinet audit, the shopping
 * list — hangs off orderByDate for that reason.
 */

/** Lead time assumed for the very first trip, when there is no previous one to halve. */
export const DEFAULT_ORDER_LEAD_DAYS = 42;

export type TripUrgency =
  /** The order deadline has gone by. Not fatal, but nothing else will arrive in time. */
  | 'passed'
  /** Order now — anything left is cutting into shipping time. */
  | 'critical'
  /** Start deciding what to buy. */
  | 'warning'
  /** Far enough out to leave alone. */
  | 'ok';

/**
 * When orders have to be placed for this trip.
 *
 * Halfway between the previous collection and this one, which is also when the
 * cabinet audit falls — one date, two uses, deliberately. The audit exists to
 * decide what to order, so running it at the moment the ordering deadline hits
 * is the whole point; doing it just before collection would be too late to act.
 *
 * With no previous trip there is no midpoint to take, so a fixed lead time is
 * used instead. Either way this is only a default — the field is editable,
 * because a Christmas visit and a summer one do not ship the same way.
 */
export function defaultOrderByDate(
  collectionDate: IsoDate,
  previousCollectionDate: IsoDate | null,
): IsoDate {
  if (previousCollectionDate === null || previousCollectionDate >= collectionDate) {
    return addDays(collectionDate, -DEFAULT_ORDER_LEAD_DAYS);
  }
  return midpoint(previousCollectionDate, collectionDate);
}

/**
 * Days left to place orders. Negative once the deadline has passed, so the
 * caller can say "three days late" rather than just "late".
 */
export function daysUntilOrderBy(orderByDate: IsoDate, today: IsoDate): number {
  return differenceInDays(today, orderByDate);
}

/**
 * How urgent this trip is, judged on the order deadline rather than collection.
 *
 * The thresholds are much tighter than the expiry ones (60/180 days) on purpose:
 * expiry asks "will this survive six months until the next trip", while this
 * asks "is there still time to order and have it shipped", which is a matter of
 * weeks. Reusing the expiry numbers here would have every trip screaming for
 * half the year.
 */
export function tripUrgency(orderByDate: IsoDate | null, today: IsoDate): TripUrgency {
  if (orderByDate === null) return 'ok';

  const days = daysUntilOrderBy(orderByDate, today);
  if (days < 0) return 'passed';
  if (days <= 14) return 'critical';
  if (days <= 45) return 'warning';
  return 'ok';
}
