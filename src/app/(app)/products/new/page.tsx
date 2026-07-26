import Link from 'next/link';
import { ProductForm } from './product-form';

export default function NewProductPage() {
  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
        <Link href="/products" className="text-sm underline underline-offset-4">
          Cancel
        </Link>
      </header>
      <ProductForm />
    </div>
  );
}
