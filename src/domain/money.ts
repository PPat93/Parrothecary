/**
 * Money is stored as integer MINOR UNITS — grosze for PLN, cents for EUR.
 * Floating point currency is how you end up with a 0.01 discrepancy that takes
 * an evening to find.
 */

export type Currency = 'PLN' | 'EUR';

export interface Money {
  amountMinor: number;
  currency: Currency;
}

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  PLN: 'zł',
  EUR: '€',
};

export function money(amountMinor: number, currency: Currency): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money must be whole minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

/**
 * Parse what someone typed. Accepts both separators, because a Polish receipt
 * says "12,50" and an Irish one says "12.50", and thousands separators from
 * either convention.
 */
export function parseAmount(input: string, currency: Currency): Money {
  const cleaned = input.trim().replace(/[\s ]/g, '');
  if (cleaned === '') throw new Error('Empty amount');

  // Whichever separator appears last is the decimal one.
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  const decimalPos = Math.max(lastComma, lastDot);

  let normalised: string;
  if (decimalPos === -1) {
    normalised = cleaned;
  } else {
    const intPart = cleaned.slice(0, decimalPos).replace(/[.,]/g, '');
    const fracPart = cleaned.slice(decimalPos + 1);
    // Three digits after the last separator means it was a thousands separator,
    // not a decimal point: "1.234" is one thousand two hundred and thirty four.
    normalised = fracPart.length === 3 ? `${intPart}${fracPart}` : `${intPart}.${fracPart}`;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalised)) {
    throw new Error(`Unrecognised amount: ${input}`);
  }

  return money(Math.round(Number(normalised) * 100), currency);
}

export function formatMoney(value: Money, options: { showCurrency?: boolean } = {}): string {
  const { showCurrency = true } = options;
  const sign = value.amountMinor < 0 ? '-' : '';
  const abs = Math.abs(value.amountMinor);
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, '0');

  // Polish convention puts the symbol after, Irish before.
  if (value.currency === 'PLN') {
    const amount = `${sign}${major},${minor}`;
    return showCurrency ? `${amount} ${CURRENCY_SYMBOLS.PLN}` : amount;
  }

  const amount = `${sign}${major}.${minor}`;
  return showCurrency ? `${sign}${CURRENCY_SYMBOLS.EUR}${major}.${minor}` : amount;
}

/**
 * Convert to euro for comparison and totals, using the rate recorded at the
 * time of purchase rather than today's — otherwise last year's spend changes
 * every time the exchange rate moves.
 */
export function toEur(value: Money, fxRateToEur: number | null): Money {
  if (value.currency === 'EUR') return value;
  if (fxRateToEur === null || fxRateToEur <= 0) {
    throw new Error('A PLN amount needs an exchange rate before it can be converted');
  }
  return money(Math.round(value.amountMinor * fxRateToEur), 'EUR');
}

/**
 * Cost of a single tablet or ml, in minor units. Deliberately NOT rounded to a
 * whole minor unit: the whole point is comparing a 24-pack against a 60-pack,
 * and at that granularity the fraction is the answer.
 */
export function pricePerUnit(total: Money, units: number): number {
  if (units <= 0) throw new Error(`Unit count must be positive, got ${units}`);
  return total.amountMinor / units;
}

export function formatPricePerUnit(minorPerUnit: number, currency: Currency): string {
  const rounded = Math.round(minorPerUnit * 100) / 100;
  return currency === 'PLN' ? `${rounded} gr` : `${rounded}c`;
}

/**
 * What the unused part of a pack was worth.
 *
 * Binning a bottle with a third left in it wastes a third of the money, not all
 * of it. Charging the whole purchase price to waste would overstate every
 * figure, and the number this feeds is meant to be the honest cost of throwing
 * things away — inflating it would make it easy to dismiss.
 *
 * Rounded to whole minor units: it is money, and fractions of a grosz are not.
 */
export function unusedValue(total: Money, packSize: number, unitsRemaining: number): Money {
  if (packSize <= 0) return money(0, total.currency);

  const fraction = Math.min(1, Math.max(0, unitsRemaining / packSize));
  return money(Math.round(total.amountMinor * fraction), total.currency);
}

export function sumMoney(values: Money[], currency: Currency): Money {
  let total = 0;
  for (const value of values) {
    if (value.currency !== currency) {
      throw new Error(`Cannot add ${value.currency} to a ${currency} total without converting`);
    }
    total += value.amountMinor;
  }
  return money(total, currency);
}
