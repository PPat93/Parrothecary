'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Stock', icon: '▦' },
  { href: '/expiring', label: 'Expiring', icon: '◔' },
  { href: '/shopping', label: 'Shopping', icon: '☑' },
  { href: '/products', label: 'Products', icon: '☰' },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky bottom-0 z-10 grid grid-cols-4 border-t pb-[env(safe-area-inset-bottom)]"
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
            <span aria-hidden className="text-lg leading-none">
              {tab.icon}
            </span>
            <span className={active ? 'font-semibold' : undefined}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
