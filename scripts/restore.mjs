/**
 * Put a backup back.
 *
 *   npm run db:restore -- backups/2026-08-17T2303
 *   npm run db:restore -- ~/Downloads/parrothecary-backup-2026-08-17T2303.zip
 *   npm run db:restore -- <path> --force    (no prompt)
 *
 * Takes either shape a backup comes in: the folder the timer writes, or the zip
 * the download button hands to a phone.
 *
 * This exists because the manual version had a step that fails silently. Copying
 * the database over `data/` while `parrothecary.db-wal` and `-shm` are still
 * sitting there does not restore anything: SQLite replays that log on top of the
 * file just put in place, the app comes back showing the cupboard exactly as it
 * was before, and `integrity_check` reports `ok` throughout. Proved with two
 * throwaway databases rather than argued about. A written instruction is a weak
 * defence against a step whose omission looks like success, so it is done here.
 *
 * Order of work, and all of it is deliberate:
 *
 *   1. read and check the backup completely, before touching anything
 *   2. back up what is about to be overwritten, using the ordinary backup script
 *   3. clear the stale write-ahead log, then put both halves in place
 *   4. check what was written, and say what to do next
 *
 * Nothing is overwritten until step 1 has passed, so a damaged or half-downloaded
 * backup costs nothing but the reading of it. And step 2 means the one thing this
 * cannot do is lose the cupboard it replaces — a restore of the wrong backup is
 * itself undoable.
 *
 * The app must be stopped first. That cannot be checked reliably from here: with
 * WAL journalling an idle connection holds no lock worth finding, so a running
 * app would look exactly like a stopped one. Hence the confirmation, which says
 * so, and hence `--force` being a deliberate act rather than the default.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { BACKUP_STAMP } from '../src/domain/backup-name.ts';
import { isPhotoFile, photoFileNames } from '../src/domain/photo-name.ts';
import { backupsPath, databasePath, uploadsPath as resolveUploads } from '../src/lib/data-paths.ts';
import { readZip } from '../src/lib/zip.ts';

const dbPath = databasePath();
const uploadsPath = resolveUploads();

let source = null;
let force = false;
for (const arg of process.argv.slice(2)) {
  if (arg === '--') continue; // npm passes this through ahead of script args
  if (arg === '--force') {
    force = true;
    continue;
  }
  if (arg.startsWith('--')) {
    console.error(`Unrecognised option "${arg}". The only one is --force.`);
    process.exit(1);
  }
  if (source !== null) {
    console.error('Only one backup can be restored at a time.');
    process.exit(1);
  }
  source = arg;
}

if (source === null) {
  console.error('Which backup? Give the folder or the zip file:');
  console.error('  npm run db:restore -- backups/2026-08-17T2303');
  console.error('  npm run db:restore -- ~/Downloads/parrothecary-backup-2026-08-17T2303.zip');
  process.exit(1);
}

const sourcePath = path.resolve(source);
if (!fs.existsSync(sourcePath)) {
  console.error(`Nothing at ${sourcePath}.`);
  process.exit(1);
}

/*
 * Everything is read into memory before anything is written, which is what makes
 * a failed restore harmless. A backup is under a megabyte today, and the download
 * that produces the zip refuses above 64 MB, so the whole of one fits comfortably.
 */
console.log(`Reading ${sourcePath}`);

let files; // name inside the backup -> bytes
try {
  files = sourcePath.toLowerCase().endsWith('.zip') ? readArchive(sourcePath) : readFolder(sourcePath);
} catch (error) {
  console.error(`  ${error.message}`);
  process.exit(1);
}

/**
 * Both shapes arrive as one flat map, so everything below this line stops caring
 * which one it was handed.
 */
function readArchive(file) {
  const entries = readZip(fs.readFileSync(file));
  const found = new Map(entries.map((entry) => [entry.name, entry.bytes]));
  return stripTopFolder(found);
}

