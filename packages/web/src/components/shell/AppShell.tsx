import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import MuiAvatar from '@mui/material/Avatar';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import {
  ConfigProvider,
  DashboardLayout,
  IconButton,
  IconsaxIcon,
  NavAction,
  NavGroup,
  ThemeCustomization,
  ThemeMode,
  useDrawerOpen,
} from '@kanbots/ui';
import type { IssueRef } from '@kanbots/core';
import {
  Archive,
  Book1,
  Chart2,
  Cloud,
  Code,
  Copy,
  Cpu,
  Element3,
  Flash,
  Hierarchy,
  Kanban,
  Maximize4,
  Messages2,
  Minus,
  SearchNormal1,
  Setting2,
  CloseSquare,
} from 'iconsax-react';
import { getBridge } from '../../desktop-bridge.js';
import { useIssues } from '../../hooks/useIssues.js';
import { colorForLogin } from '../../labels.js';
import type { Theme } from '../../stores/usePrefsStore.js';
import { LeftRail } from '../rail/LeftRail.js';
import { Logo } from '../Logo.js';

/**
 * The app chrome sits below every legacy overlay: modals, menus, palette,
 * tray and toasts use z-index 30–100 in the old CSS, wherever they render.
 * MUI's own popovers and dialogs keep their usual 1300+.
 */
const CHROME_Z_INDEX = { drawer: 20, appBar: 21 };

/**
 * MUI theme for the app shell, following Kodra's own theme preference
 * (dark / paper) so there is a single theme switch.
 */
export function ShellTheme({ theme, children }: { theme: Theme; children: ReactNode }) {
  const config = useMemo(
    () => ({ mode: theme === 'paper' ? ThemeMode.LIGHT : ThemeMode.DARK }),
    [theme],
  );
  return (
    <ConfigProvider value={config}>
      <ThemeCustomization zIndex={CHROME_Z_INDEX}>{children}</ThemeCustomization>
    </ConfigProvider>
  );
}

export interface AppShellNav {
  onOpenPalette: () => void;
  onOpenStats: () => void;
  onOpenArchive: () => void;
  onOpenProviders: () => void;
  onOpenCloud: () => void;
  onOpenRules: () => void;
  onOpenScripts: () => void;
  onOpenRepos: () => void;
  onOpenCardTemplates: () => void;
  onOpenMemory: () => void;
  onOpenSettings: () => void;
}

export interface AppShellProps {
  folderName: string;
  branch: string;
  drawerOpen: boolean;
  onToggleDrawer: () => void;
  tweaksOpen: boolean;
  onToggleTweaks: () => void;
  selectedNumber: IssueRef | null;
  onSelectIssue: (n: IssueRef) => void;
  nav: AppShellNav;
  children: ReactNode;
}

/**
 * The app chrome: Able Pro dashboard layout (drawer + app bar) around the
 * board. The board and its legacy CSS live inside a `.kb-app` wrapper until
 * they are migrated too.
 */
export function AppShell({
  folderName,
  branch,
  drawerOpen,
  onToggleDrawer,
  tweaksOpen,
  onToggleTweaks,
  selectedNumber,
  onSelectIssue,
  nav,
  children,
}: AppShellProps) {
  const bridge = getBridge();

  return (
    <DashboardLayout
      drawerOpen={drawerOpen}
      onDrawerToggle={onToggleDrawer}
      draggableHeader={bridge !== null}
      drawerHeader={<DrawerBrand open={drawerOpen} />}
      drawerContent={
        <DrawerNav
          nav={nav}
          drawerOpen={drawerOpen}
          selectedNumber={selectedNumber}
          onSelectIssue={onSelectIssue}
        />
      }
      drawerFooter={<AccountFooter />}
      headerContent={
        <HeaderContent
          folderName={folderName}
          branch={branch}
          tweaksOpen={tweaksOpen}
          onToggleTweaks={onToggleTweaks}
          onOpenPalette={nav.onOpenPalette}
        />
      }
    >
      <div className="kb-app kb-shell-main">{children}</div>
    </DashboardLayout>
  );
}

function DrawerBrand({ open }: { open: boolean }) {
  return (
    <Box sx={{ color: 'text.primary', display: 'flex', alignItems: 'center' }}>
      <Logo size={open ? 24 : 28} withWordmark={open} />
    </Box>
  );
}

function DrawerNav({
  nav,
  drawerOpen,
  selectedNumber,
  onSelectIssue,
}: {
  nav: AppShellNav;
  drawerOpen: boolean;
  selectedNumber: IssueRef | null;
  onSelectIssue: (n: IssueRef) => void;
}) {
  return (
    <>
      <NavGroup title="Workspace">
        <NavAction title="Board" icon={Kanban} selected onClick={() => undefined} />
        <NavAction
          title="Command palette"
          icon={SearchNormal1}
          shortcut="⌘K"
          onClick={nav.onOpenPalette}
        />
        <NavAction title="Stats & cost" icon={Chart2} onClick={nav.onOpenStats} />
        <NavAction title="Archive" icon={Archive} onClick={nav.onOpenArchive} />
      </NavGroup>
      <NavGroup title="Configure">
        <NavAction title="Providers" icon={Flash} onClick={nav.onOpenProviders} />
        <NavAction title="Cloud" icon={Cloud} onClick={nav.onOpenCloud} />
        <NavAction title="House rules" icon={Book1} onClick={nav.onOpenRules} />
        <NavAction title="Repo scripts" icon={Code} onClick={nav.onOpenScripts} />
        <NavAction title="Repos" icon={Hierarchy} onClick={nav.onOpenRepos} />
        <NavAction title="Card templates" icon={Copy} onClick={nav.onOpenCardTemplates} />
        <NavAction title="Memory" icon={Cpu} onClick={nav.onOpenMemory} />
        <NavAction title="Settings" icon={Setting2} onClick={nav.onOpenSettings} />
      </NavGroup>
      {drawerOpen ? (
        <Box className="kb-app" sx={{ mt: 1 }}>
          <LeftRail
            selectedNumber={selectedNumber}
            onSelectIssue={onSelectIssue}
            onOpenCloud={nav.onOpenCloud}
          />
        </Box>
      ) : null}
    </>
  );
}

