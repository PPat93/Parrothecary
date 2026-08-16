import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { getShoppingItem, getSuggestedFxRate } from '@/lib/queries';
import { ReceiveForm } from './receive-form';

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getShoppingItem(Number(id));

  if (!item) notFound();

  // The date the form will default to, so the rate offered belongs to the same
  // shopping run as the box being entered.
  const suggestedRate = await getSuggestedFxRate(item.tripCollectionDate);

  // Settled lines have already produced their box, or explicitly never will.
  // Offering the form again is how you end up with the same delivery in stock
  // twice; the server refuses it too, this just stops it being offered.
  const settled = item.status === 'in_stock' || item.status === 'not_received';

  /*
   * A retired product takes no new stock — the same rule the stock form and
   * `receiveShoppingItem` apply. Shown rather than left to the submit button,
   * because filling in the expiry, price and lot off a real box only to be told
   * no is the version of this that wastes your time.
   */
  const retired = !settled && item.productArchivedAt !== null;

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Add to stock</h1>
        <Link href="/shopping" className={LINK_BUTTON} style={toneStyle('warning')}>
          {settled || retired ? 'Back' : 'Cancel'}
        </Link>
      </header>

      {retired ? (
        <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
          {item.quantityPacks} × {item.name}
          {item.strength ? ` ${item.strength}` : ''} cannot be added: this product has been
          archived, so nothing more of it enters the cupboard. Restore it from its product page if
          this delivery is real, or clear the line on the shopping list.
        </p>
      ) : settled ? (
        <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
          {item.quantityPacks} × {item.name}
          {item.strength ? ` ${item.strength}` : ''}{' '}
          {item.status === 'in_stock'
            ? 'is already in the cupboard — this line was received earlier. Receiving it again would add a second box that never existed.'
            : /*
               * This used to say "move it back into the flow on the shopping
               * list". There is no such control: "didn't arrive" is a settled
               * state, so the list gives that row a Clear button and nothing
               * else, and `setShoppingStatus` refuses to walk a settled line
               * backwards even if a stale form asked it to. The page was
               * pointing at a button that does not exist. Clearing and adding
               * it again is the way out, so that is what it says now.
               */
              'is marked as never arrived, so nothing was added to stock. That cannot be walked back: clear the line on the shopping list and add the item again if it turns up after all.'}
        </p>
      ) : (
        <>
          <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
            {item.quantityPacks} × {item.name}
            {item.strength ? ` ${item.strength}` : ''} — fill in what the box actually says and it
            becomes a real box in the cupboard.
          </p>

          <ReceiveForm item={item} suggestedRate={suggestedRate} />
        </>
      )}
    </div>
  );
}
