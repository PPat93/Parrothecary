/**
 * Button colour vocabulary. Plain module with no 'use client', so server
 * components can style links with it without dragging a client bundle along.
 *
 * Blue moves you forward, red destroys or abandons, amber retires, green brings
 * back or adds.
 */
export type Tone = 'accent' | 'critical' | 'warning' | 'ok' | 'neutral';

const TONE_COLOUR: Record<Tone, string> = {
  accent: 'var(--color-accent)',
  critical: 'var(--color-critical)',
  warning: 'var(--color-warning)',
  ok: 'var(--color-ok)',
  neutral: 'var(--border)',
};

export function toneStyle(tone: Tone, variant: 'solid' | 'outline' = 'outline') {
  const colour = TONE_COLOUR[tone];

  if (variant === 'solid') {
    return {
      background: colour,
      color: 'var(--accent-ink)',
      borderColor: colour,
      boxShadow: `var(--glow) color-mix(in oklch, ${colour} 40%, transparent)`,
    };
  }

  return {
    borderColor: tone === 'neutral' ? 'var(--border)' : colour,
    color: tone === 'neutral' ? 'var(--muted)' : colour,
    background: 'transparent',
  };
}

/**
 * Shared shape for links that act as buttons. The global 44px tap-target rule
 * only applies to <button>, so links need the min-height spelled out or they
 * render visibly shorter beside one.
 */
export const LINK_BUTTON =
  'is-action inline-flex min-h-[44px] shrink-0 items-center rounded-lg border px-3 text-sm font-medium';
