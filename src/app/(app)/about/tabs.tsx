import Link from 'next/link';

/**
 * Three answers to three different questions, kept apart because they are read
 * at different moments: what this is, what a thing on screen means, and how
 * one screen leads to the next.
 */
export function AboutTabs({ active }: { active: 'about' | 'help' | 'flows' }) {
  return (
    <div
      className="mb-5 grid grid-cols-3 gap-1 rounded-xl border p-1 text-center text-sm"
      test-data="about-tabs"
      style={{ borderColor: 'var(--border)' }}
    >
      <Tab href="/about" label="About" active={active === 'about'} />
      <Tab href="/about/help" label="Help" active={active === 'help'} />
      <Tab href="/about/flows" label="Flows" active={active === 'flows'} />
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

/** A titled block of prose. Shared by Help and Flows so they read as one thing. */
export function Panel({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mb-4 rounded-2xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      <div className="flex flex-col gap-2 text-sm" style={{ color: 'var(--muted)' }}>
        {children}
      </div>
    </section>
  );
}

/** A word and what it means. Used for the glossary and the refusal index. */
export function Term({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <p>
      <span className="font-medium" style={{ color: 'var(--text)' }}>
        {term}
      </span>{' '}
      — {children}
    </p>
  );
}
