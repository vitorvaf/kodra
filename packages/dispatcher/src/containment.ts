import { isAbsolute, normalize, relative, resolve } from 'node:path';

export interface InspectToolUseInput {
  worktreePath: string;
  name: string;
  input: unknown;
}

export interface ContainmentEscape {
  /** Best-effort human-readable reason; safe to surface in the UI. */
  reason: string;
  /** Resolved absolute paths that fall outside the worktree. */
  paths: string[];
  /** Heuristic flag — true for Bash inspections (regex-based, may have
   *  false positives/negatives). Callers can use this to soften the
   *  message presented to users. */
  heuristic: boolean;
}

export type InspectToolUseResult = { kind: 'ok' } | ({ kind: 'escape' } & ContainmentEscape);

const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/**
 * Decide whether a tool_use event escapes its worktree. Pure: no IO, no
 * filesystem reads — symlinks are not resolved, only string/path-shape
 * checks are performed.
 *
 * Bash detection is heuristic by design (regex over the command string).
 * It catches the common patterns called out in the task acceptance
 * criteria — absolute paths in args, output redirection, `cd <abs>`,
 * `git -C <abs>` — but cannot understand shell semantics, command
 * substitution, or environment variable expansion. False positives
 * (e.g., "/" appearing inside a quoted string the shell will not treat
 * as a path) are accepted as the cost of cheap detection; false
 * negatives (clever obfuscation) are explicitly out of scope.
 */
export function inspectToolUse(args: InspectToolUseInput): InspectToolUseResult {
  const { worktreePath, name, input } = args;
  const root = normalize(worktreePath);

  if (FILE_TOOLS.has(name)) {
    const paths = collectFilePathsFromInput(name, input);
    const escapes = paths.filter((p) => isOutside(root, p));
    if (escapes.length > 0) {
      return {
        kind: 'escape',
        reason: `${name} target outside worktree`,
        paths: escapes,
        heuristic: false,
      };
    }
    return { kind: 'ok' };
  }

  if (name === 'Bash') {
    const command = extractBashCommand(input);
    if (command === null) return { kind: 'ok' };
    const escapes = scanBashCommand(root, command);
    if (escapes.length > 0) {
      return {
        kind: 'escape',
        reason: 'Bash command references path outside worktree',
        paths: escapes,
        heuristic: true,
      };
    }
    return { kind: 'ok' };
  }

  return { kind: 'ok' };
}

function isOutside(root: string, candidate: string): boolean {
  const abs = isAbsolute(candidate) ? normalize(candidate) : resolve(root, candidate);
  if (abs === root) return false;
  const rel = relative(root, abs);
  if (rel === '' || rel === '.') return false;
  if (rel.startsWith('..')) return true;
  if (isAbsolute(rel)) return true; // different drive on win32
  return false;
}

function collectFilePathsFromInput(name: string, input: unknown): string[] {
  if (!isObject(input)) return [];
  const out: string[] = [];
  // Edit / Write / NotebookEdit: { file_path | notebook_path: string }
  // MultiEdit: { file_path: string, edits: [...] }
  // We collect any string value under the conventional keys.
  const KEYS = ['file_path', 'notebook_path', 'path', 'filePath'] as const;
  for (const key of KEYS) {
    const v = (input as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.length > 0) out.push(v);
  }
  // Defensive — handle arrays of paths if a future tool emits them.
  const arr = (input as Record<string, unknown>).paths;
  if (Array.isArray(arr)) {
    for (const v of arr) if (typeof v === 'string' && v.length > 0) out.push(v);
  }
  return out;
}

function extractBashCommand(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (isObject(input)) {
    const cmd = (input as Record<string, unknown>).command;
    if (typeof cmd === 'string') return cmd;
  }
  return null;
}

// Match an absolute-looking path token: starts with `/`, runs until
// whitespace or a few shell metacharacters. Token is filtered post-match
// against URL schemes etc.
const ABSOLUTE_PATH_RE = /(?<!\w)\/[^\s'"`<>|;&)]+/g;
const CD_RE = /(?:^|[\s;&|])cd\s+(['"]?)(\/[^\s'";|&)]+)\1/g;
const GIT_C_RE = /git\s+(?:[^\s]+\s+)*-C\s+(['"]?)(\/[^\s'";|&)]+)\1/g;
const REDIRECT_RE = /(?:>>?|<)\s*(['"]?)(\/[^\s'";|&)]+)\1/g;

function isUrlAbsolute(command: string, index: number): boolean {
  // Drop matches that are the path component of a URL like https://host/x
  return /[A-Za-z][A-Za-z0-9+.-]*:\/$/.test(command.slice(0, index));
}

function scanBashCommand(root: string, command: string): string[] {
  const candidates = new Set<string>();
  for (const m of command.matchAll(ABSOLUTE_PATH_RE)) {
    if (m.index !== undefined && isUrlAbsolute(command, m.index)) continue;
    candidates.add(stripTrailingPunct(m[0]));
  }
  for (const m of command.matchAll(CD_RE)) {
    candidates.add(stripTrailingPunct(m[2] ?? ''));
  }
  for (const m of command.matchAll(GIT_C_RE)) {
    candidates.add(stripTrailingPunct(m[2] ?? ''));
  }
  for (const m of command.matchAll(REDIRECT_RE)) {
    candidates.add(stripTrailingPunct(m[2] ?? ''));
  }
  const out: string[] = [];
  for (const c of candidates) {
    if (!c) continue;
    if (isOutside(root, c)) out.push(c);
  }
  return out;
}

function stripTrailingPunct(p: string): string {
  return p.replace(/[),.;:]+$/g, '');
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}
