import type { ReactNode } from 'react';

// material-ui
import type { Theme } from '@mui/material/styles';
import { styled, useTheme } from '@mui/material/styles';
import type { AvatarProps } from '@mui/material/Avatar';
import MuiAvatar from '@mui/material/Avatar';

// project-imports
import { ThemeMode } from '../../config';
import getColors from '../../utils/getColors';

// types
import type {
  AvatarTypeProps,
  ColorProps,
  ExtendedStyleProps,
  SizeProps,
} from '../../types/extended';

// ==============================|| AVATAR - COLOR STYLE ||============================== //

interface AvatarStyleProps extends ExtendedStyleProps {
  type?: AvatarTypeProps;
}

function getColorStyle({ theme, color, type }: AvatarStyleProps) {
  const colors = getColors(theme, color);
  const { lighter, light, main, contrastText } = colors;

  switch (type) {
    case 'filled':
      return {
        color:
          color === 'secondary' && theme.palette.mode === ThemeMode.DARK ? lighter : contrastText,
        backgroundColor: main,
      };
    case 'outlined':
      return {
        color: main,
        border: '1px solid',
        borderColor: main,
        backgroundColor: 'transparent',
      };
    case 'combined':
      return {
        color: main,
        border: '1px solid',
        borderColor: light,
        backgroundColor: lighter + 80,
      };
    default:
      return {
        color: main,
        backgroundColor: lighter + 80,
      };
  }
}

// ==============================|| AVATAR - SIZE STYLE ||============================== //

function getSizeStyle(size?: SizeProps) {
  switch (size) {
    case 'badge':
      return {
        border: '2px solid',
        fontSize: '0.675rem',
        width: 20,
        height: 20,
        '& svg': {
          width: 10,
          height: 10,
        },
      };
    case 'xs':
      return {
        fontSize: '0.75rem',
        width: 24,
        height: 24,
        '& svg': {
          width: 14,
          height: 14,
        },
      };
    case 'sm':
      return {
        fontSize: '0.875rem',
        width: 32,
        height: 32,
        '& svg': {
          width: 18,
          height: 18,
        },
      };
    case 'lg':
      return {
        fontSize: '1.2rem',
        width: 52,
        height: 52,
        '& svg': {
          width: 28,
          height: 28,
        },
      };
    case 'xl':
      return {
        fontSize: '1.5rem',
        width: 64,
        height: 64,
        '& svg': {
          width: 36,
          height: 36,
        },
      };
    case 'md':
    default:
      return {
        fontSize: '1rem',
        width: 40,
        height: 40,
        '& svg': {
          width: 20,
          height: 20,
        },
      };
  }
}

// ==============================|| AVATAR - STYLED ||============================== //

interface StyleProps {
  color: ColorProps;
  type?: AvatarTypeProps;
  theme: Theme;
  size?: SizeProps;
}

const AvatarStyle = styled(MuiAvatar, {
  shouldForwardProp: (prop) => prop !== 'color' && prop !== 'type' && prop !== 'size',
})(({ theme, color, type, size }: StyleProps) => ({
  ...getSizeStyle(size),
  ...getColorStyle({ theme, color, type }),
  ...(size === 'badge' && {
    borderColor: theme.palette.background.default,
  }),
}));

// ==============================|| AVATAR - EXTENDED ||============================== //

export interface Props extends AvatarProps {
  color?: ColorProps;
  children?: ReactNode | string;
  type?: AvatarTypeProps;
  size?: SizeProps;
}

export default function Avatar({
  children,
  color = 'primary',
  type,
  size = 'md',
  ...others
}: Props) {
  const theme = useTheme();

  return (
    <AvatarStyle theme={theme} color={color} type={type} size={size} {...others}>
      {children}
    </AvatarStyle>
  );
}
