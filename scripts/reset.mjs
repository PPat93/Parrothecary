/**
 * Wipe all data, keeping the schema. Use this before entering real inventory
 * so no demo rows survive into the live database.
 *
 *   npm run db:reset            (asks for confirmation)
 *   npm run db:reset -- --force (no prompt, for scripts)
 *
 * Sessions are cleared too, so every phone is logged out afterwards.
 *
 * The photographs go as well, and did not always: this deleted every row and
 * left `uploads/` untouched, so pictures of medication outlived the rows that
 * referenced them and no screen could ever show or remove them again. Three
 * such orphans were sitting in the real cabinet when this was found, and the
 * backup script had begun faithfully copying them into every backup. Since a
 * wipe is what deployment day does, they would have outlived that too.
 *
 * Only files this app minted are removed — a uuid, optionally `-thumb`, ending
 * in `.webp`, judged by the same rule the photo route uses to decide what it
 * will serve. Anything else in that folder was put there by a person.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { countPhotographs, isPhotoFile } from '../src/domain/photo-name.ts';
import { databasePath, uploadsPath as resolveUploads } from '../src/lib/data-paths.ts';

const dbPath = databasePath();
const uploadsPath = resolveUploads();
const force = process.argv.includes('--force');

const photoFiles = fs.existsSync(uploadsPath)
  ? fs.readdirSync(uploadsPath).filter(isPhotoFile)
  : [];

// Pictures, not files. This script is asking permission to delete them, and the
// file count reads as twice as many photographs as anybody actually took —
// which is a poor number to show somebody just before they type "yes".
const photographs = countPhotographs(photoFiles);
const picturesAndFiles = () =>
  `${photographs} photograph${photographs === 1 ? '' : 's'} ` +
  `(${photoFiles.length} file${photoFiles.length === 1 ? '' : 's'})`;

const db = new Database(dbPath);
db.pragma('foreign_keys = OFF');

const tables = db
  .prepare(
    `select name from sqlite_master
     where type = 'table'
       and name not like 'sqlite_%'
       and name != '__drizzle_migrations'`,
  )
  .all()
  .map((row) => row.name);

const counts = Object.fromEntries(
  tables.map((t) => [t, db.prepare(`select count(*) c from "${t}"`).get().c]),
);
const total = Object.values(counts).reduce((a, b) => a + b, 0);

console.log(`Database: ${dbPath}`);
for (const [table, count] of Object.entries(counts)) {
  if (count > 0) console.log(`  ${table}: ${count}`);
}
console.log(`  total rows: ${total}`);
if (photoFiles.length > 0) console.log(`  box photographs: ${picturesAndFiles()}`);
console.log();

/*
 * Rows and photographs are counted separately because they can run out of step:
 * an already-empty database with pictures still on disk is exactly the state
 * this script used to leave behind, and "nothing to do" would have been wrong.
 */
if (total === 0 && photoFiles.length === 0) {
  console.log('Already empty. Nothing to do.');
  process.exit(0);
}

if (!force) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Delete all of this permanently? Type "yes" to confirm: ');
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Cancelled. Nothing was deleted.');
    process.exit(1);
  }
}

db.transaction(() => {
  for (const table of tables) db.prepare(`delete from "${table}"`).run();
  // Restart autoincrement counters so a fresh start really looks fresh.
  db.prepare(`delete from sqlite_sequence`).run();
})();

db.pragma('foreign_keys = ON');
db.exec('vacuum');

/*
 * After the rows, so a failure here leaves files nothing points at rather than
 * rows pointing at files that have gone. The first is the state this script
 * exists to produce; the second would be a cupboard full of broken pictures.
 */
let photosDeleted = 0;
for (const file of photoFiles) {
  try {
    fs.rmSync(path.join(uploadsPath, file), { force: true });
    photosDeleted++;
  } catch (error) {
    console.error(`  could not delete ${file}: ${error.message}`);
  }
}

console.log(`\nDeleted ${total} rows across ${tables.length} tables. Database is empty.`);
if (photoFiles.length > 0) {
  console.log(
    `Deleted ${photosDeleted} of ${photoFiles.length} photograph file(s), ` +
      `${photographs} picture${photographs === 1 ? '' : 's'}, from ${uploadsPath}.`,
  );
}
if (photosDeleted !== photoFiles.length) process.exit(1);
