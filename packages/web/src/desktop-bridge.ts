// The Window['kanbots'] type and the full KanbotsBridge interface are
// declared in `./global.d.ts` (the bridge is a single object that mixes
// lifecycle methods with the typed invoke/subscribe channels). This
// module owns only the lifecycle data shapes and a small accessor.

export interface ActiveWorkspaceInfo {
  repoPath: string;
  config:
    | { mode: 'github'; owner: string; repo: string; notifyOnRunComplete?: boolean }
    | {
        mode: 'local';
        name: string;
        authorLogin: string;
        notifyOnRunComplete?: boolean;
      };
}

export interface RecentWorkspace {
  repoPath: string;
  displayName: string;
  lastOpenedAt: string;
}

export interface ActiveCloudWorkspaceInfo {
  orgSlug: string;
  orgDisplayName: string;
  projectSlug: string;
  projectDisplayName: string;
  localRepoPath: string | null;
}

export interface RecentCloudWorkspace {
  orgSlug: string;
  orgDisplayName: string;
  projectSlug: string;
  projectDisplayName: string;
  lastOpenedAt: string;
}

export interface BootstrapPayload {
  workspace: ActiveWorkspaceInfo | null;
  cloudWorkspace: ActiveCloudWorkspaceInfo | null;
  recents: RecentWorkspace[];
  cloudRecents: RecentCloudWorkspace[];
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
}

export interface CloudStatusPayload {
  authed: boolean;
  baseUrl: string | null;
  tokenPrefix: string | null;
  orgId: string | null;
  signedInAt: string | null;
  promptDismissed: boolean;
}

export type CloudLoginStartResult =
  | {
      ok: true;
      userCode: string;
      verificationUri: string;
      verificationUriComplete: string;
      expiresAt: number;
      intervalMs: number;
    }
  | { ok: false; error: string };

export type CloudLoginPollResult =
  | { status: 'pending' }
  | { status: 'expired' | 'consumed' | 'cancelled' }
  | { status: 'approved'; tokenPrefix: string; orgId: string | null }
  | { status: 'error'; error: string }
  | { status: 'idle' };

export function getBridge(): NonNullable<Window['kanbots']> | null {
  return typeof window !== 'undefined' && window.kanbots ? window.kanbots : null;
}
