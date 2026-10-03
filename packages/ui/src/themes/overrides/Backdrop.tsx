// material-ui
import { alpha } from '@mui/material/styles';

// ==============================|| OVERRIDES - BACKDROP ||============================== //

export default function Backdrop() {
  return {
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: alpha('#000', 0.2),
        },
      },
    },
  };
}
