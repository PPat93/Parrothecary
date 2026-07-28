import Link from 'next/link';

/**
 * Detail views are reached by tapping a row, so they need a way back that is
 * not the browser chrome — an installed PWA has no address bar.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-2 -ml-1 inline-flex items-center gap-1 text-sm"
      style={{ color: 'var(--muted)' }}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 6l-6 6 6 6" />
      </svg>
      {label}
    </Link>
  );
}
