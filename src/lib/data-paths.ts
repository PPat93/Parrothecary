/**
 * Where the data lives.
 *
 * One folder holds everything: the database file, and the box photographs in
 * `uploads/` beside it. `DATABASE_PATH` names the file, and the folder follows
 * from it — that is what makes "copy the folder, not just the file" a thing
 * somebody can actually do.
 *
 * Here because five places had worked that out for themselves, each with its own
 * copy of `'./data/parrothecary.db'` and three with their own `path.join(…,
 * 'uploads')`. That is the shape of every twin bug found in this project so far,
 * and this one has a nasty failure: move the uploads folder, miss a copy, and the
 * backup script goes on succeeding while copying no photographs at all.
 *
 * Plain functions with no framework imports and no `server-only`, so the scripts
 * can import it the way they import `src/domain/photo-name.ts`. Functions rather
 * than constants so the value is read when it is asked for — the tests and the
 * backup verification both point a process at a database other than the default.
 */
import path from 'node:path';

export const DEFAULT_DATABASE_PATH = './data/parrothecary.db';

/** The database file, absolute. */
export function databasePath(): string {
  const configured = process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH;

  /*
   * The comment is for the build, not the reader. `next build` works out which
   * files each route needs, meets a path it cannot compute, and concludes the
   * route might read anything in the project — reported as "the whole project
   * was traced unintentionally". What it is looking at is a database file on
   * disk at runtime, never a module to bundle, so there is nothing to trace.
   *
   * Needed only since this moved out of its callers: the identical expression
   * inline in `src/lib/photos.ts` never tripped the check, and crossing a module
   * boundary was enough for that analysis to give up. Worth knowing, because the
   * cost of the warning is not cosmetic — it is a file list that claims a route
   * depends on the whole repository.
   */
  return path.resolve(/* turbopackIgnore: true */ configured);
}

/**
 * The photographs, absolute.
 *
 * Beside the database rather than under `public/`, because the backup copies
 * this folder and because anything in `public/` is served without a session.
 */
export function uploadsPath(): string {
  return path.join(path.dirname(databasePath()), 'uploads');
}
