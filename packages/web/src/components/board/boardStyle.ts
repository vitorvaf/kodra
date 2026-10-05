import type { Priority, Tag } from '../../labels.js';
import type { Issue } from '../../types.js';

/** MUI palette keys used for board semantics. */
export type BoardColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';

/**
 * Agent state → palette, matching Kodra's state semantics:
 * running/execution = success (mint), waiting on you = warning,
 * review = info, failed = error.
 */
export function agentColor(agent: Issue['agent']): BoardColor | null {
  switch (agent) {
    case 'running':
      return 'success';
    case 'blocked':
      return 'warning';
    case 'review':
      return 'info';
    case 'failed':
      return 'error';
    case 'queued':
      return 'secondary';
    default:
      return null;
  }
}

export function agentLabel(agent: Issue['agent']): string | null {
  switch (agent) {
    case 'running':
      return 'Running';
    case 'blocked':
      return 'Waiting on you';
    case 'review':
      return 'Ready to review';
    case 'queued':
      return 'Queued';
    case 'failed':
      return 'Failed';
    default:
      return null;
  }
}

export function tagColor(tag: Tag): BoardColor {
  switch (tag) {
    case 'BUG':
    case 'FIX':
      return 'error';
    case 'FEAT':
      return 'primary';
    case 'PR':
      return 'info';
    case 'AUTOPILOT':
      return 'warning';
    case 'IMPL':
      return 'success';
    default:
      return 'secondary';
  }
}

export function priorityColor(priority: Priority): BoardColor {
  switch (priority) {
    case 'p0':
      return 'error';
    case 'p1':
      return 'warning';
    case 'p2':
      return 'info';
    default:
      return 'secondary';
  }
}

/** Column status → accent dot color. */
export function columnColor(status: string): BoardColor {
  switch (status) {
    case 'todo':
      return 'primary';
    case 'inProgress':
      return 'success';
    case 'review':
      return 'info';
    case 'done':
      return 'success';
    default:
      return 'secondary';
  }
}
