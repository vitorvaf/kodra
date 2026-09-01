import type { CSSProperties } from 'react';

export interface LogoProps {
  /** Visual size of the mark glyph in pixels. Defaults to 14 (modal-chip scale). */
  size?: number;
  /** Show the "kanbots" wordmark next to the mark. */
  withWordmark?: boolean;
  /** Override CSS color of the mark. Defaults to var(--accent). */
  tone?: 'accent' | 'ink' | 'muted';
  className?: string;
  style?: CSSProperties;
}

/**
 * Shared kanbots brand mark used across the web app.
 *
 * The mark is four rounded rectangles arranged like a kanban board: three
 * outlined columns + one filled column emphasizing the active card. Mirrors
 * the marketing site logo so OSS and Cloud read as the same product.
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
  const tileSize = size + 8;

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--ff-sans)',
        fontWeight: 500,
        ...style,
      }}
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
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent-line)',
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
          <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13" y="3" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13" y="11" width="8" height="10" rx="1.5" fill="currentColor" opacity="0.9" />
        </svg>
      </span>
      {withWordmark ? (
        <span
          style={{
            color: 'var(--ink)',
            fontSize: Math.round(size * 1.05),
            letterSpacing: '-0.01em',
          }}
        >
          kanbots
        </span>
      ) : null}
    </span>
  );
}
