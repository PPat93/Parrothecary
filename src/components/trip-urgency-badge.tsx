import { daysUntilOrderBy, tripUrgency, type TripUrgency } from '@/domain/trip';

// Same shape family as ExpiryBadge and RunOutBadge — one system.
const STYLES: Record<TripUrgency, { bg: string; fg: string }> = {
  passed: { bg: 'var(--color-critical)', fg: 'white' },
  critical: {
    bg: 'color-mix(in oklch, var(--color-critical) 18%, transparent)',
    fg: 'var(--color-critical)',
  },
  warning: {
    bg: 'color-mix(in oklch, var(--color-warning) 22%, transparent)',
    fg: 'var(--color-warning)',
  },
  ok: { bg: 'color-mix(in oklch, var(--color-ok) 18%, transparent)', fg: 'var(--color-ok)' },
};

/**
 * Counts down to the order deadline, not the trip. Renders nothing when no
 * deadline is set — silence rather than a chip claiming everything is fine.
 */
export function TripUrgencyBadge({
  orderByDate,
  today,
}: {
  orderByDate: string | null;
  today: string;
}) {
  if (orderByDate === null) return null;

  const urgency = tripUrgency(orderByDate, today);
  const days = daysUntilOrderBy(orderByDate, today);
  const style = STYLES[urgency];

  const label =
    days < 0
      ? `order deadline passed`
      : days === 0
        ? 'order today'
        : days === 1
          ? '1 day to order'
          : `${days} days to order`;

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{ background: style.bg, color: style.fg }}
      title={`Orders for this trip should be placed by ${orderByDate}`}
    >
      {label}
    </span>
  );
}
