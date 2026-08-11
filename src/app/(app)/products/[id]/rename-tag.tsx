'use client';

import { useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { renameSubstance, renameSymptom } from '../../actions';

/**
 * Correcting a name where you notice it is wrong.
 *
 * Folded away behind the name itself rather than sitting open: a product can
 * carry half a dozen ingredients, and six text boxes turn a page you read into
 * a form you fill in. Tapping the name is how you get at it.
 *
 * Typing a name that already exists merges the two — the action handles that —
 * so the hint says so rather than letting it look like a mistake afterwards.
 */
export function RenameTag({
  kind,
  id,
  name,
  label,
}: {
  kind: 'substance' | 'symptom';
  id: number;
  name: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-w-0 break-words text-left underline decoration-dotted underline-offset-4"
        title="Correct this spelling everywhere it is used"
      >
        {label}
      </button>
    );
  }

  return (
    <form
      action={kind === 'substance' ? renameSubstance : renameSymptom}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
    >
      <input type="hidden" name={kind === 'substance' ? 'substanceId' : 'symptomId'} value={id} />
      <input
        name="name"
        defaultValue={name}
        autoFocus
        className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        aria-label={`New name for ${name}`}
      />
      <ActionButton tone="accent" className="rounded-lg border px-2 py-1 text-xs">
        Rename
      </ActionButton>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-lg border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        Cancel
      </button>
      <span className="basis-full text-xs" style={{ color: 'var(--muted)' }}>
        Fixes it on every product. An existing name merges the two.
      </span>
    </form>
  );
}
