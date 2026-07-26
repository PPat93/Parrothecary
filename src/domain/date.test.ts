import { describe, expect, it } from 'vitest';
import {
  addDays,
  differenceInDays,
  isIsoDate,
  lastDayOfMonth,
  midpoint,
  parseIsoDate,
  toIsoDate,
  todayIso,
} from './date';

describe('parseIsoDate / toIsoDate', () => {
  it('round-trips a date', () => {
    expect(toIsoDate(parseIsoDate('2027-11-30'))).toBe('2027-11-30');
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(() => parseIsoDate('30.11.2027')).toThrow();
    expect(() => parseIsoDate('2027-11')).toThrow();
  });
});

describe('isIsoDate', () => {
  it('accepts real dates', () => {
    expect(isIsoDate('2028-02-29')).toBe(true); // leap year
  });

  it('rejects dates that do not exist', () => {
    expect(isIsoDate('2027-02-31')).toBe(false);
    expect(isIsoDate('2027-02-29')).toBe(false); // not a leap year
    expect(isIsoDate('2027-13-01')).toBe(false);
  });
});

describe('differenceInDays', () => {
  it('counts whole days forward and backward', () => {
    expect(differenceInDays('2026-07-26', '2026-08-05')).toBe(10);
    expect(differenceInDays('2026-08-05', '2026-07-26')).toBe(-10);
    expect(differenceInDays('2026-07-26', '2026-07-26')).toBe(0);
  });

  it('is unaffected by the spring clock change', () => {
    // Europe/Dublin and Europe/Warsaw both jump forward on 2027-03-28.
    // A local-time implementation returns 1 here, which is the classic bug.
    expect(differenceInDays('2027-03-27', '2027-03-29')).toBe(2);
  });

  it('is unaffected by the autumn clock change', () => {
    expect(differenceInDays('2027-10-30', '2027-11-01')).toBe(2);
  });

  it('crosses a leap day correctly', () => {
    expect(differenceInDays('2028-02-28', '2028-03-01')).toBe(2);
    expect(differenceInDays('2027-02-28', '2027-03-01')).toBe(1);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2027-01-02', -3)).toBe('2026-12-30');
  });

  it('crosses a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });
});

describe('lastDayOfMonth', () => {
  it('handles 30- and 31-day months', () => {
    expect(lastDayOfMonth('2027-11')).toBe('2027-11-30');
    expect(lastDayOfMonth('2027-12')).toBe('2027-12-31');
  });

  it('handles February in both leap and common years', () => {
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
    expect(lastDayOfMonth('2027-02')).toBe('2027-02-28');
    expect(lastDayOfMonth('2100-02')).toBe('2100-02-28'); // century, not a leap year
  });

  it('rejects nonsense', () => {
    expect(() => lastDayOfMonth('2027-13')).toThrow();
    expect(() => lastDayOfMonth('2027-00')).toThrow();
    expect(() => lastDayOfMonth('2027-11-30')).toThrow();
  });
});

describe('midpoint', () => {
  it('finds the date halfway between two trips', () => {
    // Mid-October to early March: the audit and ordering deadline lands between.
    expect(midpoint('2026-10-15', '2027-03-05')).toBe('2026-12-24');
  });

  it('rounds down on an odd number of days', () => {
    expect(midpoint('2026-07-26', '2026-07-29')).toBe('2026-07-27');
  });
});

describe('todayIso', () => {
  it('uses local calendar day, not UTC instant', () => {
    // 23:30 on the 26th in a UTC+1 zone is still the 26th to the user.
    const localLateEvening = new Date(2026, 6, 26, 23, 30);
    expect(todayIso(localLateEvening)).toBe('2026-07-26');
  });
});
