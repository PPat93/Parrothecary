import { describe, expect, it } from 'vitest';
import {
  formatMoney,
  formatPricePerUnit,
  money,
  parseAmount,
  parseFxRate,
  pricePerUnit,
  sumMoney,
  toEurOrNull,
  unusedValue,
} from './money';

describe('money', () => {
  it('refuses fractional minor units', () => {
    expect(() => money(12.5, 'PLN')).toThrow();
  });
});

describe('parseAmount', () => {
  it('reads the Polish comma decimal', () => {
    expect(parseAmount('12,50', 'PLN')).toEqual({ amountMinor: 1250, currency: 'PLN' });
  });

  it('reads the Irish dot decimal', () => {
    expect(parseAmount('12.50', 'EUR')).toEqual({ amountMinor: 1250, currency: 'EUR' });
  });

  it('ignores spaces used as thousands separators', () => {
    expect(parseAmount('1 234,56', 'PLN')).toEqual({ amountMinor: 123456, currency: 'PLN' });
  });

  it('treats three trailing digits as thousands, not decimals', () => {
    // "1.234" on a Polish price list means one thousand two hundred thirty four.
    expect(parseAmount('1.234', 'PLN')).toEqual({ amountMinor: 123400, currency: 'PLN' });
  });

  it('handles a whole number with no separator', () => {
    expect(parseAmount('12', 'PLN')).toEqual({ amountMinor: 1200, currency: 'PLN' });
  });

  it('handles a single decimal digit', () => {
    expect(parseAmount('12,5', 'PLN')).toEqual({ amountMinor: 1250, currency: 'PLN' });
  });

  it('rejects rubbish', () => {
    expect(() => parseAmount('', 'PLN')).toThrow();
    expect(() => parseAmount('about a tenner', 'PLN')).toThrow();
  });

  // Everything this parses is a price paid, and a minus quietly subtracted
  // from the cupboard's value instead of adding to it.
  it('refuses a negative price', () => {
    expect(() => parseAmount('-12,50', 'PLN')).toThrow();
    expect(() => parseAmount('-12', 'EUR')).toThrow();
  });
});

describe('formatMoney', () => {
  it('puts the złoty symbol after the amount with a comma decimal', () => {
    expect(formatMoney(money(1250, 'PLN'))).toBe('12,50 zł');
  });

  it('puts the euro symbol before the amount with a dot decimal', () => {
    expect(formatMoney(money(1250, 'EUR'))).toBe('€12.50');
  });

  it('pads the minor units', () => {
    expect(formatMoney(money(1205, 'PLN'))).toBe('12,05 zł');
    expect(formatMoney(money(5, 'EUR'))).toBe('€0.05');
  });

  it('keeps the sign on negatives in both currencies', () => {
    expect(formatMoney(money(-1250, 'PLN'))).toBe('-12,50 zł');
    expect(formatMoney(money(-1250, 'EUR'))).toBe('-€12.50');
  });

  it('can omit the currency', () => {
    expect(formatMoney(money(1250, 'PLN'), { showCurrency: false })).toBe('12,50');
    expect(formatMoney(money(-1250, 'EUR'), { showCurrency: false })).toBe('-12.50');
  });
});

describe('toEurOrNull', () => {
  it('converts złoty at the rate recorded on the purchase date', () => {
    // 100,00 zł at 0.23 EUR/PLN
    expect(toEurOrNull(money(10000, 'PLN'), 0.23)).toEqual({ amountMinor: 2300, currency: 'EUR' });
  });

  it('leaves euro untouched and does not require a rate', () => {
    expect(toEurOrNull(money(1250, 'EUR'), null)).toEqual({ amountMinor: 1250, currency: 'EUR' });
  });

  it('refuses to guess a missing rate, without taking the page down', () => {
    expect(toEurOrNull(money(10000, 'PLN'), null)).toBeNull();
    expect(toEurOrNull(money(10000, 'PLN'), 0)).toBeNull();
    expect(toEurOrNull(money(10000, 'PLN'), -0.23)).toBeNull();
  });
});

