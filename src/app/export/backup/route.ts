import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { NextResponse } from 'next/server';
import { backupStamp, readableStamp } from '@/domain/backup-name';
import { isPhotoFile } from '@/domain/photo-name';
import { CSV_BOM } from '@/lib/csv';
import { databasePath, uploadsPath } from '@/lib/data-paths';
import { isLoggedIn } from '@/lib/session';
import { isArchiveName, zipArchive, type ZipEntry } from '@/lib/zip';

/**
 * A backup, in your hand.
 *
 * `npm run db:backup` is the one that protects data, because the machine runs it
 * on a timer whether anybody remembers or not. This is the other half of the
 * problem: a backup on the same disk survives a bad deploy, not a dead one, and
 * getting a copy off the machine should not need a terminal. Press this before a
 * trip, or before typing in a season's stock, and the copy is on the phone.
 *
 * What it hands over is exactly what the script writes — the database and the
 * photographs, in one folder — so the restore procedure is the same for both,
 * and `restore.txt` inside says what that is. A zip because a phone can only be
 * handed one file, and because a backup ought to still make sense to somebody
 * who finds it on a memory stick in two years.
 *
 * A route handler for the reason the CSV exports are: this ends in a download,
 * and a server action cannot hand the browser a file. Auth is checked here
 * rather than trusted from the proxy, which only looks for a cookie and not a
 * valid one, and a miss is 404 rather than 401 so the endpoint does not confirm
 * it exists to somebody without a session.
 *
 * A static segment beside `[kind]`, which Next resolves in preference to it, so
 * this is reached at /export/backup and never through the CSV allow-list.
 */

/**
 * Above this, say no and point at the script.
 *
 * The archive is built in memory, which is the price of checking the copy before
 * promising it — a stream that fails halfway has already sent a `200`. Today a
 * backup is under a megabyte, so this is a hundredfold of headroom rather than a
 * limit anybody will meet; the machine this runs on is a container with a modest
 * memory limit, and the alternative to a cap is the app being killed.
 */
const MAX_BYTES = 64 * 1024 * 1024;

