import Link from 'next/link';
import { logout } from '@/app/(app)/actions';

/**
 * Slim bar on every authenticated view, so locking the app is always in the
 * same place. It used to be a link buried at the bottom of the products page.
 *
 * The name and parrot go home. Stock is already in the bottom nav, but three
 * screens deep in a product's boxes the header is where a thumb reaches first.
 */
export function AppHeader() {
  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between border-b px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {/*
        The whole lockup is the way home, not just the picture: the name beside
        it reads as one thing, and half of a brand mark being clickable is the
        kind of detail that gets discovered by accident or not at all.
      */}
      <Link href="/" title="Parrothecary — back to stock" className="flex items-center gap-2">
        {/* Sits on its own dark disc so the neon lines survive light mode. */}
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ background: 'oklch(0.06 0.004 260)' }}
        >
          {/* Pre-sized asset with a plain img: the logo never changes, so
              runtime optimisation buys nothing. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/parrot-64.png" alt="Mini parrot logo" width={24} height={24} className="h-6 w-6 object-contain" />
        </span>
        <span className="text-sm font-semibold tracking-tight">Parrothecary</span>
      </Link>

      <span className="flex items-center gap-1">
        {/* Money is a look-at-it-occasionally screen, not one of the six things
            the bottom bar is for, so it lives up here with About. */}
        <Link
          href="/stats"
          aria-label="Money"
          title="Money"
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ color: 'var(--muted)' }}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          </svg>
        </Link>

        <Link
          href="/about"
          aria-label="About Parrothecary"
          title="About Parrothecary"
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ color: 'var(--muted)' }}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5" />
            <path d="M12 7.75v.5" />
          </svg>
        </Link>

        <form action={logout}>
          <button
            type="submit"
            aria-label="Lock Parrothecary"
            title="Lock Parrothecary"
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ color: 'var(--muted)' }}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
              <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
            </svg>
          </button>
        </form>
      </span>
    </header>
  );
}
