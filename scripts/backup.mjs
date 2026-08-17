/**
 * Take a backup of the cupboard.
 *
 *   npm run db:backup
 *   npm run db:backup -- --keep=7
 *
 * A backup is the folder, not the file. `VACUUM INTO` copies the database and
 * nothing else, while the box photographs sit beside it in `uploads/` as
 * ordinary files — so a database restored on its own comes back with every
 * picture missing. That is not hypothetical: a broken thumbnail found during
 * the bug hunt was exactly that shape. Both halves go, or it is not a backup.
 *
 * `VACUUM INTO` rather than a file copy, because the app keeps serving while
 * this runs: it writes one consistent snapshot and folds the write-ahead log
 * into it, so the copy needs no `-wal` or `-shm` alongside to be complete.
 * Copying the three files by hand mid-write would not give that.
 *
 * Read-only on the live data.
 *
 * The exit code answers one question: is there a usable backup? Zero means yes,
 * including when the cupboard itself has faults — those are printed as notes,
 * because a faithful copy of something that needs attention is still worth
 * having. Non-zero means no backup was written and the folder it would have gone
 * in has been removed. A timer can act on that without reading the output,
 * though the notes are worth reading when it does not.
 *
 * What it deliberately leaves out: `.env.local`. The password hash lives there,
 * and a backup folder is a thing that ends up on memory sticks. Losing it costs
 * one `npm run auth:hash`, which is cheaper than copying a secret everywhere.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_STAMP, backupStamp } from '../src/domain/backup-name.ts';
import { isPhotoFile, photoFileNames } from '../src/domain/photo-name.ts';
import { databasePath, uploadsPath as resolveUploads } from '../src/lib/data-paths.ts';
import { inspectLedger } from './lib/inspect-ledger.mjs';

const dbPath = databasePath();
// Asked rather than worked out, so this and the app cannot drift about where the
// pictures live — a backup that copies the wrong folder still reports success.
const uploadsPath = resolveUploads();
const backupRoot = path.resolve(process.env.BACKUP_DIR ?? './backups');

/*
 * Arguments are checked rather than filtered for the one that is recognised.
 * `--keep 5`, written the way most commands take it, matched nothing and left
 * the default of thirty in place without a word — so somebody who had asked for
 * retention would believe they had it. An unrecognised argument is now a
 * refusal, because the alternative is doing something other than what was
 * asked and saying nothing.
 */
let keep = 30;
for (const arg of process.argv.slice(2)) {
  if (arg === '--') continue; // npm passes this through ahead of script args
  if (arg.startsWith('--keep=')) {
    keep = Number(arg.slice('--keep='.length));
    continue;
  }
  console.error(`Unrecognised argument "${arg}".`);
  console.error('The only option is --keep=N, written with an equals sign:');
  console.error('  npm run db:backup -- --keep=7');
  process.exit(1);
}

if (!Number.isInteger(keep) || keep < 1) {
  console.error(`--keep must be a whole number of backups to retain, got "${keep}".`);
  process.exit(1);
}

if (!fs.existsSync(dbPath)) {
  console.error(`No database at ${dbPath} — nothing to back up.`);
  process.exit(1);
}

function directorySize(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? directorySize(full) : fs.statSync(full).size;
  }
  return total;
}

/*
 * The name, and the pattern pruning recognises it by, both come from
 * src/domain/backup-name.ts — the download button names its file from the same
 * stamp, and "the same as the other one" is not a promise a comment can keep.
 *
 * Still asserted here. The two are a builder and a pattern rather than one
 * definition, and if they ever disagreed, retention would quietly stop working
 * while backups piled up until the disk filled.
 */
const folderName = backupStamp(new Date());
if (!BACKUP_STAMP.test(folderName)) {
  console.error(`"${folderName}" does not match the name pruning looks for. Fix backup-name.ts.`);
  process.exit(1);
}

const target = path.join(backupRoot, folderName);

/*
 * Creating the folder is how this run claims the minute, and the claim has to be
 * the same act as the check.
 *
 * Asking `existsSync` first and creating afterwards left a gap between the two.
 * Two runs starting together — the timer and somebody trying it by hand, which
 * is exactly what deployment day looks like — could both find nothing there and
 * both carry on. The second would then fail to write its copy over the first's,
 * and `abandon` would delete the folder: the losing run destroying the winning
 * run's finished backup, which is the one outcome this whole script exists to
 * prevent. A plain `mkdir` cannot be raced — one of them gets EEXIST.
 *
 * And EEXIST is not a failure. A timer catching up on a missed run fires twice
 * in a minute, and reporting that as broken would page somebody about a cupboard
 * that is, in fact, backed up. It exits 0 the way `db:reset` does when there is
 * nothing to delete — after tidying, since a smaller `--keep` than last time is
 * still worth honouring.
 */