export async function GET() {
  if (!(await isLoggedIn())) {
    return new NextResponse('Not found', { status: 404 });
  }

  const stamp = backupStamp(new Date());
  const folder = `parrothecary-backup-${stamp}`;
  const dbPath = databasePath();

  if (!fs.existsSync(dbPath)) {
    return problem('There is no database to back up yet.');
  }

  /*
   * Every file in the uploads folder, not only the ones the app minted. A stray
   * a person put in there is copied faithfully, for the same reason the wipe
   * refuses to delete it: it is not this code's to decide about.
   */
  const uploads = uploadsPath();

  /*
   * A folder that cannot even be listed is a refusal, not a note. The notes are
   * for files this knows about and could not take; if the listing failed there is
   * no way to know what is missing, and a backup nobody can describe the gaps in
   * is the kind you find out about on the day you need it.
   */
  let files: string[];
  try {
    files = fs.existsSync(uploads) ? walk(uploads) : [];
  } catch (error) {
    console.error(`could not list ${uploads}`, error);
    return problem(
      'The photographs folder could not be read, so the backup would have been incomplete.',
    );
  }

  /*
   * Asked before the snapshot is taken, not after. The check used to come later,
   * which meant a database too big for this button was copied into the temporary
   * folder in full and then refused — doing the expensive half of the work for a
   * request that was always going to be turned down.
   *
   * The live file plus its write-ahead log, because the snapshot folds the two
   * together and can be as large as both.
   */
  const room =
    sizeOf(dbPath) +
    sizeOf(`${dbPath}-wal`) +
    files.reduce((sum, file) => sum + sizeOf(path.join(uploads, file)), 0);

  if (room > MAX_BYTES) {
    return problem(
      'The cupboard has grown past what this button can build in one go. ' +
        'Use npm run db:backup on the machine instead — it writes the same thing to disk.',
    );
  }

  /*
   * `VACUUM INTO` rather than reading the file, because the app is serving while
   * this runs: it writes one consistent snapshot with the write-ahead log folded
   * in, so the copy needs no `-wal` or `-shm` beside it to be complete. Reading
   * the three files mid-write would not give that. Read-only on the live data.
   *
   * The snapshot has to be a real file — that is what `VACUUM INTO` writes to —
   * and it goes in the system temporary folder rather than beside the database,
   * where a half-written stray would sit in the folder that gets backed up.
   */
  const snapshot = path.join(os.tmpdir(), `parrothecary-${randomUUID()}.db`);
  const open: Database.Database[] = [];

  try {
    const source = new Database(dbPath, { readonly: true });
    open.push(source);
    source.prepare('vacuum into ?').run(snapshot);

    const copy = new Database(snapshot, { readonly: true });
    open.push(copy);

    /*
     * Checked against the copy, not the original: whether the original is sound
     * is a different question, and not the one being answered by handing
     * somebody a file and calling it a backup.
     */
    const integrity = copy.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      return problem('The copy came out unreadable, so it was not worth giving you.');
    }

    const hasSchema = count(copy, `select count(*) n from sqlite_master
                                   where type = 'table' and name = 'batches'`);
    if (hasSchema === 0) {
      return problem('That database has no tables yet, so there is nothing to back up.');
    }

    const boxes = count(copy, 'select count(*) n from batches');
    const movements = count(copy, 'select count(*) n from stock_movements');
    const sourceBoxes = count(source, 'select count(*) n from batches');
    const sourceMovements = count(source, 'select count(*) n from stock_movements');

    if (boxes !== sourceBoxes || movements !== sourceMovements) {
      return problem('The copy came out short of the original, so it was not worth giving you.');
    }

    const entries: ZipEntry[] = [
      { name: `${folder}/${path.basename(dbPath)}`, bytes: fs.readFileSync(snapshot) },
    ];

    /*
     * One awkward file does not cost the whole backup.
     *
     * Two ways that happens, and both used to end as a `503` with nothing
     * downloaded. A photograph deleted between the listing and the read — the
     * app was serving all along — and a name a zip cannot carry, which on Linux
     * is any name with a colon in it and is therefore something a person can
     * leave in that folder. The database is the part worth protecting, so the
     * odd file is left out and named in `restore.txt` instead. Same judgement
     * the backup script came to: a faithful copy of something that needs
     * attention is still worth having.
     */
    const left: string[] = [];
    let photos = 0;

    for (const file of files) {
      const name = `${folder}/uploads/${file}`;
      if (!isArchiveName(name)) {
        left.push(`${file} - a zip cannot hold a name like that`);
        continue;
      }
      try {
        entries.push({ name, bytes: fs.readFileSync(path.join(uploads, file)) });
        if (isPhotoFile(path.posix.basename(file))) photos++;
      } catch {
        left.push(`${file} - could not be read while this was being built`);
      }
    }

    entries.push({
      name: `${folder}/restore.txt`,
      bytes: Buffer.from(
        restoreNotes({
          stamp,
          database: path.basename(dbPath),
          boxes,
          movements,
          photos,
          left,
        }),
        'utf8',
      ),
    });

    const archive = zipArchive(entries);

    return new NextResponse(new Uint8Array(archive), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${folder}.zip"`,
        // Known, so the phone can show how far along the download is rather than
        // a spinner that could mean anything.
        'Content-Length': String(archive.length),
        // A stale backup is a dangerous thing to hand somebody.
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    /*
     * Logged in full, answered in one sentence. The likely causes are a disk
     * with no room for the snapshot and a temporary folder this user may not
     * write in, and neither is worth putting in front of somebody standing at a
     * cupboard — but both are worth having in the log.
     */
    console.error('backup download failed', error);
    return problem('The backup could not be built. The server log says why.');
  } finally {
    /*
     * Closed before the snapshot is deleted, in that order. Windows will not
     * remove a file it still has open, and a leftover copy of the whole
     * database in a temporary folder is precisely the thing this feature exists
     * to keep track of. The backup script learned this the same way.
     */
    for (const db of open) {
      try {
        db.close();
      } catch {
        // Already closed, or never opened cleanly. The real failure, if there
        // was one, has been reported above.
      }
    }
    try {
      fs.rmSync(snapshot, { force: true });
    } catch (error) {
      console.error(`could not remove the temporary snapshot ${snapshot}`, error);
    }
  }
}

