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

/**
 * Uncontrolled by default, which is what almost every form here wants.
 * Pass `checked` and `onChange` when the answer has to steer the rest of the
 * form — a product that does not expire, for instance, should not go on being
 * asked how long past its date it stays usable.
 */
export function Checkbox({
  name,
  label,
  defaultChecked,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <input
        {...(checked === undefined
          ? { defaultChecked }
          : { checked, onChange: (event) => onChange?.(event.target.checked) })}
        type="checkbox"
        name={name}
        className="h-5 w-5 shrink-0"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}

/** Free text with suggestions — the value is not restricted to the list. */
export function Datalist({ id, options }: { id: string; options: string[] }) {
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
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
      className="is-action w-full rounded-xl px-4 py-3 font-medium disabled:opacity-50"
      style={{
        background: 'var(--color-accent)',
        color: 'var(--accent-ink)',
        boxShadow: `var(--glow) color-mix(in oklch, var(--color-accent) 45%, transparent)`,
      }}
    >
      {pending ? 'Saving…' : children}
    </button>
  );
}
