import { ipcMain } from 'electron';
import type {
  PlannerEvent,
  SuggestFeatureBacklogEntry,
  SuggestFeatureEntryStatus,
} from '@kanbots/api';
import type { CardSummary, CloudClient } from '@kanbots/cloud-client';
import { createSuggester } from '@kanbots/dispatcher';
import { CHANNEL_PREFIX } from './ipc/register.js';
import { toIpcError } from './ipc/errors.js';
import type { ActiveCloudWorkspaceInfo } from './types.js';

/**
 * Composer (suggest-a-feature) handlers wired against the cloud as the
 * backlog source and the local Claude/Codex CLI as the LLM. Registered while
 * a cloud workspace is open and torn down on close — mirrors how local
 * workspaces register their composer handlers via the workspace handler set.
 *
 * The spawned CLI runs inside the local git repo the user bound to this
 * cloud project (via Cloud Settings → Bind local repo). Without a binding
 * the CLI has nothing to ground a suggestion in, so we fail loudly rather
 * than spawn in an unrelated directory.
 */

const SUGGEST_BACKLOG_LIMIT = 200;

const CARD_STATUS_TO_ENTRY_STATUS: Record<CardSummary['status'], SuggestFeatureEntryStatus> = {
  inbox: 'backlog',
  backlog: 'backlog',
  ready: 'todo',
  in_progress: 'in-progress',
  review: 'in-review',
  done: 'done',
  blocked: 'in-progress',
  archived: 'closed',
};

interface SuggestArgs {
  personaPrompt: string;
  provider?:
    | 'claude-code'
    | 'codex-cli'
    | 'gemini-cli'
    | 'amp-cli'
    | 'cursor-cli'
    | 'copilot-cli'
    | 'opencode-cli'
    | 'droid-cli'
    | 'ccr-cli'
    | 'qwen-cli'
    | 'acp';
  userNotes?: string;
}

function cardsToBacklogEntries(cards: readonly CardSummary[]): SuggestFeatureBacklogEntry[] {
  const entries: SuggestFeatureBacklogEntry[] = [];
  for (const card of cards) {
    const status = card.archived_at !== null ? 'closed' : CARD_STATUS_TO_ENTRY_STATUS[card.status];
    const entry: SuggestFeatureBacklogEntry = {
      title: card.title,
      number: card.number,
      status,
    };
    if (card.body) entry.body = card.body;
    entries.push(entry);
  }
  return entries;
}

export interface RegisterCloudComposerOptions {
  cloudClient: CloudClient;
  getActiveCloudWorkspace: () => ActiveCloudWorkspaceInfo | null;
  onSuggestEvent: (event: PlannerEvent) => void;
}

export function registerCloudComposerHandlers(
  opts: RegisterCloudComposerOptions,
): () => void {
  const channel = `${CHANNEL_PREFIX}composer:suggest`;

  ipcMain.handle(channel, async (_event, rawArgs) => {
    try {
      const args = rawArgs as SuggestArgs;
      const ws = opts.getActiveCloudWorkspace();
      if (ws === null) {
        throw new Error('No active cloud workspace; open a project before suggesting features.');
      }
      if (ws.localRepoPath === null) {
        throw new Error(
          'This cloud project is not bound to a local repository. Open Cloud Settings → Bind local repo, then try again.',
        );
      }
      const list = await opts.cloudClient.cards.list(ws.orgSlug, ws.projectSlug, {
        limit: SUGGEST_BACKLOG_LIMIT,
      });
      const backlog = cardsToBacklogEntries(list.data);

      // Spawn the CLI inside the bound local repo so the suggester can read
      // the actual codebase (README, package.json, source dirs). Built fresh
      // per call because the binding can change without reopening the
      // workspace (Cloud Settings → Bind local repo updates it in place).
      const suggest = createSuggester({ cwd: ws.localRepoPath });

      const trimmedNotes = args.userNotes?.trim();
      return await suggest({
        backlog,
        personaPrompt: args.personaPrompt,
        ...(args.provider !== undefined ? { provider: args.provider } : {}),
        ...(trimmedNotes ? { userNotes: trimmedNotes } : {}),
        onEvent: opts.onSuggestEvent,
      });
    } catch (err) {
      throw new Error(JSON.stringify(toIpcError(err)));
    }
  });

  return () => {
    ipcMain.removeHandler(channel);
  };
}
