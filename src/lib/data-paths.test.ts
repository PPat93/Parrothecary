import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { databasePath, DEFAULT_DATABASE_PATH, uploadsPath } from './data-paths';

const configured = process.env.DATABASE_PATH;

afterEach(() => {
  if (configured === undefined) delete process.env.DATABASE_PATH;
  else process.env.DATABASE_PATH = configured;
});

describe('where the data lives', () => {
  it('defaults to the data folder in the project', () => {
    delete process.env.DATABASE_PATH;

    expect(databasePath()).toBe(path.resolve(DEFAULT_DATABASE_PATH));
  });

  it('follows DATABASE_PATH, absolute or relative', () => {
    process.env.DATABASE_PATH = path.join(path.sep, 'srv', 'parrothecary', 'live.db');
    expect(databasePath()).toBe(path.resolve(path.sep, 'srv', 'parrothecary', 'live.db'));

    process.env.DATABASE_PATH = './elsewhere/live.db';
    expect(databasePath()).toBe(path.resolve('./elsewhere/live.db'));
  });

  it('keeps the photographs beside the database, wherever that is', () => {
    /*
     * The agreement this file exists for. The app writes photographs here, the
     * backup copies this folder, and the wipe deletes from it — three callers
     * that have to name the same folder or the backup quietly holds no pictures.
     */
    process.env.DATABASE_PATH = path.join(path.sep, 'srv', 'parrothecary', 'live.db');

    expect(uploadsPath()).toBe(path.resolve(path.sep, 'srv', 'parrothecary', 'uploads'));
    expect(path.dirname(uploadsPath())).toBe(path.dirname(databasePath()));
  });

  it('is read afresh each time rather than fixed when the module loaded', () => {
    // The scripts and the tests both point a process at a second database, and a
    // constant computed at import time would have handed them the first one.
    process.env.DATABASE_PATH = './one.db';
    const first = databasePath();
    process.env.DATABASE_PATH = './two.db';

    expect(databasePath()).not.toBe(first);
  });
});
