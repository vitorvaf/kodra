import type { StatusKey } from './types.js';

export interface ColumnDef {
  key: StatusKey | null;
  label: string;
  status: 'inbox' | StatusKey;
}

export const COLUMNS: readonly ColumnDef[] = [
  { key: null, label: 'Inbox', status: 'inbox' },
  { key: 'backlog', label: 'Backlog', status: 'backlog' },
  { key: 'todo', label: 'Todo', status: 'todo' },
  { key: 'inProgress', label: 'In progress', status: 'inProgress' },
  { key: 'review', label: 'Review', status: 'review' },
  { key: 'done', label: 'Done', status: 'done' },
];

export const STATUS_LABEL: Record<StatusKey, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  inProgress: 'In progress',
  review: 'Review',
  done: 'Done',
};

export const STATUS_PREFIX = 'status:';

export const STATUS_LABEL_NAMES: Record<StatusKey, string> = {
  backlog: 'status:backlog',
  todo: 'status:todo',
  inProgress: 'status:in-progress',
  review: 'status:review',
  done: 'status:done',
};

export function withStatus(labels: readonly string[], next: StatusKey | null): string[] {
  const stripped = labels.filter((l) => !l.startsWith(STATUS_PREFIX));
  if (next === null) return stripped;
  return [...stripped, STATUS_LABEL_NAMES[next]];
}

export type Priority = 'p0' | 'p1' | 'p2' | 'p3';

const PRIORITY_PREFIX = 'priority:';

export function priorityFromLabels(labels: readonly string[]): Priority | null {
  for (const l of labels) {
    if (!l.startsWith(PRIORITY_PREFIX)) continue;
    const v = l.slice(PRIORITY_PREFIX.length).toLowerCase();
    if (v === 'p0' || v === 'p1' || v === 'p2' || v === 'p3') return v;
  }
  return null;
}

export type Tag =
  | 'FEAT'
  | 'BUG'
  | 'IMPL'
  | 'PR'
  | 'CHORE'
  | 'INFRA'
  | 'DOCS'
  | 'FIX'
  | 'AUTOPILOT';

const TAG_LABELS: Record<string, Tag> = {
  feat: 'FEAT',
  feature: 'FEAT',
  enhancement: 'FEAT',
  bug: 'BUG',
  fix: 'FIX',
  chore: 'CHORE',
  infra: 'INFRA',
  docs: 'DOCS',
  implementation: 'IMPL',
  impl: 'IMPL',
  autopilot: 'AUTOPILOT',
};

export function tagFromLabels(labels: readonly string[], isPullRequest: boolean): Tag | null {
  if (isPullRequest) return 'PR';
  for (const raw of labels) {
    const l = raw.toLowerCase();
    if (TAG_LABELS[l]) return TAG_LABELS[l];
    // Allow "type:feat" and "area:auth" etc.
    if (l.startsWith('type:')) {
      const v = l.slice(5);
      if (TAG_LABELS[v]) return TAG_LABELS[v];
    }
  }
  return null;
}

const AREA_PREFIX = 'area:';

export function areaLabels(labels: readonly string[]): string[] {
  return labels.filter((l) => l.startsWith(AREA_PREFIX));
}

export function nonStatusLabels(labels: readonly string[]): string[] {
  return labels.filter((l) => !l.startsWith(STATUS_PREFIX));
}

const LINK_PREFIXES = ['parent:', 'link:', 'links:', 'related:'];

export function linkedIssueNumbers(labels: readonly string[]): number[] {
  const out = new Set<number>();
  for (const raw of labels) {
    const l = raw.toLowerCase();
    for (const prefix of LINK_PREFIXES) {
      if (l.startsWith(prefix)) {
        const v = l.slice(prefix.length).replace(/^#/, '');
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n) && n > 0) out.add(n);
      }
    }
  }
  return [...out].sort((a, b) => a - b);
}

export function ageString(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const mo = Math.floor(day / 30);
  return `${mo}mo`;
}

export function strippedBranch(branch: string | null | undefined): string {
  if (!branch) return '';
  return branch.replace(/^kb\//, '').replace(/^kanbots\//, '');
}

const HUE_PALETTE = [45, 75, 130, 200, 240, 280, 320, 350];

export function colorForLogin(login: string): string {
  let h = 0;
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) >>> 0;
  const hue = HUE_PALETTE[h % HUE_PALETTE.length] ?? 45;
  return `oklch(0.74 0.13 ${hue})`;
}
