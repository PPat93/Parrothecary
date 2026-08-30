import Link from 'next/link';
import {ActionButton, type Tone} from '@/components/action-button';
import {ConfirmButton} from '@/components/confirm-button';
import {SHOPPING_STATUSES, TERMINAL_SHOPPING_STATUSES} from '@/db/schema';
import {getShoppingList, getTripOptions, getVariantOptions, type ShoppingRow} from '@/lib/queries';
import {shortDeliveryNote} from '@/lib/labels';
import {removeShoppingItem, setShoppingStatus} from '../actions';
import {AddShoppingForm} from './add-form';

/**
 * Most stock is ordered online ahead of a trip and collected on arrival, so an
 * item moves through several states rather than being simply ticked off.
 * The last two are settled: they only get cleared, never moved back.
 */
const STAGES: { status: (typeof SHOPPING_STATUSES)[number]; title: string; blurb: string }[] = [
    {status: 'to_buy', title: 'To buy', blurb: 'Not ordered yet.'},
    {status: 'ordered', title: 'Ordered', blurb: 'Placed online, on its way.'},
    {status: 'arrived', title: 'Arrived', blurb: 'Waiting at family — collect on the trip.'},
    {
        status: 'in_stock',
        title: 'In the cupboard',
        /*
         * This used to say "clear the line when you no longer need it", which
         * invited the one action on this page that quietly destroys something.
         * A box carries no trip of its own: the only thing tying it to the
         * restock it came on is this line, so clearing one takes its cost out
         * of that trip's total — while the yearly figures, which read the boxes
         * directly, carry on counting it. Two screens, two answers, no warning.
         */
        blurb:
            'Added to stock. Each of these still ties its box to the trip it came on, which is how that trip knows what it cost — so they are worth keeping.',
    },
    {
        status: 'not_received',
        title: "Didn't arrive",
        blurb: 'Damaged, lost or cancelled. Nothing was added to stock.',
    },
];

/** Stages that can still be moved forward or back. */
const ACTIVE_STAGES = STAGES.filter((s) => !TERMINAL_SHOPPING_STATUSES.some((t) => t === s.status));

