import type { CSSProperties } from 'react';

export interface KodraPulseProps {
  /** Diameter of the dot in pixels. Defaults to 8. */
  size?: number;
  /** Pulse color. Defaults to 'mint' (running/execution). */
  tone?: 'mint' | 'accent' | 'violet';
  /** Accessible label. When omitted the glyph is aria-hidden decoration. */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * "Kodra Pulse" — a tiny activity glyph: ── ● ──
 *
 * A soft-pulsing dot between two hairlines, for "an agent is working here"
 * moments. Reuses the shared `kb-pulse` keyframes from tokens.css (and
 * therefore respects the global prefers-reduced-motion override).
 *
 * Suggested integrations (not wired here — owning files belong to other
 * workstreams):
 *   - Running rows in the board / agent lane headers (tone='mint')
 *   - Autopilot launch confirmation states (tone='mint')
 *   - Awaiting-input card markers (tone='violet')
 */
export function KodraPulse({ size = 8, tone = 'mint', label, className, style }: KodraPulseProps) {
  const toneVar =
    tone === 'violet' ? 'var(--awaiting)' : tone === 'accent' ? 'var(--accent)' : 'var(--running)';
  const hairline: CSSProperties = {
    width: size * 1.75,
    height: 1,
    background: `color-mix(in srgb, ${toneVar} 35%, transparent)`,
  };

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span aria-hidden style={hairline} />
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: toneVar,
          animation: 'kb-pulse 1.6s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
      <span aria-hidden style={hairline} />
    </span>
  );
}
