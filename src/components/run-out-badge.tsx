import { runOutSeverity, type RunOutProjection, type RunOutSeverity } from '@/domain/runout';

// Same shape family as ExpiryBadge/SymptomTags on purpose — one system, colour
// carries the meaning.
const STYLES: Record<RunOutSeverity, { bg: string; fg: string }> = {
  none: { bg: 'transparent', fg: 'var(--muted)' },
  ok: { bg: 'color-mix(in oklch, var(--color-ok) 18%, transparent)', fg: 'var(--color-ok)' },
  warning: {
    bg: 'color-mix(in oklch, var(--color-warning) 22%, transparent)',
    fg: 'var(--color-warning)',
  },
  critical: {
    bg: 'color-mix(in oklch, var(--color-critical) 18%, transparent)',
    fg: 'var(--color-critical)',
  },
};

/*
 * "of stock", not "left", and the words are the whole point.
 *
 * This number is supply: how long what is in the cupboard lasts at the current
 * dose rate. It is not the length of the course, and it is not how long until
 * anything expires — but "60 days left" beside a dose schedule reads as both,
 * and a 60-tablet pack taken once a day produces exactly that. The only thing
 * that said otherwise was the `title` below, and a phone never shows a tooltip.
 *
 * The expiring screen uses "days left" for days until an expiry date, so the
 * same three words meant two different things on a screen that can show both.
 */
function label(projection: RunOutProjection): string {
  if (projection.daysRemaining === 0) return 'out of stock today';
  if (projection.daysRemaining === 1) return '1 day of stock';
  return `${projection.daysRemaining} days of stock`;
}

/** Nothing rendered when there is no active schedule for this product — silence, not a "none" chip. */
export function RunOutBadge({ projection }: { projection: RunOutProjection | null }) {
  if (projection === null) return null;

  const severity = runOutSeverity(projection);
  const style = STYLES[severity];
  const glowing = severity === 'ok' || severity === 'warning' || severity === 'critical';

  return (
    <span
      className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-medium tabular-nums"
      style={{
        background: style.bg,
        color: style.fg,
        boxShadow: glowing ? `var(--glow) color-mix(in oklch, ${style.fg} 30%, transparent)` : undefined,
      }}
      title={`Runs out ${projection.runOutDate} at the current rate`}
    >
      {label(projection)}
    </span>
  );
}
