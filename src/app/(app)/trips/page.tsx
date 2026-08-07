import Link from 'next/link';
import {LINK_BUTTON, toneStyle} from '@/components/tone';
import {TripUrgencyBadge} from '@/components/trip-urgency-badge';
import {todayIso} from '@/domain/date';
import {formatMoney, money} from '@/domain/money';
import {getTrips} from '@/lib/queries';

export default async function TripsPage() {
    const today = todayIso();
    const trips = await getTrips();

    const planned = trips.filter((t) => t.status === 'planned');
    // Soonest-first is right for what is coming; for what is done, the most
    // recent is the one you actually want to look back at.
    const completed = trips.filter((t) => t.status === 'completed').reverse();

    return (
        <div className="mx-auto w-full max-w-2xl">
            <header className="mb-1 flex items-baseline justify-between">
                <h1 className="text-2xl font-semibold tracking-tight" test-data="trips-title">Trips</h1>
                <Link href="/trips/new" className={LINK_BUTTON} test-data="new-trip-btn" style={toneStyle('accent')}>
                    New trip
                </Link>
            </header>

            <p className="mb-5 text-sm" style={{color: 'var(--muted)'}} test-data="trips-description">
                Two or three restocks a year. What matters is the order deadline, not the flight — most of
                it is bought online and shipped ahead, to be collected on arrival.
            </p>

            {trips.length === 0 ? (
                <div
                    className="rounded-2xl border border-dashed p-8 text-center text-sm"
                    style={{borderColor: 'var(--border)', color: 'var(--muted)'}}
                >
                    <p>No trips planned.</p>
                    <p className="mt-2">
                        Add the next one and the shopping list gets a deadline to work back from.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-6" test-data="main-trips-groups">
                    {planned.length > 0 ? (
                        <Section title="Planned" trips={planned} today={today}/>
                    ) : null}
                    {completed.length > 0 ? (
                        <Section title="Done" trips={completed} today={today}/>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function Section({
                     title,
                     trips,
                     today,
                 }: {
    title: string;
    trips: Awaited<ReturnType<typeof getTrips>>;
    today: string;
}) {
    return (
        <section test-data={title.toLowerCase() + "-section"} title="Trips section">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide" test-data="trips-section-title">{title}</h2>
            <ul className="flex flex-col gap-2">
                {trips.map((trip) => (
                    <li key={trip.id}>
                        <Link
                            href={`/trips/${trip.id}`}
                            className="flex items-center gap-3 rounded-xl border p-3"
                            style={{background: 'var(--surface)', borderColor: 'var(--border)'}}
                        >
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-medium">{trip.label}</p>
                                <p className="text-xs tabular-nums" style={{color: 'var(--muted)'}}>
                                    {/* A restock is collected on a day; a holiday spans them. */}
                                    {trip.kind === 'travel'
                                        ? `away ${trip.collectionDate} → ${trip.returnDate ?? '?'}`
                                        : `collect ${trip.collectionDate}`}
                                    {trip.itemCount > 0
                                        ? ` · ${trip.itemCount} ${trip.itemCount === 1 ? 'item' : 'items'}`
                                        : ' · nothing on the list yet'}
                                    {trip.spentMinorEur > 0
                                        ? ` · ${formatMoney(money(trip.spentMinorEur, 'EUR'), {showCurrency: true})}`
                                        : ''}
                                    {/* At least this much: some boxes have no rate to convert. */}
                                    {trip.uncostedBoxes > 0 ? (
                                        <span
                                            title={`${trip.uncostedBoxes} ${trip.uncostedBoxes === 1 ? 'box is' : 'boxes are'} priced in złoty with no exchange rate recorded, so ${trip.uncostedBoxes === 1 ? 'it is' : 'they are'} not in this figure.`}
                                        >
                                            {trip.spentMinorEur > 0 ? '+' : ' · some costs unconverted'}
                                        </span>
                                    ) : null}
                                </p>
                            </div>

                            {/* Only a restock has an order deadline to miss. */}
                            {trip.status === 'planned' && trip.kind !== 'travel' ? (
                                <TripUrgencyBadge orderByDate={trip.orderByDate} today={today}/>
                            ) : null}

                            <span aria-hidden style={{color: 'var(--muted)'}}>
                ›
              </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
}
