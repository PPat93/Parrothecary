'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * One icon family: 24px, 1.75 stroke, no fills. Previously these were mismatched
 * text glyphs (▦ ◔ ☑ ☰) which rendered at different weights and sizes depending
 * on the font the phone picked.
 */
const ICONS = {
  stock: (
    <>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </>
  ),
  expiring: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  shopping: (
    <>
      <path d="M3 5h2l2.5 10.5h10L20 8H6" />
      <circle cx="9.5" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
    </>
  ),
  products: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </>
  ),
  doses: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
      <path d="M9 14.5l2 2 4-4.5" />
    </>
  ),
} as const;

const TABS = [
  { href: '/', label: 'Stock', icon: 'stock' },
  { href: '/doses', label: 'Doses', icon: 'doses' },
  { href: '/expiring', label: 'Expiring', icon: 'expiring' },
  { href: '/shopping', label: 'Shopping', icon: 'shopping' },
  { href: '/products', label: 'Products', icon: 'products' },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-10 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)]"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {TABS.map((tab) => {
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className="flex flex-col items-center gap-1 py-2 text-xs"
            style={{ color: active ? 'var(--text)' : 'var(--muted)' }}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth={active ? 2 : 1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {ICONS[tab.icon]}
            </svg>
            <span className={active ? 'font-semibold' : undefined}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
