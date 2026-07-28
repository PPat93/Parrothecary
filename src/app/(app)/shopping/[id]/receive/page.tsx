import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getShoppingItem } from '@/lib/queries';
import { ReceiveForm } from './receive-form';

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getShoppingItem(Number(id));

  if (!item) notFound();

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Add to stock</h1>
        <Link href="/shopping" className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>

      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        {item.quantityPacks} × {item.name}
        {item.strength ? ` ${item.strength}` : ''} — fill in what the box actually says and it
        becomes a real box in the cupboard.
      </p>

      <ReceiveForm item={item} />
    </div>
  );
}