try {
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.mkdirSync(target); // deliberately not recursive: EEXIST is the signal
} catch (error) {
  if (error.code === 'EEXIST') {
    console.log(`${target} already exists — a backup was taken this minute.`);
    prune();
    process.exit(0);
  }
  // The likely one on a fresh machine: the service user cannot write where
  // BACKUP_DIR points. A stack trace is a poor way to say so.
  console.error(`Could not create ${target}: ${error.message}`);
  console.error('Check BACKUP_DIR and that this user may write there.');
  process.exit(1);
}

console.log(`Backing up ${dbPath}`);

/**
 * Anything that goes wrong from here leaves a half-written folder, and a
 * half-written backup sitting in the directory looking like a good one is
 * worse than no backup at all — it is the one you would reach for.
 *
 * The open connections are closed first. Windows will not delete a file it
 * still has open, so skipping that turned a clear "this photograph is missing"
 * into an EPERM stack trace with the bad folder left sitting there — the exact
 * outcome this function exists to prevent, on the machine it was written on.
 */
const open = [];

function abandon(reason) {
  for (const db of open) {
    try {
      db.close();
    } catch {
      // Already closed, or never opened cleanly. Not worth reporting over the
      // real failure below.
    }
  }

  console.error(`\n  ${reason}`);
  try {
    fs.rmSync(target, { recursive: true, force: true });
    console.error('  Backup abandoned and the folder removed — nothing was left half-written.');
  } catch (error) {
    console.error(`  Backup abandoned, but ${target} could not be removed: ${error.message}`);
    console.error('  Delete it by hand — it is incomplete and must not be restored from.');
  }
  process.exit(1);
}

const source = new Database(dbPath, { readonly: true });
open.push(source);
const copyPath = path.join(target, path.basename(dbPath));

try {
  source.prepare('vacuum into ?').run(copyPath);
} catch (error) {
  abandon(`Could not copy the database: ${error.message}`);
}

let photosCopied = 0;
if (fs.existsSync(uploadsPath)) {
  try {
    fs.cpSync(uploadsPath, path.join(target, 'uploads'), { recursive: true });
    // Counted, not just listed: anything else a person left in that folder is
    // copied faithfully but is not a photograph, and calling a stray note one
    // made the summary quietly wrong.
    photosCopied = fs.readdirSync(path.join(target, 'uploads')).filter(isPhotoFile).length;
  } catch (error) {
    abandon(`Could not copy the photographs: ${error.message}`);
  }
}
// A cabinet with no photographs yet is normal, not a failure.

/*
 * Everything below reads the copy rather than the original. Checking the
 * source would prove nothing about what was just written, which is the only
 * thing in question.
 *
 * All of it inside one try, because anything that throws here has to go through
 * `abandon` rather than out of the process. It did not, and the case that
 * proved it is the one this script will meet on deployment day: a database with
 * no schema yet threw `no such table: batches` as a raw stack trace and left
 * the half-written folder sitting there — precisely the outcome the checks
 * exist to prevent.
 */
const copy = new Database(copyPath, { readonly: true });
open.push(copy);

let copyCounts;
/** Pictures the database names that are not on disk. Reported, not fatal — see below. */
const missingPhotos = [];
try {
  const integrity = copy.pragma('integrity_check', { simple: true });
  if (integrity !== 'ok') {
    throw new Error(`The copied database fails SQLite's own integrity check: ${integrity}`);
  }

  /*
   * A database with no tables is a real thing to be handed — a fresh clone
   * before `npm run db:migrate`, or an empty file at DATABASE_PATH — and it
   * deserves the answer rather than a stack trace.
   */
  const hasSchema = copy
    .prepare(`select count(*) n from sqlite_master where type = 'table' and name = 'batches'`)
    .get().n;
  if (!hasSchema) {
    throw new Error(
      'That database has no schema yet, so there is nothing to back up. ' +
        'Run npm run db:migrate first.',
    );
  }

  const sourceCounts = inspectLedger(source);
  copyCounts = inspectLedger(copy);

  if (copyCounts.boxes !== sourceCounts.boxes || copyCounts.movements !== sourceCounts.movements) {
    throw new Error(
      `The copy holds ${copyCounts.boxes} boxes and ${copyCounts.movements} movements, ` +
        `but the original has ${sourceCounts.boxes} and ${sourceCounts.movements}.`,
    );
  }

  /*
   * Every photograph the copy refers to ought to be in the copy's own uploads
   * folder. This is the check that would have caught the dangling thumbnail,
   * and it is the whole reason this script copies a folder rather than a file.
   *
   * Reported, not fatal — which is a correction. It used to throw, and that put
   * the two kinds of problem the wrong way round: a database that refers to a
   * picture nobody can find is a fault in the cupboard, and refusing to back the
   * cupboard up because of it means one missing thumbnail costs every backup
   * from then until somebody notices. Ledger faults are already reported this
   * way rather than thrown — a faithful copy of something that needs attention
   * is still worth having.
   *
   * It also closes a race nobody would ever have diagnosed at three in the
   * morning. The database snapshot and the folder of pictures are taken moments
   * apart, so replacing a product photo in that window leaves the snapshot
   * naming a file the copy did not get. Nothing is wrong with either, and the
   * old behaviour would have thrown that night's backup away for it.
   */
  const referenced = copy
    .prepare(`select photo_path from products where photo_path is not null`)
    .all()
    .map((row) => row.photo_path);

  for (const name of referenced) {
    for (const file of photoFileNames(name)) {
      if (!fs.existsSync(path.join(target, 'uploads', file))) missingPhotos.push(file);
    }
  }
} catch (error) {
  abandon(error.message);
}

