import { randomBytes } from 'node:crypto';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zipArchive } from './zip';

/**
 * Read an archive back the way an extractor would: from the end, through the
 * central directory, rather than by walking the local headers this code wrote.
 *
 * Deliberately a second implementation. A round trip through the same
 * assumptions would pass on an archive no other program could open, which is
 * the only failure that matters here — nobody finds out until the day they need
 * the backup. `Expand-Archive` and `unzip` were both pointed at real output too;
 * this is what runs on every commit.
 */
type Member = {
  name: string;
  method: number;
  crc: number;
  size: number;
  bytes: Buffer;
  utf8: boolean;
  dosTime: number;
  dosDate: number;
};

function readArchive(archive: Buffer): Member[] {
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end, 'no end-of-central-directory record').toBeGreaterThan(-1);

  const total = archive.readUInt16LE(end + 10);
  const directorySize = archive.readUInt32LE(end + 12);
  const directoryAt = archive.readUInt32LE(end + 16);

  // The record is the last thing in the file, and the directory ends where it starts.
  expect(end + 22).toBe(archive.length);
  expect(directoryAt + directorySize).toBe(end);

  const members: Member[] = [];
  let at = directoryAt;

  for (let index = 0; index < total; index++) {
    expect(archive.readUInt32LE(at)).toBe(0x02014b50);

    const flags = archive.readUInt16LE(at + 8);
    const method = archive.readUInt16LE(at + 10);
    const dosTime = archive.readUInt16LE(at + 12);
    const dosDate = archive.readUInt16LE(at + 14);
    const crc = archive.readUInt32LE(at + 16);
    const compressed = archive.readUInt32LE(at + 20);
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const localAt = archive.readUInt32LE(at + 42);
    const name = archive.toString('utf8', at + 46, at + 46 + nameLength);

    // Follow the offset the directory gave us and check the two agree.
    expect(archive.readUInt32LE(localAt)).toBe(0x04034b50);
    expect(archive.readUInt16LE(localAt + 8)).toBe(method);
    expect(archive.readUInt32LE(localAt + 14)).toBe(crc);
    expect(archive.readUInt32LE(localAt + 22)).toBe(size);
    expect(archive.toString('utf8', localAt + 30, localAt + 30 + nameLength)).toBe(name);

    const dataAt = localAt + 30 + archive.readUInt16LE(localAt + 26) + archive.readUInt16LE(localAt + 28);
    const stored = archive.subarray(dataAt, dataAt + compressed);

    members.push({
      name,
      method,
      crc,
      size,
      bytes: method === 0 ? stored : zlib.inflateRawSync(stored),
      utf8: (flags & 0x0800) !== 0,
      dosTime,
      dosDate,
    });

    at += 46 + nameLength + extraLength + commentLength;
  }

  expect(at).toBe(end);
  return members;
}

