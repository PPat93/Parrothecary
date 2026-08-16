import { describe, expect, it } from 'vitest';
import { addDays } from './date';
import { boardDates, boardDoseStatus, doseWindowDays, HISTORY_DAYS, recentScheduleDates } from './dosing';

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

/**
 * Backdating is the normal way to enter a course you are already taking — four
 * of the five schedules in the real cabinet were entered that way. The board
 * drew red "missed" pills for the days before it knew the course existed.
 */
describe('the days the board will draw a pill on', () => {
  const daily = { startDate: '2026-03-06', endDate: null, intervalDays: 1 };
  const nothingConfirmed = () => false;

  it('says nothing about the days before the course was entered', () => {
    const dates = boardDates({ ...daily, createdOn: TODAY }, TODAY, HISTORY_DAYS, nothingConfirmed);
    expect(dates).toEqual([TODAY]);
  });

  it('still shows today, so a course entered today can be confirmed at once', () => {
    const dates = boardDates({ ...daily, createdOn: TODAY }, TODAY, HISTORY_DAYS, nothingConfirmed);
    expect(dates).toContain(TODAY);
  });

  it('fills in as the days pass', () => {
    const entered = addDays(TODAY, -1);
    const dates = boardDates({ ...daily, createdOn: entered }, TODAY, HISTORY_DAYS, nothingConfirmed);
    expect(dates).toEqual([entered, TODAY]);
  });

  it('leaves an established course untouched', () => {
    const dates = boardDates(
      { ...daily, createdOn: '2026-03-06' },
      TODAY,
      HISTORY_DAYS,
      nothingConfirmed,
    );
    expect(dates).toEqual([addDays(TODAY, -2), addDays(TODAY, -1), TODAY]);
  });

  it('never hides a dose that was confirmed, however old the day', () => {
    // Undoing it has to stay possible — the way out has to exist somewhere.
    const old = addDays(TODAY, -2);
    const dates = boardDates(
      { ...daily, createdOn: TODAY },
      TODAY,
      HISTORY_DAYS,
      (date) => date === old,
    );
    expect(dates).toEqual([old, TODAY]);
  });

  it('calls an unconfirmed occurrence on a kept older day unknown, not missed', () => {
    // The day is kept because its other occurrence was confirmed. Its sibling
    // must not turn back into an accusation about a morning before the app.
    const old = addDays(TODAY, -2);
    const morningTaken = new Set([1]);

    expect(boardDoseStatus(1, old, TODAY, morningTaken, TODAY)).toBe('taken');
    expect(boardDoseStatus(2, old, TODAY, morningTaken, TODAY)).toBe('unknown');
  });

  it('still calls a genuine missed dose missed', () => {
    const yesterday = addDays(TODAY, -1);
    const entered = addDays(TODAY, -5);
    expect(boardDoseStatus(1, yesterday, TODAY, new Set(), entered)).toBe('missed');
  });

  it('leaves today alone however new the course is', () => {
    expect(boardDoseStatus(1, TODAY, TODAY, new Set(), TODAY)).toBe('pending');
  });

  it('does not resurrect days the schedule was not running on', () => {
    const weekly = { startDate: '2026-06-13', endDate: null, intervalDays: 7 };
    const dates = boardDates(
      { ...weekly, createdOn: '2026-06-13' },
      TODAY,
      doseWindowDays({ intervalDays: 7 }),
      () => true,
    );
    expect(dates).toEqual(['2026-08-08', TODAY]);
  });
});
