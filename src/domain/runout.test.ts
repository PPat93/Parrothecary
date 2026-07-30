import { describe, expect, it } from 'vitest';
import { projectRunOut, runOutSeverity, scheduleDailyRate } from './runout';

const TODAY = '2026-07-26';

describe('scheduleDailyRate', () => {
  it('multiplies dose by times per day', () => {
    expect(scheduleDailyRate({ doseUnits: 1, timesPerDay: 1, intervalDays: 1 })).toBe(1);
    expect(scheduleDailyRate({ doseUnits: 0.5, timesPerDay: 2, intervalDays: 1 })).toBe(1);
    expect(scheduleDailyRate({ doseUnits: 5, timesPerDay: 3, intervalDays: 1 })).toBe(15);
  });

  it('spreads an infrequent dose across its interval', () => {
    // A weekly tablet is a seventh of a tablet a day, for reordering purposes.
    expect(scheduleDailyRate({ doseUnits: 1, timesPerDay: 1, intervalDays: 7 })).toBeCloseTo(1 / 7);
    expect(scheduleDailyRate({ doseUnits: 1, timesPerDay: 1, intervalDays: 2 })).toBe(0.5);
    expect(scheduleDailyRate({ doseUnits: 2, timesPerDay: 2, intervalDays: 4 })).toBe(1);
  });

  it('never returns zero for a real dose, so the projection does not vanish', () => {
    // Integer division would give 0 here, which reads as "no schedule at all"
    // and silently removes the run-out badge from exactly the schedules whose
    // stock is hardest to eyeball.
    expect(scheduleDailyRate({ doseUnits: 1, timesPerDay: 1, intervalDays: 30 })).toBeGreaterThan(0);
  });

  it('treats a nonsensical interval as daily rather than dividing by zero', () => {
    expect(scheduleDailyRate({ doseUnits: 1, timesPerDay: 1, intervalDays: 0 })).toBe(1);
  });

  it('projects a weekly tablet as lasting weeks', () => {
    const rate = scheduleDailyRate({ doseUnits: 1, timesPerDay: 1, intervalDays: 7 });
    expect(projectRunOut(4, rate, TODAY)).toEqual({ daysRemaining: 28, runOutDate: '2026-08-23' });
  });
});

describe('projectRunOut', () => {
  it('is null with no consumption rate — nothing to project, not zero days', () => {
    expect(projectRunOut(100, 0, TODAY)).toBeNull();
  });

  it('reports zero days left when stock is already empty, rather than nothing', () => {
    expect(projectRunOut(0, 1, TODAY)).toEqual({ daysRemaining: 0, runOutDate: TODAY });
  });

  it('floors a partial day — a fraction of a dose does not count as another day', () => {
    // 32.5 ml at 5 ml/day: six full days, not six and a half.
    expect(projectRunOut(32.5, 5, TODAY)).toEqual({ daysRemaining: 6, runOutDate: '2026-08-01' });
  });

  it('projects an exact multiple correctly', () => {
    expect(projectRunOut(100, 1, TODAY)).toEqual({ daysRemaining: 100, runOutDate: '2026-11-03' });
  });

  it('never goes negative on a rounding edge', () => {
    expect(projectRunOut(0.4, 1, TODAY)).toEqual({ daysRemaining: 0, runOutDate: TODAY });
  });
});

describe('runOutSeverity', () => {
  it('is none without a projection — not tracked, not "fine"', () => {
    expect(runOutSeverity(null)).toBe('none');
  });

  it('is critical at and under the threshold, including already out', () => {
    expect(runOutSeverity({ daysRemaining: 0, runOutDate: TODAY })).toBe('critical');
    expect(runOutSeverity({ daysRemaining: 60, runOutDate: TODAY })).toBe('critical');
  });

  it('is warning between the two thresholds', () => {
    expect(runOutSeverity({ daysRemaining: 61, runOutDate: TODAY })).toBe('warning');
    expect(runOutSeverity({ daysRemaining: 180, runOutDate: TODAY })).toBe('warning');
  });

  it('is ok beyond the warning window', () => {
    expect(runOutSeverity({ daysRemaining: 181, runOutDate: TODAY })).toBe('ok');
  });

  it('honours custom thresholds', () => {
    const tight = { criticalDays: 7, warningDays: 14 };
    expect(runOutSeverity({ daysRemaining: 10, runOutDate: TODAY }, tight)).toBe('warning');
    expect(runOutSeverity({ daysRemaining: 5, runOutDate: TODAY }, tight)).toBe('critical');
  });
});
