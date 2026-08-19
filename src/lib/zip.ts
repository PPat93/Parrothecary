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

  /*
   * Where the central directory starts is a 32-bit field, so an archive over 4 GB
   * has nowhere to record it. Said in a sentence because the alternative is what
   * this did before: `Buffer.writeUInt32LE` throws `ERR_OUT_OF_RANGE` with no hint
   * of which limit was met. Unreachable through the backup download, which refuses
   * well below this, and worth a line for whatever calls this next.
   */
  if (offset > MAX_ENTRY_BYTES) {
    throw new Error('A zip without zip64 cannot hold more than 4 GB in total.');
  }

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

/**
 * The other direction: an archive in, its files out.
 *
 * Written for the restore script, which has to look inside a backup before it is
 * allowed to overwrite anything. Read through the central directory at the end
 * rather than by walking local headers from the front, because that is where a
 * zip's real table of contents lives — the two can disagree, and every reader
 * that trusted the front has been the subject of a security advisory.
 *
 * Everything is checked rather than assumed, since the file being read is one
 * that has been on a phone, in a cloud folder and back:
 *
 *   - the checksum of every file, so a bad byte is caught here rather than
 *     halfway through a restore;
 *   - the names, by the same rule used when writing, so an archive holding
 *     `../../etc/passwd` cannot talk this into writing outside the folder;
 *   - the offsets, so a truncated download fails as a sentence rather than as a
 *     wrong answer.
 */
export function readZip(archive: Buffer): ZipEntry[] {
  const end = findEndRecord(archive);
  const total = archive.readUInt16LE(end + 10);
  const directoryAt = archive.readUInt32LE(end + 16);

  if (directoryAt >= archive.length) {
    throw new Error('This archive says its contents list is past the end of the file.');
  }

  const entries: ZipEntry[] = [];
  let at = directoryAt;

  for (let index = 0; index < total; index++) {
    if (at + 46 > archive.length || archive.readUInt32LE(at) !== CENTRAL_SIGNATURE) {
      throw new Error(`This archive's contents list stops after ${index} of ${total} files.`);
    }

    const flags = archive.readUInt16LE(at + 8);
    const method = archive.readUInt16LE(at + 10);
    const crc = archive.readUInt32LE(at + 16);
    const compressed = archive.readUInt32LE(at + 20);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localAt = archive.readUInt32LE(at + 42);

    /*
     * Backslashes are read as folder separators, though nothing here ever writes
     * one. The zip format says slashes, and PowerShell's own `Compress-Archive`
     * writes `backup\parrothecary.db` regardless — so a backup unpacked on a PC
     * and zipped up again, which is exactly the hop between a phone and the
     * machine, came back as a file this refused to restore. Refusing was correct
     * for the writer and useless here: what arrives is what other people's tools
     * produced.
     *
     * Before the safety check, never after, so that `..\..\etc\passwd` is still
     * a name this will not write.
     */
    const name = archive.toString('utf8', at + 46, at + 46 + nameLength).replaceAll('\\', '/');

    at += 46 + nameLength + extraLength + commentLength;

    /*
     * Directory entries are the one thing skipped rather than refused. Nothing
     * here writes them, but plenty of other zip tools do, and a backup that had
     * been through one of those would otherwise be rejected for holding a folder.
     */
    if (name.endsWith('/') && size === 0) continue;

    if (!isArchiveName(name)) {
      throw new Error(`This archive holds a file called "${name}", which is not safe to write.`);
    }

    /*
     * Bit zero means the file is encrypted. Worth its own sentence: without it
     * the bytes simply fail to uncompress, and a backup that needs a password
     * would be reported as damaged - sending somebody looking for a corrupted
     * download when what they actually need is the password they set.
     */
    if ((flags & 1) !== 0) {
      throw new Error(`"${name}" is password-protected, and this cannot open it.`);
    }

    if (localAt + 30 > archive.length || archive.readUInt32LE(localAt) !== LOCAL_SIGNATURE) {
      throw new Error(`"${name}" is not where this archive's contents list says it is.`);
    }

    // The local header's own name and extra lengths, which are allowed to differ
    // from the ones in the central directory, and do in practice.
    const dataAt = localAt + 30 + archive.readUInt16LE(localAt + 26) + archive.readUInt16LE(localAt + 28);
    if (dataAt + compressed > archive.length) {
      throw new Error(`"${name}" runs past the end of the file — the download is incomplete.`);
    }

    const stored = archive.subarray(dataAt, dataAt + compressed);

    let bytes: Buffer;
    if (method === STORED) {
      bytes = Buffer.from(stored);
    } else if (method === DEFLATED) {
      try {
        bytes = zlib.inflateRawSync(stored);
      } catch {
        throw new Error(`"${name}" could not be uncompressed — the file is damaged.`);
      }
    } else {
      throw new Error(`"${name}" is compressed in a way this cannot read (method ${method}).`);
    }

    if (bytes.length !== size) {
      throw new Error(`"${name}" came out ${bytes.length} bytes where the archive says ${size}.`);
    }

    /*
     * The checksum last, and never skipped. This is the whole reason a zip is
     * worth using over a folder of loose files: it can tell you that what came
     * back is what went in, before anybody restores from it.
     */
    if (zlib.crc32(bytes) !== crc) {
      throw new Error(`"${name}" fails its checksum — the copy is damaged.`);
    }

    entries.push({ name, bytes });
  }

  return entries;
}

/**
 * Find the end-of-central-directory record, searching backwards.
 *
 * Backwards because the record is last and its own length is variable: it may
 * carry a comment of up to 64 KB. Scanning forward for the signature would find
 * the same four bytes sitting by chance inside a compressed photograph.
 */
function findEndRecord(archive: Buffer): number {
  if (archive.length < 22) {
    throw new Error('This file is too small to be a zip at all.');
  }

  const earliest = Math.max(0, archive.length - 22 - 0xffff);
  for (let at = archive.length - 22; at >= earliest; at--) {
    if (archive.readUInt32LE(at) !== END_SIGNATURE) continue;
    // The comment length has to account for exactly the bytes that follow, or
    // this is a signature that happened to appear inside the data.
    if (at + 22 + archive.readUInt16LE(at + 20) === archive.length) return at;
  }

  throw new Error('This is not a zip file, or it was truncated before it finished downloading.');
}
