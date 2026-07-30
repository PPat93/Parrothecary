import { differenceInDays, isIsoDate, lastDayOfMonth, type IsoDate } from './date';

export type ExpiryPrecision = 'day' | 'month';

export type ExpiryStatus =
  /** Product does not expire — plasters, thermometers, saline. */
  | 'none'
  /**
   * The product does expire, but we have not recorded the date. Deliberately
   * distinct from 'none': telling someone a bandage "has no expiry" when we
   * simply never typed the date in is worse than admitting we do not know.
   */
  | 'unknown'
  /** Comfortably in date. */
  | 'ok'
  /** Amber: use it soon. */
  | 'warning'
  /** Red: about to go. */
  | 'critical'
  /**
   * Past its printed date, but inside the window this product tolerates — so
   * doses still come out of it. Deliberately distinct from 'expired': the app
   * is actively using this box, and a screen that called it expired while the
   * dose board took from it would read as a bug rather than a decision.
   */
  | 'in_grace'
  /** Past its date and past whatever tolerance the product had. Bin it. */
  | 'expired';

export interface ExpiryThresholds {
  /** Days at or below which an item goes red. */
  criticalDays: number;
  /** Days at or below which an item goes amber. */
  warningDays: number;
}

/**
 * Defaults tuned to a two-trips-a-year restock cycle: with roughly six months
 * between opportunities to replace something, 180 days of warning is what
 * actually gives you time to act, and 60 days means "this will not survive
 * until the next trip".
 */
export const DEFAULT_THRESHOLDS: ExpiryThresholds = {
  criticalDays: 60,
  warningDays: 180,
};

export interface ExpiryInput {
  /** Full ISO date, or null when the product never expires. */
  expiryDate: IsoDate | null;
  precision: ExpiryPrecision | null;
  /** From the product: false for items with no expiry at all. */
  hasExpiry: boolean;
  /**
   * From the product: days past the printed date this thing may still be used.
   * Zero for most, and required rather than optional so no caller can quietly
   * omit it and get a different answer than the dose board does.
   */
  graceDays: number;
}

/**
 * Normalise what someone typed into a full ISO date plus a precision flag.
 *
 * Boxes print either "15.11.2027" or just "11/2027". We always store a real
 * full date so sorting and comparison are trivial, but remember which kind it
 * was so the UI never invents a day that was not printed on the box.
 */
export function normaliseExpiry(input: string): {
  expiryDate: IsoDate;
  precision: ExpiryPrecision;
} {
  const value = input.trim();

  if (isIsoDate(value)) {
    return { expiryDate: value, precision: 'day' };
  }

  // "2027-11" — month only. Store the last day: a box marked 11/2027 is good
  // through the whole of November.
  if (/^\d{4}-\d{2}$/.test(value)) {
    return { expiryDate: lastDayOfMonth(value), precision: 'month' };
  }

  // "11/2027" or "11.2027"
  const monthFirst = /^(\d{1,2})[./](\d{4})$/.exec(value);
  if (monthFirst) {
    const month = monthFirst[1]!.padStart(2, '0');
    return { expiryDate: lastDayOfMonth(`${monthFirst[2]}-${month}`), precision: 'month' };
  }

  // "15.11.2027" or "15/11/2027" — day.month.year, the Polish and Irish order.
  const dayFirst = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(value);
  if (dayFirst) {
    const day = dayFirst[1]!.padStart(2, '0');
    const month = dayFirst[2]!.padStart(2, '0');
    const iso = `${dayFirst[3]}-${month}-${day}`;
    if (!isIsoDate(iso)) throw new Error(`Not a real date: ${input}`);
    return { expiryDate: iso, precision: 'day' };
  }

  throw new Error(`Unrecognised expiry date: ${input}`);
}

/** Days from today until expiry. Negative once it has passed. Null when it never expires. */
export function daysUntilExpiry(input: ExpiryInput, today: IsoDate): number | null {
  if (!input.hasExpiry || input.expiryDate === null) return null;
  return differenceInDays(today, input.expiryDate);
}

