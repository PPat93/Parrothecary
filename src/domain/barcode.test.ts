import { describe, expect, it } from 'vitest';
import { ean13CheckDigit, isValidEan13, parseGs1, parseGs1Date, parseScan, toEan13 } from './barcode';

/*
 * Every code here was read off a real box in the cabinet, so these tests pin
 * the parser to actual packaging rather than to invented examples.
 */

describe('EAN-13 check digits', () => {
  it('accepts the codes on our own boxes', () => {
    expect(isValidEan13('5909991434090')).toBe(true); // Vigalex Max
    expect(isValidEan13('5909990811045')).toBe(true); // Finaster
    expect(isValidEan13('5905279336131')).toBe(true); // katarek
    expect(isValidEan13('5907996818020')).toBe(true); // thermPAD
  });

  it('rejects a mistyped digit', () => {
    expect(isValidEan13('5909991434091')).toBe(false);
  });

  it('rejects anything that is not thirteen digits', () => {
    expect(isValidEan13('590999143409')).toBe(false);
    expect(isValidEan13('abcdefghijklm')).toBe(false);
  });

  it('computes the check digit', () => {
    expect(ean13CheckDigit('590999143409')).toBe(0);
  });
});

describe('toEan13', () => {
  it('widens a 12-digit UPC-A, so a US pack matches itself', () => {
    // Solgar and NeilMed are UPC-A. Stored as 12 digits they would never match
    // the same pack scanned as EAN-13.
    expect(toEan13('033984020276')).toBe('0033984020276');
    expect(toEan13('705928045309')).toBe('0705928045309');
  });

  it('leaves a 13-digit code alone', () => {
    expect(toEan13('5909991434090')).toBe('5909991434090');
  });
});

describe('parseGs1Date', () => {
  it('reads a full date', () => {
    expect(parseGs1Date('300721')).toEqual({ date: '2030-07-21', precision: 'day' });
  });

  it('treats day 00 as end of month, which is what the standard means', () => {
    expect(parseGs1Date('280900')).toEqual({ date: '2028-09-30', precision: 'month' });
    expect(parseGs1Date('280200')).toEqual({ date: '2028-02-29', precision: 'month' });
  });

  it('rejects impossible dates', () => {
    expect(parseGs1Date('270231')).toBeNull(); // 31 February
    expect(parseGs1Date('271301')).toBeNull(); // month 13
    expect(parseGs1Date('27013')).toBeNull(); // too short
  });
});

describe('parseGs1', () => {
  it('reads the elastoBAND label', () => {
    // (01)05907996869640 (17)300721 (10)222507110N
    expect(parseGs1('(01)05907996869640(17)300721(10)222507110N')).toEqual({
      code: '5907996869640',
      type: 'gs1_datamatrix',
      expiryDate: '2030-07-21',
      expiryPrecision: 'day',
      lotNumber: '222507110N',
      serial: null,
    });
  });

  it('reads the thermCARE label', () => {
    const result = parseGs1('(01)05907996810918(17)300414(10)002504151N');
    expect(result?.expiryDate).toBe('2030-04-14');
    expect(result?.lotNumber).toBe('002504151N');
  });

  it('reads a raw scan with FNC1 separators rather than brackets', () => {
    const gs = String.fromCharCode(29);
    const raw = `]d201059079968696401730072110222507110N${gs}21ABC123`;
    expect(parseGs1(raw)).toEqual({
      code: '5907996869640',
      type: 'gs1_datamatrix',
      expiryDate: '2030-07-21',
      expiryPrecision: 'day',
      lotNumber: '222507110N',
      serial: 'ABC123',
    });
  });

  it('strips the GTIN-14 pad so it matches the stripe on the same box', () => {
    expect(parseGs1('(01)05909990811045')?.code).toBe('5909990811045');
  });

  it('returns null without a product code', () => {
    expect(parseGs1('(17)300721(10)ABC')).toBeNull();
  });
});

describe('parseScan', () => {
  it('prefers GS1, because a DataMatrix carries expiry and batch', () => {
    const result = parseScan('(01)05900065600056(17)280107(10)2026-01-07');
    expect(result.type).toBe('gs1_datamatrix');
    expect(result.expiryDate).toBe('2028-01-07'); // Aqua-Gel
    expect(result.lotNumber).toBe('2026-01-07');
  });

  it('falls back to a plain retail stripe, which carries nothing else', () => {
    expect(parseScan('5909991434090')).toEqual({
      code: '5909991434090',
      type: 'ean13',
      expiryDate: null,
      expiryPrecision: null,
      lotNumber: null,
      serial: null,
    });
  });

  it('normalises UPC-A to the same key an EAN-13 would produce', () => {
    const result = parseScan('033984020276');
    expect(result.code).toBe('0033984020276');
    expect(result.type).toBe('upc_a');
  });

  it('hands back anything unrecognised rather than throwing', () => {
    const result = parseScan('NOT-A-BARCODE');
    expect(result.code).toBe('NOT-A-BARCODE');
    expect(result.type).toBe('other');
    expect(result.expiryDate).toBeNull();
  });
});
