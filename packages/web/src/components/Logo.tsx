import type { CSSProperties } from 'react';

/** Secondary brand constants of the Orbital mark. Only used for tone='accent';
 * ink/muted tones render the mark fully monochrome via currentColor. */
const MINT = '#35E0A1';
const VIOLET = '#8B7CFF';

export interface LogoProps {
  /** Visual size of the mark glyph in pixels. Defaults to 14. */
  size?: number;
  /** Show the "kodra" wordmark next to the mark. */
  withWordmark?: boolean;
  /** Color treatment of the mark. Defaults to 'accent' (brand colors). */
  tone?: 'accent' | 'ink' | 'muted';
  className?: string;
  style?: CSSProperties;
}

/**
 * Kodra brand mark — Orbital variant.
 *
 * Geometry mirrors the official symbol (kodra-mark.svg): three nodes
 * (blue, mint, violet) coordinate through a core, which launches two spokes
 * past a dashed orbital ring — agents, coordination, execution.
 *
 * - tone='accent' keeps the mark's brand colors (accent + mint/violet, with
 *   the second spoke following the theme ink so it reads on any surface).
 * - tone='ink'/'muted' collapse everything to currentColor for a quiet,
 *   monochrome rendering next to body text.
 * - Below 16px (the 11px modal-chip scale) stroke widths and node radii are
 *   boosted so the thin orbital rings survive pixel-grid rounding.
 */
export function Logo({
  size = 14,
  withWordmark = false,
  tone = 'accent',
  className,
  style,
}: LogoProps) {
  const toneVar =
    tone === 'ink' ? 'var(--ink)' : tone === 'muted' ? 'var(--ink-2)' : 'var(--accent)';
  const monochrome = tone !== 'accent';
  const tileSize = size + 8;

  // Small-scale boost: at 11px the viewBox-24 strokes (0.75/0.45) land at
  // ~0.3px and disappear. Thicken strokes, grow nodes, raise ring opacity.
  const compact = size < 16;
  const sw = {
    ringOuter: compact ? 1.5 : 0.75,
    ringInner: compact ? 1.05 : 0.45,
    ringDash: compact ? '1.5 1.8' : '1.1 1.6',
    ringOuterOpacity: compact ? 0.55 : 0.35,
    ringInnerOpacity: compact ? 0.75 : 0.55,
    link: compact ? 1.7 : 1.2,
    spoke: compact ? 2.9 : 2.2,
    node: compact ? 1.45 : 1.1,
    satellite: compact ? 0.95 : 0.55,
  };

  const accent = 'currentColor'; // svg style.color = toneVar
  const mint = monochrome ? 'currentColor' : MINT;
  const violet = monochrome ? 'currentColor' : VIOLET;
  // The official mark's second spoke is #F5F7FA; follow the theme ink instead
  // so it stays visible on light surfaces too. Monochrome collapses it.
  const spokeAlt = monochrome ? 'currentColor' : 'var(--ink)';

  const tileBackground =
    tone === 'accent' ? 'var(--accent-soft)' : `color-mix(in srgb, ${toneVar} 7%, transparent)`;
  const tileBorder =
    tone === 'accent' ? 'var(--accent-line)' : `color-mix(in srgb, ${toneVar} 22%, transparent)`;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--ff-sans)',
        fontWeight: 600,
        ...style,
      }}
      role={withWordmark ? undefined : 'img'}
      aria-label={withWordmark ? undefined : 'Kodra'}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: tileSize,
          height: tileSize,
          borderRadius: 6,
          background: tileBackground,
          border: `1px solid ${tileBorder}`,
          flexShrink: 0,
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width={size}
          height={size}
          fill="none"
          aria-hidden
          style={{ color: toneVar }}
        >
          {/* orbital rings */}
          <circle
            cx="12"
            cy="12"
            r="9.2"
            stroke="currentColor"
            strokeWidth={sw.ringOuter}
            opacity={sw.ringOuterOpacity}
          />
          <circle
            cx="12"
            cy="12"
            r="7.3"
            stroke="currentColor"
            strokeWidth={sw.ringInner}
            strokeDasharray={sw.ringDash}
            opacity={sw.ringInnerOpacity}
          />
          {/* left node cluster */}
          <circle cx="5.8" cy="7.3" r={sw.node} fill={accent} />
          <circle cx="5.2" cy="12" r={sw.node} fill={mint} />
          <circle cx="5.8" cy="16.7" r={sw.node} fill={violet} />
          {/* coordination lines into the core */}
          <path
            d="M6.6 7.8 C8.5 8.6 9.4 10.4 11.2 11.5"
            stroke={accent}
            strokeWidth={sw.link}
            strokeLinecap="round"
          />
          <path d="M6.2 12 H11.3" stroke={mint} strokeWidth={sw.link} strokeLinecap="round" />
          <path
            d="M6.6 16.2 C8.5 15.4 9.4 13.6 11.2 12.5"
            stroke={violet}
            strokeWidth={sw.link}
            strokeLinecap="round"
          />
          {/* launch spokes from the core */}
          <path
            d="M11 12 L16.8 6.2"
            stroke={accent}
            strokeWidth={sw.spoke}
            strokeLinecap="round"
          />
          <path
            d="M11 12 L16.8 17.8"
            stroke={spokeAlt}
            strokeWidth={sw.spoke}
            strokeLinecap="round"
          />
          {/* trailing satellites */}
          <circle cx="19.4" cy="5.3" r={sw.satellite} fill={accent} />
          <circle cx="18.2" cy="19" r={sw.satellite} fill={mint} />
        </svg>
      </span>
      {withWordmark ? (
        <span
          style={{
            color: 'var(--ink)',
            fontSize: Math.round(size * 1.05),
            fontWeight: 600,
            letterSpacing: '-0.02em',
          }}
        >
          kodra
        </span>
      ) : null}
    </span>
  );
}
