import {
  daysPastDate,
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
      title={
        status === 'in_grace'
          ? `${formatExpiry(input)} — ${past} days past date, still inside this product's ${input.graceDays}-day window, so doses are taken from it`
          : status === 'expired'
            ? `${formatExpiry(input)} — ${past} days past date, beyond what this product allows. Nothing is taken from it.`
            : status
      }
    >
      {style.label ?? formatExpiry(input)}
    </span>
  );
}
