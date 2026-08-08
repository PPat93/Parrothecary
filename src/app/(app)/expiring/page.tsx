import Link from 'next/link';
import {ConfirmButton} from '@/components/confirm-button';
import {ExpiryBadge} from '@/components/expiry-badge';
import {differenceInDays, todayIso} from '@/domain/date';
import {DEFAULT_THRESHOLDS, daysUntilExpiry, expiryStatus, type ExpiryStatus} from '@/domain/expiry';
import {formatQuantity} from '@/domain/quantity';
import {formatMoney, money} from '@/domain/money';
import {getExpiringStock, getTripOptions, getWaste, summariseWaste, toExpiryInput, type StockRow, type TripOption} from '@/lib/queries';
import {setBatchStatus} from '../actions';

const SECTIONS: { status: ExpiryStatus; title: string; blurb: string }[] = [
    {
        status: 'expired',
        title: 'Expired',
        blurb: 'Past its date and past what it tolerates — bin it and record the waste.',
    },
    {
        status: 'in_grace',
        title: 'Past date, still in use',
        blurb:
            'Doses are still being taken from these. Bin one early whenever you would rather not use it.',
    },
    {
        status: 'critical',
        title: 'Going soon',
        // Replaced at render time: the sentence depends on when the next
        // restock actually is. See criticalBlurb.
        blurb: 'Less than two months left.',
    },
    {status: 'warning', title: 'Watch', blurb: 'Use these before buying more.'},
    {
        status: 'unknown',
        title: 'No date recorded',
        blurb:
            'These expire, but nobody wrote down when. Until a date is added they cannot be warned about — the pencil adds one.',
    },
];

/**
 * "Going soon" is a fixed sixty days, but the sentence under it used to claim
 * these boxes would not survive until the next restock trip — which the
 * threshold knows nothing about. With a trip twenty days out, a box with fifty
 * days left survives it comfortably and the page was simply wrong.
 *
 * The threshold stays fixed; only the claim is checked. Naming the trip is
 * worth more than the generic line, so it is named whenever it is true.
 */
function criticalBlurb(nextRestock: TripOption | null, today: string): string {
    if (nextRestock === null) return 'Less than two months left, and no restock trip is planned.';

    const days = differenceInDays(today, nextRestock.collectionDate);
    return days > DEFAULT_THRESHOLDS.criticalDays
        ? `Will not last until ${nextRestock.label} on ${nextRestock.collectionDate}.`
        : `Less than two months left — though ${nextRestock.label} on ${nextRestock.collectionDate} comes first.`;
}

