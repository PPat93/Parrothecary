import Link from 'next/link';
import {ActionButton} from '@/components/action-button';
import {RunOutBadge} from '@/components/run-out-badge';
import {LINK_BUTTON, toneStyle} from '@/components/tone';
import {addDays, todayIso} from '@/domain/date';
import {
    doseOccurrenceStatus,
    formatDoseCadence,
    nextDueDate,
    recentScheduleDates,
    type DoseStatus,
} from '@/domain/dosing';
import {daysPastDate} from '@/domain/expiry';
import {nextBatchToOpen, totalAvailable} from '@/domain/fefo';
import {formatQuantity} from '@/domain/quantity';
import {projectRunOut, scheduleDailyRate} from '@/domain/runout';
import {
    getActiveDoseSchedules,
    getBatchesForProducts,
    getTakenOccurrences,
    type DoseScheduleBoardRow,
} from '@/lib/queries';
import {confirmDose, undoDose} from '../actions';

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
        else byMember.set(schedule.memberId, {name: schedule.memberName, schedules: [schedule]});
    }

    // Summed per product, not per schedule — two people can share one
    // medication, and the cupboard runs out for both of them at once.
    const productDailyRate = new Map<number, number>();
    for (const schedule of schedules) {
        productDailyRate.set(
            schedule.productId,
            (productDailyRate.get(schedule.productId) ?? 0) + scheduleDailyRate(schedule),
        );
    }

    return (
        <div className="mx-auto w-full max-w-2xl">
            <header className="mb-4 flex items-baseline justify-between gap-3">
                <h1 className="text-2xl font-semibold tracking-tight" test-data="doses-title">Doses</h1>
                <Link
                    href="/household"
                    className={LINK_BUTTON}
                    test-data="manage-people-btn"
                    style={toneStyle('accent')}>
                    Manage people
                </Link>
            </header>

            {byMember.size === 0 ? (
                <div
                    className="rounded-2xl border border-dashed p-8 text-center text-sm"
                    style={{borderColor: 'var(--border)', color: 'var(--muted)'}}
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
                <ul className="flex flex-col gap-3" test-data="main-doses-list">
                    {[...byMember.entries()].map(([memberId, group]) => (
                            <li
                                key={memberId}
                                test-data={group.name.replace(/\s/g, "").toLowerCase() + "-card"}
                                className="rounded-2xl border p-3"
                                style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
                            >
                                <Link
                                    href={`/household/${memberId}`}
                                    className="mb-2 inline-block text-base font-semibold"
                                >
                                    {group.name}
                                </Link>

                                <ul
                                    className="flex flex-col gap-2"
                                    test-data={group.name.replace(/\s/g, "").toLowerCase() + "-sublist"}>
                                    {group.schedules.map((schedule) => {
                                        const window = {
                                            startDate: schedule.startDate,
                                            endDate: schedule.endDate,
                                            intervalDays: schedule.intervalDays,
                                        };
                                        /*
                                         * A three-day window shows nothing at all for a weekly dose on
                                         * four days out of seven, which reads as broken rather than as
                                         * "not today". Widen it past one full interval so the last
                                         * dosing day is always on screen.
                                         */
                                        const dates = recentScheduleDates(
                                            window,
                                            today,
                                            Math.max(HISTORY_DAYS, schedule.intervalDays + 1),
                                        );
                                        const dueToday = dates.includes(today);
                                        const nextDue = dueToday ? null : nextDueDate(window, today);
                                        const stock = stockByProduct.get(schedule.productId) ?? [];
                                        const available = totalAvailable(stock, today);
                                        const outOfStock = available <= 0;

                                        /*
                                         * "Nothing to take" and "nothing we are willing to take" look
                                         * identical on a disabled pill, and the second one is the more
                                         * confusing of the two — the box is right there in the
                                         * cupboard. Say which it is.
                                         */
                                        const onlyPastDate =
                                            outOfStock &&
                                            stock.some((b) => b.status === 'in_stock' && b.quantityRemaining > 0);

                                        /*
                                         * The grace window is set once, on the product, months before
                                         * this tap. Saying so here is the whole point: taking a dose
                                         * from a box three weeks past its date should be a visible
                                         * choice, not something the app quietly decided earlier.
                                         */
                                        const nextBox = nextBatchToOpen(stock, today);
                                        const pastDateDays = nextBox
                                            ? daysPastDate(
                                                {
                                                    expiryDate: nextBox.expiryDate,
                                                    precision: nextBox.expiryPrecision,
                                                    hasExpiry: nextBox.hasExpiry,
                                                    graceDays: nextBox.expiryGraceDays,
                                                },
                                                today,
                                            )
                                            : null;

                                        const projection = projectRunOut(
                                            available,
                                            productDailyRate.get(schedule.productId) ?? scheduleDailyRate(schedule),
                                            today,
                                        );

                                        return (
                                            <li
                                                key={schedule.scheduleId}
                                                className="rounded-xl border p-2.5"
                                                test-data={"schedule-" + schedule.scheduleId}
                                                style={{borderColor: 'var(--border)'}}
                                            >
                                                <p className="text-sm font-medium">
                                                    {schedule.productName}
                                                    {schedule.productStrength ? (
                                                        <span className="font-normal" style={{color: 'var(--muted)'}}>
                            {' '}
                                                            {schedule.productStrength}
                          </span>
                                                    ) : null}
                                                </p>
                                                <p className="mb-2 flex flex-wrap items-center gap-1.5 text-xs"
                                                   style={{color: 'var(--muted)'}}>
                        <span>
                          {formatQuantity(schedule.doseUnits, schedule.unitName)} ·{' '}
                            {formatDoseCadence(schedule.timesPerDay, schedule.intervalDays)}
                        </span>
                                                    <RunOutBadge projection={projection}/>
                                                    {/* Nothing due today is information, not an empty state. */}
                                                    {nextDue !== null ? (
                                                        <span className="shrink-0">next {dayLabel(nextDue, today)}</span>
                                                    ) : null}
                                                    {schedule.productArchivedAt !== null ? (
                                                        <span
                                                            className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium"
                                                            style={{background: 'var(--color-warning)', color: 'black'}}
                                                            title="This product is archived but the dose is still running. Either restore the product or stop the dose — right now the two disagree."
                                                        >
                            archived product
                          </span>
                                                    ) : null}
                                                    {pastDateDays !== null ? (
                                                        <span
                                                            className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
                                                            style={{background: 'var(--color-warning)', color: 'black'}}
                                                            title={`The next dose comes out of a box ${pastDateDays} days past its printed date, which this product still allows. Bin that box from Expiring if you would rather not.`}
                                                        >
                            from a box {pastDateDays} days past date
                          </span>
                                                    ) : null}
                                                </p>

                                                <div className="flex flex-col gap-1.5"
                                                     test-data={"doses-dates-" + schedule.scheduleId}>
                                                    {dates.map((date) => {
                                                        const takenHere =
                                                            taken.get(`${schedule.scheduleId}:${date}`) ?? new Set<number>();
                                                        return (
                                                            <div key={date} className="flex flex-wrap items-center gap-1.5"
                                                                 test-data={"doses-date-" + schedule.scheduleId}>
                              <span
                                  className="w-14 shrink-0 text-xs tabular-nums"
                                  style={{color: 'var(--muted)'}}
                              >
                                {dayLabel(date, today)}
                              </span>
                                                                {Array.from({length: schedule.timesPerDay}, (_, i) => i + 1).map(
                                                                    (occurrence) => (
                                                                        <DosePill
                                                                            key={occurrence}
                                                                            scheduleId={schedule.scheduleId}
                                                                            date={date}
                                                                            occurrence={occurrence}
                                                                            status={doseOccurrenceStatus(occurrence, date, today, takenHere)}
                                                                            showNumber={schedule.timesPerDay > 1}
                                                                            outOfStock={outOfStock}
                                                                            onlyPastDate={onlyPastDate}
                                                                        />
                                                                    ),
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </li>
                                        )
                                            ;
                                    })}
                                </ul>
                            </li>
                        )
                    )
                    }
                </ul>
            )}
        </div>
    );
}

function dayLabel(date: string, today: string): string {
    if (date === today) return 'Today';
    if (date === addDays(today, -1)) return 'Yesterday';
    // Forward-looking now that infrequent schedules say when they are next due.
    if (date === addDays(today, 1)) return 'tomorrow';
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
                      onlyPastDate,
                  }: {
    scheduleId: number;
    date: string;
    occurrence: number;
    status: DoseStatus;
    showNumber: boolean;
    outOfStock: boolean;
    /** Stock exists, but all of it is past what the product tolerates. */
    onlyPastDate: boolean;
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
                title={
                    outOfStock && !taken
                        ? onlyPastDate
                            ? 'The only stock left is too far past its date to use — bin it from Expiring and add a new box'
                            : 'No stock to confirm this from'
                        : undefined
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border text-xs"
                style={{borderColor: 'var(--border)', color: 'var(--muted)', opacity: 0.4}}
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
        <form action={taken ? undoDose : confirmDose} test-data="single-dose">
            <input type="hidden" name="scheduleId" value={scheduleId}/>
            <input type="hidden" name="date" value={date}/>
            <input type="hidden" name="occurrence" value={occurrence}/>
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
