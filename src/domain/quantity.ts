/**
 * Quantities are always stored in BASE UNITS — tablets, ml, sachets — never in
 * packs. A half-used bottle is not expressible in packs, and every real
 * cupboard is full of half-used bottles.
 */

/**
 * The finest quantity the app actually tracks. Everything stored goes through
 * two-decimal rounding, so halves and quarters are exact and an eighth of a
 * tablet is not: subtracting 0.125 repeatedly drifts, and after eight doses of
 * a single tablet there would still be 0.04 of it showing. Inputs finer than
 * this are refused rather than silently accumulating error.
 */
export const UNIT_PRECISION = 0.01;

/**
 * Parse a typed quantity, accepting either decimal separator.
 *
 * A Polish phone keyboard offers a comma, not a full stop, so "0,5" is what
 * gets typed for half a tablet — and `Number('0,5')` is NaN. Money already
 * normalised both separators; quantities did not, which made the same keystroke
 * work for a price and fail for a dose.
 *
 * Null for anything that is not a plain number. Callers apply their own bounds:
 * this does not know whether zero is allowed.
 */
export function parseUnits(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, '').replace(',', '.');
  if (cleaned === '') return null;
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;

  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** Is this a quantity the app can track exactly, rather than round away? */
export function isTrackableQuantity(units: number): boolean {
  return Math.abs(units / UNIT_PRECISION - Math.round(units / UNIT_PRECISION)) < 1e-9;
}

export interface PackBreakdown {
  fullPacks: number;
  remainderUnits: number;
}

export function packsToUnits(packs: number, packSize: number): number {
  if (packSize <= 0) throw new Error(`Pack size must be positive, got ${packSize}`);
  return packs * packSize;
}

export function unitsToPacks(units: number, packSize: number): PackBreakdown {
  if (packSize <= 0) throw new Error(`Pack size must be positive, got ${packSize}`);
  const fullPacks = Math.floor(units / packSize);
  // Rounded because repeated fractional subtraction drifts: 0.1 + 0.2 problems
  // show up quickly once you have logged a few hundred 5 ml doses.
  const remainderUnits = round(units - fullPacks * packSize);
  return { fullPacks, remainderUnits };
}

/** Sealed packs to buy in order to obtain at least `units`. Always rounds up. */
export function packsNeeded(units: number, packSize: number): number {
  if (packSize <= 0) throw new Error(`Pack size must be positive, got ${packSize}`);
  if (units <= 0) return 0;
  return Math.ceil(round(units / packSize));
}

/**
 * Add a safety margin to a requirement. With only two restock trips a year,
 * running out is expensive and over-buying is cheap, so the default leans
 * deliberately towards over-buying.
 */
export function withBuffer(units: number, bufferFraction = 0.25): number {
  if (bufferFraction < 0) throw new Error('Buffer cannot be negative');
  return round(units * (1 + bufferFraction));
}

/** "2 packs + 14 tablets" when pack size is known, otherwise "74 tablets". */
export function formatQuantity(units: number, unitName: string, packSize?: number): string {
  const rounded = round(units);

  if (packSize === undefined || packSize <= 0 || rounded < packSize) {
    return `${formatNumber(rounded)} ${pluralise(unitName, rounded)}`;
  }

  const { fullPacks, remainderUnits } = unitsToPacks(rounded, packSize);
  const packPart = `${fullPacks} ${fullPacks === 1 ? 'pack' : 'packs'}`;
  if (remainderUnits === 0) return packPart;
  return `${packPart} + ${formatNumber(remainderUnits)} ${pluralise(unitName, remainderUnits)}`;
}

function pluralise(unitName: string, count: number): string {
  if (count === 1) return unitName;
  // Mass and volume units do not pluralise.
  if (unitName === 'ml' || unitName === 'g') return unitName;
  if (unitName === 'piece') return 'pieces';
  return `${unitName}s`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value));
}

/** Two decimal places is enough for ml and half tablets, and kills float drift. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}
