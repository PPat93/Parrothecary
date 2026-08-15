import { describe, expect, it } from 'vitest';
import { addDays } from './date';
import { doseWindowDays, HISTORY_DAYS, recentScheduleDates } from './dosing';

/**
 * The dose board draws a row of pills per schedule, and separately fetches the
 * confirmations that colour them in. Two ranges, one picture — and they drifted:
 * the row widened past a full interval so a weekly dose would not vanish for
 * four days out of seven, while the query behind it kept its three-day cutoff.
 * The dose taken last Saturday came back unconfirmed and its pill rendered red,
 * permanently, because `confirmDose` rightly refuses to record it twice.
 *
 * The rule: whatever the widest row reaches back to, the confirmations must
 * reach at least as far.
 */

/** The cutoff the board computes for a page holding these schedules. */
function cutoffFor(intervals: number[], today: string): string {
  const widest = Math.max(HISTORY_DAYS, ...intervals.map((intervalDays) => doseWindowDays({ intervalDays })));
  return addDays(today, -(widest - 1));
}

const TODAY = '2026-08-15';

describe('the dose board window', () => {
  it.each([1, 2, 3, 7, 14, 30])(
    'fetches confirmations for every day it draws a pill on (every %i days)',
    (intervalDays) => {
      const drawn = recentScheduleDates(
        { startDate: '2026-01-01', endDate: null, intervalDays },
        TODAY,
        doseWindowDays({ intervalDays }),
      );
      const cutoff = cutoffFor([intervalDays], TODAY);

      expect(drawn.length).toBeGreaterThan(0);
      for (const date of drawn) expect(date >= cutoff).toBe(true);
    },
  );

  it('covers the widest schedule when several share the page', () => {
    const intervals = [1, 2, 7];
    const cutoff = cutoffFor(intervals, TODAY);

    for (const intervalDays of intervals) {
      const drawn = recentScheduleDates(
        { startDate: '2026-01-01', endDate: null, intervalDays },
        TODAY,
        doseWindowDays({ intervalDays }),
      );
      for (const date of drawn) expect(date >= cutoff).toBe(true);
    }
  });

  it('draws the last dosing day of a weekly course, not an empty row', () => {
    // Anchored so the previous dose was a week ago and none is due that day.
    const drawn = recentScheduleDates(
      { startDate: '2026-06-13', endDate: null, intervalDays: 7 },
      addDays(TODAY, -1),
      doseWindowDays({ intervalDays: 7 }),
    );
    expect(drawn).toEqual(['2026-08-08']);
  });

  it('reaches back further than one interval, so no row can come up empty', () => {
    for (const intervalDays of [1, 2, 3, 7, 14]) {
      expect(doseWindowDays({ intervalDays })).toBeGreaterThan(intervalDays);
    }
  });
});
