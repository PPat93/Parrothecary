import { describe, expect, it } from 'vitest';
import {
  doseOccurrenceStatus,
  formatDoseCadence,
  formatDoseFrequency,
  isScheduleActiveOn,
  nextDueDate,
  recentScheduleDates,
} from './dosing';

const TODAY = '2026-07-26';

describe('isScheduleActiveOn', () => {
  it('is false before the schedule started', () => {
    expect(isScheduleActiveOn({ startDate: '2026-08-01', endDate: null, intervalDays: 1 }, '2026-07-31')).toBe(
      false,
    );
  });

  it('is true on the start date itself', () => {
    expect(isScheduleActiveOn({ startDate: '2026-07-26', endDate: null, intervalDays: 1 }, '2026-07-26')).toBe(
      true,
    );
  });

  it('runs forever when there is no end date', () => {
    expect(isScheduleActiveOn({ startDate: '2026-01-01', endDate: null, intervalDays: 1 }, '2099-01-01')).toBe(
      true,
    );
  });

  it('is false after the end date, true on it', () => {
    const schedule = { startDate: '2026-01-01', endDate: '2026-01-10', intervalDays: 1 };
    expect(isScheduleActiveOn(schedule, '2026-01-10')).toBe(true);
    expect(isScheduleActiveOn(schedule, '2026-01-11')).toBe(false);
  });
});

describe('doseOccurrenceStatus', () => {
  it('is taken whenever the occurrence has a confirmation, regardless of date', () => {
    const taken = new Set([1]);
    expect(doseOccurrenceStatus(1, '2026-07-20', TODAY, taken)).toBe('taken');
    expect(doseOccurrenceStatus(1, TODAY, TODAY, taken)).toBe('taken');
  });

  it('is missed for a past date with no confirmation', () => {
    expect(doseOccurrenceStatus(1, '2026-07-20', TODAY, new Set())).toBe('missed');
  });

  it('is pending for today with no confirmation yet', () => {
    expect(doseOccurrenceStatus(1, TODAY, TODAY, new Set())).toBe('pending');
  });

  it('is future for a date after today', () => {
    expect(doseOccurrenceStatus(1, '2026-07-27', TODAY, new Set())).toBe('future');
  });

  it('does not confuse occurrence 2 taken with occurrence 1 taken', () => {
    // Evening dose confirmed before the morning one — the morning dose is
    // still genuinely missed, not "done because something today was done".
    const eveningTaken = new Set([2]);
    expect(doseOccurrenceStatus(1, TODAY, TODAY, eveningTaken)).toBe('pending');
    expect(doseOccurrenceStatus(2, TODAY, TODAY, eveningTaken)).toBe('taken');
  });
});

describe('recentScheduleDates', () => {
  it('returns the requested number of trailing days ending today', () => {
    const schedule = { startDate: '2020-01-01', endDate: null, intervalDays: 1 };
    expect(recentScheduleDates(schedule, TODAY, 3)).toEqual([
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ]);
  });

  it('clips to the start date, so a new course does not report missed days before it existed', () => {
    const schedule = { startDate: '2026-07-25', endDate: null, intervalDays: 1 };
    expect(recentScheduleDates(schedule, TODAY, 3)).toEqual(['2026-07-25', '2026-07-26']);
  });

  it('clips to the end date when the schedule has already finished', () => {
    const schedule = { startDate: '2026-07-01', endDate: '2026-07-24', intervalDays: 1 };
    expect(recentScheduleDates(schedule, TODAY, 3)).toEqual(['2026-07-24']);
  });

  it('returns nothing for a schedule that has not started yet', () => {
    const schedule = { startDate: '2026-08-01', endDate: null, intervalDays: 1 };
    expect(recentScheduleDates(schedule, TODAY, 3)).toEqual([]);
  });
});

describe('formatDoseFrequency', () => {
  it('uses words for the two common cases', () => {
    expect(formatDoseFrequency(1)).toBe('once a day');
    expect(formatDoseFrequency(2)).toBe('twice a day');
  });

  it('falls back to a count past that', () => {
    expect(formatDoseFrequency(3)).toBe('3 times a day');
    expect(formatDoseFrequency(4)).toBe('4 times a day');
  });
});