/**
 * Plain text and a `503`, not a JSON error.
 *
 * Whoever pressed this is looking at a browser's download shelf, so the body is
 * the whole message. `503` rather than `500` because every one of these is "not
 * right now" — the database is mid-migration, the disk is full — and none of
 * them mean the button is broken.
 */
function problem(message: string) {
  return new NextResponse(`${message}\n`, {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function count(db: Database.Database, sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

/** Bytes on disk, or nothing if the file is not there — a `-wal` often is not. */
function sizeOf(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

/**
 * Every file under a folder, as forward-slashed paths relative to it.
 *
 * `uploads/` has no subfolders today. It is walked anyway so that the download
 * and the folder the script copies cannot come to hold different things, which
 * is the only difference that would matter and the one nobody would notice.
 *
 * Anything that is not a directory counts as a file, rather than only what
 * `isFile()` admits to. A symlinked photograph is not a file by that test, and
 * the first version dropped one from the backup without saying so — whereas
 * trying to read it and failing puts it in the note, and reading it as intended
 * puts the picture in the backup. Nothing here is silently left behind.
 */
function walk(root: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(root, relative));
    else found.push(relative);
  }
  return found;
}

/**
 * What this is and how to put it back, in the archive itself.
 *
 * Because the restore happens on the worst day, and possibly years from now,
 * from a file somebody found rather than a README they remembered. The counts
 * are in it so a restore can be told apart from an empty file before it is
 * trusted.
 */
function restoreNotes(about: {
  stamp: string;
  database: string;
  boxes: number;
  movements: number;
  photos: number;
  left: string[];
}): string {
  /*
   * Said in the archive rather than only in a server log, because whoever reads
   * this is the person who has to decide whether the backup is good enough. A
   * file missing from a backup that says so is a known gap; one missing from a
   * backup that claims to be complete is a nasty surprise on a bad day.
   */
  const count = about.left.length;
  const left =
    count === 0
      ? ''
      : `Left out of this backup, ${count} ${count === 1 ? 'file' : 'files'}:\n` +
        about.left.map((line) => `  ${line}\n`).join('') +
        `\nEverything else is here. The database above is complete either way.\n\n`;

  // A good folder name is a poor sentence; the domain knows how to say it.
  const when = readableStamp(about.stamp);

  const notes =
    `Parrothecary backup, taken ${when} local time.\n` +
    `\n` +
    `  ${about.database}\n` +
    `      the whole cupboard: products, boxes, doses, trips, and the ledger.\n` +
    `      ${about.boxes} boxes, ${about.movements} stock movements.\n` +
    `  uploads/\n` +
    `      the box photographs, ${about.photos} of them, named from the database.\n` +
    `\n` +
    `Both halves, or it is not a backup: a database restored on its own comes\n` +
    `back with every picture missing.\n` +
    `\n` +
    left +
    `To restore, on the machine that runs the app:\n` +
    `\n` +
    `  1. stop the app\n` +
    `  2. copy ${about.database} and uploads/ into its data folder, over what is there\n` +
    `  3. start the app, log in, and open a photograph of a box\n` +
    `\n` +
    `Step 3 is the test. Anything can restore a database; opening a picture is\n` +
    `what proves the other half came back with it.\n` +
    `\n` +
    `Not in here: the login. The password hash lives in .env.local on that\n` +
    `machine, and is deliberately left out of a file that travels. If it is\n` +
    `lost, "npm run auth:hash" sets a new password.\n`;

  /*
   * A byte-order mark and CRLF line endings, which is not this project's usual
   * taste in either, and is `src/lib/csv.ts`'s reasoning applied to a text file.
   *
   * This is the one thing the app writes that will be read outside the app,
   * years later, by whatever program is to hand. The first draft had neither, and
   * an em dash in it came out as three wrong characters — in the middle of the
   * sentence explaining what was missing from the backup, which is the worst
   * place in the file to be unreadable. The prose here is ASCII as well, since a
   * stray file's name is not, and cannot be made so.
   */
  return CSV_BOM + notes.replaceAll('\n', '\r\n');
}
