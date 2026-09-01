import type { Issue } from '@kanbots/core';
import type { AgentRun, AutopilotEffort } from '@kanbots/local-store';
import type { AgentSupervisor } from '../agent-runs/supervisor.js';
import { buildTaskSystemPrompt } from '../handlers/issues.js';

export interface DispatchAutopilotChildDeps {
  supervisor: AgentSupervisor;
}

export interface DispatchAutopilotChildArgs {
  issue: Pick<Issue, 'number' | 'title' | 'body' | 'labels'>;
  threadId: number;
  model?: string;
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
  effort?: AutopilotEffort;
  /** Persona id (not the display name) — recorded on the agent run for
   *  per-persona analytics. */
  personaId?: string;
}

export async function dispatchAutopilotChild(
  deps: DispatchAutopilotChildDeps,
  args: DispatchAutopilotChildArgs,
): Promise<AgentRun> {
  const kickoff = buildAutopilotKickoff(args.issue, args.effort);
  const cardKind = inferCardKindFromLabels(args.issue.labels);
  const issueBodyChars = args.issue.body ? args.issue.body.length : 0;
  const startInput: Parameters<AgentSupervisor['start']>[0] = {
    threadId: args.threadId,
    issueNumber: args.issue.number,
    prompt: kickoff,
    appendSystemPrompt: buildTaskSystemPrompt({
      number: args.issue.number,
      title: args.issue.title,
      body: args.issue.body,
    }),
    issueBodyChars,
  };
  if (args.model !== undefined) startInput.model = args.model;
  if (args.provider !== undefined) startInput.provider = args.provider;
  if (args.personaId !== undefined) startInput.personaId = args.personaId;
  if (cardKind !== null) startInput.cardKind = cardKind;
  return deps.supervisor.start(startInput);
}

/** Pull the kind from `type:*` labels at dispatch — autopilot tags every
 *  child issue with `type:feat` or `type:bug`, so this is reliable for
 *  autopilot-spawned runs. Returns null when nothing matches; analytics
 *  then groups the run as "uncategorised". */
function inferCardKindFromLabels(labels: readonly string[] | undefined): string | null {
  if (!labels) return null;
  for (const lbl of labels) {
    if (typeof lbl === 'string' && lbl.startsWith('type:')) {
      return lbl.slice('type:'.length);
    }
  }
  return null;
}

const EFFORT_GUIDANCE: Record<AutopilotEffort, string> = {
  low: 'Effort: low. Aim to ship within minutes — pick the simplest viable change, skip nonessential investigation, and avoid refactors.',
  medium: 'Effort: medium. Balance speed and quality — investigate enough to make a sound change, run the obvious checks, and ship.',
  high: 'Effort: high. Be thorough — handle edge cases, validate carefully, run all available checks (typecheck, tests, lint), and add tests where they materially help.',
  xhigh:
    'Effort: very high. Take extensive care — investigate deeply, refactor when warranted by what you find, write thorough tests, and verify behavior end-to-end before finishing.',
  max: 'Effort: maximum. Investigate exhaustively, run every check available, write robust tests, and refuse to call the task complete if anything is uncertain — ask for guidance via a kanbots-decision instead.',
};

function buildAutopilotKickoff(
  issue: { number: number; title: string; body: string | null | undefined },
  effort: AutopilotEffort | undefined,
): string {
  const body = issue.body && issue.body.trim().length > 0 ? issue.body : '(no description)';
  const effortLine = effort ? `\n\n${EFFORT_GUIDANCE[effort]}` : '';
  return `Task #${issue.number}: ${issue.title}

${body}

This task was created by an autopilot loop and is delegated to you to ship end-to-end. Proceed directly — do not emit a kanbots-decision asking how to approach. Investigate the codebase, make the change, run any checks you have available, and finish when the task is complete.${effortLine}`;
}
