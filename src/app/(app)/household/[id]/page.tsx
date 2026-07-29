import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton } from '@/components/action-button';
import { BackLink } from '@/components/back-link';
import { ConfirmButton } from '@/components/confirm-button';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { todayIso } from '@/domain/date';
import { formatQuantity } from '@/domain/quantity';
import { getHouseholdMember, getProducts } from '@/lib/queries';
import { archiveMember, deleteMember, removeSchedule, unarchiveMember } from '../../actions';
import { ScheduleForm } from './schedule-form';

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [member, products] = await Promise.all([getHouseholdMember(Number(id)), getProducts(false)]);
  if (!member) notFound();

  const today = todayIso();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink href={member.archivedAt ? '/household?archived=1' : '/household'} label="Household" />

      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{member.name}</h1>
          {member.notes ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {member.notes}
            </p>
          ) : null}
        </div>
        <Link
          href={`/household/${member.id}/edit`}
          className={LINK_BUTTON}
          style={toneStyle('accent')}
        >
          Edit
        </Link>
      </header>

      {member.archivedAt ? (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <span>This person is archived.</span>
          <form action={unarchiveMember}>
            <input type="hidden" name="id" value={member.id} />
            <ActionButton tone="ok">Restore</ActionButton>
          </form>
        </div>
      ) : null}

      <Section title="Doses">
        {member.schedules.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Nothing scheduled yet.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {member.schedules.map((s) => (
              <li
                key={s.id}
                className="rounded-xl border p-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">
                      {s.productName}
                      {s.productStrength ? (
                        <span className="font-normal" style={{ color: 'var(--muted)' }}>
                          {' '}
                          {s.productStrength}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {formatQuantity(s.doseUnits, s.unitName)} · {s.timesPerDay}×/day · from{' '}
                      {s.startDate}
                      {s.endDate ? ` to ${s.endDate}` : ''}
                      {s.notes ? ` · ${s.notes}` : ''}
                    </p>
                  </div>

                  <form action={removeSchedule} className="shrink-0">
                    <input type="hidden" name="id" value={s.id} />
                    <ConfirmButton
                      label="Remove"
                      title="Remove this schedule?"
                      message={`${s.productName} will no longer show on the daily board. If a dose was ever confirmed against it, that history is kept and the schedule is only retired, not erased; otherwise it is deleted outright.`}
                      confirmLabel="Yes, remove it"
                      tone="critical"
                    />
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        {products.length === 0 ? (
          <p className="mt-3 text-xs" style={{ color: 'var(--muted)' }}>
            Add a product before scheduling a dose for it.
          </p>
        ) : (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">Add a schedule</summary>
            <div className="mt-3">
              <ScheduleForm memberId={member.id} products={products} today={today} />
            </div>
          </details>
        )}
      </Section>

      {!member.archivedAt ? (
        <form action={archiveMember} className="mt-6 flex justify-center">
          <input type="hidden" name="id" value={member.id} />
          <ConfirmButton
            label="Archive this person"
            title="Archive this person?"
            message={`${member.name} will disappear from the daily board. Their dose history is kept, and this can be restored.`}
            confirmLabel="Yes, archive"
            tone="warning"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          />
        </form>
      ) : (
        <div className="mt-6 flex flex-col items-center gap-2">
          {member.hasDoseEvents ? (
            <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
              This person cannot be deleted because a dose was confirmed for them at some point —
              that is real stock history.
            </p>
          ) : (
            <form action={deleteMember}>
              <input type="hidden" name="id" value={member.id} />
              <ConfirmButton
                label="Delete permanently"
                title="Delete this person for good?"
                message={`${member.name} and any schedules will be erased completely. This cannot be undone. It is only offered because no dose was ever confirmed for them.`}
                confirmLabel="Yes, delete it"
                tone="critical"
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              />
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-4 rounded-2xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}
