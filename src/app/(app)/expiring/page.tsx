import {ConfirmButton} from '@/components/confirm-button';
import {ExpiryBadge} from '@/components/expiry-badge';
import {todayIso} from '@/domain/date';
import {daysUntilExpiry, expiryStatus, type ExpiryStatus} from '@/domain/expiry';
import {formatQuantity} from '@/domain/quantity';
import {formatMoney, money, sumMoney, toEur, unusedValue} from '@/domain/money';
import {getExpiringStock, getWaste, toExpiryInput, type StockRow} from '@/lib/queries';
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
        blurb: 'Will not survive until the next restock trip.',
    },
    {status: 'warning', title: 'Watch', blurb: 'Use these before buying more.'},
];

export default async function ExpiringPage() {
    const today = todayIso();
    const [rows, waste] = await Promise.all([getExpiringStock(), getWaste()]);

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
     * Both are costed on the unused portion only, converted at the rate recorded
     * when each was bought, and both live on this page rather than in some
     * statistics view because this is where the bin button is.
     */
    const priced = waste.filter((row) => row.priceMinor !== null && row.currency !== null);
    const valueOf = (rows: typeof priced) =>
        sumMoney(
            rows.map((row) =>
                toEur(
                    unusedValue(money(row.priceMinor!, row.currency!), row.packSize, row.quantityRemaining),
                    row.fxRateToEur,
                ),
            ),
            'EUR',
        );

    const neverOpened = priced.filter((row) => row.openedAt === null);
    const opened = priced.filter((row) => row.openedAt !== null);
    const thrownAway = valueOf(neverOpened);
    const leftInOpened = valueOf(opened);

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
                                <h2 className="text-sm font-semibold uppercase tracking-wide">{section.title}</h2>
                                <p className="mb-2 text-xs" style={{color: 'var(--muted)'}}>
                                    {section.blurb}
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
                                                        {row.name}
                                                        {row.strength ? (
                                                            <span className="font-normal"
                                                                  style={{color: 'var(--muted)'}}>
                                {' '}
                                                                {row.strength}
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
                                                        message={`${row.name} — ${formatQuantity(row.quantityRemaining, row.unitName, row.packSize)} will leave your stock and be recorded as waste. Nothing is deleted.`}
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

            {priced.length > 0 ? (
                <div
                    className="mt-6 rounded-2xl border p-4 text-sm"
                    style={{borderColor: 'var(--border)'}}
                    test-data="binned-summary"
                >
                    <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">Binned so far</h2>

                    {neverOpened.length > 0 ? (
                        <p style={{color: 'var(--muted)'}}>
              <span style={{color: 'var(--color-critical)'}}>
                {formatMoney(thrownAway, {showCurrency: true})}
              </span>{' '}
                            in {neverOpened.length} {neverOpened.length === 1 ? 'box' : 'boxes'} never opened —
                            bought and binned without being used. This is the number worth pushing down.
                        </p>
                    ) : (
                        <p style={{color: 'var(--muted)'}}>
                            Nothing has been binned unopened. That is the figure that would mean money wasted,
                            and it is zero.
                        </p>
                    )}

                    {opened.length > 0 ? (
                        <p className="mt-2" style={{color: 'var(--muted)'}}>
                            A further {formatMoney(leftInOpened, {showCurrency: true})} was left in{' '}
                            {opened.length} opened {opened.length === 1 ? 'pack' : 'packs'}. Not really waste:
                            they were opened because they were needed, and you cannot buy half a bottle.
                        </p>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
