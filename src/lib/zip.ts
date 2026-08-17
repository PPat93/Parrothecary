/**
 * Zip, by hand.
 *
 * The same reasoning as `src/lib/csv.ts`: a dependency for this would be a
 * dependency for four little-endian headers. What makes it cheap is that Node
 * already ships the two hard parts — `zlib.crc32` and `zlib.deflateRawSync` are
 * in core — so nothing here has to implement a checksum table or a compressor.
 * (`crc32` needs Node 22.2; package.json already asks for 22.18 because the
 * scripts import TypeScript directly.)
 *
 * Why a zip at all: a backup is a folder — the database and the box photographs
 * beside it — and a phone can only be handed one file. Tar would do as well and
 * is worse to open on a phone or in Windows Explorer.
 *
 * Deliberately not zip64, so nothing here may exceed 4 GB or 65,535 members.
 * Both limits are asserted rather than assumed: a silently truncated backup is
 * the one failure this whole area of the code exists to avoid, and today's
 * backup is under a megabyte.
 */
import zlib from 'node:zlib';

export type ZipEntry = {
  /** Path inside the archive, with forward slashes. Folders need no entry of their own. */
  name: string;
  bytes: Uint8Array;
};

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

/** 2.0: the version that introduced deflate, which is the newest feature used here. */
const VERSION = 20;

/**
 * Bit 11 says the name is UTF-8. Without it a reader is entitled to decode
 * names as its own 8-bit codepage, which is the same mistake the CSV byte-order
 * mark exists to prevent — and every name written here is ASCII today, so the
 * day it stops being would be the day somebody sees mojibake.
 */
const UTF8_NAME = 0x0800;

const STORED = 0;
const DEFLATED = 8;

const MAX_ENTRY_BYTES = 0xffffffff;
const MAX_ENTRIES = 0xffff;

/**
 * One archive, all of it in memory.
 *
 * Buffered rather than streamed because the caller has to check the copy it is
 * about to hand over, and a stream that fails halfway has already sent a
 * `200`. The sizes this holds are capped by the caller.
 */
export function zipArchive(entries: ZipEntry[], modified = new Date()): Buffer {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`A zip without zip64 holds ${MAX_ENTRIES} files, not ${entries.length}.`);
  }

  const [time, date] = dosTimestamp(modified);
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(archiveName(entry.name), 'utf8');
    const raw = Buffer.from(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.byteLength);

    /*
     * Compressed only when that actually helps. A database of SQLite pages
     * shrinks by most of itself; the photographs are already webp and come out
     * of the compressor slightly larger, so they are stored as they are. The
     * alternative — deflate everything — spends time to make backups bigger.
     */
    const deflated = zlib.deflateRawSync(raw);
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const method = stored ? STORED : DEFLATED;

    if (raw.length > MAX_ENTRY_BYTES) {
      throw new Error(`${entry.name} is too big for a zip without zip64.`);
    }

    const crc = zlib.crc32(raw);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(LOCAL_SIGNATURE, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(UTF8_NAME, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // no extra field
    name.copy(local, 30);

    const directory = Buffer.alloc(46 + name.length);
    directory.writeUInt32LE(CENTRAL_SIGNATURE, 0);
    directory.writeUInt16LE(VERSION, 4); // version made by
    directory.writeUInt16LE(VERSION, 6); // version needed
    directory.writeUInt16LE(UTF8_NAME, 8);
    directory.writeUInt16LE(method, 10);
    directory.writeUInt16LE(time, 12);
    directory.writeUInt16LE(date, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(body.length, 20);
    directory.writeUInt32LE(raw.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt16LE(0, 30); // extra field
    directory.writeUInt16LE(0, 32); // comment
    directory.writeUInt16LE(0, 34); // disk this file starts on
    directory.writeUInt16LE(0, 36); // internal attributes
    directory.writeUInt32LE(0, 38); // external attributes
    directory.writeUInt32LE(offset, 42);
    name.copy(directory, 46);

    parts.push(local, body);
    central.push(directory);
    offset += local.length + body.length;
  }

  const centralSize = central.reduce((total, buffer) => total + buffer.length, 0);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END_SIGNATURE, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk holding the central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16); // where the central directory starts
  end.writeUInt16LE(0, 20); // no archive comment

  return Buffer.concat([...parts, ...central, end]);
}

/**
 * Names that cannot escape the folder they are extracted into.
 *
 * A zip holding `../parrothecary.db` overwrites whatever sits beside the folder
 * somebody unpacked it in, and plenty of extractors still allow it. Every name
 * this app writes is built from a filename it minted, so this should never fire
 * — which is exactly why it throws rather than sanitising: a name that needed
 * rewriting means something upstream is wrong, and a quietly renamed file in a
 * backup is worse than a refused download.
 */
function archiveName(name: string): string {
  if (!isArchiveName(name)) throw new Error(`"${name}" is not a name this archive will write.`);
  return name;
}

/**
 * Asked separately by a caller that reads a folder it does not control.
 *
 * A backup lists whatever is in the uploads folder, and on Linux a person can
 * put a file in there called almost anything — a colon in a name is legal there
 * and illegal in a zip. Throwing would lose the whole backup over one stray
 * file, so the caller asks first and leaves that one out with a note.
 */
export function isArchiveName(name: string): boolean {
  return !(
    name === '' ||
    name.startsWith('/') ||
    name.endsWith('/') ||
    name.includes('\\') ||
    name.includes(':') ||
    hasControlCharacter(name) ||
    name.split('/').includes('..') ||
    name.split('/').includes('')
  );
}

/**
 * A control character in a name breaks readers in ways nobody has to reproduce.
 *
 * By code point rather than a regular expression, so this file holds no literal
 * control characters of its own — one written into the source here made git call
 * the file binary.
 */
function hasControlCharacter(name: string): boolean {
  for (const character of name) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/**
 * The 1980s pair of 16-bit fields a zip stores a timestamp in.
 *
 * Local time, like every other date this app writes: a backup downloaded at
 * half past midnight showing yesterday's date is the moment the stamp has to be
 * right. Seconds land on even numbers because the format only spares five bits
 * for them, and the year is clamped to the range those bits can hold rather
 * than silently wrapping to something in the past.
 */
function dosTimestamp(when: Date): [time: number, date: number] {
  const year = Math.min(2107, Math.max(1980, when.getFullYear()));

  return [
    (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  ];
}
