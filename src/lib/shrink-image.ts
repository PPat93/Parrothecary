/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * A phone camera produces 3–5 MB, which blows past the Server Action body limit
 * and is slow over house wifi for something displayed at 320px. Re-encoding
 * here means the upload is typically under 300 KB.
 *
 * The server still runs its own sharp pass — this is a courtesy to the network,
 * not a substitute for validating what arrives.
 */

const MAX_EDGE = 1600;
const QUALITY = 0.82;

export async function shrinkImage(file: File): Promise<File> {
  // Anything we cannot decode is passed through untouched; the server will
  // reject it with a proper message rather than us failing silently here.
  if (!file.type.startsWith('image/')) return file;
  if (typeof createImageBitmap !== 'function') return file;

  try {
    // `from-image` applies the EXIF orientation flag while decoding. Without
    // it, a photo taken sideways would be baked in rotated — canvas drops EXIF,
    // so there would be no flag left for anything downstream to correct.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/webp', QUALITY);
    });

    // Nothing gained, or the encoder refused: keep the original.
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', {
      type: 'image/webp',
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
