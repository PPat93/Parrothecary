'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <label htmlFor="password" className="text-sm font-medium">
        Master password
      </label>

      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        required
        className="w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      />

      {state.error ? (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-critical)' }}>
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
      >
        {pending ? 'Checking…' : 'Unlock'}
      </button>
    </form>
  );
}