function readFolder(folder) {
  if (!fs.statSync(folder).isDirectory()) {
    throw new Error('That is a file rather than a folder, and does not end in .zip.');
  }

  const found = new Map();
  const walk = (prefix) => {
    for (const entry of fs.readdirSync(path.join(folder, prefix), { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(relative);
      else found.set(relative, fs.readFileSync(path.join(folder, relative)));
    }
  };
  walk('');
  return found;
}

/**
 * The zip holds one folder with everything inside it, so that unpacking it does
 * not scatter a database across somebody's downloads. The folder the timer writes
 * has no such wrapper. Both are handled by dropping a wrapper when every single
 * entry shares one.
 *
 * Repeatedly, because there can be more than one. Zipping the folder a backup was
 * saved into, rather than the backup itself, gives
 * `Downloads/parrothecary-backup-.../parrothecary.db` — and one strip left the
 * database a level down, where this said "no database in there" about an archive
 * that plainly had one. Peeling every wrapper costs nothing and turns a refusal
 * somebody would have to diagnose into a restore.
 */
function stripTopFolder(found) {
  for (;;) {
    const names = [...found.keys()];
    if (names.length === 0) return found;

    const tops = new Set(names.map((name) => name.split('/')[0]));
    if (tops.size !== 1 || names.some((name) => !name.includes('/'))) return found;

    const [top] = tops;
    found = new Map(names.map((name) => [name.slice(top.length + 1), found.get(name)]));
  }
}

/*
 * Which file in there is the database. Named after whatever this installation
 * calls its database first, since that is what a backup of it holds — and failing
 * that, the only `.db` in the backup, so a backup taken under a different
 * DATABASE_PATH can still be restored here. Two candidates is a refusal rather
 * than a guess.
 */
const wanted = path.basename(dbPath);
const databases = [...files.keys()].filter((name) => name.endsWith('.db') && !name.includes('/'));
const chosen = files.has(wanted) ? wanted : databases.length === 1 ? databases[0] : null;

if (chosen === null) {
  if (databases.length > 0) {
    console.error(`  More than one database in there: ${databases.join(', ')}. Not guessing.`);
    process.exit(1);
  }

  console.error(`  No database called ${wanted} in there.`);

  /*
   * Say what was found, rather than only what was wanted. "No database in there"
   * is the same sentence whether somebody pointed this at the wrong folder, at a
   * backup holding two of them, or at an archive whose contents are a level
   * deeper than expected — and it gives no help telling those apart.
   */
  const deeper = [...files.keys()].filter((name) => name.endsWith('.db'));
  if (deeper.length > 0) {
    console.error(`  There is one further in: ${deeper.join(', ')}. Point this at that folder.`);
  } else {
    const seen = [...files.keys()].slice(0, 5);
    console.error(
      seen.length === 0
        ? '  It is empty.'
        : `  What is in there: ${seen.join(', ')}${files.size > 5 ? ` and ${files.size - 5} more` : ''}.`,
    );
  }
  process.exit(1);
}

const photos = [...files.keys()].filter((name) => name.startsWith('uploads/'));

/*
 * The backup is checked as a database before it is allowed to replace one, in the
 * same terms the backup script and the download use: readable, has a schema, and
 * says how much is in it. Written to a temporary file beside the target because
 * SQLite reads files, not buffers, and because a file that cannot be written here
 * is worth finding out about now rather than halfway through the restore.
 */
const staged = `${dbPath}.restoring`;
let counts;

try {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(staged, files.get(chosen));
  counts = inspect(staged);
} catch (error) {
  fs.rmSync(staged, { force: true });
  /*
   * Named, because SQLite's own wording for a file that is not a database is
   * "file is not a database", which on its own tells somebody neither which file
   * nor that they are probably holding the wrong one.
   */
  console.error(`  ${chosen} in that backup cannot be read: ${error.message}`);
  process.exit(1);
}

function inspect(file) {
  const db = new Database(file, { readonly: true });
  try {
    const integrity = db.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`That backup is damaged: ${integrity}`);

    const hasSchema = db
      .prepare(`select count(*) n from sqlite_master where type = 'table' and name = 'batches'`)
      .get().n;
    if (!hasSchema) throw new Error('That backup holds a database with no tables in it.');

    return {
      boxes: db.prepare('select count(*) n from batches').get().n,
      movements: db.prepare('select count(*) n from stock_movements').get().n,
      referenced: db
        .prepare(`select photo_path from products where photo_path is not null`)
        .all()
        .map((row) => row.photo_path),
    };
  } finally {
    db.close();
  }
}

/*
 * Photographs the backup's own database refers to and does not contain. Worth
 * saying before the restore rather than after: it is the difference between "the
 * picture is missing because this backup never had it" and an hour spent
 * wondering what went wrong with the restore.
 */
const missing = [];
for (const name of counts.referenced) {
  for (const file of photoFileNames(name)) {
    if (!files.has(`uploads/${file}`)) missing.push(file);
  }
}

const current = fs.existsSync(dbPath) ? summarise(dbPath) : null;

function summarise(file) {
  try {
    const db = new Database(file, { readonly: true });
    try {
      const hasSchema = db
        .prepare(`select count(*) n from sqlite_master where type = 'table' and name = 'batches'`)
        .get().n;
      if (!hasSchema) return null;
      return {
        boxes: db.prepare('select count(*) n from batches').get().n,
        movements: db.prepare('select count(*) n from stock_movements').get().n,
      };
    } finally {
      db.close();
    }
  } catch {
    // An unreadable database is exactly what somebody would be restoring over.
    return null;
  }
}

console.log(`  ${chosen}: ${counts.boxes} boxes, ${counts.movements} stock movements`);
/*
 * A photograph is a `<uuid>.webp` at the top of `uploads/`, which is the only
 * thing this app ever writes there. Anything in a subfolder is a person's own
 * file: restored faithfully like every other stray, and not counted as a
 * photograph. The backup script and the wipe draw the line in the same place, and
 * this used to draw it somewhere else - so the same folder was described as
 * holding nine photographs by one command and eight by another.
 */
const photographs = photos.filter((name) => {
  const inside = name.slice('uploads/'.length);
  return !inside.includes('/') && isPhotoFile(inside);
});

console.log(`  uploads: ${photographs.length} photograph files, ${photos.length} files in all`);
if (missing.length > 0) {
  console.log(
    `  note: the backup refers to ${missing.length} photograph file(s) it does not contain: ` +
      `${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' …' : ''}`,
  );
}

console.log(`\nThis will replace ${dbPath}`);
console.log(
  current === null
    ? '  there is no readable cupboard there now'
    : `  which currently holds ${current.boxes} boxes and ${current.movements} stock movements`,
);
/*
 * "and everything in uploads" is what this used to say, and it was not true: the
 * photographs are written over the ones with the same name and nothing else is
 * touched. Overstating what a destructive command is about to destroy trains
 * somebody to stop reading the warning.
 */
console.log(`  and put ${photos.length} file(s) into ${uploadsPath}, over any of the same name`);

if (!force) {
  console.log('\nThe app must be stopped first. This cannot check that for you.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Restore this backup over what is there? Type "yes" to confirm: ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    fs.rmSync(staged, { force: true });
    console.log('Cancelled. Nothing was changed.');
    process.exit(1);
  }
}

/*
 * A backup of what is about to be replaced, taken by the ordinary backup script
 * so that it is verified the same way every other backup is. Restoring the wrong
 * file is a mistake somebody makes at two in the morning, and it should cost
 * nothing but the running of one more command.
 *
 * Skipped only when there is nothing there to lose — a fresh machine, which is
 * the other reason to run this script at all.
 */
if (current !== null) {
  console.log('\nBacking up what is there now, first.');

  const { spawnSync } = await import('node:child_process');
  const startedAt = Date.now();

  /*
   * Into a folder of its own rather than among the scheduled backups, and this is
   * not tidiness.
   *
   * Backups are named to the minute, and the backup script treats a folder that
   * already exists for this minute as "already done" — correct for a timer
   * catching up on a missed run, and quietly wrong here. Take a backup and then
   * restore within the same minute, which is exactly the careful person's order
   * of work, and the safety copy was skipped while this reported success: the
   * cupboard it was about to replace went unrecorded, and the only folder for
   * that minute held a different state entirely. Proved before it was fixed.
   *
   * Separate folder, so the only thing it can collide with is another restore in
   * the same minute — and that is caught below rather than assumed away.
   */
  const safetyRoot = path.join(backupsPath(), 'before-restore');
  const safety = spawnSync(process.execPath, [path.join(import.meta.dirname, 'backup.mjs')], {
    stdio: 'inherit',
    env: { ...process.env, BACKUP_DIR: safetyRoot },
  });

  if (safety.status !== 0) {
    fs.rmSync(staged, { force: true });
    console.error('\nThat backup failed, so nothing was restored — the cupboard is untouched.');
    /*
     * This used to say "or pass --force to restore anyway", which was a dead end:
     * --force skips the confirmation and nothing else, so somebody following that
     * advice got the identical failure. Say the thing that actually works. The
     * usual cause is BACKUP_DIR pointing somewhere unwritable or full, and it can
     * be sent anywhere for one run.
     */
    console.error('Point BACKUP_DIR somewhere writable and run this again, for example:');
    console.error(`  BACKUP_DIR=${path.join(os.tmpdir(), 'parrothecary-safety')} npm run db:restore -- <path>`);
    process.exit(1);
  }

  /*
   * Exit zero is not proof. The whole promise of this step is that the cupboard
   * being replaced can be got back, so what is checked is that: a folder written
   * by this run, holding the counts the cupboard has right now.
   */
  const taken = newestSafety(safetyRoot);

  if (taken === null || taken.writtenAt < startedAt - 2000) {
    fs.rmSync(staged, { force: true });
    console.error('\nThe backup reported success but wrote nothing new, so nothing was restored.');
    console.error('A backup for this minute already existed. Wait a minute and run this again.');
    process.exit(1);
  }

  if (taken.boxes !== current.boxes || taken.movements !== current.movements) {
    fs.rmSync(staged, { force: true });
    console.error(
      `\nThe backup just taken holds ${taken.boxes} boxes and ${taken.movements} movements, ` +
        `but this cupboard has ${current.boxes} and ${current.movements}.`,
    );
    console.error('It is not a copy of what is about to be replaced, so nothing was restored.');
    process.exit(1);
  }

  console.log(`  kept as ${path.join(safetyRoot, taken.name)}`);
}

/** The most recent backup in a folder, with what it holds and when it was written. */
function newestSafety(root) {
  if (!fs.existsSync(root)) return null;

  const names = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BACKUP_STAMP.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const name = names.at(-1);
  if (name === undefined) return null;

  const folder = path.join(root, name);
  const copy = path.join(folder, path.basename(dbPath));
  if (!fs.existsSync(copy)) return null;

  const db = new Database(copy, { readonly: true });
  try {
    return {
      name,
      writtenAt: fs.statSync(folder).mtimeMs,
      boxes: db.prepare('select count(*) n from batches').get().n,
      movements: db.prepare('select count(*) n from stock_movements').get().n,
    };
  } finally {
    db.close();
  }
}

console.log('\nRestoring.');

/*
 * The step the manual instructions could not enforce. Before the database file is
 * replaced, never after: the point is that no log from the old database is left
 * to be replayed on top of the new one.
 */
for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
  if (!fs.existsSync(sidecar)) continue;
  try {
    fs.rmSync(sidecar);
    console.log(`  cleared ${path.basename(sidecar)}`);
  } catch (error) {
    fs.rmSync(staged, { force: true });
    console.error(`  Could not remove ${sidecar}: ${error.message}`);
    console.error('  Nothing was restored. This usually means the app is still running.');
    process.exit(1);
  }
}

