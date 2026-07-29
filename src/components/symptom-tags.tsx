/**
 * The "what is this for" line under a product in a list.
 *
 * Shared by the stock and product lists so the two read identically — the whole
 * point is scanning down a page and recognising something without opening it.
 * Muted and small: it is context, not the heading.
 */
export function SymptomTags({ names }: { names: string[] | undefined }) {
  if (!names || names.length === 0) return null;

  return (
    <ul className="mt-1 flex flex-wrap gap-1">
      {names.map((name) => (
        <li
          key={name}
          /*
           * Deliberately identical to ExpiryBadge — same radius, padding, size
           * and weight. Two chip shapes on one row read as two unrelated things;
           * one shape in different colours reads as one system, where the colour
           * is the only thing carrying meaning.
           */
          className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium"
          style={{
            background: 'color-mix(in oklch, var(--color-accent) 14%, transparent)',
            color: 'var(--color-accent)',
          }}
        >
          {name}
        </li>
      ))}
    </ul>
  );
}
