// drizzle-kit will not create the directory holding the database file, and
// data/ is gitignored, so a fresh clone has nowhere to put it. Runs before
// every migrate.
import fs from 'node:fs';
import path from 'node:path';
import { databasePath } from '../src/lib/data-paths.ts';

fs.mkdirSync(path.dirname(databasePath()), { recursive: true });
