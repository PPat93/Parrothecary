import { describe, expect, it } from 'vitest';
import { projectRunOut, runOutSeverity, scheduleDailyRate } from './runout';

const TODAY = '2026-07-26';

describe('scheduleDailyRate', () => {
  it('multiplies dose by times per day', () => {
    expect(scheduleDailyRate({ doseUnits: 1, timesPerDay: 1 })).toBe(1);
    expect(scheduleDailyRate({ doseUnits: 0.5, timesPerDay: 2 })).toBe(1);
    expect(scheduleDailyRate({ doseUnits: 5, timesPerDay: 3 })).toBe(15);
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
