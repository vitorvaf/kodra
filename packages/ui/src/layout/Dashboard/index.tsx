import type { ReactNode } from 'react';

// material-ui
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';

// project-imports
import MainDrawer from './Drawer';
import Header from './Header';
import { DrawerOpenContext } from './Drawer/DrawerContent/Navigation/NavAction';

import { DRAWER_WIDTH } from '../../config';

export interface DashboardLayoutProps {
  drawerOpen: boolean;
  onDrawerToggle: () => void;
  /** Brand row at the top of the drawer. */
  drawerHeader: ReactNode;
  /** Scrollable drawer navigation. */
  drawerContent: ReactNode;
  /** Pinned to the bottom of the drawer. */
  drawerFooter?: ReactNode;
  /** Right of the drawer toggle in the app bar. */
  headerContent: ReactNode;
  /** Frameless desktop window: the app bar doubles as the drag handle. */
  draggableHeader?: boolean;
  children: ReactNode;
}

// ==============================|| MAIN LAYOUT ||============================== //

/**
 * The template's dashboard layout without router, auth guard, breadcrumbs or
 * footer. The main area fills the window exactly and does not scroll itself:
 * a desktop board manages its own scrolling.
 */
export default function DashboardLayout({
  drawerOpen,
  onDrawerToggle,
  drawerHeader,
  drawerContent,
  drawerFooter,
  headerContent,
  draggableHeader,
  children,
}: DashboardLayoutProps) {
  return (
    <DrawerOpenContext.Provider value={drawerOpen}>
      <Box sx={{ display: 'flex', width: '100%', height: '100vh', overflow: 'hidden' }}>
        <Header drawerOpen={drawerOpen} onDrawerToggle={onDrawerToggle} draggable={draggableHeader}>
          {headerContent}
        </Header>
        <MainDrawer
          open={drawerOpen}
          onClose={onDrawerToggle}
          header={drawerHeader}
          footer={drawerFooter}
        >
          {drawerContent}
        </MainDrawer>
        <Box
          component="main"
          sx={{
            width: `calc(100% - ${DRAWER_WIDTH}px)`,
            flexGrow: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            height: '100%',
          }}
        >
          <Toolbar />
          <Box
            sx={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </DrawerOpenContext.Provider>
  );
}
