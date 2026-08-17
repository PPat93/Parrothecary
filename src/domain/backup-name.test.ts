import { describe, expect, it } from 'vitest';
import { BACKUP_STAMP, backupStamp, readableStamp } from './backup-name';

describe('backup names', () => {
  it('is sortable, to the minute, and padded', () => {
    expect(backupStamp(new Date(2026, 7, 17, 22, 54, 31))).toBe('2026-08-17T2254');
    expect(backupStamp(new Date(2026, 0, 5, 9, 7, 0))).toBe('2026-01-05T0907');
  });

  it('names a backup taken after midnight with the day it is', () => {
    // Local time, not UTC. The script and the button both promise this, and it is
    // the one moment in the day when getting it wrong is visible.
    expect(backupStamp(new Date(2026, 7, 18, 0, 30, 0))).toBe('2026-08-18T0030');
  });

  it('writes what the pruning pattern recognises', () => {
    /*
     * The agreement that matters. The script deletes old backups by matching this
     * pattern and skips anything that does not match, so a stamp the pattern no
     * longer recognises would mean retention silently stopping while backups piled
     * up until the disk filled. The script asserts this too, at runtime; here it is
     * checked before anybody runs it.
     */
    for (const date of [
      new Date(2026, 0, 1, 0, 0, 0),
      new Date(2026, 11, 31, 23, 59, 59),
      new Date(2030, 5, 9, 9, 9, 9),
    ]) {
      expect(backupStamp(date)).toMatch(BACKUP_STAMP);
    }
  });

  it('does not recognise something that merely looks close', () => {
    for (const near of ['2026-08-17T225', '2026-08-17T22540', '2026-8-17T2254', 'uploads', '']) {
      expect(BACKUP_STAMP.test(near)).toBe(false);
    }
  });

  it('reads as a time of day when it needs to', () => {
    expect(readableStamp('2026-08-17T2254')).toBe('2026-08-17 22:54');
    expect(readableStamp(backupStamp(new Date(2026, 0, 5, 9, 7, 0)))).toBe('2026-01-05 09:07');
  });
});
