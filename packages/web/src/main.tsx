import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { ChatApp } from './pages/ChatApp.js';
import { ErrorBoundary } from './ErrorBoundary.js';
import { getBridge } from './desktop-bridge.js';
import type {
  ActiveCloudWorkspaceInfo,
  ActiveWorkspaceInfo,
  RecentCloudWorkspace,
  RecentWorkspace,
} from './desktop-bridge.js';
import './styles/tokens.css';
import './styles/shell.css';
import './styles/card.css';
import './styles/rail.css';
import './styles/inspector.css';
import './styles/modals.css';
import './styles/stats.css';
import './styles/create-modal.css';
import './styles/tray.css';
import './styles/palette.css';
import './styles/tweaks.css';
import './styles/cloud-auth.css';
import './styles.css';

document.documentElement.setAttribute('data-theme', 'dark');

window.addEventListener('unhandledrejection', (event) => {
  console.error('[renderer] unhandledRejection:', event.reason);
});

window.addEventListener('error', (event) => {
  console.error('[renderer] uncaughtError:', event.error ?? event.message);
});

async function bootstrap(): Promise<{
  workspace: ActiveWorkspaceInfo | null;
  cloudWorkspace: ActiveCloudWorkspaceInfo | null;
  recents: RecentWorkspace[];
  cloudRecents: RecentCloudWorkspace[];
  hasBridge: boolean;
  claudeAuthed: boolean;
  codexAuthed: boolean;
  geminiAuthed: boolean;
  ampAuthed: boolean;
  cursorAuthed: boolean;
  copilotAuthed: boolean;
  opencodeAuthed: boolean;
  droidAuthed: boolean;
  ccrAuthed: boolean;
  qwenAuthed: boolean;
  cloudAuthed: boolean;
  cloudPromptDismissed: boolean;
}> {
  const bridge = getBridge();
  if (!bridge) {
    return {
      workspace: null,
      cloudWorkspace: null,
      recents: [],
      cloudRecents: [],
      hasBridge: false,
      claudeAuthed: true,
      codexAuthed: true,
      geminiAuthed: true,
      ampAuthed: true,
      cursorAuthed: true,
      copilotAuthed: true,
      opencodeAuthed: true,
      droidAuthed: true,
      ccrAuthed: true,
      qwenAuthed: true,
      cloudAuthed: false,
      cloudPromptDismissed: true,
    };
  }
  const payload = await bridge.bootstrap();
  return {
    workspace: payload.workspace,
    cloudWorkspace: payload.cloudWorkspace,
    recents: payload.recents,
    cloudRecents: payload.cloudRecents,
    hasBridge: true,
    claudeAuthed: payload.claudeAuthed,
    codexAuthed: payload.codexAuthed,
    geminiAuthed: payload.geminiAuthed,
    ampAuthed: payload.ampAuthed,
    cursorAuthed: payload.cursorAuthed,
    copilotAuthed: payload.copilotAuthed,
    opencodeAuthed: payload.opencodeAuthed,
    droidAuthed: payload.droidAuthed,
    ccrAuthed: payload.ccrAuthed,
    qwenAuthed: payload.qwenAuthed,
    cloudAuthed: payload.cloudAuthed,
    cloudPromptDismissed: payload.cloudPromptDismissed,
  };
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('root element not found');
}
const root = createRoot(container);

const isChatWindow = window.location.hash.replace(/^#/, '').startsWith('/chat');

if (isChatWindow) {
  // Standalone chat window. Renders independently from the main board UI;
  // bootstrap is unnecessary because the workspace lifecycle is owned by
  // the main window — when this window opened, the workspace was already
  // active.
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <ChatApp />
      </ErrorBoundary>
    </StrictMode>,
  );
} else {
  void bootstrap().then(
    ({
      workspace,
      cloudWorkspace,
      recents,
      cloudRecents,
      hasBridge,
      claudeAuthed,
      codexAuthed,
      geminiAuthed,
      ampAuthed,
      cursorAuthed,
      copilotAuthed,
      opencodeAuthed,
      droidAuthed,
      ccrAuthed,
      qwenAuthed,
      cloudAuthed,
      cloudPromptDismissed,
    }) => {
      root.render(
        <StrictMode>
          <ErrorBoundary>
            <App
              workspace={workspace}
              cloudWorkspace={cloudWorkspace}
              initialRecents={recents}
              initialCloudRecents={cloudRecents}
              hasBridge={hasBridge}
              initialClaudeAuthed={claudeAuthed}
              initialCodexAuthed={codexAuthed}
              initialGeminiAuthed={geminiAuthed}
              initialAmpAuthed={ampAuthed}
              initialCursorAuthed={cursorAuthed}
              initialCopilotAuthed={copilotAuthed}
              initialOpencodeAuthed={opencodeAuthed}
              initialDroidAuthed={droidAuthed}
              initialCcrAuthed={ccrAuthed}
              initialQwenAuthed={qwenAuthed}
              initialCloudAuthed={cloudAuthed}
              initialCloudPromptDismissed={cloudPromptDismissed}
            />
          </ErrorBoundary>
        </StrictMode>,
      );
    },
  );
}
