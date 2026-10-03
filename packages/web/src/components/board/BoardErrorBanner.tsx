import Alert from '@mui/material/Alert';

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
    <Alert severity="error" role="alert" onClose={onDismiss} sx={{ mx: 3, mb: 1.5 }}>
      {message}
    </Alert>
  );
}
