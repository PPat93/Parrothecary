/**
 * Is this machine ready to run Parrothecary?
 *
 *   npm run preflight
 *
 * Written for deployment day, and for the morning after a machine has been moved,
 * rebuilt or restored. Everything it asks is something that has actually gone
 * wrong somewhere in this project, or would be found out at the worst moment:
 * a Node too old to import the scripts, a native module built for another
 * platform, a password hash mangled by the shell, a data folder the service user
 * cannot write, a disk with no room for the backup the timer is about to take.
 *
 * Safe to run against a live machine at any time. It creates nothing and changes
 * nothing: the only thing it writes is a probe file in each folder it has to
 * prove is writable, named after this process and deleted a line later. Saying
 * "read-only" would have been the tidier sentence and not quite true.
 *
 * Exit code is the whole answer for a script: zero when the machine can run the
 * app, one when something must be fixed first. Warnings do not fail it — they are
 * things worth knowing that do not stop it working.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { backupsPath, databasePath, uploadsPath } from '../src/lib/data-paths.ts';

const require = createRequire(import.meta.url);

const problems = [];
const warnings = [];

function ok(what, detail = '') {
  console.log(`  ok      ${what}${detail ? ` — ${detail}` : ''}`);
}

function fail(what, detail) {
  console.log(`  PROBLEM ${what} — ${detail}`);
  problems.push(what);
}

function warn(what, detail) {
  console.log(`  note    ${what} — ${detail}`);
  warnings.push(what);
}

console.log(`Preflight for ${process.cwd()}\n`);

/*
 * Node first, because everything below it depends on the answer and because this
 * is the one the packaged Debian version gets wrong. 22.18 is not arbitrary: the
 * scripts import `.ts` files directly, which needs type stripping to be on by
 * default.
 */
const [major, minor] = process.versions.node.split('.').map(Number);
if (major > 22 || (major === 22 && minor >= 18)) {
  ok('node', `v${process.versions.node}`);
} else {
  fail('node', `v${process.versions.node} is too old; 22.18 or newer is needed to import the scripts`);
}

/*
 * The three native modules, which are compiled for one platform and one Node
 * version. They are the reason this cannot be built on a laptop and copied to the
 * machine, and a mismatch shows up as an unreadable linker error at the first
 * request rather than at start-up.
 */
for (const native of ['better-sqlite3', 'sharp', '@node-rs/argon2']) {
  try {
    require(native);
    ok(native, 'loads');
  } catch (error) {
    fail(native, `will not load: ${error.message.split('\n')[0]}`);
  }
}

/*
 * A production build has to be on disk before the service is any use.
 *
 * `next start` does not check at start-up: it prints "Ready", then throws on the
 * first request and exits, so systemd restarts it and the machine sits in a
 * restart loop with a message only visible in the journal. Cheaper to answer
 * here, before anybody enables the service.
 */
if (fs.existsSync(path.join('.next', 'BUILD_ID'))) {
  ok('production build', 'present in .next');
} else {
  fail('production build', 'missing — run npm run build');
}

/*
 * `.env.local` is read here rather than trusted to the shell, which is the whole
 * point of the checks below. Next loads that file itself, so the hash is normally
 * nowhere in the environment of a plain script, and a check that says "not set"
 * every time is not a check but noise somebody learns to skip.
 */
const BACKSLASH = String.fromCharCode(92);

/** Next expands `$name` in .env files, so a hash full of them has to escape each one. */
function unescapeDollars(value) {
  let out = '';
  for (let at = 0; at < value.length; at++) {
    if (value[at] === BACKSLASH && value[at + 1] === '$') {
      out += '$';
      at++;
      continue;
    }
    out += value[at];
  }
  return out;
}

/** Drop one matching pair of surrounding quotes, the way an env file reader does. */
function unquote(value) {
  const first = value[0];
  const quote = String.fromCharCode(34);
  const apostrophe = String.fromCharCode(39);

  if ((first === quote || first === apostrophe) && value.endsWith(first) && value.length > 1) {
    return value.slice(1, -1);
  }
  return value;
}

function hasBareDollar(value) {
  for (let at = 0; at < value.length; at++) {
    if (value[at] === '$' && value[at - 1] !== BACKSLASH) return true;
  }
  return false;
}

let hash = process.env.MASTER_PASSWORD_HASH ?? '';
let escapedInFile = false;

if (fs.existsSync('.env.local')) {
  try {
    const line = fs
      .readFileSync('.env.local', 'utf8')
      .split(String.fromCharCode(10))
      .map((text) => text.trim())
      .find((text) => text.startsWith('MASTER_PASSWORD_HASH='));

    if (line === undefined) {
      warn('.env.local', 'present, but holds no MASTER_PASSWORD_HASH');
    } else {
      ok('.env.local', 'present and readable');
      escapedInFile = true;

      /*
       * Quotes around the value are stripped before anything is judged, because
       * Next strips them too. Checked against Next's own loader rather than
       * guessed: a quoted, escaped hash works perfectly, and this used to report
       * it as "not an Argon2id hash" — a false alarm on a working machine, which
       * is the one thing a readiness check must never do.
       *
       * Quotes do not rescue an unescaped hash, though. That was checked the same
       * way: bare dollars are eaten whether the value is quoted or not, so the
       * warning below stands regardless.
       */
      const raw = unquote(line.slice('MASTER_PASSWORD_HASH='.length).trim());

      /*
       * The failure this exists for, and it is silent: Next does shell-style
       * expansion on these files, so a bare `$m=65536` becomes nothing at all.
       * The app still starts. Every login is simply refused, with no clue why.
       */
      if (hasBareDollar(raw)) {
        fail(
          'MASTER_PASSWORD_HASH',
          'has unescaped $ in .env.local — Next expands those, and every login will be refused. Write each one as ' +
            BACKSLASH +
            '$',
        );
      }

      hash = unescapeDollars(raw);
    }
  } catch (error) {
    fail('.env.local', `cannot be read: ${error.message}`);
  }
} else {
  warn('.env.local', 'missing — the app will refuse every login until it holds MASTER_PASSWORD_HASH');
}

