import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/confirm-button';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { checkBox } from '@/domain/integrity';
import { formatQuantity } from '@/domain/quantity';
import { getBatch, getBatchHistory, getFxRateHistory } from '@/lib/queries';
import { movementReasonLabel } from '@/lib/labels';
import { deleteBatch } from '../../../actions';
import { BatchEditForm } from './batch-edit-form';

/**
 * `15.10.2025`, always — not whatever locale the server happens to run in.
 *
 * `toLocaleDateString` produced "15.10.2025" next to "5.08.2026" in one list,
 * and would change shape entirely on a machine configured differently. The
 * expiry badges already use this form, so the history matches them.
 */
function movementDate(when: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(when.getDate())}.${pad(when.getMonth() + 1)}.${when.getFullYear()}`;
}

export default async function EditBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  const box = await getBatch(Number(id));
  if (!box) notFound();

  const [history, rateHistory] = await Promise.all([
    getBatchHistory(box.batchId),
    getFxRateHistory(),
  ]);

  // Reached from two screens; cancelling and saving should both go back to
  // whichever one it was.
  const cameFromExpiring = from === 'expiring';
  const back = cameFromExpiring ? '/expiring' : '/';

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Correct this box</h1>
        <Link href={back} className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>

      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        {box.name}
        {box.strength ? ` ${box.strength}` : ''} · {box.packLabelOrSize} · currently{' '}
        {formatQuantity(box.quantityRemaining, box.unitName, box.packSize)}
      </p>

      <BatchEditForm box={box} from={cameFromExpiring ? 'expiring' : null} rateHistory={rateHistory} />

      {/*
        Why the number above is what it is.

        This is the page you open when a quantity looks wrong, and until now the
        only answer available was a CSV export — the wrong place to look
        something up while holding the box. The ledger has recorded all of this
        from the start; it simply had no screen.
      */}
      {/*
        A box with nothing recorded against it got no section at all — the
        heading, the list and the sum all simply absent, with nothing saying
        why. Eighteen of the forty boxes in the real cabinet are in that state,
        so the feature looked broken on nearly half of them: present on one box,
        gone on the next, no explanation either way.

        Every box entered through the app writes its arrival in the same
        transaction as the box itself, so an empty ledger means the row came
        from somewhere else — an import, or a database seeded before this
        screen existed. Worth saying rather than leaving a hole.
      */}
      {history.length === 0 ? (
        <section className="mt-8" test-data="box-history">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">What happened to it</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Nothing was ever recorded against this box, so there is nothing to add up. A box entered
            through the app records its arrival straight away, so this one came in another way —
            imported, or already here before this screen was.
          </p>
        </section>
      ) : (
        <section className="mt-8" test-data="box-history">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">What happened to it</h2>

          <ul className="flex flex-col">
            {history.map((row) => (
              <li
                key={row.id}
                className="flex items-baseline justify-between gap-3 border-b py-1.5 text-sm last:border-b-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <span className="min-w-0">
                  <span className="tabular-nums" style={{ color: 'var(--muted)' }}>
                    {movementDate(row.occurredAt)}
                  </span>{' '}
                  {movementReasonLabel(row.reason, row.delta)}
                  {/*
                    Some notes were written when the reason alone could not say
                    which way a movement went, and now that it can they repeat
                    it: "a dose undone — dose undone". Kept in the ledger, since
                    the CSV export and older rows still carry them, but not read
                    out twice on the one line that already says it.
                  */}
                  {row.note && !movementReasonLabel(row.reason, row.delta).toLowerCase().includes(row.note.toLowerCase()) ? (
                    <span style={{ color: 'var(--muted)' }}> — {row.note}</span>
                  ) : null}
                </span>

                <span className="shrink-0 text-right tabular-nums">
                  <span
                    style={{
                      color: row.delta < 0 ? 'var(--color-critical)' : 'var(--color-ok)',
                    }}
                  >
                    {row.delta > 0 ? '+' : ''}
                    {row.delta}
                  </span>{' '}
                  <span style={{ color: 'var(--muted)' }}>→ {row.runningTotal}</span>
                </span>
              </li>
            ))}
          </ul>

          {/*
            The sum, next to what the box claims.

            What it should come to depends on whether the box is still in the
            cupboard — the same rule the ledger check applies. A box that has
            left closes out at zero on purpose, while keeping the quantity it
            still held, because that leftover is what the waste figures cost.
            Reading every box as if it were in stock made a correctly binned one
            look broken, and then offered to fix it by counting a box that is
            not on the count sheet.
          */}
          <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
            {(() => {
              const ledger = history[history.length - 1]!.runningTotal;
              const inStock = box.status === 'in_stock';

              /*
               * Judged by the shared rule, not a local one.
               *
               * This footer used to compare the sum against the quantity and
               * nothing else, so it only ever saw half of what the integrity
               * check sees. A box holding more than ever came into it — five
               * put back into a one-piece pack — has a ledger that agrees with
               * its quantity perfectly, and this line pronounced it correct
               * while the Audit screen listed it as broken and sent you here
               * to find out why. The one page that was supposed to explain the
               * problem was the one page denying there was one.
               */
              const problem = checkBox({
                status: box.status,
                quantity: box.quantityRemaining,
                ledger,
                capacity: box.capacity,
              });

              if (problem === null) {
                return inStock
                  ? `Adds up to ${formatQuantity(box.quantityRemaining, box.unitName, box.packSize)}, which is what the box says.`
                  : `These close at zero because the box has left the cupboard. The ${formatQuantity(box.quantityRemaining, box.unitName, box.packSize)} it still held is what the waste figures cost.`;
              }

              if (problem.kind === 'capacity') {
                return `The movements add up, but this box holds ${problem.quantity} and only ${problem.capacity} ever came into it — more was put back than was ever taken out. Correcting the quantity above puts it right.`;
              }

              return inStock
                ? `These add up to ${problem.ledger}, but the box says ${box.quantityRemaining}. Counting it on the Audit screen will put that right.`
                : `These add up to ${problem.ledger}, and a box out of the cupboard should close at zero. Something wrote a quantity without saying why.`;
            })()}
          </p>
        </section>
      )}

      <div className="mt-8 flex flex-col items-center gap-2">
        {box.hasDoseEvents ? (
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
            This box cannot be deleted because a dose was confirmed straight from it — that
            confirmation is real consumption history. Adjust the quantity above instead.
          </p>
        ) : box.cameFromAnOrder ? (
          <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
            This box cannot be deleted because it arrived against a shopping line — it is the record
            of that purchase, and the trip counts its cost through it. Bin it from Expiring if it is
            gone, or clear the shopping line first.
          </p>
        ) : (
          <>
            <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
              Added this box by mistake? Deleting removes it entirely, rather than recording it as
              used up or binned — so it never shows in consumption or waste figures.
            </p>
            <form action={deleteBatch}>
              <input type="hidden" name="id" value={box.batchId} />
              {cameFromExpiring ? <input type="hidden" name="from" value="expiring" /> : null}
              <ConfirmButton
                label="Delete this box"
                title="Delete this box?"
                message={`${box.name} — ${formatQuantity(box.quantityRemaining, box.unitName, box.packSize)} will be erased completely. Use this only for a box entered by mistake; if you actually used or binned it, go back and record that instead.`}
                confirmLabel="Yes, it was a mistake"
                tone="critical"
                className="rounded-lg border px-4 py-2 text-sm font-medium"
              />
            </form>
          </>
        )}
      </div>
    </div>
  );
}
