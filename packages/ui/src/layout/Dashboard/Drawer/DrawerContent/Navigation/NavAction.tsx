import { createContext, useContext, type ReactNode } from 'react';
import type { Icon as IconComponent } from 'iconsax-react';

// material-ui
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Chip, { type ChipProps } from '@mui/material/Chip';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

// project-imports
import IconsaxIcon from '../../../../../components/IconsaxIcon';
import { ThemeMode } from '../../../../../config';

/** Whether the drawer is expanded; provided by DashboardLayout. */
export const DrawerOpenContext = createContext(true);

export function useDrawerOpen() {
  return useContext(DrawerOpenContext);
}

export interface NavActionProps {
  title: string;
  icon: IconComponent;
  onClick: () => void;
  selected?: boolean;
  chip?: { label: ReactNode; color?: ChipProps['color'] };
  /** Keyboard shortcut hint shown on the right when the drawer is open. */
  shortcut?: string;
}

// ==============================|| NAVIGATION - ACTION ITEM ||============================== //

/**
 * The template's NavItem with the router taken out: it runs `onClick`
 * instead of linking to a route, and the caller decides what is selected.
 */
export function NavAction({
  title,
  icon: Icon,
  onClick,
  selected = false,
  chip,
  shortcut,
}: NavActionProps) {
  const theme = useTheme();
  const drawerOpen = useDrawerOpen();
  const mode = theme.palette.mode;

  const textColor = mode === ThemeMode.DARK ? 'secondary.400' : 'secondary.main';
  const iconSelectedColor = 'primary.main';

  const button = (
    <ListItemButton
      selected={selected}
      onClick={onClick}
      sx={{
        zIndex: 1201,
        pl: drawerOpen ? '20px' : 1.5,
        py: drawerOpen ? 1 : 1.25,
        ...(drawerOpen && {
          mx: 1.25,
          my: 0.5,
          borderRadius: 1,
          '&:hover': { bgcolor: mode === ThemeMode.DARK ? 'divider' : 'secondary.200' },
          '&.Mui-selected': {
            color: iconSelectedColor,
            bgcolor: 'transparent',
            '&:hover': { color: iconSelectedColor },
          },
        }),
        ...(!drawerOpen && {
          px: 2.75,
          justifyContent: 'center',
          '&:hover': { bgcolor: 'transparent' },
          '&.Mui-selected': { '&:hover': { bgcolor: 'transparent' }, bgcolor: 'transparent' },
        }),
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 38,
          color: selected ? iconSelectedColor : textColor,
          ...(!drawerOpen && {
            borderRadius: 1,
            width: 46,
            height: 46,
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover': { bgcolor: mode === ThemeMode.DARK ? 'secondary.light' : 'secondary.200' },
          }),
          ...(!drawerOpen &&
            selected && {
              bgcolor: mode === ThemeMode.DARK ? 'secondary.100' : 'primary.lighter',
              '&:hover': { bgcolor: mode === ThemeMode.DARK ? 'secondary.200' : 'primary.lighter' },
            }),
        }}
      >
        <IconsaxIcon icon={Icon} variant="Bulk" size={drawerOpen ? 20 : 22} />
      </ListItemIcon>
      {drawerOpen && (
        <ListItemText
          primary={
            <Typography
              variant="h6"
              sx={{
                color: selected ? iconSelectedColor : textColor,
                fontWeight: selected ? 500 : 400,
              }}
            >
              {title}
            </Typography>
          }
        />
      )}
      {drawerOpen && chip && (
        <Chip color={chip.color ?? 'primary'} size="small" label={chip.label} />
      )}
      {drawerOpen && shortcut && !chip && (
        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          {shortcut}
        </Typography>
      )}
    </ListItemButton>
  );

  return drawerOpen ? (
    button
  ) : (
    <Tooltip title={title} placement="right">
      {button}
    </Tooltip>
  );
}

export interface NavGroupProps {
  /** Caption above the group; hidden when the drawer is collapsed. */
  title?: string;
  children: ReactNode;
}

// ==============================|| NAVIGATION - GROUP ||============================== //

export function NavGroup({ title, children }: NavGroupProps) {
  const drawerOpen = useDrawerOpen();
  return (
    <List
      sx={{ py: 0, ...(drawerOpen && { mt: 1.5 }) }}
      subheader={
        title && drawerOpen ? (
          <Box sx={{ pl: 3, mb: 1.5 }}>
            <Typography
              variant="h5"
              color="secondary.dark"
              sx={{ textTransform: 'uppercase', fontSize: '0.688rem' }}
            >
              {title}
            </Typography>
          </Box>
        ) : undefined
      }
    >
      {children}
    </List>
  );
}
