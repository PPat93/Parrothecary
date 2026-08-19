import { describe, expect, it } from 'vitest';
import { isPhotoFile, isSafePhotoName, photoFileNames } from './photo-name';

/**
 * These names come out of the database and go into a file path, and two scripts
 * outside the app act on them — the reset deletes files by this rule, and the
 * backup checks that a stored photograph really is in the folder it copied. A
 * second, slightly different pattern in a script that deletes things is the
 * mistake worth designing out.
 */
const ID = '20711785-7308-491b-8a73-46f36d83a228';

describe('photo names', () => {
  it('accepts a uuid and its thumbnail', () => {
    expect(isSafePhotoName(ID)).toBe(true);
    expect(isSafePhotoName(`${ID}-thumb`)).toBe(true);
  });

  it('refuses anything that could leave the folder', () => {
    for (const name of ['../../data/parrothecary.db', '..', 'a/b', `${ID}/../x`, '']) {
      expect(isSafePhotoName(name)).toBe(false);
    }
  });

  it('refuses a name that is not the shape the app mints', () => {
    for (const name of ['not-a-uuid', 'notes', `${ID}-large`, ID.toUpperCase()]) {
      expect(isSafePhotoName(name)).toBe(false);
    }
  });

  it('recognises the app’s own files in the uploads folder', () => {
    expect(isPhotoFile(`${ID}.webp`)).toBe(true);
    expect(isPhotoFile(`${ID}-thumb.webp`)).toBe(true);
  });

  it('leaves alone anything a person put there', () => {
    // The reset deletes by this rule, so a false positive costs somebody a file.
    for (const file of ['notes.txt', 'not-a-uuid.webp', `${ID}.jpg`, `${ID}.webp.bak`, 'uploads']) {
      expect(isPhotoFile(file)).toBe(false);
    }
  });

  it('names both files one photograph is stored as', () => {
    expect(photoFileNames(ID)).toEqual([`${ID}.webp`, `${ID}-thumb.webp`]);
  });

  it('names files it would then recognise as its own', () => {
    // The round trip the backup depends on: what a photo is called, and whether
    // a file by that name counts as a photo.
    for (const name of photoFileNames(ID)) expect(isPhotoFile(name)).toBe(true);
  });
});