try {
  fs.renameSync(staged, dbPath);
} catch (error) {
  fs.rmSync(staged, { force: true });
  console.error(`  Could not put the database in place: ${error.message}`);
  console.error('  This usually means the app is still running.');
  /*
   * The write-ahead log was cleared a moment ago, so the database still sitting
   * there has lost anything written since its last checkpoint. That is not a loss
   * only because the backup above was taken first, and it holds those changes -
   * worth saying here rather than leaving somebody to work it out.
   */
  if (current !== null) {
    console.error('  What was there is in the backup taken a moment ago, including');
    console.error('  anything the cleared write-ahead log held.');
  }
  process.exit(1);
}

/*
 * Photographs are copied over rather than the folder being emptied first. A
 * restore goes back in time, and the pictures taken since are no longer referred
 * to by anything — but deleting somebody's photographs is not a thing to do on
 * their behalf while they are already having a bad day. They are counted below
 * instead, and `npm run db:reset` is what clears the folder.
 */
fs.mkdirSync(uploadsPath, { recursive: true });
let restored = 0;
const unwritten = [];

for (const name of photos) {
  /*
   * The path inside `uploads/` is kept, rather than only the filename.
   *
   * This took the basename at first, which quietly did two wrong things at once:
   * a backup holding `uploads/old/photo.webp` restored it to the top of the
   * folder, and two files of the same name in different folders landed on top of
   * each other — so restoring could *destroy* a photograph that was safely in the
   * backup, and report success. It is reachable through this project's own code:
   * the download walks `uploads/` recursively, so anything a person files away in
   * a subfolder comes back in that shape.
   */
  const inside = name.slice('uploads/'.length);
  const target = path.join(uploadsPath, inside);

  // Defence in depth. The zip reader already refuses names that climb out of the
  // folder, and a folder backup is read from real directory entries, so this
  // cannot fire — which is the point of checking it before writing.
  if (path.relative(uploadsPath, target).startsWith('..')) {
    unwritten.push(`${inside} (would have been written outside the folder)`);
    continue;
  }

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, files.get(name));
    restored++;
  } catch (error) {
    unwritten.push(`${inside} (${error.message})`);
  }
}

