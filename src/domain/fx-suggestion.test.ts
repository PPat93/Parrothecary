import { describe, expect, it } from 'vitest';
import { suggestFxRate, type FxRateOnDate } from './money';

/**
 * The rate offered for a box has to be chosen against the date on the box, and
 * that date is a field somebody can still change. Working it out once, when the
 * form was drawn, meant a box backdated to an earlier trip quietly kept the
 * rate of whichever day the form happened to open with — a rate from after the
 * purchase, which is the one thing this rule exists to prevent.
 */
const history: FxRateOnDate[] = [
  { date: '2026-03-05', rate: 0.2312 },
  { date: '2025-10-15', rate: 0.2345 },
  { date: '2024-10-11', rate: 0.2295 },
  { date: '2023-10-13', rate: 0.2185 },
];

describe('choosing which rate to offer', () => {
  it('takes the rate of the day itself when there is one', () => {
    expect(suggestFxRate(history, '2024-10-11')).toEqual({
      rate: 0.2295,
      fromDate: '2024-10-11',
      sameDay: true,
    });
  });

  it('falls back to the nearest earlier day', () => {
    expect(suggestFxRate(history, '2025-01-20')).toEqual({
      rate: 0.2295,
      fromDate: '2024-10-11',
      sameDay: false,
    });
  });

  it('never reaches for a rate from after the purchase', () => {
    // The bug: a box backdated to 2024 being offered 2026's rate.
    const offered = suggestFxRate(history, '2024-06-01');
    expect(offered?.fromDate).toBe('2023-10-13');
    expect(offered!.fromDate < '2024-06-01').toBe(true);
  });

  it('follows the date as it moves, in both directions', () => {
    expect(suggestFxRate(history, '2026-03-05')?.rate).toBe(0.2312);
    expect(suggestFxRate(history, '2023-10-13')?.rate).toBe(0.2185);
    expect(suggestFxRate(history, '2026-03-05')?.rate).toBe(0.2312);
  });

  it('offers nothing for a purchase older than anything on record', () => {
    expect(suggestFxRate(history, '2020-01-01')).toBeNull();
  });

  it('offers the newest rate when there is no date to go on', () => {
    expect(suggestFxRate(history, null)).toEqual({
      rate: 0.2312,
      fromDate: '2026-03-05',
      sameDay: false,
    });
  });

  it('has nothing to say before any rate has ever been recorded', () => {
    expect(suggestFxRate([], '2026-03-05')).toBeNull();
    expect(suggestFxRate([], null)).toBeNull();
  });

  it('does not depend on the order it is given', () => {
    const shuffled = [...history].reverse();
    expect(suggestFxRate(shuffled, '2025-01-20')).toEqual(suggestFxRate(history, '2025-01-20'));
  });
});
