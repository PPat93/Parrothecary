/**
 * Wipe all data, keeping the schema. Use this before entering real inventory
 * so no demo rows survive into the live database.
 *
 *   npm run db:reset            (asks for confirmation)
 *   npm run db:reset -- --force (no prompt, for scripts)
 *
 * Sessions are cleared too, so every phone is logged out afterwards.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import readline from 'node:readline/promises';

const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/wydawka.db');
const force = process.argv.includes('--force');

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
console.log(`  total rows: ${total}\n`);

if (total === 0) {
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

console.log(`\nDeleted ${total} rows across ${tables.length} tables. Database is empty.`);
