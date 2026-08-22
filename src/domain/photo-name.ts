/**
 * What a photo file this app minted is called.
 *
 * A uuid, optionally with `-thumb`, and nothing else. Names come back out of
 * the database and go straight into a file path, so they are kept boring: this
 * is what stops `../../` from ever being one.
 *
 * Here rather than in `src/lib/photos.ts` because two callers outside the app
 * need it and cannot have that file: it opens with `import 'server-only'` and
 * pulls in sharp. The reset script has to know which files in the uploads
 * folder are ours to delete, and it must decide that by the same rule the photo
 * route decides what to serve — a second, slightly different pattern in a
 * script that deletes things is not a mistake worth risking.
 *
 * Pure: a string in, a verdict out. No filesystem, no framework.
 */
export const PHOTO_NAME = /^[a-f0-9-]{36}(-thumb)?$/;

export function isSafePhotoName(name: string): boolean {
  return PHOTO_NAME.test(name);
}

/** The one extension the app writes. Everything is re-encoded to webp on the way in. */
export const PHOTO_EXTENSION = '.webp';

/**
 * Is this a file in the uploads folder that this app created?
 *
 * Used to decide what a wipe may delete, and what is worth counting as a
 * photograph. Anything else in there was put there by a person, and a script
 * that clears the cupboard has no business removing it.
 */
export function isPhotoFile(fileName: string): boolean {
  if (!fileName.endsWith(PHOTO_EXTENSION)) return false;
  return isSafePhotoName(fileName.slice(0, -PHOTO_EXTENSION.length));
}

/**
 * Both files one photograph is stored as: the picture and its thumbnail.
 *
 * One place, because three callers build these names — saving a photo, deleting
 * one, and the backup checking that a stored photograph is really in the folder
 * it just copied. The backup spelled out `.webp` and `-thumb` itself, which is
 * how a check meant to catch missing pictures would quietly stop finding them
 * if the app ever wrote a second format.
 */
export function photoFileNames(id: string): string[] {
  return [`${id}${PHOTO_EXTENSION}`, `${id}-thumb${PHOTO_EXTENSION}`];
}

/**
 * How many actual pictures a list of file names represents.
 *
 * Every photograph is two files, so the backup and restore scripts reporting
 * "2 photograph files" for a cupboard holding one picture is true and useless —
 * the first person to read it counted their photographs and got a different
 * number. Both counts are worth printing; only one of them is what was asked.
 *
 * Counts distinct ids rather than dividing by two, because a folder can hold a
 * picture whose thumbnail went missing, or a thumbnail whose picture did. Those
 * are exactly the cases worth reporting honestly rather than halving away.
 */
export function countPhotographs(fileNames: string[]): number {
  const ids = new Set<string>();

  for (const fileName of fileNames) {
    if (!isPhotoFile(fileName)) continue;
    const name = fileName.slice(0, -PHOTO_EXTENSION.length);
    ids.add(name.endsWith('-thumb') ? name.slice(0, -'-thumb'.length) : name);
  }

  return ids.size;
}
