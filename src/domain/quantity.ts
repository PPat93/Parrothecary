/**
 * Quantities are always stored in BASE UNITS — tablets, ml, sachets — never in
 * packs. A half-used bottle is not expressible in packs, and every real
 * cupboard is full of half-used bottles.
 */

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
