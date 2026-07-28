import Link from 'next/link';

/**
 * A plain GET form. No JavaScript, no debounce, no state to get out of sync —
 * the query lives in the URL, so a search can be bookmarked or reloaded.
 *
 * The controls sit inside the field as icons rather than as a labelled button.
 * A blue "Find" competed with the blue primary action in the same header and
 * implied equal importance; a loupe is understood without a label and stays
 * out of the way.
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
    <form action={action} className="mb-4">
      <div className="relative">
        <input
          type="search"
          name="q"
          defaultValue={value}
          placeholder={placeholder}
          aria-label="Search"
          enterKeyHint="search"
          // Room for the icons, and wider when the clear button is showing.
          // appearance-none kills the browser's own search cross, which would
          // sit next to ours and clear without submitting.
          className={`w-full appearance-none rounded-xl border py-2 pl-3 text-base outline-none focus:ring-2 [&::-webkit-search-cancel-button]:hidden ${
            value ? 'pr-[5.25rem]' : 'pr-12'
          }`}
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        />

        <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
          {value ? (
            <Link
              href={action}
              aria-label="Clear search"
              title="Clear search"
              className="is-action flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ color: 'var(--muted)' }}
            >
              <Icon>
                <path d="M6 6l12 12M18 6L6 18" />
              </Icon>
            </Link>
          ) : null}

          <button
            type="submit"
            aria-label="Search"
            title="Search"
            className="is-action flex h-9 w-9 min-h-0 items-center justify-center rounded-lg"
            style={{ color: 'var(--muted)' }}
          >
            <Icon>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </Icon>
          </button>
        </div>
      </div>
    </form>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
