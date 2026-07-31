import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BackLink } from '@/components/back-link';
import { ConfirmButton } from '@/components/confirm-button';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { TripUrgencyBadge } from '@/components/trip-urgency-badge';
import { todayIso } from '@/domain/date';
import { totalAvailable } from '@/domain/fefo';
import { formatMoney, money } from '@/domain/money';
import { formatQuantity } from '@/domain/quantity';
import { unitsDueBetween } from '@/domain/dosing';
import { unitsShort } from '@/domain/runout';
import { daysUntilOrderBy } from '@/domain/trip';
import {
  getBatchesForProducts,
  getScheduledProducts,
  getTrip,
  getTripMoney,
  getUnassignedShoppingItems,
} from '@/lib/queries';
import { shoppingStatusLabel } from '@/lib/labels';
import { deleteTrip, setShoppingTrip, setTripStatus } from '../../actions';
import { ActionButton } from '@/components/action-button';

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = await getTrip(Number(id));
  if (!trip) notFound();

  const today = todayIso();
  const [scheduled, unassigned, spend] = await Promise.all([
    getScheduledProducts(),
    getUnassignedShoppingItems(),
    getTripMoney(Number(id)),
  ]);
  const stock = await getBatchesForProducts(scheduled.map((p) => p.productId));

  /*
   * What runs out before the trip can replace it.
   *
   * Measured to the order deadline while that is still ahead, because anything
   * not ordered by then will not be there to collect. Once the deadline has
   * gone, projecting to it answers nothing — the trip still happens, so the
   * question becomes what will not last until collection and therefore has to
   * be bought in person or shipped late.
   */
  const deadlineAhead = trip.orderByDate !== null && trip.orderByDate >= today;
  const deadline = deadlineAhead ? trip.orderByDate! : trip.collectionDate;
  const shortfalls = scheduled
    .map((product) => {
      const due = product.schedules.reduce(
        (sum, schedule) => sum + unitsDueBetween(schedule, today, deadline),
        0,
      );
      return {
        ...product,
        due,
        shortBy: unitsShort(due, totalAvailable(stock.get(product.productId) ?? [], today)),
      };
    })
    .filter((row) => row.shortBy > 0)
    .sort((a, b) => b.shortBy - a.shortBy);

  const days = trip.orderByDate ? daysUntilOrderBy(trip.orderByDate, today) : null;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink href="/trips" label="Trips" />

      <header className="mb-4 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{trip.label}</h1>
        <Link href={`/trips/${trip.id}/edit`} className={LINK_BUTTON} style={toneStyle('accent')}>
          Edit
        </Link>
      </header>

      <Section title="Dates">
        <Row label="Collection" value={trip.collectionDate} />
        <Row
          label="Order by"
          value={trip.orderByDate ?? 'not set — using the collection date instead'}
        />
        {trip.status === 'planned' ? (
          <div className="flex items-center gap-2 pt-1">
            <TripUrgencyBadge orderByDate={trip.orderByDate} today={today} />
            {days !== null && days < 0 ? (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                {Math.abs(days)} days ago — anything ordered now may miss the collection.
              </span>
            ) : null}
          </div>
        ) : (
          <Row label="Status" value="collected" />
        )}
        {trip.notes ? <Row label="Notes" value={trip.notes} /> : null}
      </Section>

      <Section title="What it cost">
        {spend.spentBoxes === 0 && spend.estimatedLines === 0 && spend.unpricedLines === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Nothing bought or listed for this trip yet.
          </p>
        ) : (
          <>
            {spend.spentBoxes > 0 ? (
              <Row
                label="Spent"
                value={`${formatMoney(money(spend.spentMinorEur, 'EUR'), { showCurrency: true })} · ${spend.spentBoxes} ${spend.spentBoxes === 1 ? 'box' : 'boxes'} received`}
              />
            ) : null}

            {spend.estimatedLines > 0 ? (
              <Row
                label="Still to buy"
                value={`about ${formatMoney(money(spend.estimatedMinorEur, 'EUR'), { showCurrency: true })} · ${spend.estimatedLines} ${spend.estimatedLines === 1 ? 'line' : 'lines'}`}
              />
            ) : null}

            {/* Never folded into the estimate — a total that quietly leaves
                lines out reads as complete and is not. */}
            {spend.unpricedLines > 0 ? (
              <p className="pt-1 text-xs" style={{ color: 'var(--muted)' }}>
                {spend.unpricedLines} more {spend.unpricedLines === 1 ? 'line has' : 'lines have'} no
                price on record, so {spend.unpricedLines === 1 ? 'it is' : 'they are'} not in that
                estimate.
              </p>
            ) : null}

            {spend.estimatedLines > 0 ? (
              <p className="pt-1 text-xs" style={{ color: 'var(--muted)' }}>
                Estimated from what each was last bought for, converted at the rate recorded then.
              </p>
            ) : null}
          </>
        )}
      </Section>

      {/*
        Planning only. A collected trip cannot be planned for, and projecting to
        a date in the past reported "everything lasts past 2025-10-15" — true,
        and useless. Reopening the trip brings this back.
      */}
      {trip.status === 'planned' ? (
        <Section title="Runs out before this trip">
        <p className="mb-3">
          <Link
            href={`/trips/${trip.id}/audit`}
            className={LINK_BUTTON}
            style={toneStyle('accent')}
          >
            Run the cabinet audit
          </Link>
        </p>
        {deadline < today ? (
          /*
           * Both dates are behind us on a trip still marked planned. Projecting
           * to a past date returns nothing due, which renders as "nothing to
           * order" — a confident wrong answer. Say what is actually wrong.
           */
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            This trip’s dates have all passed. Mark it collected, or move the dates forward, and
            the projection will mean something again.
          </p>
        ) : shortfalls.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {scheduled.length === 0
              ? 'Nobody is on a regular dose, so there is nothing to project. This list is built from dose schedules.'
              : `Everything on a schedule lasts past ${deadline} at the current rate — nothing to order for this trip.`}
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
              Counted from today to {deadline}
              {deadlineAhead
                ? ' — the order deadline, since anything not ordered by then will not be there to collect.'
                : ' — the collection date, because the order deadline has already passed. These have to be bought in person or shipped late.'}{' '}
              Measured at the scheduled rate against what is usable now. Nothing is added to the
              shopping list automatically; that is still yours to decide.
            </p>
            <ul className="flex flex-col gap-2">
              {shortfalls.map((row) => (
                <li
                  key={row.productId}
                  className="flex items-center gap-3 rounded-xl border p-2.5"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.name}
                      {row.strength ? (
                        <span className="font-normal" style={{ color: 'var(--muted)' }}>
                          {' '}
                          {row.strength}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
                      {formatQuantity(row.due, row.unitName)} due
                      {row.schedules.length > 1 ? ` across ${row.schedules.length} schedules` : ''}
                    </p>
                  </div>
                  <span
                    className="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
                    style={{
                      background: 'color-mix(in oklch, var(--color-critical) 18%, transparent)',
                      color: 'var(--color-critical)',
                    }}
                  >
                    {formatQuantity(row.shortBy, row.unitName)} short
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        </Section>
      ) : null}

      <Section title="On the list for this trip">
        {trip.items.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            Nothing assigned yet. Add items from{' '}
            <Link href="/shopping" className="underline underline-offset-4">
              Shopping
            </Link>
            .
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {trip.items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border p-2.5"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.name}
                    {item.strength ? (
                      <span className="font-normal" style={{ color: 'var(--muted)' }}>
                        {' '}
                        {item.strength}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {item.quantityPacks} × {item.packLabel ?? `${item.packSize} ${item.unitName}`} ·{' '}
                    {shoppingStatusLabel(item.status)}
                  </p>
                </div>

                <form action={setShoppingTrip} className="shrink-0">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="tripId" value="" />
                  <ActionButton
                    tone="warning"
                    variant="outline"
                    title="Take this off the trip — the line itself stays on the shopping list"
                    className="rounded-lg border px-2.5 py-1 text-xs"
                  >
                    Unassign
                  </ActionButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/*
        Planned trips only, matching getTripOptions: attaching a purchase to a
        restock that already happened is nearly always a mistake, so it is not
        offered in either place.
      */}
      {trip.status === 'planned' && unassigned.length > 0 ? (
        <Section title="Not on any trip">
          <p className="mb-3 text-xs" style={{ color: 'var(--muted)' }}>
            Already on the shopping list but not tied to a restock. Attach anything you mean to
            order for this one.
          </p>
          <ul className="flex flex-col gap-2">
            {unassigned.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border p-2.5"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.name}
                    {item.strength ? (
                      <span className="font-normal" style={{ color: 'var(--muted)' }}>
                        {' '}
                        {item.strength}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    {item.quantityPacks} × {item.packLabel ?? `${item.packSize} ${item.unitName}`} ·{' '}
                    {shoppingStatusLabel(item.status)}
                  </p>
                </div>

                <form action={setShoppingTrip} className="shrink-0">
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="tripId" value={trip.id} />
                  <ActionButton
                    tone="accent"
                    variant="outline"
                    title="Assign to this trip"
                    className="rounded-lg border px-2.5 py-1 text-xs"
                  >
                    Add to trip
                  </ActionButton>
                </form>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="mt-6 flex flex-col items-center gap-3">
        <form action={setTripStatus}>
          <input type="hidden" name="id" value={trip.id} />
          <input
            type="hidden"
            name="status"
            value={trip.status === 'planned' ? 'completed' : 'planned'}
          />
          <ConfirmButton
            label={trip.status === 'planned' ? 'Mark as collected' : 'Reopen this trip'}
            title={trip.status === 'planned' ? 'Mark this trip collected?' : 'Reopen this trip?'}
            message={
              trip.status === 'planned'
                ? `${trip.label} moves to the done list. Its shopping lines stay exactly as they are — receiving a box is still what records what actually arrived.`
                : `${trip.label} goes back to planned and starts counting down to its order deadline again.`
            }
            confirmLabel={trip.status === 'planned' ? 'Yes, collected' : 'Yes, reopen'}
            tone={trip.status === 'planned' ? 'ok' : 'accent'}
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          />
        </form>

        <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
          Deleting a trip keeps every box bought on it — purchase dates and prices live on the boxes
          themselves. Shopping lines assigned to it are put back on the unassigned list.
        </p>
        <form action={deleteTrip}>
          <input type="hidden" name="id" value={trip.id} />
          <ConfirmButton
            label="Delete this trip"
            title="Delete this trip?"
            message={`${trip.label} will be removed.${
              trip.itemCount > 0
                ? ` Its ${trip.itemCount} shopping ${trip.itemCount === 1 ? 'line' : 'lines'} are not deleted — they go back to being unassigned.`
                : ''
            }`}
            confirmLabel="Yes, delete it"
            tone="critical"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          />
        </form>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="mb-4 rounded-2xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}
