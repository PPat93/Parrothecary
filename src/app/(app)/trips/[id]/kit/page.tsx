import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ActionButton } from '@/components/action-button';
import { BackLink } from '@/components/back-link';
import { daysAway } from '@/domain/travel';
import { formatQuantity } from '@/domain/quantity';
import { getKitSuggestions, getTravelKit, getTrip } from '@/lib/queries';
import { addKitItem, removeKitItem, toggleKitPacked } from '../../../actions';
import { KitUnits } from './kit-units';

/**
 * The packing list.
 *
 * Two halves. What the app can work out — a course taken twice a day, for the
 * days you are away — is offered with the number already filled in. What it
 * cannot work out is offered because somebody marked the product as one that
 * always travels. Both are suggestions until they are added; nothing is on the
 * list because the app decided it should be.
 *
 * Ticking a line off does not move stock. Taking a box out and bringing most of
 * it back needs a "what came home" step nobody performs while travelling, and a
 * forgotten return would leave the cupboard's numbers worse than not trying.
 */
export default async function TripKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = Number(id);
  const trip = await getTrip(tripId);
  if (!trip) notFound();

  // A restock has no kit — there is nothing to pack, only things to collect.
  if (trip.kind !== 'travel' || trip.returnDate === null) redirect(`/trips/${tripId}`);

  const [kit, suggestions] = await Promise.all([
    getTravelKit(tripId, trip.collectionDate, trip.returnDate),
    getKitSuggestions(tripId, trip.collectionDate, trip.returnDate),
  ]);

  const nights = daysAway(trip.collectionDate, trip.returnDate);
  const packed = kit.filter((row) => row.packed).length;

  /*
   * Once you are home this is a record, not a plan.
   *
   * The audit worksheet next door already redirects away from a trip that is
   * no longer planned — "a collected trip cannot be planned for" — and this,
   * its twin, kept working as though the suitcase were still open: a holiday
   * three months past still offered four things to add and called itself
   * "11 days away", with the courses worked out over dates that have been and
   * gone.
   *
   * Not a redirect, though. Marking a trip finished promises the list stays
   * "so it can still be looked back at", and sending you to another page is
   * not that. What goes is the suggesting.
   */
  const finished = trip.status !== 'planned';

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink href={`/trips/${tripId}`} label={trip.label} />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight" test-data="kit-title">
        Packing list
      </h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--muted)' }} test-data="kit-days">
        {finished ? (
          <>
            {`${trip.collectionDate} to ${trip.returnDate} — ${nights} ${nights === 1 ? 'day' : 'days'}. This trip is finished, so the list is kept as it was rather than added to. `}
            <Link href={`/trips/${tripId}`} className="underline underline-offset-4">
              Reopen it
            </Link>
            {' to change what it suggests.'}
          </>
        ) : (
          `${trip.collectionDate} to ${trip.returnDate} — ${nights} ${nights === 1 ? 'day' : 'days'} away. Doses are worked out from that; everything else is a standing choice.`
        )}
      </p>

      {kit.length > 0 ? (
        <section className="mb-4" test-data="kit-list">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">
            In the bag{' '}
            <span className="font-normal tabular-nums" style={{ color: 'var(--muted)' }}>
              {packed}/{kit.length}
            </span>
          </h2>

          <ul className="flex flex-col gap-2">
            {kit.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <form action={toggleKitPacked}>
                  <input type="hidden" name="id" value={row.id} />
                  <ActionButton
                    aria-label={row.packed ? `Take ${row.name} back out` : `Mark ${row.name} packed`}
                    tone={row.packed ? 'ok' : 'neutral'}
                    variant={row.packed ? 'solid' : 'outline'}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border text-sm"
                  >
                    {row.packed ? '✓' : ''}
                  </ActionButton>
                </form>

                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium break-words"
                    style={{ opacity: row.packed ? 0.55 : 1 }}
                  >
                    <Link href={`/products/${row.productId}`} className="underline-offset-4 hover:underline">
                      {row.name}
                      {row.strength ? (
                        <span className="font-normal" style={{ color: 'var(--muted)' }}>
                          {' '}
                          {row.strength}
                        </span>
                      ) : null}
                    </Link>
                    {/* Suggestions skip archived products, but one added before
                        being archived stays in the bag. Mark it. */}
                    {row.archived ? (
                      <span
                        className="ml-2 inline-flex shrink-0 items-center rounded-md px-2 py-0.5 align-middle text-xs font-medium"
                        test-data="archived-product"
                        style={{ background: 'var(--color-warning)', color: 'black' }}
                        title="This product is archived — it is no longer suggested for a trip. What is in the cupboard is what is left."
                      >
                        archived
                      </span>
                    ) : null}
                  </p>

                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {formatQuantity(row.available, row.unitName)} in the cupboard
                  </p>

                  {/*
                    Worth knowing before the bag is closed, and nothing but
                    noise after it has been unpacked again — these are measured
                    against the cupboard as it is today, not as it was.
                  */}
                  {!finished && row.available <= 0 ? (
                    /*
                      Nothing at all is its own warning, and it needed to be:
                      the short-stock line below only fires when the bag asks
                      for more than there is, and a standing item — a blanket,
                      plasters, the thermometer — goes in with no number at all.
                      So the one row the app cannot reason about in any other
                      way, the one that is on this list purely so it is not
                      forgotten, was also the only one that could be completely
                      out of stock and say nothing about it.
                    */
                    <p className="text-xs font-medium" style={{ color: 'var(--color-critical)' }}>
                      none left to pack
                    </p>
                  ) : !finished && row.units > row.available ? (
                    <p className="text-xs font-medium" style={{ color: 'var(--color-critical)' }}>
                      only {formatQuantity(row.available, row.unitName)} to take
                    </p>
                  ) : null}
                  {!finished && row.expiresAway ? (
                    <p className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
                      the box you would take goes off before you get home
                    </p>
                  ) : null}
                  {/*
                    The number in the bag was worked out on the day it was
                    added. Extend the trip afterwards and it stays as it was —
                    ten tablets for what is now twenty days — with nothing
                    saying the sum had moved on.
                  */}
                  {!finished && row.dueUnits > row.units ? (
                    <p className="text-xs font-medium" style={{ color: 'var(--color-warning)' }}>
                      {formatQuantity(row.dueUnits, row.unitName)} due over {nights}{' '}
                      {nights === 1 ? 'day' : 'days'} — the bag has{' '}
                      {formatQuantity(row.units, row.unitName)}
                    </p>
                  ) : null}
                </div>

                <KitUnits id={row.id} units={row.units} unitName={row.unitName} />

                <form action={removeKitItem}>
                  <input type="hidden" name="id" value={row.id} />
                  <ActionButton
                    aria-label={`Take ${row.name} off the list`}
                    tone="critical"
                    className="rounded-lg border px-2 py-1 text-xs"
                  >
                    Remove
                  </ActionButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!finished && suggestions.length > 0 ? (
        <section test-data="kit-suggestions">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Suggested</h2>
          <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
            Courses running while you are away, with the number worked out, and anything marked as
            always travelling. Nothing here is on the list until you add it.
          </p>

          <ul className="flex flex-col gap-2">
            {suggestions.map((row) => (
              <li
                key={row.productId}
                className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
                style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">
                    {row.name}
                    {row.strength ? (
                      <span className="font-normal" style={{ color: 'var(--muted)' }}>
                        {' '}
                        {row.strength}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {row.reason === 'scheduled'
                      ? `${formatQuantity(row.units, row.unitName)} due over ${nights} ${nights === 1 ? 'day' : 'days'}`
                      : 'always goes along'}
                    {' · '}
                    {formatQuantity(row.available, row.unitName)} in the cupboard
                  </p>
                </div>

                <form action={addKitItem} className="flex shrink-0 items-center gap-2">
                  <input type="hidden" name="tripId" value={tripId} />
                  <input type="hidden" name="productId" value={row.productId} />
                  <input type="hidden" name="units" value={row.units} />
                  <ActionButton tone="accent" aria-label={`Add ${row.name} to the bag`}>
                    Add
                  </ActionButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {kit.length === 0 && (finished || suggestions.length === 0) ? (
        <div
          className="rounded-2xl border border-dashed p-8 text-center text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          {finished ? (
            <p>Nothing was packed for this trip.</p>
          ) : (
            <>
              <p>Nothing to suggest.</p>
              <p className="mt-2">
                Mark the things that always travel on their product pages, and any dose running
                while you are away will work itself out.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