const strays = walkUploads().filter((file) => !files.has(`uploads/${file}`));

function walkUploads(prefix = '') {
  const found = [];
  for (const entry of fs.readdirSync(path.join(uploadsPath, prefix), { withFileTypes: true })) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walkUploads(relative));
    else if (isPhotoFile(entry.name)) found.push(relative);
  }
  return found;
}

const after = inspect(dbPath);
console.log(
  `  ${after.boxes} boxes, ${after.movements} stock movements, ` +
    `${photographs.length} photograph files` +
    (restored > photographs.length ? ` and ${restored - photographs.length} other file(s)` : ''),
);

if (after.boxes !== counts.boxes || after.movements !== counts.movements) {
  console.error('  but that does not match the backup. Something else is writing to this database.');
  process.exit(1);
}

/*
 * A file that could not be written is a failure, not a footnote. It printed the
 * error and then said "restored" underneath it with an exit code of zero, which
 * is exactly how somebody ends up believing a restore finished when part of it
 * did not — and the reassuring line was the last thing on the screen.
 */
if (unwritten.length > 0) {
  console.error(`\n  ${unwritten.length} file(s) could NOT be written:`);
  for (const line of unwritten) console.error(`    ${line}`);
  console.error('\n  The database is restored. The photographs are not all there.');
  console.error('  Fix whatever stopped them being written, then run this again.');
  process.exit(1);
}

