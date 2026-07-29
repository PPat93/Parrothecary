import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { addDays, todayIso } from '@/domain/date';
import { doseOccurrenceStatus, recentScheduleDates, type DoseStatus } from '@/domain/dosing';
import { totalAvailable } from '@/domain/fefo';
import { formatQuantity } from '@/domain/quantity';
import {
  getActiveDoseSchedules,
  getBatchesForProducts,
  getTakenOccurrences,
  type DoseScheduleBoardRow,
} from '@/lib/queries';
import { confirmDose, undoDose } from '../actions';

const HISTORY_DAYS = 3;

export default async function DosesPage() {
  const today = todayIso();
  const cutoff = addDays(today, -(HISTORY_DAYS - 1));

  const schedules = await getActiveDoseSchedules();
  const [taken, stockByProduct] = await Promise.all([
    getTakenOccurrences(
      schedules.map((s) => s.scheduleId),
      cutoff,
    ),
    getBatchesForProducts([...new Set(schedules.map((s) => s.productId))]),
  ]);

  // Grouped by member so "which of Piotr's doses is this" is answered by the
  // card it sits in, without repeating his name on every row.
  const byMember = new Map<number, { name: string; schedules: DoseScheduleBoardRow[] }>();
  for (const schedule of schedules) {
    const group = byMember.get(schedule.memberId);
    if (group) group.schedules.push(schedule);
    else byMember.set(schedule.memberId, { name: schedule.memberName, schedules: [schedule] });
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Doses</h1>
        <Link href="/household" className={LINK_BUTTON} style={toneStyle('accent')}>
          Manage people
        </Link>
      </header>

      {byMember.size === 0 ? (
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
          {[...byMember.entries()].map(([memberId, group]) => (
            <li
              key={memberId}
              className="rounded-2xl border p-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <Link
                href={`/household/${memberId}`}
                className="mb-2 inline-block text-base font-semibold"
              >
                {group.name}
              </Link>

              <ul className="flex flex-col gap-2">
                {group.schedules.map((schedule) => {
                  const dates = recentScheduleDates(
                    { startDate: schedule.startDate, endDate: schedule.endDate },
                    today,
                    HISTORY_DAYS,
                  );
                  const outOfStock =
                    totalAvailable(stockByProduct.get(schedule.productId) ?? [], today) <= 0;

                  return (
                    <li
                      key={schedule.scheduleId}
                      className="rounded-xl border p-2.5"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      <p className="text-sm font-medium">
                        {schedule.productName}
                        {schedule.productStrength ? (
                          <span className="font-normal" style={{ color: 'var(--muted)' }}>
                            {' '}
                            {schedule.productStrength}
                          </span>
                        ) : null}
                      </p>
                      <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
                        {formatQuantity(schedule.doseUnits, schedule.unitName)} ·{' '}
                        {schedule.timesPerDay}×/day
                        {outOfStock ? (
                          <span style={{ color: 'var(--color-critical)' }}> · none in stock</span>
                        ) : null}
                      </p>

                      <div className="flex flex-col gap-1.5">
                        {dates.map((date) => {
                          const takenHere =
                            taken.get(`${schedule.scheduleId}:${date}`) ?? new Set<number>();
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
                                    outOfStock={outOfStock}
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
            </li>
          ))}
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
  outOfStock,
}: {
  scheduleId: number;
  date: string;
  occurrence: number;
  status: DoseStatus;
  showNumber: boolean;
  outOfStock: boolean;
}) {
  const label = showNumber ? String(occurrence) : '✓';
  const taken = status === 'taken';

  /*
   * A tap with nothing in stock used to reach the server, no-op silently, and
   * look like a broken button. Refusing the tap here — with a reason in the
   * title — is the same "explain instead of allow a dead action" rule the
   * rest of the app already follows (e.g. the archived-product picker).
   */
  if (status === 'future' || (outOfStock && !taken)) {
    return (
      <span
        aria-hidden
        title={outOfStock && !taken ? 'No stock to confirm this from' : undefined}
        className="flex h-8 w-8 items-center justify-center rounded-lg border text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)', opacity: 0.4 }}
      >
        {label}
      </span>
    );
  }

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
