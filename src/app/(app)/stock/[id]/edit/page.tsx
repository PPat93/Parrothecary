import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ConfirmButton } from '@/components/confirm-button';
import { LINK_BUTTON, toneStyle } from '@/components/tone';
import { formatQuantity } from '@/domain/quantity';
import { getBatch } from '@/lib/queries';
import { deleteBatch } from '../../../actions';
import { BatchEditForm } from './batch-edit-form';

export default async function EditBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const box = await getBatch(Number(id));
  if (!box) notFound();

  return (
    <div className="mx-auto w-full max-w-lg">
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Correct this box</h1>
        <Link href="/" className={LINK_BUTTON} style={toneStyle('warning')}>
          Cancel
        </Link>
      </header>

      <p className="mb-5 text-sm" style={{ color: 'var(--muted)' }}>
        {box.name}
        {box.strength ? ` ${box.strength}` : ''} · {box.packLabelOrSize} · currently{' '}
        {formatQuantity(box.quantityRemaining, box.unitName, box.packSize)}
      </p>

      <BatchEditForm box={box} />

      <div className="mt-8 flex flex-col items-center gap-2">
        <p className="text-center text-xs" style={{ color: 'var(--muted)' }}>
          Added this box by mistake? Deleting removes it entirely, rather than recording it as
          used up or binned — so it never shows in consumption or waste figures.
        </p>
        <form action={deleteBatch}>
          <input type="hidden" name="id" value={box.batchId} />
          <ConfirmButton
            label="Delete this box"
            title="Delete this box?"
            message={`${box.name} — ${formatQuantity(box.quantityRemaining, box.unitName, box.packSize)} will be erased completely. Use this only for a box entered by mistake; if you actually used or binned it, go back and record that instead.`}
            confirmLabel="Yes, it was a mistake"
            tone="critical"
            className="rounded-lg border px-4 py-2 text-sm font-medium"
          />
        </form>
      </div>
    </div>
  );
}
