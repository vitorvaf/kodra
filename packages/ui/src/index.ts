// Kodra UI kit built on the Able Pro MUI template (licensed for this
// project; this package is private and never published).

// fonts and third-party styles the template expects globally
import './assets/fonts/inter/inter.css';
import 'simplebar-react/dist/simplebar.min.css';

export { default as ThemeCustomization } from './themes';
export { ConfigProvider, ConfigContext } from './contexts/ConfigContext';
export { default as useConfig } from './hooks/useConfig';
export {
  default as config,
  DRAWER_WIDTH,
  HEADER_HEIGHT,
  MINI_DRAWER_WIDTH,
  ThemeMode,
  ThemeDirection,
  MenuOrientation,
} from './config';
export type { DefaultConfigProps, PresetColor, FontFamily } from './types/config';

export { default as DashboardLayout, type DashboardLayoutProps } from './layout/Dashboard';
export {
  NavAction,
  NavGroup,
  useDrawerOpen,
  type NavActionProps,
  type NavGroupProps,
} from './layout/Dashboard/Drawer/DrawerContent/Navigation/NavAction';

export { default as MainCard } from './components/MainCard';
export { default as IconButton } from './components/@extended/IconButton';
export { default as Avatar } from './components/@extended/Avatar';
export { default as Dot } from './components/@extended/Dot';
export { default as Transitions } from './components/@extended/Transitions';
export { default as IconsaxIcon, type IconsaxIconProps } from './components/IconsaxIcon';
export { default as SimpleBar } from './components/third-party/SimpleBar';
