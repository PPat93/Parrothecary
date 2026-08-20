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

  it('picks the most recent months in autumn, when month numbers change width', () => {
    /*
     * The bug this is here for. Months are grouped by a key built from the year
     * and the month number, and those keys are sorted as text to find the most
     * recent ones. Unpadded, `2026-10` (November) sorts before `2026-8`
     * (September) — so the rule kept September and deleted both November backups,
     * which is the opposite of what it exists to do. Every earlier test happened
     * to use months whose numbers were the same width.
     */
    const december = new Date(2026, 11, 20, 20, 0);
    const names = [
      stamp(2026, 12, 15), // inside the fortnight
      stamp(2026, 11, 5),
      stamp(2026, 11, 20),
      stamp(2026, 10, 4),
      stamp(2026, 10, 18),
      stamp(2026, 9, 6),
      stamp(2026, 9, 21),
    ];

    const { keep } = chooseBackupsToKeep(names, DEFAULT_RETENTION, december);

    expect(keep).toEqual([stamp(2026, 12, 15), stamp(2026, 11, 5), stamp(2026, 10, 4)]);
  });

  it('keeps the right months across a year boundary', () => {
    const january = new Date(2027, 0, 20, 20, 0);
    const names = [
      stamp(2027, 1, 15), // recent
      stamp(2026, 12, 3),
      stamp(2026, 12, 28),
      stamp(2026, 11, 2),
      stamp(2026, 10, 1),
    ];

    const { keep } = chooseBackupsToKeep(names, DEFAULT_RETENTION, january);

    expect(keep).toEqual([stamp(2027, 1, 15), stamp(2026, 12, 3), stamp(2026, 11, 2)]);
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

describe('the promise the folder relies on', () => {
  /*
   * Whatever the policy and whatever is in the folder, every backup must come
   * back exactly once — kept or removed, never both, never neither. A backup that
   * fell out of both lists would simply never be tidied; one in both would be
   * deleted while being counted as kept.
   *
   * Random inputs, with a fixed seed so a failure is reproducible rather than a
   * story about a test that went red once on somebody's laptop.
   */
  it('accounts for every backup, whatever the policy', () => {
    let seed = 12345;
    const random = (limit: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return Math.floor((seed / 2147483648) * limit);
    };
    const pad = (value: number) => String(value).padStart(2, '0');

    for (let round = 0; round < 500; round++) {
      const names = new Set<string>();
      for (let index = 0; index < 1 + random(40); index++) {
        names.add(
          `${2025 + random(3)}-${pad(1 + random(12))}-${pad(1 + random(28))}` +
            `T${pad(random(24))}${pad(random(60))}`,
        );
      }

      const list = [...names];
      const now = new Date(2026, random(12), 1 + random(28));
      const policy = { days: 1 + random(40), months: random(4) };

      const { keep, remove } = chooseBackupsToKeep(list, policy, now);

      expect(new Set([...keep, ...remove]).size, `round ${round}`).toBe(list.length);
      expect(keep.filter((name) => remove.includes(name)), `round ${round}`).toEqual([]);
    }
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
