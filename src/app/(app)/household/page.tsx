import Link from 'next/link';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getHouseholdMembers } from '@/lib/queries';

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const showArchived = archived === '1';
  const rows = await getHouseholdMembers(showArchived);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Household</h1>
        <Link href="/household/new" className={LINK_BUTTON} style={toneStyle('accent')}>
          New person
        </Link>
      </header>

      <div
        className="mb-4 grid grid-cols-2 gap-1 rounded-xl border p-1 text-center text-sm"
        style={{ borderColor: 'var(--border)' }}
      >
        <Tab href="/household" label="Active" active={!showArchived} />
        <Tab href="/household?archived=1" label="Archived" active={showArchived} />
      </div>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          {showArchived ? 'Nothing archived.' : 'Add whoever takes something regularly.'}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/household/${row.id}`}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{row.name}</p>
                  {row.notes ? (
                    <p className="truncate text-xs" style={{ color: 'var(--muted)' }}>
                      {row.notes}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                  {row.activeScheduleCount} {row.activeScheduleCount === 1 ? 'dose' : 'doses'}
                </span>
                <span aria-hidden style={{ color: 'var(--muted)' }}>
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
