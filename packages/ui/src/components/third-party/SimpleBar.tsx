// material-ui
import type { Theme } from '@mui/material/styles';
import { alpha, styled } from '@mui/material/styles';
import Box from '@mui/material/Box';

// third-party
import type { Props } from 'simplebar-react';
import SimpleBar from 'simplebar-react';
import { BrowserView, MobileView } from 'react-device-detect';
import type { MUIStyledCommonProps } from '@mui/system';
import type { ReactNode } from 'react';

// root style
const RootStyle = styled(BrowserView)({
  flexGrow: 1,
  height: '100%',
  overflow: 'hidden',
});

// scroll bar wrapper
const SimpleBarStyle = styled(SimpleBar)(({ theme }) => ({
  maxHeight: '100%',
  '& .simplebar-scrollbar': {
    '&:before': { backgroundColor: alpha(theme.palette.secondary.main, 0.25) },
    '&.simplebar-visible:before': { opacity: 1 },
  },
  '& .simplebar-track.simplebar-vertical': { width: 10 },
  '& .simplebar-track.simplebar-horizontal .simplebar-scrollbar': { height: 6 },
  '& .simplebar-mask': { zIndex: 'inherit' },
}));

// ==============================|| SIMPLE SCROLL BAR  ||============================== //

export default function SimpleBarScroll({
  children,
  sx,
  ...other
}: MUIStyledCommonProps<Theme> & Props) {
  return (
    <>
      <RootStyle>
        <SimpleBarStyle clickOnTrack={false} sx={sx} {...other}>
          {children as ReactNode}
        </SimpleBarStyle>
      </RootStyle>
      <MobileView>
        <Box sx={{ overflowX: 'auto', ...sx }} {...other}>
          {children as ReactNode}
        </Box>
      </MobileView>
    </>
  );
}
