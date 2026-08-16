import { lastDayOfMonth, type IsoDate } from './date';

/**
 * Barcode parsing.
 *
 * Two very different things share the word "barcode" here:
 *
 *   EAN-13 / UPC-A  — the retail stripe. Thirteen digits and nothing else. It
 *                     identifies a product only if you already have it in a
 *                     lookup table; it carries no expiry, no batch.
 *
 *   GS1 DataMatrix  — the small square on EU prescription packs, mandatory
 *                     since the Falsified Medicines Directive took effect in
 *                     Feb 2019. It encodes the product code, expiry, batch and
 *                     serial, so one scan fills in most of an "add box" form.
 */

export type BarcodeType = 'ean13' | 'upc_a' | 'gs1_datamatrix' | 'other';

export interface ScannedCode {
  /** Normalised lookup key — always a 13-digit GTIN where we can get one. */
  code: string;
  type: BarcodeType;
  /** Only GS1 codes carry these. */
  expiryDate: IsoDate | null;
  expiryPrecision: 'day' | 'month' | null;
  lotNumber: string | null;
  serial: string | null;
}

/**
 * GS1 Application Identifiers we care about. The rest of the standard is large
 * and irrelevant to a medicine cabinet.
 */
const AI_LENGTHS: Record<string, number> = {
  '01': 14, // GTIN
  '17': 6, // expiry, YYMMDD
};
/** Variable-length AIs, terminated by the group separator. */
const AI_VARIABLE = new Set(['10', '21']);

/** ASCII 29. Separates variable-length fields inside a GS1 payload. */
const GROUP_SEPARATOR = String.fromCharCode(29);

export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(first12[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}

/**
 * A UPC-A is an EAN-13 with an implied leading zero. Storing both forms would
 * mean the same physical pack failing to match itself, so everything is widened
 * to 13 digits on the way in.
 */
export function toEan13(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length === 12) return `0${digits}`;
  return digits;
}

/**
 * Every shape the same physical barcode can be written in.
 *
 * `parseScan` reduces what a camera reads to one canonical form — a UPC-A
 * widened to thirteen digits, a GS1 GTIN-14 stripped of its packaging digit —
 * so codes attached through this app are all stored that way. Codes that
 * arrived by another route are not: a catalogue typed in before that rule
 * existed holds twelve- and fourteen-digit forms, and an exact-match lookup
 * against a scan silently misses every one of them. Five of the eleven packs in
 * the real cabinet were unrecognisable for exactly this reason — the scanner
 * offered to attach a code it already had, under a different number of digits.
 *
 * Comparing the alternatives is enough; nothing needs rewriting in place.
 */
export function barcodeVariants(code: string): string[] {
  const digits = code.replace(/\D/g, '');
  if (digits === '') return [code];

  const forms = new Set<string>([code, digits]);

  // Thirteen digits: also the twelve-digit UPC-A it came from, and the
  // fourteen-digit GTIN a case-level label would print.
  if (digits.length === 13) {
    if (digits.startsWith('0')) forms.add(digits.slice(1));
    forms.add(`0${digits}`);
  }
  // Twelve or fourteen: the thirteen-digit form this app would have stored.
  if (digits.length === 12) forms.add(`0${digits}`);
  if (digits.length === 14 && digits.startsWith('0')) forms.add(digits.slice(1));

  return [...forms];
}

/**
 * GS1 dates are YYMMDD, and DD is allowed to be "00" meaning "end of month" —
 * which is exactly the month-precision case the app already models.
 */
export function parseGs1Date(yymmdd: string): { date: IsoDate; precision: 'day' | 'month' } | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;

  const yy = Number(yymmdd.slice(0, 2));
  const mm = yymmdd.slice(2, 4);
  const dd = yymmdd.slice(4, 6);

  // GS1 pivots two-digit years around a 50-year window. Medicine expiry dates
  // are always in the near future, so this never has to guess about the past.
  const year = yy >= 51 ? 1900 + yy : 2000 + yy;
  const month = Number(mm);
  if (month < 1 || month > 12) return null;

  if (dd === '00') {
    return { date: lastDayOfMonth(`${year}-${mm}`), precision: 'month' };
  }

  const day = Number(dd);
  if (day < 1 || day > 31) return null;
  const iso = `${year}-${mm}-${dd}`;
  // Reject dates that do not exist, e.g. 31 February.
  const check = new Date(`${iso}T00:00:00Z`);
  if (check.getUTCDate() !== day) return null;

  return { date: iso, precision: 'day' };
}

/**
 * Parse a raw GS1 element string. Scanners hand these over with the leading
 * "]d2" symbology identifier and sometimes with FNC1 rendered as ASCII 29,
 * sometimes as literal parentheses — all three shapes appear in the wild.
 */
export function parseGs1(raw: string): ScannedCode | null {
  const payload = raw.replace(/^\]d2/, '').replace(/^\]C1/, '');
  const fields: Record<string, string> = {};

  // Human-readable form, as printed under the square: (01)059...(17)300721(10)ABC
  // Each AI is delimited, so it parses directly without length rules.
  if (payload.includes('(')) {
    for (const [, ai, value] of payload.matchAll(/\((\d{2})\)([^(]*)/g)) {
      if (ai && value !== undefined) fields[ai] = value.trim();
    }
    return buildFromFields(fields);
  }

  let index = 0;

  while (index < payload.length) {
    if (payload[index] === GROUP_SEPARATOR) {
      index += 1;
      continue;
    }

    const ai = payload.slice(index, index + 2);
    index += 2;

    if (ai in AI_LENGTHS) {
      const length = AI_LENGTHS[ai]!;
      fields[ai] = payload.slice(index, index + length);
      index += length;
      continue;
    }

    if (AI_VARIABLE.has(ai)) {
      const end = payload.indexOf(GROUP_SEPARATOR, index);
      const stop = end === -1 ? payload.length : end;
      fields[ai] = payload.slice(index, stop);
      index = stop;
      continue;
    }

    // An AI we do not handle: without its length we cannot safely skip it, so
    // stop rather than misread everything after it.
    break;
  }

  return buildFromFields(fields);
}

function buildFromFields(fields: Record<string, string>): ScannedCode | null {
  const gtin = fields['01'];
  if (!gtin) return null;

  const expiry = fields['17'] ? parseGs1Date(fields['17']) : null;

  return {
    // GTIN-14 is an EAN-13 padded to 14; strip the pad so it matches the
    // stripe on the same box.
    code: gtin.length === 14 && gtin.startsWith('0') ? gtin.slice(1) : gtin,
    type: 'gs1_datamatrix',
    expiryDate: expiry?.date ?? null,
    expiryPrecision: expiry?.precision ?? null,
    lotNumber: fields['10'] ?? null,
    serial: fields['21'] ?? null,
  };
}

/**
 * Single entry point for whatever the scanner produced. Tries GS1 first,
 * because a DataMatrix carries far more than an identifier.
 */
export function parseScan(raw: string, format?: string): ScannedCode {
  const trimmed = raw.trim();

  const gs1 = parseGs1(trimmed);
  if (gs1) return gs1;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 12 || digits.length === 13) {
    return {
      code: toEan13(digits),
      type: digits.length === 12 ? 'upc_a' : 'ean13',
      expiryDate: null,
      expiryPrecision: null,
      lotNumber: null,
      serial: null,
    };
  }

  return {
    code: trimmed,
    type: format === 'data_matrix' ? 'gs1_datamatrix' : 'other',
    expiryDate: null,
    expiryPrecision: null,
    lotNumber: null,
    serial: null,
  };
}
