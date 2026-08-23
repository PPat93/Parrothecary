import Link from 'next/link';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getFxRateHistory, getVariantOptions } from '@/lib/queries';
import { BatchForm } from './batch-form';

export default async function NewBatchPage() {
  // Chosen against the date in the form, which the person can still change.
  const [variants, rateHistory] = await Promise.all([getVariantOptions(), getFxRateHistory()]);

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Add box</h1>
        <Link replace href="/" className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>

      {variants.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          <p>No packs defined yet.</p>
          <p className="mt-2">
            Add a{' '}
            <Link href="/products/new" className="underline underline-offset-4">
              product with a pack size
            </Link>{' '}
            first — a box has to be a box of something.
          </p>
        </div>
      ) : (
        <BatchForm variants={variants} rateHistory={rateHistory} />
      )}
    </div>
  );
}