/*
 * The hash itself, checked for shape rather than correctness. Nothing here can
 * tell whether it matches the password somebody remembers; it can tell that the
 * thing in the file is an Argon2id hash at all.
 */
if (hash === '') {
  fail('MASTER_PASSWORD_HASH', 'not set — generate one with npm run auth:hash');
} else if (!hash.startsWith('$argon2id$')) {
  fail('MASTER_PASSWORD_HASH', 'does not look like an Argon2id hash — run npm run auth:hash again');
} else {
  ok('MASTER_PASSWORD_HASH', escapedInFile ? 'an Argon2id hash, escaped as Next needs it' : 'an Argon2id hash');
}

/**
 * Can this user actually write there? Asked by writing, because permissions read
 * from the outside are a poor guide to what a service user can really do.
 *
 * Nothing is created. An earlier version made the folder if it was missing, which
 * quietly contradicted the promise at the top of this file — and worse, a
 * mistyped DATABASE_PATH would have had it building the wrong folder tree and
 * then reporting that everything was fine. A folder that does not exist yet is a
 * fact to report, not one to fix.
 */
function writable(dir) {
  const wanted = path.resolve(dir);

  let existing = wanted;
  while (!fs.existsSync(existing)) {
    const above = path.dirname(existing);
    if (above === existing) return { exists: false, tested: existing, error: 'no such path' };
    existing = above;
  }

  const probe = path.join(existing, `.preflight-${process.pid}`);
  try {
    fs.writeFileSync(probe, 'x');
    fs.rmSync(probe);
    return { exists: existing === wanted, tested: existing, error: null };
  } catch (error) {
    return { exists: existing === wanted, tested: existing, error: error.message };
  }
}

/** Report on one folder the app needs, without touching it. */
function checkFolder(label, dir) {
  const verdict = writable(dir);

  if (verdict.error !== null) {
    fail(label, `${verdict.tested} cannot be written: ${verdict.error}`);
  } else if (verdict.exists) {
    ok(label, dir);
  } else {
    warn(label, `${dir} does not exist yet — it will be created, and ${verdict.tested} is writable`);
  }
}

const dbPath = databasePath();
const dataDir = path.dirname(dbPath);

checkFolder('data folder', dataDir);
checkFolder('uploads folder', uploadsPath());
checkFolder('backup folder', backupsPath());
checkFolder('temporary folder', os.tmpdir());

/*
 * The database itself, and whether the migrations have been applied. A missing
 * database is not a problem on a machine that has not been set up yet, which is
 * why it is a note: `npm run db:migrate` is the answer, and the message says so.
 */
if (!fs.existsSync(dbPath)) {
  warn('database', `nothing at ${dbPath} yet — run npm run db:migrate`);
} else {
  const { default: Database } = await import('better-sqlite3');
  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = db
      .prepare(`select count(*) n from sqlite_master where type = 'table' and name = 'batches'`)
      .get().n;

    if (!tables) {
      warn('database', 'exists but has no tables — run npm run db:migrate');
    } else {
      const boxes = db.prepare('select count(*) n from batches').get().n;
      const movements = db.prepare('select count(*) n from stock_movements').get().n;
      ok('database', `${boxes} boxes, ${movements} stock movements`);
    }
    db.close();
  } catch (error) {
    fail('database', `cannot be opened: ${error.message}`);
  }

  /*
   * Room for the backup the timer is about to take. A backup is about the size of
   * the cupboard, and a disk that cannot hold one fails at three in the morning
   * with nobody reading the output.
   */
  const size = sizeOf(dbPath) + sizeOf(uploadsPath());
  const free = freeBytes(backupsPath());
  const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  if (free === null) {
    warn('disk space', 'could not be measured on this platform');
  } else if (free < size * 3) {
    fail(
      'disk space',
      `${megabytes(free)} free where backups go, and the cupboard is ${megabytes(size)} — too tight`,
    );
  } else {
    ok('disk space', `${megabytes(free)} free, cupboard is ${megabytes(size)}`);
  }
}

function sizeOf(target) {
  try {
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) return stat.size;
    return fs
      .readdirSync(target, { withFileTypes: true })
      .reduce((total, entry) => total + sizeOf(path.join(target, entry.name)), 0);
  } catch {
    return 0;
  }
}

function freeBytes(dir) {
  try {
    const stat = fs.statfsSync(dir);
    return stat.bavail * stat.bsize;
  } catch {
    return null;
  }
}

if (process.env.NODE_ENV !== 'production') {
  warn('NODE_ENV', `is "${process.env.NODE_ENV ?? 'unset'}" — the service should set it to production`);
}

console.log();
if (problems.length > 0) {
  console.log(`${problems.length} thing(s) must be fixed before this machine can run the app:`);
  for (const problem of problems) console.log(`  - ${problem}`);
  process.exit(1);
}

console.log(
  warnings.length === 0
    ? 'Ready. Nothing to fix.'
    : `Ready, with ${warnings.length} note(s) above worth reading.`,
);
