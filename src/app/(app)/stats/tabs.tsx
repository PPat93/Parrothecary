import Link from 'next/link';

/**
 * Two halves of the same question, kept apart because they read different
 * tables and fill up at different speeds: money comes from the purchase
 * history and was complete on day one, usage comes from the ledger and only
 * accumulates as the app gets used.
 */
export function StatsTabs({ active }: { active: 'money' | 'usage' }) {
  return (
    <div
      className="mb-4 grid grid-cols-2 gap-1 rounded-xl border p-1 text-center text-sm"
      test-data="stats-tabs"
      style={{ borderColor: 'var(--border)' }}
    >
      <Tab href="/stats" label="Money" active={active === 'money'} />
      <Tab href="/stats/usage" label="Usage" active={active === 'usage'} />
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5"
      style={{
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--muted)',
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </Link>
  );
}