describe('parseFxRate', () => {
  it('accepts either decimal separator', () => {
    expect(parseFxRate('0,2312')).toEqual({ ok: true, rate: 0.2312 });
    expect(parseFxRate(' 0.2312 ')).toEqual({ ok: true, rate: 0.2312 });
  });

  it('treats blank as not recorded rather than as an error', () => {
    expect(parseFxRate('')).toEqual({ ok: true, rate: null });
    expect(parseFxRate('   ')).toEqual({ ok: true, rate: null });
  });

  it('rejects nonsense and impossible rates', () => {
    expect(parseFxRate('abc').ok).toBe(false);
    expect(parseFxRate('0').ok).toBe(false);
    expect(parseFxRate('-0,23').ok).toBe(false);
  });

  /*
   * The likeliest mistake by a distance: "4,35 to the euro" is the number a
   * bank app shows and the one a person remembers. Taken at face value it
   * would inflate every euro total in the app by about nineteen times.
   */
  it('refuses a rate given the wrong way round, and says which number to use', () => {
    const result = parseFxRate('4,35');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('0,2299');

    expect(parseFxRate('1').ok).toBe(false);
    expect(parseFxRate('2312').ok).toBe(false);
  });
});

describe('pricePerUnit', () => {
  it('keeps the fraction, because comparing pack sizes is the whole point', () => {
    // 24 tablets for 12,99 zł vs 60 for 24,99 zł — the 60 is clearly cheaper.
    expect(pricePerUnit(money(1299, 'PLN'), 24)).toBeCloseTo(54.125, 3);
    expect(pricePerUnit(money(2499, 'PLN'), 60)).toBeCloseTo(41.65, 2);
  });

  it('rejects a zero or negative unit count', () => {
    expect(() => pricePerUnit(money(1299, 'PLN'), 0)).toThrow();
  });
});

describe('formatPricePerUnit', () => {
  it('reads as grosze for złoty and cents for euro', () => {
    expect(formatPricePerUnit(54.125, 'PLN')).toBe('54.13 gr');
    expect(formatPricePerUnit(12.5, 'EUR')).toBe('12.5c');
  });
});

describe('sumMoney', () => {
  it('adds a trip total', () => {
    const spend = [money(1299, 'PLN'), money(2499, 'PLN'), money(850, 'PLN')];
    expect(sumMoney(spend, 'PLN')).toEqual({ amountMinor: 4648, currency: 'PLN' });
  });

  it('sums to zero on an empty list', () => {
    expect(sumMoney([], 'EUR')).toEqual({ amountMinor: 0, currency: 'EUR' });
  });

  it('refuses to silently add mixed currencies', () => {
    expect(() => sumMoney([money(1299, 'PLN'), money(500, 'EUR')], 'PLN')).toThrow();
  });
});

describe('unusedValue', () => {
  const pack = money(1299, 'PLN'); // a 50-pack of APAP

  it('is the whole price when nothing was used', () => {
    expect(unusedValue(pack, 50, 50)).toEqual(money(1299, 'PLN'));
  });

  it('is nothing when the pack was finished', () => {
    expect(unusedValue(pack, 50, 0)).toEqual(money(0, 'PLN'));
  });

  it('charges only the part actually thrown away', () => {
    // Binning a half-used box wastes half the money, not all of it.
    expect(unusedValue(pack, 50, 25)).toEqual(money(650, 'PLN'));
    expect(unusedValue(money(6000, 'PLN'), 60, 20)).toEqual(money(2000, 'PLN'));
  });

  it('keeps the currency it was bought in', () => {
    expect(unusedValue(money(2199, 'EUR'), 60, 30)).toEqual(money(1100, 'EUR'));
  });

  it('does not exceed the price when more is left than a pack holds', () => {
    // Two boxes merged into one row, a mistyped quantity — either way, waste
    // cannot cost more than the thing cost.
    expect(unusedValue(pack, 50, 80)).toEqual(money(1299, 'PLN'));
  });

  it('costs a multi-pack box against everything it held', () => {
    /*
     * A shopping line for three 60-packs is received as one box of 180, priced
     * at what all three cost. Dividing by one pack instead charged a box with
     * two packs still in it as the entire €30 thrown away.
     */
    const threePacks = money(3000, 'EUR');
    expect(unusedValue(threePacks, 180, 180)).toEqual(money(3000, 'EUR'));
    expect(unusedValue(threePacks, 180, 120)).toEqual(money(2000, 'EUR'));
    expect(unusedValue(threePacks, 180, 60)).toEqual(money(1000, 'EUR'));
  });

  it('treats a negative remainder as nothing left', () => {
    expect(unusedValue(pack, 50, -5)).toEqual(money(0, 'PLN'));
  });

  it('does not divide by a missing pack size', () => {
    expect(unusedValue(pack, 0, 10)).toEqual(money(0, 'PLN'));
  });
});
