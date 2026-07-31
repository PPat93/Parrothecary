'use client';

import { useFormStatus } from 'react-dom';
import { toneStyle, type Tone } from './tone';

export { toneStyle, type Tone };

/**
 * A submit button that shows it is working.
 *
 * Server actions round-trip to the server, and until now a tap produced no
 * response at all — you could not tell whether it had registered. useFormStatus
 * reports the parent form's state, so every action gets feedback without each
 * caller wiring up its own.
 */
export function ActionButton({
  children,
  tone = 'neutral',
  variant = 'outline',
  pendingLabel,
  className = 'rounded-lg border px-3 py-1.5 text-xs font-medium',
  title,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  tone?: Tone;
  variant?: 'solid' | 'outline';
  pendingLabel?: string;
  className?: string;
  title?: string;
  'aria-label'?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={title}
      aria-label={ariaLabel}
      aria-busy={pending}
      className={`${className} is-action`}
      style={toneStyle(tone, variant)}
    >
      {pending ? (pendingLabel ?? <Spinner />) : children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent align-middle"
    />
  );
}
