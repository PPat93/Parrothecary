import Link from 'next/link';
import { getManufacturers, getSubstanceNames } from '@/lib/queries';
import { ProductForm } from './product-form';

export default async function NewProductPage() {
  const [manufacturers, substanceNames] = await Promise.all([
    getManufacturers(),
    getSubstanceNames(),
  ]);

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
        <Link href="/products" className="text-sm underline underline-offset-4">
          Cancel
        </Link>
      </header>
      <ProductForm manufacturers={manufacturers} substanceNames={substanceNames} />
    </div>
  );
}