export default async function ExpiringPage() {
    const today = todayIso();
    const [rows, waste, tripOptions] = await Promise.all([
        getExpiringStock(),
        getWaste(),
        getTripOptions(),
    ]);

    // The soonest restock still ahead of us. Past planned trips are somebody
    // forgetting to close one out, and cannot be what stock is measured against.
    const nextRestock = tripOptions.find((t) => t.collectionDate >= today) ?? null;

    /*
     * Two different things, deliberately not added together.
     *
     * A sealed box that expired is money thrown away: it was bought, never
     * touched, and binned. That is the figure worth trying to reduce.
     *
     * A box that was opened is not. Half a bottle of liquid plaster left at its
     * expiry date did its job on the wounds it was opened for, and the leftover
     * was never avoidable — that size was the smallest one sold. Calling that
     * "waste" would be arithmetically true and practically a lie, and it would
     * make the honest number next to it easy to ignore.
     *
     * The split itself lives in `summariseWaste` and is shared with the Money
     * page — it is exactly the kind of rule that drifts once there are two
     * copies. It stays on screen here as well as there because this is where
     * the bin button is.
     */
    const summary = summariseWaste(waste);
    const uncosted = summary.uncostedBoxes;
    const neverOpened = summary.neverOpenedBoxes;
    const opened = summary.openedBoxes;
    const thrownAway = money(summary.thrownAwayMinorEur, 'EUR');
    const leftInOpened = money(summary.leftInOpenedMinorEur, 'EUR');

    const byStatus = new Map<ExpiryStatus, StockRow[]>();
    for (const row of rows) {
        const status = expiryStatus(toExpiryInput(row), today);
        byStatus.set(status, [...(byStatus.get(status) ?? []), row]);
    }

    const anything = SECTIONS.some((s) => (byStatus.get(s.status) ?? []).length > 0);

    return (
        <div className="mx-auto w-full max-w-2xl">
            <h1 className="mb-4 text-2xl font-semibold tracking-tight" test-data="expiring-title">Expiring</h1>

            {!anything ? (
                <div
                    className="rounded-2xl border border-dashed p-8 text-center text-sm"
                    style={{borderColor: 'var(--border)', color: 'var(--muted)'}}
                >
                    Nothing expiring in the next six months.
                </div>
            ) : (
                <div className="flex flex-col gap-6" test-data="main-expiring-groups">
                    {SECTIONS.map((section) => {
                        const items = byStatus.get(section.status) ?? [];
                        if (items.length === 0) return null;

                        return (
                            <section key={section.status} test-data={section.title.replace(/\s/g, "").toLowerCase()}>
                                <h2 className="text-sm font-semibold uppercase tracking-wide" test-data="section-title">{section.title}</h2>
                                <p className="mb-2 text-xs" style={{color: 'var(--muted)'}} test-data="section-description">
                                    {section.status === 'critical' ? criticalBlurb(nextRestock, today) : section.blurb}
                                </p>

                                <ul className="flex flex-col gap-2">
                                    {items.map((row) => {
                                        const days = daysUntilExpiry(toExpiryInput(row), today);

                                        return (
                                            <li
                                                key={row.batchId}
                                                className="flex items-center gap-2 rounded-xl border p-3"
                                                style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
                                            >
                                                <ExpiryBadge today={today} input={toExpiryInput(row)}/>

                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">
                                                        {/* This screen used to be a dead end: it could
                              only bin. But "should I throw this away" is
                              usually answered somewhere else — how much is
                              left elsewhere, whether anything is still
                              scheduled on it. So the name goes where the
                              rest of the app sends it. */}
                                                        <Link href={`/products/${row.productId}`}
                                                              className="hover:underline">
                                                            {row.name}
                                                        </Link>
                                                        {row.strength ? (
                                                            <span className="font-normal"
                                                                  style={{color: 'var(--muted)'}}>
                                {' '}
                                                                {row.strength}
                              </span>
                                                        ) : null}
                                                        {row.productArchivedAt !== null ? (
                                                            <span
                                                                className="ml-2 inline-flex shrink-0 items-center rounded-md px-2 py-0.5 align-middle text-xs font-medium"
                                                                test-data="archived-product"
                                                                style={{
                                                                    background: 'var(--color-warning)',
                                                                    color: 'black'
                                                                }}
                                                                title="This product is archived — what is here is what is left. It still expires."
                                                            >
                                archived
                              </span>
                                                        ) : null}
                                                    </p>
                                                    <p className="text-xs tabular-nums" style={{color: 'var(--muted)'}}>
                                                        {formatQuantity(row.quantityRemaining, row.unitName, row.packSize)}
                                                        {days !== null
                                                            ? days < 0
                                                                ? ` · ${Math.abs(days)} days ago`
                                                                : ` · ${days} days left`
                                                            : null}
                                                    </p>
                                                </div>

                                                {/* The date is the whole reason a row is here, and a
                            wrong or missing one is corrected on the box.
                            Without this the "No date recorded" section could
                            only tell you to go and find the box yourself. */}
                                                <Link
                                                    href={`/stock/${row.batchId}/edit?from=expiring`}
                                                    aria-label={`Correct the date on this box of ${row.name}`}
                                                    title="Correct this box"
                                                    className="is-action flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border"
                                                    style={{borderColor: 'var(--border)', color: 'var(--muted)'}}
                                                >
                                                    <svg
                                                        aria-hidden
                                                        viewBox="0 0 24 24"
                                                        width="16"
                                                        height="16"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="1.9"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    >
                                                        <path d="M12 20h9"/>
                                                        <path
                                                            d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                                                    </svg>
                                                </Link>

                                                <form action={setBatchStatus}>
                                                    <input type="hidden" name="id" value={row.batchId}/>
                                                    <input
                                                        type="hidden"
                                                        name="status"
                                                        value={section.status === 'expired' ? 'expired' : 'discarded'}
                                                    />
                                                    <ConfirmButton
                                                        label="Binned"
                                                        title="Bin this box?"
                                                        message={`${row.name} — ${formatQuantity(row.quantityRemaining, row.unitName, row.packSize)} will leave your stock and be recorded as waste. Nothing is deleted: if this was a mistake, the product page can put the box back.`}
                                                        confirmLabel="Yes, bin it"
                                                        tone="critical"
                                                    />
                                                </form>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            )}

            {neverOpened > 0 || opened > 0 || uncosted > 0 ? (
                <div
                    className="mt-6 rounded-2xl border p-4 text-sm"
                    style={{borderColor: 'var(--border)'}}
                    test-data="binned-summary"
                >
                    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" test-data="binned-summary-title">Binned so far</h2>

                    {neverOpened > 0 ? (
                        <p style={{color: 'var(--muted)'}} test-data="money-wasted">
              <span style={{color: 'var(--color-critical)'}}>
                {formatMoney(thrownAway, {showCurrency: true})}
              </span>{' '}
                            in {neverOpened} {neverOpened === 1 ? 'box' : 'boxes'} never opened —
                            bought and binned without being used. This is the number worth pushing down.
                        </p>
                    ) : (
                        <p style={{color: 'var(--muted)'}} test-data="money-wasted">
                            Nothing has been binned unopened. That is the figure that would mean money wasted,
                            and it is zero.
                        </p>
                    )}

                    {opened > 0 ? (
                        <p className="mt-2" style={{color: 'var(--muted)'}} test-data="not-wasted">
                            A further {formatMoney(leftInOpened, {showCurrency: true})} was left in{' '}
                            {opened} opened {opened === 1 ? 'pack' : 'packs'}. Not really waste:
                            they were opened because they were needed, and you cannot buy half a bottle.
                        </p>
                    ) : null}

                    {uncosted > 0 ? (
                        <p className="mt-2 text-xs" style={{color: 'var(--muted)'}} test-data="uncosted-waste">
                            {uncosted} binned {uncosted === 1 ? 'box has' : 'boxes have'} a złoty price with no
                            exchange rate recorded, so {uncosted === 1 ? 'it is' : 'they are'} not in either
                            figure. Add the rate by editing the box.
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