describe('isScheduleActiveOn — intervals', () => {
  // Anchored on a Tuesday; TODAY (2026-07-26) is a Sunday.
  const weekly = { startDate: '2026-07-07', endDate: null, intervalDays: 7 };

  it('is due on the anchor day and every interval after it', () => {
    expect(isScheduleActiveOn(weekly, '2026-07-07')).toBe(true);
    expect(isScheduleActiveOn(weekly, '2026-07-14')).toBe(true);
    expect(isScheduleActiveOn(weekly, '2026-07-21')).toBe(true);
  });

  it('is not due on the days between', () => {
    // The dangerous direction: a weekly drug must never look due daily.
    for (const date of ['2026-07-08', '2026-07-09', '2026-07-13', '2026-07-20']) {
      expect(isScheduleActiveOn(weekly, date)).toBe(false);
    }
  });

  it('handles alternate days', () => {
    const alternate = { startDate: '2026-07-20', endDate: null, intervalDays: 2 };
    expect(isScheduleActiveOn(alternate, '2026-07-20')).toBe(true);
    expect(isScheduleActiveOn(alternate, '2026-07-21')).toBe(false);
    expect(isScheduleActiveOn(alternate, '2026-07-22')).toBe(true);
  });

  it('still respects the start and end dates', () => {
    const ended = { startDate: '2026-07-07', endDate: '2026-07-15', intervalDays: 7 };
    expect(isScheduleActiveOn(ended, '2026-06-30')).toBe(false); // an interval before the start
    expect(isScheduleActiveOn(ended, '2026-07-14')).toBe(true);
    expect(isScheduleActiveOn(ended, '2026-07-21')).toBe(false); // past the end
  });

  it('treats a nonsensical interval as daily rather than dividing by zero', () => {
    const broken = { startDate: '2026-07-20', endDate: null, intervalDays: 0 };
    expect(isScheduleActiveOn(broken, '2026-07-21')).toBe(true);
  });
});

describe('nextDueDate', () => {
  const weekly = { startDate: '2026-07-07', endDate: null, intervalDays: 7 };

  it('returns today when today is a dosing day', () => {
    expect(nextDueDate(weekly, '2026-07-21')).toBe('2026-07-21');
  });

  it('returns the next dosing day otherwise', () => {
    expect(nextDueDate(weekly, TODAY)).toBe('2026-07-28');
    expect(nextDueDate(weekly, '2026-07-22')).toBe('2026-07-28');
  });

  it('returns the start date for a schedule that has not begun', () => {
    expect(nextDueDate(weekly, '2026-07-01')).toBe('2026-07-07');
  });

  it('is null once the schedule has finished', () => {
    const ended = { startDate: '2026-07-07', endDate: '2026-07-20', intervalDays: 7 };
    expect(nextDueDate(ended, TODAY)).toBeNull();
  });

  it('is tomorrow for an everyday schedule, never null', () => {
    const daily = { startDate: '2020-01-01', endDate: null, intervalDays: 1 };
    expect(nextDueDate(daily, TODAY)).toBe(TODAY);
  });
});

describe('formatDoseFrequency — intervals', () => {
  it('says a week rather than a day when the interval is weekly', () => {
    expect(formatDoseFrequency(1, 7)).toBe('once a week');
    expect(formatDoseFrequency(2, 7)).toBe('twice a week');
  });

  it('names a fortnight, and counts days otherwise', () => {
    expect(formatDoseFrequency(1, 14)).toBe('once a fortnight');
    expect(formatDoseFrequency(1, 3)).toBe('once every 3 days');
  });

  it('keeps the daily wording for an interval of one', () => {
    expect(formatDoseFrequency(1, 1)).toBe('once a day');
  });
});

describe('formatDoseCadence', () => {
  it('is terse for the board', () => {
    expect(formatDoseCadence(2, 1)).toBe('2×/day');
    expect(formatDoseCadence(1, 7)).toBe('1×/week');
    expect(formatDoseCadence(1, 3)).toBe('1×/3 days');
  });
});
