import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ActionButton } from '@/components/action-button';
import { AuditPick } from './audit-pick';
import { BackLink } from '@/components/back-link';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { todayIso } from '@/domain/date';
import { unitsDueBetween } from '@/domain/dosing';
import { formatQuantity, isLowStock } from '@/domain/quantity';
import { unitsShort } from '@/domain/runout';
import { getAuditRows, getTrip, type AuditRow } from '@/lib/queries';
import { addAuditSelection } from '../../../actions';

/**
 * The twice-yearly cabinet audit, done against a trip.
 *
 * Three groups, in the order you actually think about them: what the maths can
 * prove will run out, what the cupboard shows is empty, and everything else for
 * an eyeball pass. The third group is most of the cabinet — plasters, saline,
 * dressings — and no projection can speak for it, which is exactly why the
 * audit is a human sitting down twice a year rather than a report.
 */
export default async function TripAuditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = Number(id);
  const trip = await getTrip(tripId);
  if (!trip) notFound();

  /*
   * Restocks only, the mirror of the packing list sending them away. Nothing
   * links here for a holiday, but the URL still worked — and the worksheet
   * ends by writing shopping lines, so a holiday could quietly acquire a list
   * of things to order that nothing would ever collect.
   */
  if (trip.kind !== 'restock') redirect(`/trips/${tripId}`);

  /*
   * And only while the trip is still ahead. The trip page stops showing what
   * will run out once a restock is done, but this URL kept serving the whole
   * worksheet, so a collected trip could still be ticked into a shopping list
   * nobody would ever pick up. Plan against the next one instead.
   */
  if (trip.status !== 'planned') redirect(`/trips/${tripId}`);

  const today = todayIso();
  const rows = await getAuditRows(tripId);

  const deadlineAhead = trip.orderByDate !== null && trip.orderByDate >= today;
  const deadline = deadlineAhead ? trip.orderByDate! : trip.collectionDate;

  const assessed = rows.map((row) => {
    const due = row.schedules.reduce(
      (sum, schedule) => sum + unitsDueBetween(schedule, today, deadline),
      0,
    );
    const shortBy = unitsShort(due, row.usableUnits);

    /*
     * Judged against a pack rather than against "is there a sealed box left":
     * one opened tub with 58 of 60 capsules in it is not running low.
     *
     * Measured against the largest pack, which is the same one the picker
     * offers first — "a quarter of a pack" has to mean the pack you would
     * actually buy, or the threshold moves depending on which size you look at.
     */
    const packSize = Math.max(0, ...row.variants.map((v) => v.packSize));
    const low = isLowStock(row.usableUnits, packSize);

    return { ...row, due, shortBy, low };
  });

  const runningOut = assessed.filter((r) => r.shortBy > 0);
  const empty = assessed.filter((r) => r.shortBy === 0 && r.low);
  const rest = assessed.filter((r) => r.shortBy === 0 && !r.low);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BackLink href={`/trips/${trip.id}`} label={trip.label} />

      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Audit</h1>
        <Link href={`/trips/${trip.id}`} className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>

      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        Go through the cupboard against {trip.label}. Quantities are suggestions where the maths
        can make one — change anything, tick what you want, add it all in one go.
      </p>

      <form action={addAuditSelection} className="flex flex-col gap-6">
        <input type="hidden" name="tripId" value={trip.id} />

        <Group
          title="Runs out before this trip"
          blurb={`Counted to ${deadline} from the dose schedules, against what is usable now.`}
          rows={runningOut}
          empty="Nothing on a schedule falls short."
        />

        <Group
          title="Empty or nearly"
          blurb="Nothing left, or less than a quarter of a pack. No dose schedule to project from, so this is what the cupboard alone can tell you."
          rows={empty}
          empty="Everything else has a sealed pack behind it."
        />

        <details className="rounded-2xl border p-3" style={{ borderColor: 'var(--border)' }}>
          <summary className="cursor-pointer text-sm font-medium">
            Everything else{' '}
            <span className="font-normal tabular-nums" style={{ color: 'var(--muted)' }}>
              {rest.length}
            </span>
          </summary>
          <p className="mt-1 mb-3 text-xs" style={{ color: 'var(--muted)' }}>
            Stocked and not running out. Here for the eyeball pass — the app cannot tell you when
            you will next need a bandage.
          </p>
          <ul className="flex flex-col gap-2">
            {rest.map((row) => (
              <Row key={row.productId} row={row} />
            ))}
          </ul>
        </details>

        {/*
          ActionButton rather than SubmitButton: it reads useFormStatus, so the
          button disables itself while the insert runs. This form writes up to
          fifteen rows at once, which is long enough to invite a second tap.
        */}
        <ActionButton
          tone="accent"
          variant="solid"
          pendingLabel="Adding…"
          className="w-full rounded-xl px-4 py-3 font-medium"
        >
          Add ticked items to {trip.label}
        </ActionButton>
      </form>
    </div>
  );
}

type Assessed = AuditRow & { due: number; shortBy: number; low: boolean };

function Group({
  title,
  blurb,
  rows,
  empty,
}: {
  title: string;
  blurb: string;
  rows: Assessed[];
  empty: string;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide">
        {title}{' '}
        <span className="font-normal tabular-nums" style={{ color: 'var(--muted)' }}>
          {rows.length}
        </span>
      </h2>
      <p className="mb-2 text-xs" style={{ color: 'var(--muted)' }}>
        {blurb}
      </p>

      {rows.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <Row key={row.productId} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ row }: { row: Assessed }) {
  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
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
        <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
          {formatQuantity(row.usableUnits, row.unitName)} usable
          {row.shortBy > 0 ? ` · ${formatQuantity(row.shortBy, row.unitName)} short` : ''}
          {row.shortBy === 0 && row.low ? ' · running low' : ''}
        </p>
      </div>

      {row.onListPacks !== null ? (
        <span className="shrink-0 text-xs" style={{ color: 'var(--color-ok)' }}>
          {row.onListPacks} on the list
        </span>
      ) : row.variants.length === 0 ? (
        // A product with no pack cannot be bought — it has nothing to order.
        <span className="shrink-0 text-xs" style={{ color: 'var(--muted)' }}>
          no pack size
        </span>
      ) : (
        <AuditPick
          productId={row.productId}
          productName={row.name}
          unitName={row.unitName}
          variants={row.variants}
          shortBy={row.shortBy}
          low={row.low}
        />
      )}
    </li>
  );
}
