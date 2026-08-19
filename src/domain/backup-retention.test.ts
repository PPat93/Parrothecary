import { describe, expect, it } from 'vitest';
import { chooseBackupsToKeep, describeRetention, DEFAULT_RETENTION } from './backup-name';

/** A backup taken at half past three on that date, the way the timer writes them. */
function stamp(year: number, month: number, day: number, hour = 3, minute = 30) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}${pad(minute)}`;
}

/**
 * Twice a week, on the nights the household asked for: Thursday into Friday, and
 * Sunday into Monday. Written out as real dates so the tests below are about
 * calendars rather than arithmetic.
 */
const NOW = new Date(2026, 7, 19, 20, 0); // Wednesday 19 August 2026, evening

describe('choosing which backups to keep', () => {
  it('keeps everything from the last fortnight', () => {
    const names = [
      stamp(2026, 8, 17), // Monday, two days ago
      stamp(2026, 8, 14), // Friday
      stamp(2026, 8, 10),
      stamp(2026, 8, 7),
      stamp(2026, 8, 6), // thirteen days ago, just inside
    ];

    const { keep, remove } = chooseBackupsToKeep(names, DEFAULT_RETENTION, NOW);

    expect(keep).toEqual([...names].sort().reverse());
    expect(remove).toEqual([]);
  });

  it('keeps one a month behind the fortnight, and drops the rest of that month', () => {
    const names = [
      stamp(2026, 8, 17), // recent
      stamp(2026, 8, 14), // recent
      stamp(2026, 7, 3), // July: the oldest of the month, kept
      stamp(2026, 7, 10),
      stamp(2026, 7, 24),
      stamp(2026, 6, 5), // June: the oldest of the month, kept
      stamp(2026, 6, 19),
    ];

    const { keep, remove } = chooseBackupsToKeep(names, DEFAULT_RETENTION, NOW);

    expect(keep).toContain(stamp(2026, 7, 3));
    expect(keep).toContain(stamp(2026, 6, 5));
    expect(remove).toEqual([stamp(2026, 6, 19), stamp(2026, 7, 10), stamp(2026, 7, 24)]);
  });

  it('lets go of months older than the policy asks for', () => {
    const names = [
      stamp(2026, 8, 17),
      stamp(2026, 7, 3),
      stamp(2026, 6, 5),
      stamp(2026, 5, 2), // three months back — beyond "two months before that"
      stamp(2025, 12, 25), // last Christmas
    ];

    const { keep, remove } = chooseBackupsToKeep(names, DEFAULT_RETENTION, NOW);

    expect(keep).toEqual([stamp(2026, 8, 17), stamp(2026, 7, 3), stamp(2026, 6, 5)]);
    expect(remove).toEqual([stamp(2025, 12, 25), stamp(2026, 5, 2)]);
  });

  it('holds the same copy as the month goes on, rather than moving it forward', () => {
    /*
     * The reason the oldest of a month is chosen rather than the newest. A fixed
     * point in the past is only useful if it stays fixed: run this in the middle
     * of the month and again at the end, and the same folder has to survive both.
     */
    const july = [stamp(2026, 7, 3), stamp(2026, 7, 10), stamp(2026, 7, 24)];
    const august = [stamp(2026, 8, 3), stamp(2026, 8, 17)];

    const midMonth = chooseBackupsToKeep([...july, stamp(2026, 8, 3)], DEFAULT_RETENTION, NOW);
    const later = chooseBackupsToKeep([...july, ...august], DEFAULT_RETENTION, NOW);

    expect(midMonth.keep).toContain(stamp(2026, 7, 3));
    expect(later.keep).toContain(stamp(2026, 7, 3));
  });

  it('never proposes deleting something that is not a backup', () => {
    const names = [
      stamp(2026, 8, 17),
      stamp(2026, 1, 1),
      'before-restore',
      'before-migrate',
      'notes.txt',
      'my old copy',
    ];

    const { keep, remove } = chooseBackupsToKeep(names, DEFAULT_RETENTION, NOW);

    for (const stranger of ['before-restore', 'before-migrate', 'notes.txt', 'my old copy']) {
      expect(remove).not.toContain(stranger);
      expect(keep).not.toContain(stranger);
    }
  });

  it('keeps nothing older than the fortnight when asked for no monthly copies', () => {
    const names = [stamp(2026, 8, 17), stamp(2026, 7, 3), stamp(2026, 6, 5)];

    const { keep, remove } = chooseBackupsToKeep(names, { days: 14, months: 0 }, NOW);

    expect(keep).toEqual([stamp(2026, 8, 17)]);
    expect(remove).toEqual([stamp(2026, 6, 5), stamp(2026, 7, 3)]);
  });

  it('copes with an empty folder', () => {
    expect(chooseBackupsToKeep([], DEFAULT_RETENTION, NOW)).toEqual({ keep: [], remove: [] });
  });

  it('what a fortnight of the household schedule actually leaves behind', () => {
    /*
     * The whole policy, on the real schedule: two a week, for a year. What should
     * survive is four recent backups and two older markers — six folders, about
     * four megabytes, rather than the fifty-odd a year would otherwise pile up.
     */
    const names: string[] = [];
    for (let day = new Date(2025, 7, 1); day < NOW; day.setDate(day.getDate() + 1)) {
      // Mondays and Fridays, which is the night after Sunday and the night after Thursday.
      if (day.getDay() === 1 || day.getDay() === 5) {
        names.push(stamp(day.getFullYear(), day.getMonth() + 1, day.getDate()));
      }
    }

    const { keep, remove } = chooseBackupsToKeep(names, DEFAULT_RETENTION, NOW);

    expect(names.length).toBeGreaterThan(100);
    expect(keep).toHaveLength(6);
    expect(remove).toHaveLength(names.length - 6);
  });
});

describe('describing the policy', () => {
  it('reads as a sentence', () => {
    expect(describeRetention(DEFAULT_RETENTION)).toBe(
      'everything from the last 14 days, plus one a month for 2 months before that',
    );
    expect(describeRetention({ days: 7, months: 1 })).toBe(
      'everything from the last 7 days, plus one a month for 1 month before that',
    );
    expect(describeRetention({ days: 30, months: 0 })).toBe('everything from the last 30 days');
  });
});