export default async function ShoppingPage() {
    const [items, variants, trips] = await Promise.all([
        getShoppingList(),
        getVariantOptions(),
        getTripOptions(),
    ]);

    const byStatus = new Map<string, ShoppingRow[]>();
    for (const item of items) {
        byStatus.set(item.status, [...(byStatus.get(item.status) ?? []), item]);
    }

    return (
        <div className="mx-auto w-full max-w-2xl">
            <h1 className="mb-4 text-2xl font-semibold tracking-tight" test-data="shopping-title">Shopping</h1>

            {variants.length === 0 ? (
                <div
                    className="rounded-2xl border border-dashed p-8 text-center text-sm"
                    style={{borderColor: 'var(--border)', color: 'var(--muted)'}}
                    test-data='explainer-section'
                >
                    Add a{' '}
                    <Link href="/products/new" className="underline underline-offset-4">
                        product with a pack size
                    </Link>{' '}
                    before building a list.
                </div>
            ) : (
                <details
                    test-data="add-shopping-item"
                    className="mb-6 rounded-2xl border p-3"
                    style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
                >
                    <summary className="cursor-pointer text-sm font-medium">Add an item</summary>
                    <div className="mt-3">
                        <AddShoppingForm variants={variants} trips={trips}/>
                    </div>
                </details>
            )}

            <div className="flex flex-col gap-6" test-data="main-shopping-groups">
                {STAGES.map((stage) => {
                    const stageItems = byStatus.get(stage.status) ?? [];
                    if (stageItems.length === 0) return null;

                    // Settled items have nowhere to go: no forward hop, no way back.
                    const settled = TERMINAL_SHOPPING_STATUSES.some((t) => t === stage.status);
                    const activeIndex = ACTIVE_STAGES.findIndex((s) => s.status === stage.status);
                    const next = settled ? undefined : ACTIVE_STAGES[activeIndex + 1];
                    const previous = settled ? undefined : ACTIVE_STAGES[activeIndex - 1];
                    // Nothing has been ordered yet at "to buy", so it cannot fail to arrive.
                    const canFailToArrive = stage.status === 'ordered' || stage.status === 'arrived';

                    return (
                        <section key={stage.status} test-data={stage.title.replace(/\s/g, "").toLowerCase()} title="Shopping section">
                            <h2 className="text-sm font-semibold uppercase tracking-wide" test-data="section-title">
                                {stage.title}{' '}
                                <span className="font-normal tabular-nums" style={{color: 'var(--muted)'}}>
                  {stageItems.length}
                </span>
                            </h2>
                            <p className="mb-2 text-xs" style={{color: 'var(--muted)'}} test-data="section-description">
                                {stage.blurb}
                            </p>

                            <ul className="flex flex-col gap-2">
                                {stageItems.map((item) => (
                                    <li
                                        key={item.id}
                                        // Wraps because a row can carry three actions on a phone.
                                        className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
                                        style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium break-words">
                                                {item.quantityPacks} × {item.name}
                                                {item.strength ? (
                                                    <span className="font-normal" style={{color: 'var(--muted)'}}>
                            {' '}
                                                        {item.strength}
                          </span>
                                                ) : null}
                                                {/* Archiving does not clear open lines — say so rather
                            than let a retired product be bought again. */}
                                                {item.productArchivedAt !== null ? (
                                                    <span
                                                        className="ml-2 inline-flex shrink-0 items-center rounded-md px-2 py-0.5 align-middle text-xs font-medium"
                                                        test-data="archived-product"
                                                        style={{background: 'var(--color-warning)', color: 'black'}}
                                                        title="This product is archived. It cannot be added to the list any more, and this line was here before that — clear it, or restore the product."
                                                    >
                            archived
                          </span>
                                                ) : null}
                                            </p>
                                            <p className="text-xs" style={{color: 'var(--muted)'}}>
                                                {item.packLabel ?? `${item.packSize} ${item.unitName}`}
                                                {/* Which restock this belongs to. Absent means bought
                            locally, which is a real answer, so it says so. */}
                                                {item.tripLabel ? (
                                                    <>
                                                        {' · '}
                                                        <Link
                                                            href={`/trips/${item.tripId}`}
                                                            className="underline underline-offset-2"
                                                        >
                                                            {item.tripLabel}
                                                        </Link>
                                                    </>
                                                ) : (
                                                    ' · no trip'
                                                )}
                                            </p>
                                            {/* Said, not hidden: the line is settled, but not all of
                          it turned up, and the trip stopped counting the rest. */}
                                            {shortDeliveryNote(item.quantityPacks, item.packSize, item.receivedUnits, item.unitName) ? (
                                                <p
                                                    className="text-xs"
                                                    test-data="short-delivery"
                                                    style={{color: 'var(--color-warning)'}}
                                                >
                                                    {shortDeliveryNote(item.quantityPacks, item.packSize, item.receivedUnits, item.unitName)}
                                                </p>
                                            ) : null}
                                            {/* Own line, wrapping: notes are free text and get long. */}
                                            {item.notes ? (
                                                <p
                                                    className="mt-1 text-xs break-words whitespace-pre-line"
                                                    style={{color: 'var(--muted)'}}
                                                >
                                                    {item.notes}
                                                </p>
                                            ) : null}
                                        </div>

                                        <div className="flex shrink-0 items-center gap-2">
                                            {previous ? (
                                                <StatusButton
                                                    id={item.id}
                                                    status={previous.status}
                                                    label="←"
                                                    title={`Back to ${previous.title}`}
                                                    tone="neutral"
                                                />
                                            ) : null}

                                            {canFailToArrive ? (
                                                <form action={setShoppingStatus}>
                                                    <input type="hidden" name="id" value={item.id}/>
                                                    <input type="hidden" name="status" value="not_received"/>
                                                    <ConfirmButton
                                                        label="Didn't arrive"
                                                        title="Mark as not received?"
                                                        message={`${item.quantityPacks} × ${item.name} will be filed under "Didn't arrive" — damaged, lost or cancelled. Nothing is added to stock.`}
                                                        confirmLabel="Yes, it didn't arrive"
                                                        tone="critical"
                                                    />
                                                </form>
                                            ) : null}

                                            {/*
                        The last hop is not a status flip: collecting a pack means
                        a real box enters the cupboard, so it needs the expiry and
                        lot off the label. That is a form, not a button.
                      */}
                                            {stage.status === 'arrived' ? (
                                                <Link
                                                    href={`/shopping/${item.id}/receive`}
                                                    /*
                                                     * inline-flex + min-h matches the sibling <button>s:
                                                     * the global 44px tap-target rule only applies to
                                                     * buttons, so this link rendered visibly shorter.
                                                     */
                                                    className="inline-flex min-h-[44px] items-center rounded-lg border px-3 text-xs font-medium"
                                                    style={{
                                                        borderColor: 'var(--color-accent)',
                                                        color: 'var(--color-accent)',
                                                    }}
                                                >
                                                    Add to stock
                                                </Link>
                                            ) : next ? (
                                                <StatusButton
                                                    id={item.id}
                                                    status={next.status}
                                                    label={next.title}
                                                    title={`Move to ${next.title}`}
                                                />
                                            ) : (
                                                <form action={removeShoppingItem}>
                                                    <input type="hidden" name="id" value={item.id}/>
                                                    <ConfirmButton
                                                        label="Clear"
                                                        title={
                                                            seversTripCost(item)
                                                                ? 'Clear this line and drop its cost from the trip?'
                                                                : 'Clear this line?'
                                                        }
                                                        message={
                                                            seversTripCost(item)
                                                                ? `${item.quantityPacks} × ${item.name} will be removed from the shopping list. The box itself stays in your stock — but this line is the only thing recording that it came on ${item.tripLabel}, so what it cost will drop out of that trip's total. The yearly figures keep it, so the two will stop agreeing.`
                                                                : stage.status === 'in_stock'
                                                                    ? `${item.quantityPacks} × ${item.name} will be removed from the shopping list. The box itself stays in your stock — only the line goes.`
                                                                    : `${item.quantityPacks} × ${item.name} will be removed from the shopping list.`
                                                        }
                                                        confirmLabel="Yes, clear it"
                                                        tone="critical"
                                                    />
                                                </form>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })}

                {items.length === 0 ? (
                    <div
                        className="rounded-2xl border border-dashed p-8 text-center text-sm"
                        style={{borderColor: 'var(--border)', color: 'var(--muted)'}}
                        test-data='empty-page-description'
                    >
                        Nothing on the list.
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function StatusButton({
                          id,
                          status,
                          label,
                          title,
                          tone = 'accent',
                      }: {
    id: number;
    status: string;
    label: string;
    title: string;
    tone?: Tone;
}) {
    return (
        <form action={setShoppingStatus}>
            <input type="hidden" name="id" value={id}/>
            <input type="hidden" name="status" value={status}/>
            <ActionButton tone={tone} title={title}>
                {label}
            </ActionButton>
        </form>
    );
}

/**
 * Would clearing this line take a box's cost out of a trip's total?
 *
 * A box has no trip of its own — the join runs trip → shopping line → box. So
 * the line is the only record that this box came on that restock, and deleting
 * it is the difference between "€30.70, 5 boxes" and "€25.77, 4 boxes" on the
 * trip page, with the yearly total unchanged because that reads the boxes
 * directly. Both conditions matter: a line with no box has no cost to lose, and
 * one bought locally has no trip to lose it from.
 */
function seversTripCost(item: ShoppingRow): boolean {
    return item.receivedBatchId !== null && item.tripId !== null;
}
