'use client';

import { useState } from 'react';

/**
 * A product photo small enough to scan a list with.
 *
 * Disappears instead of showing a broken-image icon. The database holds the
 * photo's name while the file itself lives beside it on disk, so the two can
 * come apart — a database restored without its uploads folder is the obvious
 * way, and that is a real prospect on a machine whose backups are still being
 * set up. A missing picture should read as "no picture", which is a state the
 * list already handles, rather than as damage.
 *
 * Decorative on purpose: the name sits beside it, so an empty alt keeps a
 * screen reader from reading the same thing twice.
 */
export function Thumbnail({ photoPath, className }: { photoPath: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/photo/${photoPath}-thumb`}
      alt=""
      onError={() => setMissing(true)}
      className={className ?? 'h-10 w-10 shrink-0 rounded-lg border object-cover'}
      style={{ borderColor: 'var(--border)' }}
    />
  );
}
