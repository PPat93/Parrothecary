'use client';

import { useActionState, useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { ErrorText } from '@/components/form';
import { toneStyle } from '@/components/tone';
import { renameSubstance, renameSymptom, type RenameResult } from '../../actions';

const initial: RenameResult = { error: null, merge: null };

/**
 * Correcting a name where you notice it is wrong.
 *
 * Folded away behind the name itself rather than sitting open: a product can
 * carry half a dozen ingredients, and six text boxes turn a page you read into
 * a form you fill in. Tapping the name is how you get at it.
 *
 * Two different acts share this one field. Typing a name nothing else uses is a
 * correction and happens straight away. Typing one that already exists merges
 * two entries — every product moves across and a row disappears, with no undo —
 * so that one comes back and asks, saying how much is about to move.
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
  const [value, setValue] = useState(name);
  const [state, formAction, pending] = useActionState(
    kind === 'substance' ? renameSubstance : renameSymptom,
    initial,
  );

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
    <form action={formAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input type="hidden" name={kind === 'substance' ? 'substanceId' : 'symptomId'} value={id} />
      <input
        name="name"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        autoFocus
        className="min-w-0 flex-1 rounded-lg border px-2 py-1 text-sm"
        style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        aria-label={`New name for ${name}`}
      />

      {state.merge ? (
        <>
          {/*
            The button carries the answer. Nothing was written on the way here:
            this submit is the first one that changes anything.
          */}
          <button
            type="submit"
            name="confirm"
            value="yes"
            disabled={pending}
            className="is-action rounded-lg border px-2 py-1 text-xs font-medium"
            style={toneStyle('critical')}
          >
            {pending ? 'Merging…' : 'Yes, merge them'}
          </button>
          <span className="basis-full text-xs" style={{ color: 'var(--color-warning)' }}>
            “{state.merge.name}” already exists. Merging moves{' '}
            {state.merge.products === 1 ? 'the product' : `all ${state.merge.products} products`}{' '}
            onto it and cannot be undone.
          </span>
        </>
      ) : (
        <ActionButton tone="accent" className="rounded-lg border px-2 py-1 text-xs">
          {pending ? 'Saving…' : 'Rename'}
        </ActionButton>
      )}

      <button
        type="button"
        onClick={() => {
          setValue(name);
          setOpen(false);
        }}
        className="rounded-lg border px-2 py-1 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
      >
        Cancel
      </button>

      {state.error ? (
        <span className="basis-full">
          <ErrorText>{state.error}</ErrorText>
        </span>
      ) : null}

      {!state.merge && !state.error ? (
        <span className="basis-full text-xs" style={{ color: 'var(--muted)' }}>
          Fixes it on every product that uses it.
        </span>
      ) : null}
    </form>
  );
}
