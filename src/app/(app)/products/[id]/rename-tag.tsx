'use client';

import { useActionState, useState } from 'react';
import { ActionButton } from '@/components/action-button';
import { ErrorText } from '@/components/form';
import { toneStyle } from '@/components/tone';
import { renameSubstance, renameSymptom, type RenameResult } from '../../actions';

const initial: RenameResult = { error: null, merge: null };

/**
 * Correcting a name, and giving it a Polish one.
 *
 * Behind a pencil, not behind the text itself. The first version made the name
 * a dotted-underlined button and nothing else — which reads as text, so the
 * feature was invisible to the person it was built for. The pencil is the same
 * icon a box carries on the stock list, and means the same thing there: correct
 * this record.
 *
 * The Polish name is a search alias, not a translation of the interface. It is
 * what makes "ból gardła" find a product tagged "sore throat", so it belongs
 * beside the name rather than on a screen of its own.
 */
export function EditTag({
  kind,
  id,
  name,
  namePl,
  label,
}: {
  kind: 'substance' | 'symptom';
  id: number;
  name: string;
  namePl: string | null;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [pl, setPl] = useState(namePl ?? '');
  const [state, formAction, pending] = useActionState(
    kind === 'substance' ? renameSubstance : renameSymptom,
    initial,
  );

  if (!open) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className="min-w-0 break-words">{label}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${name}`}
          title="Correct the name, or add a Polish one"
          className="is-action shrink-0 rounded p-1"
          style={{ color: 'var(--muted)', minHeight: 0 }}
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      </span>
    );
  }

  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-col gap-2">
      <input type="hidden" name={kind === 'substance' ? 'substanceId' : 'symptomId'} value={id} />

      <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--muted)' }}>
        Name
        <input
          name="name"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
          className="rounded-lg border px-2 py-1 text-sm"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs" style={{ color: 'var(--muted)' }}>
        Polish name — optional, so searching in Polish finds it
        <input
          name="namePl"
          value={pl}
          onChange={(event) => setPl(event.target.value)}
          placeholder={kind === 'substance' ? 'Paracetamol' : 'ból gardła'}
          className="rounded-lg border px-2 py-1 text-sm"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)', color: 'var(--text)' }}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {state.merge ? (
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
        ) : (
          <ActionButton tone="accent" className="rounded-lg border px-2 py-1 text-xs">
            {pending ? 'Saving…' : 'Save'}
          </ActionButton>
        )}

        <button
          type="button"
          onClick={() => {
            setValue(name);
            setPl(namePl ?? '');
            setOpen(false);
          }}
          className="rounded-lg border px-2 py-1 text-xs"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Cancel
        </button>
      </div>

      {state.error ? <ErrorText>{state.error}</ErrorText> : null}

      {state.merge ? (
        <span className="text-xs" style={{ color: 'var(--color-warning)' }}>
          “{state.merge.name}” already exists. Merging moves{' '}
          {state.merge.products === 1 ? 'one product' : `${state.merge.products} products`} onto it
          and cannot be undone.
        </span>
      ) : (
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          Changes apply to every product that uses it.
        </span>
      )}
    </form>
  );
}
