import Link from 'next/link';
import { notFound } from 'next/navigation';
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
        <Link href={`/products/${product.id}`} className="shrink-0 text-sm underline underline-offset-4">
          Cancel
        </Link>
      </header>

      <EditProductForm product={product} manufacturers={manufacturers} />
    </div>
  );
}
