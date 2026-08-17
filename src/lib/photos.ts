import 'server-only';

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Box photos.
 *
 * Stored beside the database rather than in public/, for two reasons: the
 * backup job already copies the data directory, and anything under public/ is
 * served without a session — these are pictures of what the household takes.
 *
 * Phone cameras produce 3–5 MB files. Everything is re-encoded to webp on the
 * way in, plus a thumbnail, so the stock list stays quick over wifi.
 */

const UPLOAD_DIR = path.resolve(
  path.dirname(path.resolve(process.env.DATABASE_PATH ?? './data/parrothecary.db')),
  'uploads',
);

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/*
 * Re-exported rather than defined here: the reset script needs the same rule to
 * know which files in the uploads folder are the app's to delete, and it cannot
 * import this file — `server-only` above would throw, and sharp would come with
 * it. See src/domain/photo-name.ts.
 */
export { isSafePhotoName } from '@/domain/photo-name';
import { isSafePhotoName, photoFileNames } from '@/domain/photo-name';

export function photoFile(name: string): string {
  return path.join(UPLOAD_DIR, `${name}.webp`);
}

export async function savePhoto(file: File): Promise<{ id: string } | { error: string }> {
  if (file.size === 0) return { error: 'No file was selected.' };
  if (file.size > MAX_BYTES) return { error: 'That photo is too large — 12 MB is the limit.' };
  if (file.type && !ACCEPTED.includes(file.type)) {
    return { error: `${file.type} is not an image format this can read.` };
  }

  const id = randomUUID();
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  try {
    const input = Buffer.from(await file.arrayBuffer());

    // rotate() applies the EXIF orientation flag and then drops it, so a photo
    // taken sideways is stored the right way up rather than relying on every
    // viewer to honour the flag.
    await sharp(input)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(photoFile(id));

    await sharp(input)
      .rotate()
      .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(photoFile(`${id}-thumb`));

    return { id };
  } catch {
    return { error: 'That file could not be read as an image.' };
  }
}

export async function deletePhoto(id: string): Promise<void> {
  if (!isSafePhotoName(id)) return;
  // Missing files are fine — the point is that they are gone. Names from the
  // one place that knows them, so the backup's "is this picture really here"
  // check and this cannot disagree about what "here" means.
  for (const name of photoFileNames(id)) {
    await fs.rm(path.join(UPLOAD_DIR, name), { force: true });
  }
}
