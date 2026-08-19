/**
 * What a backup is called.
 *
 * Two things name a backup: the script, which creates `backups/<stamp>/`, and the
 * download button, which hands over `parrothecary-backup-<stamp>.zip`. They are
 * meant to read alike and sort together, so a folder taken by the timer and a
 * file taken by hand can be lined up in one listing.
 *
 * Here rather than in either, because "the same stamp as the other one" is a
 * promise a comment cannot keep. Every other rule in this project that lived in
 * two places has already drifted once — the pack size, the photo filenames, the
 * shape of this very folder name against the pattern that prunes it.
 *
 * Pure, and importable by the scripts, which is why it sits beside
 * `photo-name.ts` rather than in `src/lib`.
 */

/**
 * The shape of a stamp, for anything that has to recognise one rather than write
 * it — the script prunes old backups by matching this, and deletes nothing that
 * does not, because a folder somebody else put there is not its to remove.
 */
export const BACKUP_STAMP = /^\d{4}-\d{2}-\d{2}T\d{4}$/;

/**
 * Sortable, and to the minute.
 *
 * Local time, not UTC: a backup taken at half past midnight belongs to tonight,
 * the same rule the CSV timestamps and the audit dates follow. Minutes are enough
 * — two backups inside one minute are the same backup for every purpose here, and
 * the script relies on that to notice a timer catching up on a missed run.
 */
export function backupStamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

/**
 * The stamp as a sentence: `2026-08-17 22:54`.
 *
 * A good filename is a poor thing to read in the note inside a backup, which is
 * the one file here somebody opens years later wondering what they have got.
 */
export function readableStamp(stamp: string): string {
  return `${stamp.slice(0, 10)} ${stamp.slice(11, 13)}:${stamp.slice(13)}`;
}

/**
 * The moment a stamp names, or nothing if it is not a stamp at all.
 *
 * Built by hand rather than handed to `new Date(...)`, which reads a bare date as
 * UTC and would shift every backup by the difference — enough, in a household an
 * hour or two off UTC, to sort a late-evening backup into the wrong day and prune
 * the wrong one.
 */
export function stampTaken(stamp: string): Date | null {
  if (!BACKUP_STAMP.test(stamp)) return null;

  return new Date(
    Number(stamp.slice(0, 4)),
    Number(stamp.slice(5, 7)) - 1,
    Number(stamp.slice(8, 10)),
    Number(stamp.slice(11, 13)),
    Number(stamp.slice(13, 15)),
  );
}

/**
 * Which backups to keep, and which to let go.
 *
 * Counting is the obvious rule and the wrong one. "Keep the newest thirty" means
 * something different every time the schedule changes — thirty nightly backups is
 * a month, thirty twice-weekly is nearly four. What a person actually wants is
 * stated in time: everything from the last fortnight, and one older copy far
 * enough back to survive a mistake nobody noticed for weeks.
 *
 * So there are two rules:
 *
 *   - keep every backup from the last `days`
 *   - beyond that, keep one per calendar month, for the last `months` of them
 *
 * The second is the one that matters on a bad day. Every recent backup is a
 * faithful copy of a cupboard that may already have been wrong — a box binned by
 * accident three weeks ago is in all of them. The older copy is the only thing
 * that can be compared against.
 *
 * Pure: names in, verdict out. No filesystem, no clock of its own.
 */
export type RetentionPolicy = {
  /** Keep everything at least this recent. */
  days: number;
  /** Beyond that, keep one backup per calendar month, for this many months. */
  months: number;
};

export const DEFAULT_RETENTION: RetentionPolicy = { days: 14, months: 2 };

export type RetentionVerdict = {
  /** Folder names to keep, newest first. */
  keep: string[];
  /** Folder names safe to delete, oldest first. */
  remove: string[];
};

export function chooseBackupsToKeep(
  names: string[],
  policy: RetentionPolicy,
  now: Date,
): RetentionVerdict {
  /*
   * Anything that is not a backup name is not this code's business. A folder
   * somebody else put in there — notes, a stray unpacked copy, the
   * `before-restore` folder the restore writes — is never proposed for deletion,
   * which is why it does not even appear in the verdict.
   */
  const backups = names
    .filter((name) => BACKUP_STAMP.test(name))
    .sort()
    .reverse();

  const recent = new Date(now.getTime() - policy.days * 24 * 60 * 60 * 1000);

  const keep: string[] = [];
  const remove: string[] = [];

  /*
   * One per month is chosen as the *oldest* in that month, not the newest.
   *
   * Both keep one, and only this one is stable: the oldest backup in a month is
   * decided the moment that month's first backup is taken and never changes
   * again. Keeping the newest would mean the chosen copy moving forward every few
   * days, deleting last week's choice each time — so the thing meant to be a
   * fixed point in the past would quietly be a moving one.
   */
  const monthlyKept = new Set<string>();

  /*
   * Padded, and that matters more than it looks. The month is a number from 0 to
   * 11, and these keys are sorted as text to find the most recent months — so
   * without the padding, `2026-10` (November) sorts before `2026-8` (September),
   * and the rule keeps the older month while deleting the newer one. Found by
   * asking it about an autumn: it threw away both November backups and kept
   * September.
   */
  const monthKey = (taken: Date) =>
    `${taken.getFullYear()}-${String(taken.getMonth()).padStart(2, '0')}`;

  // Oldest first for this pass, so the first backup seen in a month is the one kept.
  for (const name of [...backups].reverse()) {
    const taken = stampTaken(name);
    if (taken === null) continue;

    if (taken >= recent) continue; // inside the recent window, handled below

    if (!monthlyKept.has(monthKey(taken))) monthlyKept.add(monthKey(taken));
  }

  /*
   * Only the most recent `months` of those are kept. Older ones go — the point is
   * a fixed point or two behind the fortnight, not an archive that grows forever.
   */
  const monthsToKeep = new Set([...monthlyKept].sort().reverse().slice(0, policy.months));

  const chosenForMonth = new Set<string>();
  for (const name of [...backups].reverse()) {
    const taken = stampTaken(name);
    if (taken === null || taken >= recent) continue;

    const month = monthKey(taken);
    if (monthsToKeep.has(month) && !chosenForMonth.has(month)) {
      chosenForMonth.add(month);
      keep.push(name);
    } else {
      remove.push(name);
    }
  }

  for (const name of backups) {
    const taken = stampTaken(name);
    if (taken !== null && taken >= recent) keep.push(name);
  }

  keep.sort().reverse();
  remove.sort();

  return { keep, remove };
}

/** How the policy reads in the summary the backup script prints. */
export function describeRetention(policy: RetentionPolicy): string {
  const fortnight = `everything from the last ${policy.days} days`;
  if (policy.months === 0) return fortnight;

  return (
    `${fortnight}, plus one a month for ${policy.months} ` +
    `month${policy.months === 1 ? '' : 's'} before that`
  );
}
