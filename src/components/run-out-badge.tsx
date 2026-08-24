import {
  runOutLabel,
  runOutSeverity,
  type RunOutProjection,
  type RunOutSeverity,
} from '@/domain/runout';

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
      {runOutLabel(projection)}
    </span>
  );
}