function AccountFooter() {
  const open = useDrawerOpen();
  const { issues } = useIssues();
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    const bridge = getBridge();
    if (!bridge) return;
    let alive = true;
    bridge
      .updaterGetState()
      .then((state) => {
        if (alive) setAppVersion(state.currentVersion);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const me = 'you';
  const runs = issues.filter((i) => i.agent === 'running').length;
  const avatar = (
    <MuiAvatar sx={{ width: 34, height: 34, bgcolor: colorForLogin(me), fontSize: 14 }}>
      {me.slice(0, 1).toUpperCase()}
    </MuiAvatar>
  );

  return (
    <Box
      sx={{
        borderTop: 1,
        borderColor: 'divider',
        px: open ? 3 : 0,
        py: 2,
        display: 'flex',
        justifyContent: open ? 'flex-start' : 'center',
      }}
    >
      {open ? (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
          {avatar}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap>
              {me}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {runs} run{runs === 1 ? '' : 's'} · {issues.length} issue
              {issues.length === 1 ? '' : 's'}
              {appVersion ? ` · v${appVersion}` : ''}
            </Typography>
          </Box>
        </Stack>
      ) : (
        <Tooltip title={`${runs} running · ${issues.length} issues`} placement="right">
          {avatar}
        </Tooltip>
      )}
    </Box>
  );
}

function HeaderContent({
  folderName,
  branch,
  tweaksOpen,
  onToggleTweaks,
  onOpenPalette,
}: {
  folderName: string;
  branch: string;
  tweaksOpen: boolean;
  onToggleTweaks: () => void;
  onOpenPalette: () => void;
}) {
  const bridge = getBridge();

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0, ml: 1 }}>
        <IconsaxIcon icon={Element3} size={18} variant="Bulk" />
        <Typography variant="h5" noWrap>
          {folderName}
        </Typography>
        <Chip
          label={branch}
          size="small"
          variant="outlined"
          sx={{ fontFamily: 'monospace', height: 22 }}
        />
      </Stack>

      <ButtonBase
        onClick={onOpenPalette}
        sx={{
          ml: 3,
          px: 1.5,
          height: 40,
          width: { xs: 'auto', md: 260 },
          borderRadius: 1,
          border: 1,
          borderColor: 'divider',
          color: 'text.secondary',
          justifyContent: 'flex-start',
          gap: 1,
          display: { xs: 'none', sm: 'inline-flex' },
          '&:hover': { borderColor: 'primary.main' },
        }}
      >
        <IconsaxIcon icon={SearchNormal1} size={16} />
        <Typography variant="body2" sx={{ flex: 1, textAlign: 'left' }}>
          Search or jump to…
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
          ⌘K
        </Typography>
      </ButtonBase>

      <Box sx={{ flex: 1 }} />

      {bridge?.openChat ? (
        <Tooltip title="Chat with the Kodra agent">
          <IconButton
            color="secondary"
            variant="light"
            aria-label="Open agent chat"
            onClick={() => {
              void bridge.openChat?.(null);
            }}
          >
            <IconsaxIcon icon={Messages2} variant="Bulk" />
          </IconButton>
        </Tooltip>
      ) : null}
      <Tooltip title="Tweaks">
        <IconButton
          color="secondary"
          variant="light"
          aria-label="Tweaks"
          aria-pressed={tweaksOpen}
          onClick={onToggleTweaks}
        >
          <IconsaxIcon icon={Setting2} variant="Bulk" />
        </IconButton>
      </Tooltip>

      {bridge ? (
        <Stack direction="row" spacing={0.5} sx={{ ml: 1.5 }}>
          <IconButton
            color="secondary"
            size="small"
            aria-label="Minimize"
            onClick={() => bridge.minimizeWindow()}
          >
            <IconsaxIcon icon={Minus} size={18} />
          </IconButton>
          <IconButton
            color="secondary"
            size="small"
            aria-label="Maximize"
            onClick={() => bridge.toggleMaximizeWindow()}
          >
            <IconsaxIcon icon={Maximize4} size={18} />
          </IconButton>
          <IconButton
            color="error"
            size="small"
            aria-label="Close"
            onClick={() => bridge.closeWindow()}
          >
            <IconsaxIcon icon={CloseSquare} size={18} />
          </IconButton>
        </Stack>
      ) : null}
    </>
  );
}
