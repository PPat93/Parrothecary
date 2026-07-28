import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getManufacturers, getProduct } from '@/lib/queries';
import { EditProductForm } from './edit-form';

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, manufacturers] = await Promise.all([
    getProduct(Number(id)),
    getManufacturers(),
  ]);

  if (!product) notFound();

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Edit product</h1>
        <Link href={`/products/${product.id}`} className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>

      <p
        className="mb-4 rounded-xl border p-3 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        Pack sizes and active substances are not edited here. A pack size has boxes and past
        purchases recorded against it, so changing it would rewrite what those numbers meant —
        manage them on the{' '}
        <Link href={`/products/${product.id}`} className="underline underline-offset-4">
          product page
        </Link>{' '}
        instead, where you can add a new pack size alongside the old one.
      </p>

      <EditProductForm product={product} manufacturers={manufacturers} />
    </div>
  );
}
