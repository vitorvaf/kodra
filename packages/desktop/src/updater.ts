import { app, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdaterState, UpdaterStatus } from './types.js';

export const UPDATER_CHANGED_CHANNEL = 'updater:changed' as const;
export const UPDATER_GET_STATE_CHANNEL = 'updater:get-state' as const;
export const UPDATER_CHECK_CHANNEL = 'updater:check' as const;
export const UPDATER_INSTALL_CHANNEL = 'updater:install' as const;

function envDuration(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const INITIAL_CHECK_DELAY_MS = envDuration('KODRA_UPDATE_INITIAL_DELAY_MS', 30_000);
const CHECK_INTERVAL_MS = Math.max(
  60_000,
  envDuration('KODRA_UPDATE_CHECK_INTERVAL_MS', 30 * 60 * 1_000),
);

let initialized = false;
let mainWindowGetter: (() => BrowserWindow | null | undefined) | null = null;
let latestState: UpdaterState = {
  status: 'idle',
  currentVersion: app.getVersion(),
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function broadcast(state: UpdaterState): void {
  try {
    const sender = mainWindowGetter?.()?.webContents;
    if (!sender || sender.isDestroyed()) return;
    sender.send(UPDATER_CHANGED_CHANNEL, state);
  } catch (error) {
    // A window can disappear between the destroyed check and send(). An IPC
    // failure must never take down the main process.
    console.error('[updater] failed to forward state:', error);
  }
}

function setState(
  status: UpdaterStatus,
  details: {
    availableVersion?: string;
    progress?: number;
    error?: string;
  } = {},
): void {
  const state: UpdaterState = {
    status,
    currentVersion: app.getVersion(),
    ...(details.availableVersion !== undefined
      ? { availableVersion: details.availableVersion }
      : {}),
    ...(details.progress !== undefined ? { progress: details.progress } : {}),
    ...(details.error !== undefined ? { error: details.error } : {}),
  };
  latestState = state;
  broadcast(state);
}

function reportError(error: unknown): void {
  const message = errorMessage(error);
  console.error('[updater] update failed:', error);
  try {
    setState('error', { error: message });
  } catch (stateError) {
    console.error('[updater] failed to publish error state:', stateError);
  }
}

export function getUpdaterState(): UpdaterState {
  return latestState;
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return;
  // A staged update installs on quit — re-checking would cycle the state
  // (checking → available → downloaded), re-showing a dismissed toast and
  // letting transient errors clobber the 'downloaded' state.
  if (latestState.status === 'downloaded') return;

  try {
    setState('checking');
    await autoUpdater.checkForUpdates();
    if (latestState.status === 'available' && autoUpdater.autoDownload) {
      void autoUpdater.downloadUpdate().catch(reportError);
    }
  } catch (error) {
    reportError(error);
  }
}

export function installUpdate(): void {
  if (!app.isPackaged) return;

  try {
    autoUpdater.quitAndInstall();
  } catch (error) {
    reportError(error);
  }
}

export function initUpdater(
  getMainWindow: () => BrowserWindow | null | undefined,
): void {
  if (!app.isPackaged) return;
  if (initialized) return;
  initialized = true;
  mainWindowGetter = getMainWindow;

  try {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // macOS unsigned builds cannot install updates — Squirrel.Mac requires
    // a signed bundle, and quitAndInstall() would simply quit the app,
    // relaunching at the same version. Until builds are signed +
    // notarized, darwin stays detect-only: no auto-download, no
    // "Restart now" surface (the renderer keeps 'available' invisible).
    // TODO(signing): remove this override when macOS signing lands.
    if (process.platform === 'darwin') {
      autoUpdater.autoDownload = false;
    }

    const feedUrl = process.env.KODRA_UPDATE_FEED_URL || process.env.KANBOTS_UPDATE_FEED_URL;
    if (feedUrl) {
      autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl });
    }

    autoUpdater.on('checking-for-update', () => {
      try {
        setState('checking');
      } catch (error) {
        reportError(error);
      }
    });
    autoUpdater.on('update-available', (info) => {
      try {
        setState('available', { availableVersion: info.version });
      } catch (error) {
        reportError(error);
      }
    });
    autoUpdater.on('update-not-available', () => {
      try {
        setState('not-available');
      } catch (error) {
        reportError(error);
      }
    });
    autoUpdater.on('download-progress', (progress) => {
      try {
        const normalized = Number.isFinite(progress.percent)
          ? Math.max(0, Math.min(1, progress.percent / 100))
          : 0;
        setState('downloading', { progress: normalized });
      } catch (error) {
        reportError(error);
      }
    });
    autoUpdater.on('update-downloaded', (info) => {
      try {
        setState('downloaded', { availableVersion: info.version });
      } catch (error) {
        reportError(error);
      }
    });
    autoUpdater.on('error', (error) => {
      reportError(error);
    });

    setTimeout(() => {
      void checkForUpdates();
    }, INITIAL_CHECK_DELAY_MS);
    setInterval(() => {
      void checkForUpdates();
    }, CHECK_INTERVAL_MS);
  } catch (error) {
    reportError(error);
  }
}
