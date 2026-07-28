import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THRESHOLDS,
  daysUntilExpiry,
  expiryStatus,
  formatExpiry,
  isUsableOn,
  normaliseExpiry,
  type ExpiryInput,
} from './expiry';

const TODAY = '2026-07-26';

function box(expiryDate: string | null, precision: 'day' | 'month' | null = 'day'): ExpiryInput {
  return { expiryDate, precision, hasExpiry: expiryDate !== null };
}

describe('normaliseExpiry', () => {
  it('keeps a full date as day precision', () => {
    expect(normaliseExpiry('2027-11-15')).toEqual({
      expiryDate: '2027-11-15',
      precision: 'day',
    });
  });

  it('expands a month-only box to the last day of that month', () => {
    // A box marked 11/2027 is good through the whole of November.
    expect(normaliseExpiry('11/2027')).toEqual({
      expiryDate: '2027-11-30',
      precision: 'month',
    });
    expect(normaliseExpiry('11.2027')).toEqual({
      expiryDate: '2027-11-30',
      precision: 'month',
    });
    expect(normaliseExpiry('2027-11')).toEqual({
      expiryDate: '2027-11-30',
      precision: 'month',
    });
  });

  it('pads a single-digit month', () => {
    expect(normaliseExpiry('1/2028')).toEqual({
      expiryDate: '2028-01-31',
      precision: 'month',
    });
  });

  it('reads day.month.year, the order printed on Polish and Irish boxes', () => {
    expect(normaliseExpiry('15.11.2027')).toEqual({
      expiryDate: '2027-11-15',
      precision: 'day',
    });
    expect(normaliseExpiry('05/03/2027')).toEqual({
      expiryDate: '2027-03-05',
      precision: 'day',
    });
  });

  it('handles a month-precision February in a leap year', () => {
    expect(normaliseExpiry('02/2028')).toEqual({
      expiryDate: '2028-02-29',
      precision: 'month',
    });
  });

  it('rejects impossible and unparseable dates', () => {
    expect(() => normaliseExpiry('31.02.2027')).toThrow();
    expect(() => normaliseExpiry('sometime next year')).toThrow();
    expect(() => normaliseExpiry('')).toThrow();
  });
});

describe('daysUntilExpiry', () => {
  it('counts forward', () => {
    expect(daysUntilExpiry(box('2026-08-05'), TODAY)).toBe(10);
  });

  it('goes negative once passed', () => {
    expect(daysUntilExpiry(box('2026-07-20'), TODAY)).toBe(-6);
  });

  it('returns null for items that never expire', () => {
    expect(daysUntilExpiry({ expiryDate: null, precision: null, hasExpiry: false }, TODAY)).toBeNull();
  });
});

describe('expiryStatus', () => {
  it('flags anything past its date as expired', () => {
    expect(expiryStatus(box('2026-07-25'), TODAY)).toBe('expired');
  });

  it('treats the expiry day itself as still usable but critical', () => {
    expect(expiryStatus(box('2026-07-26'), TODAY)).toBe('critical');
  });

  it('goes red inside the critical window', () => {
    // 60 days by default: will not survive to the next restock trip.
    expect(expiryStatus(box('2026-09-01'), TODAY)).toBe('critical');
    expect(expiryStatus(box('2026-09-24'), TODAY)).toBe('critical'); // exactly 60
  });

  it('goes amber inside the warning window', () => {
    expect(expiryStatus(box('2026-09-25'), TODAY)).toBe('warning'); // 61
    expect(expiryStatus(box('2027-01-22'), TODAY)).toBe('warning'); // exactly 180
  });

  it('is fine beyond the warning window', () => {
    expect(expiryStatus(box('2027-01-23'), TODAY)).toBe('ok'); // 181
    expect(expiryStatus(box('2029-01-01'), TODAY)).toBe('ok');
  });

  it('reports non-expiring items separately rather than as ok', () => {
    const plasters: ExpiryInput = { expiryDate: null, precision: null, hasExpiry: false };
    expect(expiryStatus(plasters, TODAY)).toBe('none');
  });

  it('distinguishes "we never typed the date in" from "it does not expire"', () => {
    // A bandage that does expire but whose date we have not recorded must not
    // be reported as never expiring — that is a claim we cannot make.
    const bandage: ExpiryInput = { expiryDate: null, precision: null, hasExpiry: true };
    expect(expiryStatus(bandage, TODAY)).toBe('unknown');
  });

  it('honours custom thresholds', () => {
    const tight = { criticalDays: 7, warningDays: 14 };
    expect(expiryStatus(box('2026-08-20'), TODAY, tight)).toBe('ok'); // 25 days
    expect(expiryStatus(box('2026-08-05'), TODAY, tight)).toBe('warning'); // 10 days
    expect(expiryStatus(box('2026-08-01'), TODAY, tight)).toBe('critical'); // 6 days
  });

  it('uses thresholds sized for a two-trips-a-year cycle', () => {
    expect(DEFAULT_THRESHOLDS.criticalDays).toBe(60);
    expect(DEFAULT_THRESHOLDS.warningDays).toBe(180);
  });
});

describe('formatExpiry', () => {
  it('hides the invented day on month-precision boxes', () => {
    expect(formatExpiry(box('2027-11-30', 'month'))).toBe('11/2027');
  });

  it('shows the full date when the box printed one', () => {
    expect(formatExpiry(box('2027-11-15', 'day'))).toBe('15.11.2027');
  });

  it('says so when nothing expires', () => {
    expect(formatExpiry({ expiryDate: null, precision: null, hasExpiry: false })).toBe('no expiry');
  });

  it('admits when the date is simply missing', () => {
    expect(formatExpiry({ expiryDate: null, precision: null, hasExpiry: true })).toBe(
      'date unknown',
    );
  });
});

describe('isUsableOn', () => {
  it('answers whether stock survives until a future trip', () => {
    // Will this box still be good when we next restock in March?
    expect(isUsableOn(box('2027-03-10'), '2027-03-05')).toBe(true);
    expect(isUsableOn(box('2027-02-28'), '2027-03-05')).toBe(false);
  });

  it('treats the expiry day itself as usable', () => {
    expect(isUsableOn(box('2027-03-05'), '2027-03-05')).toBe(true);
  });

  it('says non-expiring stock is always usable', () => {
    expect(isUsableOn({ expiryDate: null, precision: null, hasExpiry: false }, '2099-01-01')).toBe(
      true,
    );
  });
});
