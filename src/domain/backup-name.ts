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
