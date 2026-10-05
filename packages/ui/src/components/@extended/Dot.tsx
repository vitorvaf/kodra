// material-ui
import type { CSSObject } from '@mui/material/styles';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';

// project-imports
import type { ColorProps } from '../../types/extended';
import getColors from '../../utils/getColors';

interface Props {
  color?: ColorProps;
  size?: number;
  variant?: string;
  sx?: CSSObject;
  componentDiv?: boolean;
}

// ==============================|| DOT - EXTENDED ||============================== //

export default function Dot({ color, size, variant, sx, componentDiv }: Props) {
  const theme = useTheme();
  const colors = getColors(theme, color || 'primary');
  const { main } = colors;

  return (
    <Box
      component={componentDiv ? 'div' : 'span'}
      sx={{
        width: size || 8,
        height: size || 8,
        borderRadius: '50%',
        bgcolor: variant === 'outlined' ? '' : main,
        ...(variant === 'outlined' && { border: `1px solid `, borderColor: main }),
        ...sx,
      }}
    />
  );
}