console.log('  restored, and the database reads back exactly as the backup did.');

if (strays.length > 0) {
  console.log(
    `\n  Note: ${strays.length} photograph file(s) in the folder are not in this backup — ` +
      `pictures taken after it. Nothing refers to them now. They were left alone.`,
  );
}
if (missing.length > 0) {
  console.log(
    `\n  Note: ${missing.length} photograph file(s) the restored database refers to were ` +
      `not in the backup, so they are still missing.`,
  );
}

/*
 * Sign-ins are rows in the database like everything else, so they travel with a
 * backup: the ones it held come back, and any phone that signed in after it was
 * taken finds itself signed out. Harmless, and alarming if nobody said it would
 * happen - somebody restoring at midnight does not need to wonder whether the
 * restore broke the login.
 */
console.log('');
console.log('A phone that signed in after this backup was taken will be signed out.');
console.log('Sign-ins live in the database too, so the ones in the backup came back with it.');
/*
 * The check to finish on, except when there is nothing to check. A backup of a
 * cupboard nobody has photographed yet - deployment day, before anything is
 * typed in - was told to open a photograph of a box, which is an instruction
 * that cannot be followed and reads like something has gone wrong.
 */
if (photographs.length === 0) {
  console.log('');
  console.log('Start the app and log in.');
  console.log('There are no photographs in this backup, so nothing to open as a check.');
} else {
  console.log('');
  console.log('Start the app, log in, and open a photograph of a box.');
  console.log('That last step is the test: anything can restore a database.');
}
