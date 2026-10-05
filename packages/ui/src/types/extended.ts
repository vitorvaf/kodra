// material-ui
import type { Theme } from '@mui/material/styles';
import type { ButtonProps } from '@mui/material/Button';
import type { ChipProps } from '@mui/material/Chip';
import type { IconButtonProps } from '@mui/material/IconButton';
import type { SliderProps } from '@mui/material/Slider';
import type { LoadingButtonProps } from '@mui/lab';

// ==============================|| TYPES - EXTENDED COMPONENT  ||============================== //

export type ButtonVariantProps = 'contained' | 'light' | 'outlined' | 'dashed' | 'text' | 'shadow';
export type IconButtonShapeProps = 'rounded' | 'square';
type TooltipColor = 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error' | 'default';
export type ColorProps =
  | ChipProps['color']
  | ButtonProps['color']
  | LoadingButtonProps['color']
  | IconButtonProps['color']
  | SliderProps['color']
  | TooltipColor;
export type AvatarTypeProps = 'filled' | 'outlined' | 'combined';
export type SizeProps = 'badge' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ExtendedStyleProps = {
  color: ColorProps;
  theme: Theme;
};
