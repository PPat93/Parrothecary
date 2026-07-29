import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { addDays, todayIso } from '@/domain/date';
import { doseOccurrenceStatus, recentScheduleDates, type DoseStatus } from '@/domain/dosing';
import { formatQuantity } from '@/domain/quantity';
import { getActiveDoseSchedules, getTakenOccurrences } from '@/lib/queries';
import { confirmDose, undoDose } from '../actions';

const HISTORY_DAYS = 3;

export default async function DosesPage() {
  const today = todayIso();
  const cutoff = addDays(today, -(HISTORY_DAYS - 1));

  const schedules = await getActiveDoseSchedules();
  const taken = await getTakenOccurrences(
    schedules.map((s) => s.scheduleId),
    cutoff,
  );

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Doses</h1>
        <Link href="/household" className={LINK_BUTTON} style={toneStyle('accent')}>
          Manage people
        </Link>
      </header>

      {schedules.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <p>Nothing scheduled.</p>
          <p className="mt-2">
            Add someone under{' '}
            <Link href="/household" className="underline underline-offset-4">
              Household
            </Link>{' '}
            and give them a dose to track.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {schedules.map((schedule) => {
            const dates = recentScheduleDates(
              { startDate: schedule.startDate, endDate: schedule.endDate },
              today,
              HISTORY_DAYS,
            );

            return (
              <li
                key={schedule.scheduleId}
                className="rounded-2xl border p-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <p className="text-sm font-medium">
                  {schedule.memberName} — {schedule.productName}
                  {schedule.productStrength ? (
                    <span className="font-normal" style={{ color: 'var(--muted)' }}>
                      {' '}
                      {schedule.productStrength}
                    </span>
                  ) : null}
                </p>
                <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                  {formatQuantity(schedule.doseUnits, schedule.unitName)} · {schedule.timesPerDay}
                  ×/day
                </p>

                <div className="flex flex-col gap-1.5">
                  {dates.map((date) => {
                    const takenHere = taken.get(`${schedule.scheduleId}:${date}`) ?? new Set<number>();
                    return (
                      <div key={date} className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="w-14 shrink-0 text-xs tabular-nums"
                          style={{ color: 'var(--muted)' }}
                        >
                          {dayLabel(date, today)}
                        </span>
                        {Array.from({ length: schedule.timesPerDay }, (_, i) => i + 1).map(
                          (occurrence) => (
                            <DosePill
                              key={occurrence}
                              scheduleId={schedule.scheduleId}
                              date={date}
                              occurrence={occurrence}
                              status={doseOccurrenceStatus(occurrence, date, today, takenHere)}
                              showNumber={schedule.timesPerDay > 1}
                            />
                          ),
                        )}
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const [, month, day] = date.split('-');
  return `${day}.${month}`;
}

function DosePill({
  scheduleId,
  date,
  occurrence,
  status,
  showNumber,
}: {
  scheduleId: number;
  date: string;
  occurrence: number;
  status: DoseStatus;
  showNumber: boolean;
}) {
  const label = showNumber ? String(occurrence) : '✓';

  if (status === 'future') {
    // Not yet due — nothing to tap, so no form at all rather than a dead button.
    return (
      <span
        aria-hidden
        className="flex h-8 w-8 items-center justify-center rounded-lg border text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)', opacity: 0.4 }}
      >
        {label}
      </span>
    );
  }

  const taken = status === 'taken';
  const tone = taken ? 'ok' : status === 'missed' ? 'critical' : 'accent';
  const title = taken
    ? 'Taken — tap to undo'
    : status === 'missed'
      ? 'Missed — tap to mark taken'
      : 'Tap to confirm';

  return (
    <form action={taken ? undoDose : confirmDose}>
      <input type="hidden" name="scheduleId" value={scheduleId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="occurrence" value={occurrence} />
      <ActionButton
        tone={tone}
        variant={taken ? 'solid' : 'outline'}
        title={title}
        aria-label={title}
        className="flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-medium"
      >
        {taken ? '✓' : label}
      </ActionButton>
    </form>
  );
}
