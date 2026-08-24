import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getTrip } from '@/lib/queries';
import { TripForm } from '../../trip-form';

export default async function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await getTrip(Number(id));
  if (!trip) notFound();

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Edit trip</h1>
        <Link replace href={`/trips/${trip.id}`} className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>
      <TripForm trip={trip} />
    </div>
  );
}
