import { expiryStatus, formatExpiry, type ExpiryInput, type ExpiryStatus } from '@/domain/expiry';

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
  expired: { bg: 'var(--color-critical)', fg: 'white', label: 'expired' },
};

export function ExpiryBadge({ input, today }: { input: ExpiryInput; today: string }) {
  const status = expiryStatus(input, today);
  const style = STYLES[status];

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{ background: style.bg, color: style.fg }}
      title={status}
    >
      {style.label ?? formatExpiry(input)}
    </span>
  );
}
