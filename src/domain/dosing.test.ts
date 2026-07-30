import { describe, expect, it } from 'vitest';
import {
  doseOccurrenceStatus,
  formatDoseFrequency,
  isScheduleActiveOn,
  recentScheduleDates,
} from './dosing';

const TODAY = '2026-07-26';

describe('isScheduleActiveOn', () => {
  it('is false before the schedule started', () => {
    expect(isScheduleActiveOn({ startDate: '2026-08-01', endDate: null }, '2026-07-31')).toBe(
      false,
    );
  });

  it('is true on the start date itself', () => {
    expect(isScheduleActiveOn({ startDate: '2026-07-26', endDate: null }, '2026-07-26')).toBe(
      true,
    );
  });

  it('runs forever when there is no end date', () => {
    expect(isScheduleActiveOn({ startDate: '2026-01-01', endDate: null }, '2099-01-01')).toBe(
      true,
    );
  });

  it('is false after the end date, true on it', () => {
    const schedule = { startDate: '2026-01-01', endDate: '2026-01-10' };
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
    const schedule = { startDate: '2020-01-01', endDate: null };
    expect(recentScheduleDates(schedule, TODAY, 3)).toEqual([
      '2026-07-24',
      '2026-07-25',
      '2026-07-26',
    ]);
  });

  it('clips to the start date, so a new course does not report missed days before it existed', () => {
    const schedule = { startDate: '2026-07-25', endDate: null };
    expect(recentScheduleDates(schedule, TODAY, 3)).toEqual(['2026-07-25', '2026-07-26']);
  });

  it('clips to the end date when the schedule has already finished', () => {
    const schedule = { startDate: '2026-07-01', endDate: '2026-07-24' };
    expect(recentScheduleDates(schedule, TODAY, 3)).toEqual(['2026-07-24']);
  });

  it('returns nothing for a schedule that has not started yet', () => {
    const schedule = { startDate: '2026-08-01', endDate: null };
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