/*
 * Problems in the cupboard rather than in the copy. Neither is a reason to
 * throw the backup away — it is a faithful copy of something that needs
 * attention — but both are said out loud, because the one thing that must not
 * happen is a fault becoming invisible by being quietly backed up every night.
 */
const notes = [];
if (copyCounts.problems.length > 0) {
  notes.push(
    `${copyCounts.problems.length} box(es) in this backup do not add up. ` +
      `The copy is fine; the cupboard needs a look. Run npm run db:check-ledger.`,
  );
}
if (missingPhotos.length > 0) {
  notes.push(
    `${missingPhotos.length} photograph file(s) the database refers to are not on disk: ` +
      `${missingPhotos.slice(0, 3).join(', ')}${missingPhotos.length > 3 ? ' …' : ''}. ` +
      `They were missing before this ran — the backup holds everything that exists.`,
  );
}

// Nothing below reads either database, and leaving them open would hold files
// the pruning is about to delete.
source.close();
copy.close();

const size = directorySize(target);
console.log(`  ${path.relative(process.cwd(), target)}`);
console.log(
  `  ${copyCounts.boxes} boxes, ${copyCounts.movements} movements, ` +
    `${photosCopied} photo file${photosCopied === 1 ? '' : 's'}, ${(size / 1024 / 1024).toFixed(1)} MB`,
);
// Only claims what was actually checked. Saying "every photograph is here"
// with a list of missing ones underneath is how a summary stops being read.
console.log(
  missingPhotos.length === 0
    ? '  verified: readable, complete, and every photograph it refers to is here.'
    : '  verified: readable and complete — but see the note below.',
);
for (const note of notes) console.log(`\n  Note: ${note}`);

/**
 * Delete all but the newest `keep` backups.
 *
 * A function because two paths need it: the ordinary one, and the "a backup
 * already exists for this minute" exit, which used to say "nothing to do" and
 * leave. That was not quite true — somebody running this with a smaller
 * `--keep` than last time had asked for tidying, and got a message saying there
 * was none to do while the old folders sat there.
 *
 * Called only after a good backup exists, never before: deleting the old ones
 * first would mean a failure halfway through leaving fewer backups than it
 * started with, which is the opposite of the job.
 *
 * Tidying up cannot fail the run either. The backup is written and verified by
 * this point, and an old folder that refuses to delete — open in a file
 * manager, or on a mount that has gone away — is housekeeping, not a lost
 * backup. Exiting non-zero here would report a good backup as a failure, and
 * with `Persistent=true` invite the timer to try the whole thing again.
 */
function prune() {
  const existing = fs
    .readdirSync(backupRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BACKUP_STAMP.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  let pruned = 0;
  const unpruned = [];
  for (const name of existing.slice(0, Math.max(0, existing.length - keep))) {
    try {
      fs.rmSync(path.join(backupRoot, name), { recursive: true, force: true });
      pruned++;
    } catch (error) {
      unpruned.push(`${name} (${error.message})`);
    }
  }

  if (pruned > 0) {
    console.log(`  pruned ${pruned} older backup${pruned === 1 ? '' : 's'}, keeping ${keep}.`);
  }
  if (unpruned.length > 0) {
    console.log(`  could not prune ${unpruned.length}: ${unpruned.join(', ')}`);
    console.log('  the backup itself is fine — these are just old folders taking up room.');
  }
}

prune();

process.exit(0);
