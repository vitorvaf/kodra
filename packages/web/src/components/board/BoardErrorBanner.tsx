export interface BoardErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

/**
 * Inline error strip rendered between the toolbar/filters and the board.
 * Used by both modes for drag-drop failures, fetch errors, etc.
 */
export function BoardErrorBanner({ message, onDismiss }: BoardErrorBannerProps) {
  if (message === null) return null;
  return (
    <div
      role="alert"
      style={{
        padding: '8px 18px',
        color: 'var(--failed)',
        fontSize: 12,
        background: 'oklch(0.7 0.18 25 / 0.08)',
        borderBottom: '1px solid var(--hairline-soft)',
      }}
    >
      {message}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="dismiss"
        style={{
          marginLeft: 8,
          background: 'transparent',
          border: 'none',
          color: 'var(--failed)',
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}
