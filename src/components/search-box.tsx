import Link from 'next/link';

/**
 * A plain GET form. No JavaScript, no debounce, no state to get out of sync —
 * the query lives in the URL, so a search can be bookmarked or reloaded.
 */
export function SearchBox({
  action,
  value,
  placeholder,
}: {
  action: string;
  value: string;
  placeholder: string;
}) {
  return (
    <form action={action} className="mb-4 flex gap-2">
      <input
        type="search"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        aria-label="Search"
        enterKeyHint="search"
        className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-base outline-none focus:ring-2"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      />
      <button
        type="submit"
        className="rounded-xl border px-4 text-sm font-medium"
        style={{ borderColor: 'var(--border)' }}
      >
        Find
      </button>
      {value ? (
        <Link
          href={action}
          className="flex items-center rounded-xl border px-3 text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
