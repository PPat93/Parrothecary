'use client';

import { useRef } from 'react';

/**
 * A submit button that asks first.
 *
 * Used for anything that destroys or retires a record — binning a box,
 * archiving a product, clearing a shopping line. The app is used one-handed at
 * a cupboard, where a mis-tap is easy and "Binned" sits right next to a "+".
 *
 * Renders a real <dialog> rather than window.confirm(): it can be styled, it
 * traps focus, Escape closes it, and it does not look like a browser warning.
 */
export function ConfirmButton({
  label,
  title,
  message,
  confirmLabel = 'Yes, do it',
  className,
  style,
}: {
  label: string;
  title: string;
  message: string;
  confirmLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  function confirm() {
    dialog.current?.close();
    // The trigger is type="button", so it never submits on its own — we submit
    // the form it belongs to only once the user has said yes.
    trigger.current?.form?.requestSubmit();
  }

  return (
    <>
      <button
        type="button"
        ref={trigger}
        onClick={() => dialog.current?.showModal()}
        className={className}
        style={style}
      >
        {label}
      </button>

      <dialog
        ref={dialog}
        className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border p-5"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
      >
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
          {message}
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium"
            style={{ borderColor: 'var(--border)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white"
            style={{ background: 'var(--color-critical)' }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
