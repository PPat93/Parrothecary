import fs from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { isSafePhotoName, photoFile } from '@/lib/photos';
import { isLoggedIn } from '@/lib/session';

/**
 * Serves a box photo.
 *
 * Deliberately extensionless. The proxy lets anything ending in an image
 * extension straight through — that exclusion exists so Android can fetch PWA
 * icons without a session — and these are not public in the way an app icon is.
 * A path of /photo/<uuid> falls under the proxy, and the session is checked
 * again here because the proxy only looks for a cookie, not a valid one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  if (!(await isLoggedIn())) {
    return new NextResponse('Not found', { status: 404 });
  }

  const { name } = await params;
  // Rejects traversal and anything that is not a uuid we minted.
  if (!isSafePhotoName(name)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const file = await fs.readFile(photoFile(name));
    return new NextResponse(new Uint8Array(file), {
      headers: {
        'Content-Type': 'image/webp',
        // Immutable: a new upload gets a new uuid, so this URL never changes
        // meaning and the phone can keep it for a year.
        'Cache-Control': 'private, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
