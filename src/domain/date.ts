/**
 * Date primitives for calendar dates ("2027-11-30"), not instants.
 *
 * Everything here works in UTC on purpose. Expiry dates, purchase dates and
 * trip dates are calendar facts — a box does not expire an hour earlier
 * because the clocks changed. Using local-time Date objects for this is the
 * single most reliable way to introduce off-by-one-day bugs, so we never do.
 */

export const MS_PER_DAY = 86_400_000;

/** A calendar date in ISO form, e.g. "2027-11-30". */
export type IsoDate = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_RE = /^(\d{4})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  // Round-tripping catches "2027-02-31" and similar impossible dates.
  return toIsoDate(parseIsoDate(value)) === value;
}

/** Parse "YYYY-MM-DD" to a UTC-midnight timestamp in milliseconds. */
export function parseIsoDate(value: IsoDate): number {
  const m = ISO_DATE_RE.exec(value);
  if (!m) throw new Error(`Not an ISO date: ${value}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  return Date.UTC(year, month - 1, day);
}

/** Format a UTC timestamp back to "YYYY-MM-DD". */
export function toIsoDate(ms: number): IsoDate {
  const d = new Date(ms);
  const year = String(d.getUTCFullYear()).padStart(4, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function differenceInDays(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / MS_PER_DAY);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(parseIsoDate(date) + days * MS_PER_DAY);
}

/** Last day of the given month, e.g. lastDayOfMonth("2027-11") -> "2027-11-30". */
export function lastDayOfMonth(yearMonth: string): IsoDate {
  const m = ISO_MONTH_RE.exec(yearMonth);
  if (!m) throw new Error(`Not an ISO month: ${yearMonth}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Month out of range: ${yearMonth}`);
  // Day 0 of the following month is the last day of this one, leap years included.
  return toIsoDate(Date.UTC(year, month, 0));
}

/** The calendar date halfway between two dates, rounded down. */
export function midpoint(from: IsoDate, to: IsoDate): IsoDate {
  const days = differenceInDays(from, to);
  return addDays(from, Math.floor(days / 2));
}

/** Today as a calendar date. Injected into domain functions so tests stay deterministic. */
export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}
