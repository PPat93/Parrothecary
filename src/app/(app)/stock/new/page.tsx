import Link from 'next/link';
import { getVariantOptions } from '@/lib/queries';
import { BatchForm } from './batch-form';

export default async function NewBatchPage() {
  const variants = await getVariantOptions();

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Add box</h1>
        <Link href="/" className="text-sm underline underline-offset-4">
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
        <BatchForm variants={variants} />
      )}
    </div>
  );
}
