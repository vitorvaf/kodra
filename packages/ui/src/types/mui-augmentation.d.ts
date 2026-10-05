/**
 * MUI module augmentations from the Able Pro template: extra variants
 * (Chip/Button/Alert "light", "combined", ...), palette shades and
 * `theme.customShadows`. Self-contained so it can ship next to the emitted
 * declarations: dist/index.d.ts references it, which makes the
 * augmentations visible to every consumer of @kanbots/ui.
 */
import type {} from '@mui/material';
import type {} from '@mui/material/styles';
import type {} from '@mui/material/Alert';
import type {} from '@mui/material/Badge';
import type {} from '@mui/material/Button';
import type {} from '@mui/material/Checkbox';
import type {} from '@mui/material/Chip';
import type {} from '@mui/material/Pagination';
import type {} from '@mui/material/Radio';
import type {} from '@mui/material/Slider';
import type {} from '@mui/material/Switch';

export type CustomShadowProps = {
  button: string;
  text: string;
  z1: string;
  z2: string;
  primary: string;
  primaryButton: string;
  secondary: string;
  secondaryButton: string;
  error: string;
  errorButton: string;
  warning: string;
  warningButton: string;
  info: string;
  infoButton: string;
  success: string;
  successButton: string;
  grey: string;
  greyButton: string;
};

// index.d.ts (Color)
declare module '@mui/material' {
  interface Color {
    0?: string;
    A50?: string;
    A800?: string;
  }
}

// Alert.d.ts
declare module '@mui/material/Alert' {
  interface AlertPropsColorOverrides {
    primary;
    secondary;
  }
  interface AlertPropsVariantOverrides {
    border;
  }
}

// Badge.d.ts
declare module '@mui/material/Badge' {
  interface BadgePropsVariantOverrides {
    light;
  }
}

// Button.d.ts
declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    dashed;
    shadow;
    light;
  }

  interface ButtonPropsSizeOverrides {
    extraSmall;
  }
}

// Checkbox.d.ts
declare module '@mui/material/Checkbox' {
  interface CheckboxPropsSizeOverrides {
    large;
  }
}

// Chip.d.ts
declare module '@mui/material/Chip' {
  interface ChipPropsVariantOverrides {
    light;
    combined;
  }
  interface ChipPropsSizeOverrides {
    large;
  }
}

// Pagination.d.ts
declare module '@mui/material/Pagination' {
  interface PaginationPropsColorOverrides {
    error;
    success;
    warning;
    info;
  }
  interface PaginationPropsVariantOverrides {
    contained;
    combined;
  }
}

// Radio.d.ts
declare module '@mui/material/Radio' {
  interface RadioPropsSizeOverrides {
    large;
  }
}

// Slider.d.ts
declare module '@mui/material/Slider' {
  interface SliderPropsColorOverrides {
    error;
    success;
    warning;
    info;
  }
}

// Switch.d.ts
declare module '@mui/material/Switch' {
  interface SwitchPropsSizeOverrides {
    large;
  }
}

// createPalette.d.ts
declare module '@mui/material/styles' {
  interface SimplePaletteColorOptions {
    lighter?: string;
    darker?: string;
    0?: string;
    50?: string;
    100?: string;
    200?: string;
    300?: string;
    400?: string;
    500?: string;
    600?: string;
    700?: string;
    800?: string;
    900?: string;
    A50?: string;
    A100?: string;
    A200?: string;
    A300?: string;
    A400?: string;
    A700?: string;
    A800?: string;
  }

  interface PaletteColor {
    lighter: string;
    darker: string;
    0?: string;
    50?: string;
    100?: string;
    200?: string;
    300?: string;
    400?: string;
    500?: string;
    600?: string;
    700?: string;
    800?: string;
    900?: string;
    A50?: string;
    A100?: string;
    A200?: string;
    A300?: string;
    A400?: string;
    A700?: string;
    A800?: string;
  }
}

// createTheme.d.ts
declare module '@mui/material/styles' {
  interface Theme {
    customShadows: CustomShadowProps;
  }
}
