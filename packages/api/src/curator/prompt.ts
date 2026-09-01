import type { AgentEvent, Learning } from '@kanbots/local-store';

/** Maximum chars of agent_events context handed to the curator. Holds ≈10k
 *  input tokens at 4 chars/token — generous enough to see plumbing while
 *  staying under any reasonable per-call cost cap on Haiku. */
const MAX_EVENT_CONTEXT_CHARS = 40_000;

/** Per-event payload truncation. Tool_results from Read/Glob/Grep can be
 *  huge; we keep the first chunk so the curator sees what was looked at,
 *  not what was read in full. */
const PER_EVENT_PAYLOAD_CHARS = 600;

export const CURATOR_SYSTEM_PROMPT = `You distill durable lessons from a single agent run.

Look at the recent stream of events from the run and any existing learnings already filed for this repo. Extract 0–3 high-signal, repo-specific lessons that future agents working in this repo would benefit from knowing.

Rules:
- Each lesson must be ≤200 tokens of body content (≤800 chars).
- Tag MUST be one of: convention, gotcha, fragile, decision-rationale.
- Skip task-specific facts (e.g. "fixed typo at line 42 of foo.ts"). Only durable rules: conventions to follow, gotchas to avoid, fragile invariants, or rationale for past decisions worth preserving.
- Skip lessons that are already present in EXISTING_LEARNINGS or trivially restate them.
- Set confidence between 0.3 (weak/anecdotal) and 0.9 (strongly-grounded). Default 0.5.
- Output strictly the JSON object matching the schema below — an object with key \`learnings\` whose value is an array of 0–3 entries.

If you see no durable lessons worth preserving, return \`{"learnings": []}\`.`;

export const CURATOR_JSON_SCHEMA = {
  type: 'object',
  required: ['learnings'],
  additionalProperties: false,
  properties: {
    learnings: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        required: ['tag', 'content'],
        additionalProperties: false,
        properties: {
          tag: { enum: ['convention', 'gotcha', 'fragile', 'decision-rationale'] },
          content: { type: 'string', minLength: 10, maxLength: 800 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          evidence_event_seq_min: { type: 'integer', minimum: 0 },
          evidence_event_seq_max: { type: 'integer', minimum: 0 },
        },
      },
    },
  },
} as const;

export interface RenderCuratorPromptInput {
  events: AgentEvent[];
  existing: Learning[];
  /** Issue title shown to the curator so context-poor events are easier to
   *  interpret. Optional. */
  issueTitle?: string;
}

export function renderCuratorPrompt(input: RenderCuratorPromptInput): string {
  const eventsBlock = formatEvents(input.events);
  const existingBlock = formatExistingLearnings(input.existing);
  const titleLine = input.issueTitle ? `\nISSUE: ${input.issueTitle}\n` : '';
  return `${titleLine}EVENTS (most recent agent run, truncated):
${eventsBlock}

EXISTING_LEARNINGS (already filed for this repo — don't duplicate):
${existingBlock}`;
}

function formatEvents(events: AgentEvent[]): string {
  if (events.length === 0) return '(none)';
  // Walk in reverse so we keep the most recent events when budgeting; flip
  // back at the end so the curator reads forward.
  const lines: string[] = [];
  let used = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!ev) continue;
    const line = formatOneEvent(ev);
    if (used + line.length > MAX_EVENT_CONTEXT_CHARS) break;
    lines.push(line);
    used += line.length;
  }
  return lines.reverse().join('\n');
}

function formatOneEvent(ev: AgentEvent): string {
  const payload = JSON.stringify(ev.payload);
  const truncated =
    payload.length > PER_EVENT_PAYLOAD_CHARS
      ? `${payload.slice(0, PER_EVENT_PAYLOAD_CHARS)}…`
      : payload;
  return `[seq ${ev.seq} ${ev.type}] ${truncated}`;
}

function formatExistingLearnings(existing: Learning[]): string {
  if (existing.length === 0) return '(none)';
  return existing
    .slice(0, 20)
    .map((l) => `- [${l.tag}] ${l.content}`)
    .join('\n');
}
