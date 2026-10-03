import type { ReactNode } from 'react';

// material-ui
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';

// project-imports
import DrawerHeaderStyled from './DrawerHeader/DrawerHeaderStyled';
import MiniDrawerStyled from './MiniDrawerStyled';
import SimpleBar from '../../../components/third-party/SimpleBar';

import { DRAWER_WIDTH, HEADER_HEIGHT } from '../../../config';

export interface MainDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Logo / brand row at the top of the drawer. */
  header: ReactNode;
  /** Scrollable navigation content. */
  children: ReactNode;
  /** Pinned below the scroll area (e.g. the account row). */
  footer?: ReactNode;
}

// ==============================|| MAIN LAYOUT - DRAWER ||============================== //

/**
 * The template's drawer, driven by props instead of the template's global
 * menu store and router: permanent mini drawer on large screens, temporary
 * drawer below `md`.
 */
export default function MainDrawer({ open, onClose, header, children, footer }: MainDrawerProps) {
  const theme = useTheme();
  // Desktop windows are often narrower than the template's lg (1266px):
  // keep the permanent mini drawer down to md.
  const downMD = useMediaQuery(theme.breakpoints.down('md'));

  const content = (
    <>
      <DrawerHeaderStyled
        theme={theme}
        open={open}
        sx={{ minHeight: HEADER_HEIGHT, py: 1, pl: open ? 3 : 0 }}
      >
        {header}
      </DrawerHeaderStyled>
      <SimpleBar sx={{ '& .simplebar-content': { display: 'flex', flexDirection: 'column' } }}>
        {children}
      </SimpleBar>
      {footer}
    </>
  );

  return (
    <Box
      component="nav"
      sx={{ flexShrink: { md: 0 }, zIndex: theme.zIndex.drawer }}
      aria-label="workspace navigation"
    >
      {!downMD ? (
        <MiniDrawerStyled variant="permanent" open={open}>
          {content}
        </MiniDrawerStyled>
      ) : (
        <Drawer
          variant="temporary"
          open={open}
          onClose={onClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: `1px solid ${theme.palette.divider}`,
              backgroundImage: 'none',
              boxShadow: 'inherit',
            },
          }}
        >
          {content}
        </Drawer>
      )}
    </Box>
  );
}
