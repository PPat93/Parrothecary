'use client';

const fieldStyle = {
  background: 'var(--surface)',
  borderColor: 'var(--border)',
};

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? (
        <span className="text-xs" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded-xl border px-3 py-2.5 text-base outline-none focus:ring-2"
      style={fieldStyle}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-xl border px-3 py-2.5 text-base outline-none focus:ring-2"
      style={fieldStyle}
    />
  );
}

export function Checkbox({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-3">
      <input type="checkbox" name={name} className="h-5 w-5" />
      <span className="text-sm">{label}</span>
    </label>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm" style={{ color: 'var(--color-critical)' }}>
      {children}
    </p>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-xl bg-slate-900 px-4 py-3 font-medium text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}
