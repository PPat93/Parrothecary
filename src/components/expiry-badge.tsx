import {
  daysPastDate,
  daysUntilExpiry,
  expiryStatus,
  formatExpiry,
  type ExpiryInput,
  type ExpiryStatus,
} from '@/domain/expiry';

const STYLES: Record<ExpiryStatus, { bg: string; fg: string; label?: string }> = {
  none: { bg: 'transparent', fg: 'var(--muted)' },
  unknown: {
    bg: 'color-mix(in oklch, var(--color-warning) 12%, transparent)',
    fg: 'var(--muted)',
  },
  ok: { bg: 'color-mix(in oklch, var(--color-ok) 18%, transparent)', fg: 'var(--color-ok)' },
  warning: {
    bg: 'color-mix(in oklch, var(--color-warning) 22%, transparent)',
    fg: 'var(--color-warning)',
  },
  critical: {
    bg: 'color-mix(in oklch, var(--color-critical) 18%, transparent)',
    fg: 'var(--color-critical)',
  },
  /*
   * Amber and solid: the app is still taking doses from this box, so red
   * ("stop, bin it") would be wrong — but so would the quiet outline of a box
   * that is comfortably in date. Amber is the app's retire-soon colour, which
   * is exactly what this is.
   */
  in_grace: { bg: 'var(--color-warning)', fg: 'black', label: 'past date' },
  expired: { bg: 'var(--color-critical)', fg: 'white', label: 'expired' },
};

/**
 * What the badge says when you hover or long-press it.
 *
 * Two states used to explain themselves and the rest fell through to the raw
 * status name, so a box in date announced itself as "critical" — the internal
 * enum, shown to the only two people who will ever read it.
 */
function describe(
  input: ExpiryInput,
  today: string,
  status: ExpiryStatus,
  past: number | null,
): string | undefined {
  if (status === 'in_grace') {
    return `${formatExpiry(input)} — ${past} days past date, still inside this product's ${input.graceDays}-day window, so doses are taken from it`;
  }
  if (status === 'expired') {
    return `${formatExpiry(input)} — ${past} days past date, beyond what this product allows. Nothing is taken from it.`;
  }
  if (status === 'unknown') {
    return 'This product expires, but no date was recorded for this box, so it cannot be warned about.';
  }
  // 'none' already reads as "no expiry" on the badge itself.
  const days = daysUntilExpiry(input, today);
  return days === null ? undefined : `${formatExpiry(input)} — ${days} days left`;
}

export function ExpiryBadge({ input, today }: { input: ExpiryInput; today: string }) {
  const status = expiryStatus(input, today);
  const style = STYLES[status];
  const past = daysPastDate(input, today);

  // Faint glow echoing the logo's neon. Only on states that mean something —
  // --glow collapses to 0 in light mode, where it would just look blurry.
  const glowing = status === 'ok' || status === 'warning' || status === 'critical';

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{
        background: style.bg,
        color: style.fg,
        boxShadow: glowing ? `var(--glow) color-mix(in oklch, ${style.fg} 30%, transparent)` : undefined,
      }}
      title={describe(input, today, status, past)}
    >
      {style.label ?? formatExpiry(input)}
    </span>
  );
}
