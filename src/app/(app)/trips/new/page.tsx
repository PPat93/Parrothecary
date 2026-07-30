import Link from 'next/link';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { TripForm } from '../trip-form';

export default function NewTripPage() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New trip</h1>
        <Link href="/trips" className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>
      <TripForm />
    </div>
  );
}
