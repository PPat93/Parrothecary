import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getShoppingItem } from '@/lib/queries';
import { ReceiveForm } from './receive-form';

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getShoppingItem(Number(id));

  if (!item) notFound();

  // Settled lines have already produced their box, or explicitly never will.
  // Offering the form again is how you end up with the same delivery in stock
  // twice; the server refuses it too, this just stops it being offered.
  const settled = item.status === 'in_stock' || item.status === 'not_received';

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Add to stock</h1>
        <Link href="/shopping" className={LINK_BUTTON} style={toneStyle('warning')}>
          {settled ? 'Back' : 'Cancel'}
        </Link>
      </header>

      {settled ? (
        <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
          {item.quantityPacks} × {item.name}
          {item.strength ? ` ${item.strength}` : ''}{' '}
          {item.status === 'in_stock'
            ? 'is already in the cupboard — this line was received earlier. Receiving it again would add a second box that never existed.'
            : 'is marked as never arrived, so nothing was added to stock. Move it back into the flow on the shopping list if that was wrong.'}
        </p>
      ) : (
        <>
          <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
            {item.quantityPacks} × {item.name}
            {item.strength ? ` ${item.strength}` : ''} — fill in what the box actually says and it
            becomes a real box in the cupboard.
          </p>

          <ReceiveForm item={item} />
        </>
      )}
    </div>
  );
}
