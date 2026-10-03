import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { IconButton, IconsaxIcon } from '@kanbots/ui';
import { CloseCircle } from 'iconsax-react';
import { Logo } from '../Logo.js';

export interface ModalFrameProps {
  title: ReactNode;
  onClose: () => void;
  /** Max width in px. */
  width?: number;
  /** Extra header content between the title and the close button. */
  headerExtra?: ReactNode;
  /** Muted note on the left of the footer. */
  footerHint?: ReactNode;
  /** Footer buttons, right-aligned. Omit both footer props for no footer. */
  actions?: ReactNode;
  /**
   * Classes for the body wrapper. Bodies that still use the legacy CSS keep
   * their own class (e.g. `kb-sentry-body`) until they are migrated too.
   */
  bodyClassName?: string;
  /** Let the body fill the dialog and manage its own scrolling. */
  fillBody?: boolean;
  /**
   * Close on Escape. Turn off for modals that handle Escape themselves
   * (e.g. to cancel an inline edit first, or to stay open while saving).
   */
  escapeCloses?: boolean;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * Shared dialog chrome for every modal: MUI Dialog with the Kodra mark and
 * title, a close button, a scrolling body and an optional footer.
 */
export function ModalFrame({
  title,
  onClose,
  width = 1100,
  headerExtra,
  footerHint,
  actions,
  bodyClassName,
  fillBody = false,
  escapeCloses = true,
  ariaLabel,
  children,
}: ModalFrameProps) {
  const hasFooter = footerHint !== undefined || actions !== undefined;
  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth={false}
      disableEscapeKeyDown={!escapeCloses}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      PaperProps={{
        sx: {
          maxWidth: width,
          ...(fillBody && { height: 'calc(100% - 64px)' }),
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1.75, pr: 1.5 }}
      >
        <Box sx={{ display: 'flex', color: 'text.primary' }}>
          <Logo size={14} />
        </Box>
        <Typography variant="h5" component="h2" noWrap sx={{ minWidth: 0 }}>
          {title}
        </Typography>
        <Box sx={{ flex: 1, minWidth: 8 }} />
        {headerExtra}
        <IconButton color="secondary" aria-label="Close (Esc)" onClick={onClose}>
          <IconsaxIcon icon={CloseCircle} size={20} />
        </IconButton>
      </DialogTitle>
      <DialogContent
        dividers
        sx={{
          p: 0,
          display: 'flex',
          flexDirection: 'column',
          ...(fillBody && { overflow: 'hidden' }),
        }}
      >
        <Box
          className={['kb-app', bodyClassName].filter(Boolean).join(' ')}
          sx={{ flex: 1, minHeight: 0, ...(fillBody && { display: 'flex', overflow: 'hidden' }) }}
        >
          {children}
        </Box>
      </DialogContent>
      {hasFooter ? (
        <DialogActions sx={{ px: 3, py: 1.75, gap: 1 }}>
          {footerHint !== undefined ? (
            <Typography
              variant="caption"
              color="text.secondary"
              component="div"
              sx={{ mr: 'auto', '& code': { fontFamily: 'var(--ff-mono, monospace)' } }}
            >
              {footerHint}
            </Typography>
          ) : (
            <Box sx={{ mr: 'auto' }} />
          )}
          <Stack direction="row" spacing={1}>
            {actions}
          </Stack>
        </DialogActions>
      ) : null}
    </Dialog>
  );
}
