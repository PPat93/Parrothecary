import Link from 'next/link';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { TripUrgencyBadge } from '@/components/trip-urgency-badge';
import { todayIso } from '@/domain/date';
import { formatMoney, money } from '@/domain/money';
import { getTrips } from '@/lib/queries';

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
        <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
        <Link href="/trips/new" className={LINK_BUTTON} style={toneStyle('accent')}>
          New trip
        </Link>
      </header>

      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        Two or three restocks a year. What matters is the order deadline, not the flight — most of
        it is bought online and shipped to family in Poland before the visit.
      </p>

      {trips.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <p>No trips planned.</p>
          <p className="mt-2">
            Add the next one and the shopping list gets a deadline to work back from.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {planned.length > 0 ? (
            <Section title="Planned" trips={planned} today={today} />
          ) : null}
          {completed.length > 0 ? (
            <Section title="Done" trips={completed} today={today} />
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
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      <ul className="flex flex-col gap-2">
        {trips.map((trip) => (
          <li key={trip.id}>
            <Link
              href={`/trips/${trip.id}`}
              className="flex items-center gap-3 rounded-xl border p-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{trip.label}</p>
                <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                  collect {trip.collectionDate}
                  {trip.itemCount > 0
                    ? ` · ${trip.itemCount} ${trip.itemCount === 1 ? 'item' : 'items'}`
                    : ' · nothing on the list yet'}
                  {trip.spentMinorEur > 0
                    ? ` · ${formatMoney(money(trip.spentMinorEur, 'EUR'), { showCurrency: true })}`
                    : ''}
                </p>
              </div>

              {trip.status === 'planned' ? (
                <TripUrgencyBadge orderByDate={trip.orderByDate} today={today} />
              ) : null}

              <span aria-hidden style={{ color: 'var(--muted)' }}>
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
