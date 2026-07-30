import { addDays, type IsoDate } from './date';
import { DEFAULT_THRESHOLDS, type ExpiryThresholds } from './expiry';

/**
 * Run-out projection.
 *
 * Unlike expiry, the consumption rate here is NOT inferred from history — it
 * is exact, straight from the dose schedule (doseUnits × timesPerDay). Only
 * products with at least one active schedule get a projection; ad-hoc items
 * (a painkiller taken irregularly) correctly get none, because their usage
 * rate is genuinely unknown.
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

/** Units consumed per day by a single schedule. Named so the model has a name. */
export function scheduleDailyRate(schedule: { doseUnits: number; timesPerDay: number }): number {
  return schedule.doseUnits * schedule.timesPerDay;
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

  const daysRemaining = Math.max(0, Math.floor(totalUnitsAvailable / dailyRate));
  return { daysRemaining, runOutDate: addDays(today, daysRemaining) };
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
