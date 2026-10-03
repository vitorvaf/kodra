// material-ui
import type { Theme } from '@mui/material/styles';

// assets
import { ArrowRight2 } from 'iconsax-react';

// ==============================|| OVERRIDES - ACCORDION SUMMARY ||============================== //

export default function AccordionSummary(theme: Theme) {
  const { palette, spacing } = theme;

  return {
    MuiAccordionSummary: {
      defaultProps: {
        expandIcon: <ArrowRight2 size={14} color="currentColor" variant="Linear" />,
      },
      styleOverrides: {
        root: {
          backgroundColor: palette.secondary.lighter,
          flexDirection: 'row-reverse',
          minHeight: 46,
        },
        expandIconWrapper: {
          '&.Mui-expanded': {
            transform: 'rotate(90deg)',
          },
        },
        content: {
          marginTop: spacing(1.25),
          marginBottom: spacing(1.25),
          marginLeft: spacing(1),
        },
      },
    },
  };
}
