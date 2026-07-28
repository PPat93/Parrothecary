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
  /** Red: about to go, or already gone within the grace window. */
  | 'critical'
  /** Past its date. */
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
  if (days < 0) return 'expired';
  if (days <= thresholds.criticalDays) return 'critical';
  if (days <= thresholds.warningDays) return 'warning';
  return 'ok';
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
 * Will this box still be in date on the given day? Used to decide whether
 * stock we already own actually covers us until the next restock.
 */
export function isUsableOn(input: ExpiryInput, date: IsoDate): boolean {
  if (!input.hasExpiry || input.expiryDate === null) return true;
  return differenceInDays(date, input.expiryDate) >= 0;
}
