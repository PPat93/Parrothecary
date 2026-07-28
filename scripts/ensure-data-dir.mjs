// drizzle-kit will not create the directory holding the database file, and
// data/ is gitignored, so a fresh clone has nowhere to put it. Runs before
// every migrate.
import fs from 'node:fs';
import path from 'node:path';

const dbPath = path.resolve(process.env.DATABASE_PATH ?? './data/parrothecary.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
