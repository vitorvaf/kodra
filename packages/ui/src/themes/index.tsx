import type { ReactNode } from 'react';
import { useMemo } from 'react';

// material-ui
import type { ThemeOptions, Theme, TypographyVariantsOptions } from '@mui/material/styles';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import StyledEngineProvider from '@mui/material/StyledEngineProvider';

// project-imports
import Palette from './palette';
import Typography from './typography';
import CustomShadows from './shadows';
import componentsOverride from './overrides';

import { HEADER_HEIGHT, ThemeMode } from '../config';
import useConfig from '../hooks/useConfig';
import getWindowScheme from '../utils/getWindowScheme';

// types
import type { CustomShadowProps } from '../types/theme';

type ThemeCustomizationProps = {
  children: ReactNode;
  /**
   * Stacking levels for the app bar and drawer. A host that still renders
   * legacy overlays with low z-indexes can sink the chrome below them.
   */
  zIndex?: { appBar?: number; drawer?: number };
};

// ==============================|| DEFAULT THEME - MAIN  ||============================== //

export default function ThemeCustomization({ children, zIndex }: ThemeCustomizationProps) {
  const { themeDirection, mode, presetColor, fontFamily, themeContrast } = useConfig();
  let themeMode = mode;
  if (themeMode === ThemeMode.AUTO) {
    const autoMode = getWindowScheme();
    if (autoMode) {
      themeMode = ThemeMode.DARK;
    } else {
      themeMode = ThemeMode.LIGHT;
    }
  }

  const theme: Theme = useMemo<Theme>(
    () => Palette(themeMode, presetColor, themeContrast),
    [themeMode, presetColor, themeContrast],
  );

  const themeTypography: TypographyVariantsOptions = useMemo<TypographyVariantsOptions>(
    () => Typography(fontFamily),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fontFamily],
  );
  const themeCustomShadows: CustomShadowProps = useMemo<CustomShadowProps>(
    () => CustomShadows(theme),
    [theme],
  );

  const themeOptions: ThemeOptions = useMemo(
    () => ({
      breakpoints: {
        values: {
          xs: 0,
          sm: 768,
          md: 1024,
          lg: 1266,
          xl: 1440,
        },
      },
      direction: themeDirection,
      mixins: {
        toolbar: {
          minHeight: HEADER_HEIGHT,
          paddingTop: 8,
          paddingBottom: 8,
        },
      },
      palette: theme.palette,
      shape: {
        borderRadius: 8,
      },
      customShadows: themeCustomShadows,
      typography: themeTypography,
      ...(zIndex && { zIndex }),
    }),
    [themeDirection, theme, themeTypography, themeCustomShadows, zIndex],
  );

  const themes: Theme = createTheme(themeOptions);
  themes.components = componentsOverride(themes);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={themes}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </StyledEngineProvider>
  );
}
