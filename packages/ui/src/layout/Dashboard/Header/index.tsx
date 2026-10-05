import type { ReactNode } from 'react';

// material-ui
import { alpha, useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import AppBar, { type AppBarProps } from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';

// project-imports
import AppBarStyled from './AppBarStyled';
import IconButton from '../../../components/@extended/IconButton';
import IconsaxIcon from '../../../components/IconsaxIcon';

import { DRAWER_WIDTH, MINI_DRAWER_WIDTH, ThemeMode } from '../../../config';

// assets
import { HambergerMenu } from 'iconsax-react';

export interface HeaderProps {
  drawerOpen: boolean;
  onDrawerToggle: () => void;
  children: ReactNode;
  /**
   * Frameless desktop windows: make the bar the window's drag handle while
   * keeping its controls clickable.
   */
  draggable?: boolean;
}

// ==============================|| MAIN LAYOUT - HEADER ||============================== //

export default function Header({
  drawerOpen,
  onDrawerToggle,
  children,
  draggable = false,
}: HeaderProps) {
  const theme = useTheme();
  const downMD = useMediaQuery(theme.breakpoints.down('md'));
  const mode = theme.palette.mode;

  const iconBackColorOpen = mode === ThemeMode.DARK ? 'background.paper' : 'secondary.200';
  const iconBackColor = mode === ThemeMode.DARK ? 'background.default' : 'secondary.100';

  const mainHeader: ReactNode = (
    <Toolbar
      sx={{
        px: { xs: 2, sm: 3, lg: 4 },
        gap: 1,
        ...(draggable && {
          WebkitAppRegion: 'drag',
          '& button, & a, & input, & [role="button"], & .no-drag': { WebkitAppRegion: 'no-drag' },
        }),
      }}
    >
      <IconButton
        aria-label="toggle drawer"
        onClick={onDrawerToggle}
        edge="start"
        color="secondary"
        variant="light"
        size="large"
        sx={{
          color: 'secondary.main',
          bgcolor: drawerOpen ? iconBackColorOpen : iconBackColor,
          ml: { xs: 0, md: -1 },
          p: 1,
        }}
      >
        <IconsaxIcon icon={HambergerMenu} />
      </IconButton>
      {children}
    </Toolbar>
  );

  const appBar: AppBarProps = {
    position: 'fixed',
    elevation: 0,
    sx: {
      bgcolor: alpha(theme.palette.background.default, 0.8),
      // AppBar defaults to the primary contrast text (white), which vanishes
      // on the translucent light background.
      color: 'text.primary',
      backdropFilter: 'blur(8px)',
      zIndex: theme.zIndex.appBar,
      width: {
        xs: '100%',
        md: drawerOpen ? `calc(100% - ${DRAWER_WIDTH}px)` : `calc(100% - ${MINI_DRAWER_WIDTH}px)`,
      },
    },
  };

  return !downMD ? (
    <AppBarStyled open={drawerOpen} {...appBar}>
      {mainHeader}
    </AppBarStyled>
  ) : (
    <AppBar {...appBar}>{mainHeader}</AppBar>
  );
}
