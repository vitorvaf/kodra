// Mirrors the `userFacingName` + `renderToolUseMessage` exports from
// claude-code's per-tool UI.tsx files (FileEditTool, BashTool, etc.) so the
// thread tab renders tool calls with the same headers the CLI shows.

export interface ToolHeader {
  verb: string;
  arg: string | null;
  // Hint for the body renderer: 'edit' shows a unified diff, 'write' shows
  // the new content, 'bash' shows the command verbatim, etc.
  body: 'edit' | 'write' | 'read' | 'bash' | 'search' | 'todo' | 'task' | 'plain';
}

interface ToolInput {
  file_path?: unknown;
  old_string?: unknown;
  new_string?: unknown;
  replace_all?: unknown;
  edits?: unknown;
  content?: unknown;
  command?: unknown;
  pattern?: unknown;
  path?: unknown;
  prompt?: unknown;
  description?: unknown;
  todos?: unknown;
  query?: unknown;
  url?: unknown;
}

const MAX_ARG_CHARS = 160;
const MAX_ARG_LINES = 2;

function asString(x: unknown): string | null {
  return typeof x === 'string' ? x : null;
}

function getDisplayPath(p: string): string {
  // Worktrees live at <repoPath>/.kanbots/worktrees/<worktree-name>/<...>.
  // Strip the absolute prefix so the user sees the path inside the repo
  // tree, which is the part with actual signal.
  const m = p.match(/[/\\]\.kanbots[/\\]worktrees[/\\][^/\\]+[/\\](.+)$/);
  if (m && m[1]) return m[1];
  return p;
}

function truncateArg(s: string): string {
  const lines = s.split('\n');
  if (lines.length > MAX_ARG_LINES) {
    s = lines.slice(0, MAX_ARG_LINES).join('\n');
  }
  if (s.length > MAX_ARG_CHARS) {
    s = s.slice(0, MAX_ARG_CHARS);
  }
  if (s.length !== lines.join('\n').length) return `${s.trim()}…`;
  return s;
}

export function describeToolUse(name: string, rawInput: unknown): ToolHeader {
  const input: ToolInput =
    rawInput && typeof rawInput === 'object' ? (rawInput as ToolInput) : {};

  switch (name) {
    case 'Edit':
    case 'MultiEdit':
    case 'FileEdit': {
      const p = asString(input.file_path);
      // claude-code's FileEditTool.userFacingName: "Create" when old_string
      // is empty (new-file create-via-edit), otherwise "Update".
      const old = asString(input.old_string);
      const verb = old === '' ? 'Create' : 'Update';
      return { verb, arg: p ? getDisplayPath(p) : null, body: 'edit' };
    }
    case 'Write':
    case 'FileWrite': {
      const p = asString(input.file_path);
      return { verb: 'Write', arg: p ? getDisplayPath(p) : null, body: 'write' };
    }
    case 'Read':
    case 'FileRead': {
      const p = asString(input.file_path);
      return { verb: 'Read', arg: p ? getDisplayPath(p) : null, body: 'read' };
    }
    case 'Bash':
    case 'PowerShell': {
      const cmd = asString(input.command);
      return {
        verb: name === 'PowerShell' ? 'PowerShell' : 'Bash',
        arg: cmd ? truncateArg(cmd) : null,
        body: 'bash',
      };
    }
    case 'Glob': {
      const pattern = asString(input.pattern);
      return { verb: 'Search', arg: pattern, body: 'search' };
    }
    case 'Grep': {
      const pattern = asString(input.pattern);
      const path = asString(input.path);
      const arg = pattern
        ? path
          ? `pattern: "${pattern}", path: "${getDisplayPath(path)}"`
          : `pattern: "${pattern}"`
        : null;
      return { verb: 'Search', arg, body: 'search' };
    }
    case 'TodoWrite':
      return { verb: 'Update Todos', arg: null, body: 'todo' };
    case 'Task':
    case 'Agent': {
      const desc = asString(input.description) ?? asString(input.prompt);
      return { verb: 'Task', arg: desc ? truncateArg(desc) : null, body: 'task' };
    }
    case 'WebFetch': {
      const url = asString(input.url);
      return { verb: 'Fetch', arg: url, body: 'plain' };
    }
    case 'WebSearch': {
      const q = asString(input.query);
      return { verb: 'Search the web', arg: q, body: 'plain' };
    }
    case 'NotebookEdit': {
      const p = asString(input.file_path);
      return { verb: 'Edit notebook', arg: p ? getDisplayPath(p) : null, body: 'edit' };
    }
    default: {
      // Unknown / MCP / custom — strip the `mcp__<server>__` prefix that
      // claude-code attaches to MCP tools, then show the bare name. The
      // kanbots MCP server exposes things like `createIssue`, which the
      // CLI surfaces as `mcp__kanbots__createIssue`; trimming the prefix
      // keeps the chat transcript readable.
      const verb = name.replace(/^mcp__[^_]+__/, '');
      const summaryFields: (keyof ToolInput)[] = [
        'file_path',
        'path',
        'pattern',
        'query',
        'url',
        'command',
        'description',
      ];
      let arg: string | null = null;
      for (const k of summaryFields) {
        const v = input[k];
        if (typeof v === 'string') {
          arg = truncateArg(v);
          break;
        }
      }
      // If no recognized field, summarize the input object as a one-line
      // hint so the user sees *something* about what the tool was called
      // with (e.g. an MCP tool with `{ issueNumber: 12 }`).
      if (arg === null && rawInput && typeof rawInput === 'object') {
        const obj = rawInput as Record<string, unknown>;
        const keys = Object.keys(obj);
        if (keys.length > 0) {
          const summary = keys
            .slice(0, 4)
            .map((k) => {
              const v = obj[k];
              const text =
                typeof v === 'string'
                  ? v
                  : typeof v === 'number' || typeof v === 'boolean'
                    ? String(v)
                    : '…';
              return `${k}: ${text}`;
            })
            .join(', ');
          arg = truncateArg(summary);
        }
      }
      return { verb, arg, body: 'plain' };
    }
  }
}

export function getToolUseInputForBody(
  name: string,
  rawInput: unknown,
): {
  file_path?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  content?: string;
  command?: string;
  todos?: unknown;
} {
  if (!rawInput || typeof rawInput !== 'object') return {};
  const input = rawInput as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of [
    'file_path',
    'old_string',
    'new_string',
    'replace_all',
    'content',
    'command',
    'todos',
  ]) {
    if (k in input) out[k] = input[k];
  }
  void name;
  return out;
}