export function expiryStatus(
  input: ExpiryInput,
  today: IsoDate,
  thresholds: ExpiryThresholds = DEFAULT_THRESHOLDS,
): ExpiryStatus {
  if (!input.hasExpiry) return 'none';
  if (input.expiryDate === null) return 'unknown';

  const days = daysUntilExpiry(input, today);
  if (days === null) return 'none';
  if (days < 0) return isDosable(input, today) ? 'in_grace' : 'expired';
  if (days <= thresholds.criticalDays) return 'critical';
  if (days <= thresholds.warningDays) return 'warning';
  return 'ok';
}

/**
 * The one place that answers "may this box still be used?".
 *
 * Everything else — the badges, the stock totals, FEFO allocation, the dose
 * board — routes through here rather than comparing dates itself. Three
 * slightly different answers to this question was exactly the bug waiting to
 * happen: stock counting a box the dose board refused to touch.
 *
 * A negative grace value cannot pull the deadline forward; the printed date is
 * the earliest this ever returns false.
 */
export function isDosable(input: ExpiryInput, today: IsoDate): boolean {
  if (!input.hasExpiry || input.expiryDate === null) return true;
  return differenceInDays(today, input.expiryDate) >= -Math.max(0, input.graceDays);
}

/**
 * Upper bound on a product's grace window. Not a medical judgement — just the
 * point past which the number is far more likely to be a slipped digit than a
 * decision. Real values are weeks, or a couple of months.
 */
export const MAX_GRACE_DAYS = 365;

/**
 * Validate what someone typed into the grace field.
 *
 * Blank means zero, never "unlimited" — a field left alone must not widen how
 * long something counts as usable. Lives here rather than in the form so the
 * rule is tested and so both the create and edit paths cannot drift apart.
 */
export function parseGraceDays(
  value: string | null,
): { ok: true; days: number } | { ok: false; message: string } {
  if (value === null || value.trim() === '') return { ok: true, days: 0 };

  const days = Number(value);
  if (!Number.isInteger(days) || days < 0) {
    return {
      ok: false,
      message: `"${value}" is not a valid grace period. Enter whole days, like 60, or leave it blank.`,
    };
  }
  if (days > MAX_GRACE_DAYS) {
    return {
      ok: false,
      message: `${days} days is too long to keep using something past its date. ${MAX_GRACE_DAYS} is the most allowed — did you mean ${Math.floor(days / 10)}?`,
    };
  }
  return { ok: true, days };
}

/** Days past the printed date, or null when it is not past it (or never expires). */
export function daysPastDate(input: ExpiryInput, today: IsoDate): number | null {
  const days = daysUntilExpiry(input, today);
  if (days === null || days >= 0) return null;
  return Math.abs(days);
}

/**
 * "11.2027" for month precision, "15.11.2027" for day.
 *
 * Both use the same separator on purpose. A slash for one and dots for the
 * other made a stock list look inconsistent rather than precise. The month form
 * still omits the day — we never invent one — but it now reads as the same kind
 * of date, just shorter.
 */
export function formatExpiry(input: ExpiryInput): string {
  if (!input.hasExpiry) return 'no expiry';
  if (input.expiryDate === null) return 'date unknown';

  const [year, month, day] = input.expiryDate.split('-');
  if (input.precision === 'month') return `${month}.${year}`;
  return `${day}.${month}.${year}`;
}

/**
 * Will this box still be usable on the given day? Used to decide whether stock
 * we already own actually covers us until the next restock.
 *
 * Same rule as `isDosable`, asked about a future date instead of today — the
 * grace window counts here too, because stock we are willing to take doses
 * from is stock that covers us.
 */
export function isUsableOn(input: ExpiryInput, date: IsoDate): boolean {
  return isDosable(input, date);
}