describe('zipArchive', () => {
  it('gives every file back byte for byte', () => {
    const entries = [
      { name: 'folder/parrothecary.db', bytes: Buffer.from('SQLite format 3\0'.repeat(40)) },
      { name: 'folder/uploads/a.webp', bytes: Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0xff]) },
      { name: 'folder/restore.txt', bytes: Buffer.from('stop the app\ncopy the folder\n') },
    ];

    const members = readArchive(zipArchive(entries));

    expect(members.map((member) => member.name)).toEqual([
      'folder/parrothecary.db',
      'folder/uploads/a.webp',
      'folder/restore.txt',
    ]);
    for (const [index, entry] of entries.entries()) {
      expect(members[index]!.bytes).toEqual(entry.bytes);
      expect(members[index]!.size).toBe(entry.bytes.length);
    }
  });

  it('checksums with the standard CRC-32', () => {
    // The value every zip tool agrees on for this sentence.
    const bytes = Buffer.from('The quick brown fox jumps over the lazy dog');
    const [member] = readArchive(zipArchive([{ name: 'fox.txt', bytes }]));

    expect(member!.crc).toBe(0x414fa339);
  });

  it('compresses what compresses and stores what does not', () => {
    const text = Buffer.from('a database page of mostly nothing\0'.repeat(200));
    // Incompressible on purpose: deflate makes random bytes slightly bigger, and
    // webp photographs behave the same way. Storing them keeps the backup small.
    // Random rather than a formula — the first formula tried here compressed by
    // half, which had the test asserting the opposite of what it meant to.
    const noise = randomBytes(4096);

    const members = readArchive(
      zipArchive([
        { name: 'text', bytes: text },
        { name: 'noise', bytes: noise },
      ]),
    );

    expect(members[0]!.method).toBe(8);
    expect(members[1]!.method).toBe(0);
    expect(members[0]!.bytes).toEqual(text);
    expect(members[1]!.bytes).toEqual(noise);
  });

  it('never grows a file by archiving it', () => {
    const noise = randomBytes(2048);
    const archive = zipArchive([{ name: 'noise', bytes: noise }]);

    // Headers add a fixed amount; the body itself must not have grown.
    expect(archive.length).toBeLessThan(noise.length + 200);
  });

  it('marks names as UTF-8 and gives them back unchanged', () => {
    const [member] = readArchive(
      zipArchive([{ name: 'kopia/tabletki-powlekane-µg.txt', bytes: Buffer.from('x') }]),
    );

    expect(member!.utf8).toBe(true);
    expect(member!.name).toBe('kopia/tabletki-powlekane-µg.txt');
  });

  it('stores an empty file', () => {
    const [member] = readArchive(zipArchive([{ name: 'empty', bytes: Buffer.alloc(0) }]));

    expect(member!.size).toBe(0);
    expect(member!.bytes.length).toBe(0);
    expect(member!.crc).toBe(0);
  });

  it('writes a readable archive with nothing in it', () => {
    const archive = zipArchive([]);

    expect(archive.length).toBe(22);
    expect(readArchive(archive)).toEqual([]);
  });

  /*
   * The slow one, deliberately: it really does build an archive at the limit,
   * because the thing worth proving is that the member count lands in the record
   * as 65535 rather than wrapping round to nothing, and there is no way to see
   * that without the archive existing. Two seconds of it is 65,535 calls to the
   * compressor.
   *
   * The timeout is generous rather than default for that reason. It was found by
   * being the only test in the suite that could fail on a busy machine and pass
   * on a quiet one, which is a worse thing to own than a slow test.
   */
  it('refuses more members than the format can count', { timeout: 60_000 }, () => {
    const many = Array.from({ length: 65536 }, (_, index) => ({
      name: `f${index}`,
      bytes: Buffer.alloc(0),
    }));

    expect(() => zipArchive(many)).toThrow(/65535/);
    // One fewer is fine, and the record says so rather than wrapping to zero.
    const at = zipArchive(many.slice(0, 65535));
    expect(at.readUInt16LE(at.length - 12)).toBe(65535);
  });

  it('refuses a name that would escape the folder it is extracted into', () => {
    // Every one of these is a real extractor bug somebody has shipped. None can
    // arise from a filename this app minted, which is why they throw rather than
    // being quietly rewritten.
    for (const name of [
      '../parrothecary.db',
      'folder/../../etc/passwd',
      '/absolute/parrothecary.db',
      'C:/parrothecary.db',
      'folder\\parrothecary.db',
      'folder//parrothecary.db',
      'folder/',
      '',
    ]) {
      expect(() => zipArchive([{ name, bytes: Buffer.from('x') }]), name).toThrow();
    }
  });

  it('records the local date and time in the format the header has room for', () => {
    // 17 August 2026, 14:32:09 local.
    const [member] = readArchive(
      zipArchive([{ name: 'x', bytes: Buffer.from('x') }], new Date(2026, 7, 17, 14, 32, 9)),
    );

    expect(member!.dosDate).toBe(((2026 - 1980) << 9) | (8 << 5) | 17);
    // Seconds are stored in units of two, so nine becomes eight.
    expect(member!.dosTime).toBe((14 << 11) | (32 << 5) | 4);
  });

  it('clamps a date the header cannot hold rather than wrapping it', () => {
    const [old] = readArchive(
      zipArchive([{ name: 'x', bytes: Buffer.from('x') }], new Date(1971, 0, 5, 0, 0, 0)),
    );

    // 1971 has no representation, and wrapping would put it in the future.
    expect(old!.dosDate >> 9).toBe(0);
  });
});
