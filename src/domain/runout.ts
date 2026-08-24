import { addDays, differenceInDays, type IsoDate } from './date';
import { DEFAULT_THRESHOLDS, type ExpiryThresholds } from './expiry';

/**
 * Run-out projection.
 *
 * Unlike expiry, the consumption rate here is NOT inferred from history — it
 * is exact, straight from the dose schedule (doseUnits × timesPerDay, spread
 * over intervalDays). Only products with at least one active schedule get a
 * projection; ad-hoc items (a painkiller taken irregularly) correctly get none,
 * because their usage rate is genuinely unknown.
 *
 * Deliberately reuses expiry's DEFAULT_THRESHOLDS (60/180 days) rather than
 * inventing new numbers — it is the same "will this survive until the next
 * restock trip" question, just asked of quantity instead of a date.
 */

export type RunOutSeverity = 'none' | 'ok' | 'warning' | 'critical';

export interface RunOutProjection {
  /** Whole days of supply left, floored — a partial day counts as used up. */
  daysRemaining: number;
  /** The date stock hits zero at the current rate. */
  runOutDate: IsoDate;
}

/**
 * Units consumed per day by a single schedule. Named so the model has a name.
 *
 * An average, once intervalDays is above 1: a weekly tablet is a seventh of a
 * tablet a day. Fine for "when do I reorder", which is the only question this
 * feeds — it is not a claim that a seventh of a tablet is taken daily.
 */
export function scheduleDailyRate(schedule: {
  doseUnits: number;
  timesPerDay: number;
  intervalDays: number;
}): number {
  const interval = Math.max(1, Math.trunc(schedule.intervalDays));
  return (schedule.doseUnits * schedule.timesPerDay) / interval;
}

/**
 * Null when there is no rate to project against — no active schedule for this
 * product, not "the math came out to nothing". Zero stock still projects
 * (daysRemaining: 0, runOutDate: today), because that is real information:
 * distinct from "we do not track this one".
 */
export function projectRunOut(
  totalUnitsAvailable: number,
  dailyRate: number,
  today: IsoDate,
): RunOutProjection | null {
  if (dailyRate <= 0) return null;

  /*
   * Snapped before flooring. A fractional rate makes the quotient land a hair
   * under a whole number — three quarter-tablets a day over a week gives
   * 2.25 / 0.32142857… = 6.999999999999999, which floors to 6 and reports a day
   * less of supply than there is. Always in that direction, so it under-reports
   * rather than over, but it is still wrong and it only shows up once doses stop
   * being whole numbers.
   */
  const days = totalUnitsAvailable / dailyRate;
  const snapped = Math.abs(days - Math.round(days)) < 1e-9 ? Math.round(days) : days;

  const daysRemaining = Math.max(0, Math.floor(snapped));
  return { daysRemaining, runOutDate: addDays(today, daysRemaining) };
}

/**
 * Units short of covering everything already due by a date.
 *
 * `unitsDue` comes from the schedules themselves (see `unitsDueBetween`) rather
 * than from an average rate, so a course that ends next week is not projected
 * across the whole window.
 *
 * Rounded up: you cannot buy 2.4 tablets, and under-ordering is the expensive
 * mistake when there are only two restock trips a year.
 */
export function unitsShort(unitsDue: number, totalUnitsAvailable: number): number {
  const short = unitsDue - totalUnitsAvailable;
  if (short <= 0) return 0;

  // A fractional dose lands a hair off a whole number, and ceil() would turn
  // 6.000000000000001 into 7 units to buy.
  const snapped = Math.abs(short - Math.round(short)) < 1e-9 ? Math.round(short) : short;
  return Math.ceil(snapped);
}

/**
 * How the projection reads on screen.
 *
 * "of stock", not "left", and the words are the fix rather than decoration.
 * This number is supply — what is in the cupboard divided by the rate the
 * schedules drain it — and "60 days left" beside a course reads as the length
 * of the course. A 60-tablet pack taken once a day produces exactly that, so
 * the coincidence is common rather than rare. The expiring screen already uses
 * "days left" for days until an expiry date, so the same three words meant two
 * different things on a screen that shows both.
 *
 * Here rather than in the badge because it is the answer to a question the
 * domain asks, and because a phrase nobody can test drifts back.
 */
export function runOutLabel(projection: RunOutProjection): string {
  if (projection.daysRemaining === 0) return 'out of stock today';
  if (projection.daysRemaining === 1) return '1 day of stock';
  return `${projection.daysRemaining} days of stock`;
}

export function runOutSeverity(
  projection: RunOutProjection | null,
  thresholds: ExpiryThresholds = DEFAULT_THRESHOLDS,
): RunOutSeverity {
  if (projection === null) return 'none';
  if (projection.daysRemaining <= thresholds.criticalDays) return 'critical';
  if (projection.daysRemaining <= thresholds.warningDays) return 'warning';
  return 'ok';
}
