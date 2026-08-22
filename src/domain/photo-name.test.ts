import { describe, expect, it } from 'vitest';
import { countPhotographs, isPhotoFile, isSafePhotoName, photoFileNames } from './photo-name';

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

describe('counting photographs rather than files', () => {
  const OTHER = '2b7f8c1e-4a3d-4c5b-9e6f-1a2b3c4d5e6f';

  it('counts one picture and its thumbnail as one photograph', () => {
    // The whole reason this exists: a backup reporting "2 photograph files" for
    // a cupboard holding one picture was true, and read by a person as two.
    expect(countPhotographs(photoFileNames(ID))).toBe(1);
  });

  it('counts two photographs as two', () => {
    expect(countPhotographs([...photoFileNames(ID), ...photoFileNames(OTHER)])).toBe(2);
  });

  it('counts a half pair as one, either way round', () => {
    // Deliberately not files/2. A picture whose thumbnail went missing is one of
    // the situations worth reporting honestly, not rounding away.
    expect(countPhotographs([`${ID}.webp`])).toBe(1);
    expect(countPhotographs([`${ID}-thumb.webp`])).toBe(1);
  });

  it('ignores anything a person left in the folder', () => {
    expect(countPhotographs([...photoFileNames(ID), 'notes.txt', 'holiday.jpg'])).toBe(1);
  });

  it('counts nothing as nothing', () => {
    expect(countPhotographs([])).toBe(0);
  });

  it('never exceeds the file count, and never doubles it', () => {
    // The two ways of getting this wrong, stated as a rule rather than examples.
    const names = [...photoFileNames(ID), ...photoFileNames(OTHER), 'stray.txt'];
    const photoFiles = names.filter(isPhotoFile);
    const counted = countPhotographs(names);

    expect(counted).toBeLessThanOrEqual(photoFiles.length);
    expect(counted * 2).toBeGreaterThanOrEqual(photoFiles.length);
  });
});
