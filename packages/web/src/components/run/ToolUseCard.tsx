// Renders a single agent `tool_use` event the way claude-code's terminal does:
// a header line "● Verb(arg)" with an optional body underneath (inline diff,
// command echo, todo list, or truncated tool-result text).

import { useState } from 'react';
import { ageString } from '../../labels.js';
import type { AgentEvent } from '../../types.js';
import { InlineDiff } from './InlineDiff.js';
import { describeToolUse, getToolUseInputForBody } from './toolDescriptions.js';

interface ToolUseCardProps {
  toolUse: AgentEvent;
  result: AgentEvent | null;
  isLive: boolean;
}

interface ToolUsePayload {
  toolUseId?: string;
  name?: string;
  input?: unknown;
}
interface ToolResultPayload {
  toolUseId?: string;
  isError?: boolean;
  content?: unknown;
}

const RESULT_PREVIEW_CHARS = 600;

export function ToolUseCard({ toolUse, result, isLive }: ToolUseCardProps) {
  const payload = (toolUse.payload ?? {}) as ToolUsePayload;
  const name = payload.name ?? 'tool';
  const header = describeToolUse(name, payload.input);
  const bodyInput = getToolUseInputForBody(name, payload.input);

  const resultPayload = result ? ((result.payload ?? {}) as ToolResultPayload) : null;
  const resultText = resultPayload ? extractResultText(resultPayload.content) : null;
  const resultIsError = resultPayload?.isError === true;

  // Edits and writes carry the change inline (the diff IS the signal), so
  // they stay expanded. Read/Bash/Search/etc. just dump file contents or
  // stdout — collapse those by default and let the user click to inspect.
  const hasInlineEdit = header.body === 'edit' || header.body === 'write';
  const hasContent =
    hasInlineEdit ||
    (header.body === 'bash' && typeof bodyInput.command === 'string' && bodyInput.command.length > 160) ||
    (header.body === 'todo' && Array.isArray(bodyInput.todos) && bodyInput.todos.length > 0) ||
    resultText !== null;

  const collapsible = hasContent && !hasInlineEdit;
  const [expanded, setExpanded] = useState<boolean>(hasInlineEdit);

  function onHeaderClick(): void {
    if (collapsible) setExpanded((v) => !v);
  }

  const showBody = expanded || hasInlineEdit;

  return (
    <div className={`kb-tool-card${resultIsError ? ' is-error' : ''}`}>
      <div
        className={`kb-tool-head${collapsible ? ' is-toggle' : ''}`}
        onClick={collapsible ? onHeaderClick : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={
          collapsible
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onHeaderClick();
                }
              }
            : undefined
        }
        aria-expanded={collapsible ? expanded : undefined}
      >
        <span className="kb-tool-glyph" aria-hidden>●</span>
        <span className="kb-tool-verb">{header.verb}</span>
        {header.arg ? (
          <>
            <span className="kb-tool-paren" aria-hidden>(</span>
            <span className="kb-tool-arg">{header.arg}</span>
            <span className="kb-tool-paren" aria-hidden>)</span>
          </>
        ) : null}
        <span className="kb-tool-spacer" />
        {collapsible ? (
          <span className="kb-tool-chev" aria-hidden>
            {expanded ? '▾' : '▸'}
          </span>
        ) : null}
        <span className="kb-tool-time">
          {result === null && isLive ? '● running' : `${ageString(toolUse.createdAt)} ago`}
        </span>
      </div>

      {showBody ? (
        <>
          <ToolUseBody
            body={header.body}
            input={bodyInput}
            rawName={name}
            rawInput={payload.input}
          />
          {resultText !== null ? (
            <ToolResultBody text={resultText} isError={resultIsError} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ToolUseBody({
  body,
  input,
  rawName,
  rawInput,
}: {
  body: ReturnType<typeof describeToolUse>['body'];
  input: ReturnType<typeof getToolUseInputForBody>;
  rawName: string;
  rawInput: unknown;
}) {
  if (body === 'edit') {
    const oldStr = typeof input.old_string === 'string' ? input.old_string : '';
    const newStr = typeof input.new_string === 'string' ? input.new_string : '';
    if (oldStr === '' && newStr === '') return null;
    return (
      <div className="kb-tool-diff">
        <InlineDiff oldString={oldStr} newString={newStr} />
      </div>
    );
  }
  if (body === 'write') {
    const content = typeof input.content === 'string' ? input.content : '';
    if (!content) return null;
    return (
      <div className="kb-tool-diff">
        <InlineDiff oldString="" newString={content} />
      </div>
    );
  }
  if (body === 'bash') {
    const cmd = typeof input.command === 'string' ? input.command : '';
    if (!cmd || cmd.length <= 160) return null;
    // Header already truncates short commands; only show full command body
    // when the agent ran something multi-line.
    return (
      <pre className="kb-tool-cmd">
        <code>{cmd}</code>
      </pre>
    );
  }
  if (body === 'todo') {
    const items = Array.isArray(input.todos) ? (input.todos as unknown[]) : [];
    if (items.length === 0) return null;
    return (
      <ul className="kb-tool-todos">
        {items.map((it, i) => {
          const t = (it ?? {}) as {
            content?: string;
            activeForm?: string;
            status?: string;
          };
          const status = (t.status ?? 'pending').toLowerCase();
          const label = t.content ?? t.activeForm ?? '(todo)';
          return (
            <li key={i} className={`kb-tool-todo s-${status}`}>
              <span className="kb-tool-todo-mark" aria-hidden>
                {status === 'completed' ? '✓' : status === 'in_progress' ? '◐' : '○'}
              </span>
              <span>{label}</span>
            </li>
          );
        })}
      </ul>
    );
  }
  // Plain / search / read / task — fall back to a tiny <details> with the raw
  // input json so debugging is still possible without dominating the UI.
  void rawName;
  if (rawInput === undefined || rawInput === null) return null;
  if (typeof rawInput === 'string') return null;
  return null;
}

function ToolResultBody({ text, isError }: { text: string; isError: boolean }) {
  const preview = text.length > RESULT_PREVIEW_CHARS;
  const [expanded, setExpanded] = useState(false);
  const shown = preview && !expanded ? text.slice(0, RESULT_PREVIEW_CHARS) : text;
  return (
    <div className={`kb-tool-result${isError ? ' is-error' : ''}`}>
      <pre className="kb-tool-result-pre">
        <code>{shown}</code>
        {preview && !expanded ? '…' : ''}
      </pre>
      {preview ? (
        <button
          type="button"
          className="kb-tool-result-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'show less' : `show all (${text.length.toLocaleString()} chars)`}
        </button>
      ) : null}
    </div>
  );
}

function extractResultText(content: unknown): string | null {
  if (content === null || content === undefined) return null;
  if (typeof content === 'string') return content.trim() ? content : null;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (item && typeof item === 'object') {
        const obj = item as { type?: string; text?: string };
        if (obj.type === 'text' && typeof obj.text === 'string') {
          parts.push(obj.text);
          continue;
        }
      }
      if (typeof item === 'string') {
        parts.push(item);
        continue;
      }
    }
    if (parts.length > 0) return parts.join('\n');
  }
  if (content && typeof content === 'object') {
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return null;
    }
  }
  return null;
}
