import Link from 'next/link';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getManufacturers, getSubstanceNames, getSymptomNames } from '@/lib/queries';
import { ProductForm } from './product-form';

export default async function NewProductPage() {
  const [manufacturers, substanceNames, symptomNames] = await Promise.all([
    getManufacturers(),
    getSubstanceNames(),
    getSymptomNames(),
  ]);

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
        {/* Amber, not red: cancelling backs out of a form, it does not destroy
            a record. Red is reserved for things that actually delete. */}
        <Link href="/products" className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>
      <ProductForm
        manufacturers={manufacturers}
        substanceNames={substanceNames}
        symptomNames={symptomNames}
      />
    </div>
  );
}
