# ADR-0000: Adopt ADR convention

- **Status**: Accepted
- **Date**: 2026-08-11
- **Deciders**: fork maintainer

## Context

The upstream kanbots project ships descriptive documentation
(`docs/architecture.md`, `docs/agents.md`, `docs/mcp-server.md`, …) but has no
convention for recording *decisions* — the "why we chose X over Y" that
descriptive docs deliberately omit. This fork is about to make several
non-obvious integration choices (memory layer, cost optimization, MCP wiring,
scoping strategy) whose rationale will be expensive to reconstruct from commit
messages alone. Without a decision log, future contributors re-litigate the
same trade-offs or silently violate an agreed boundary.

## Decision

We adopt a lightweight ADR convention for this fork:

- **Location**: `docs/adr/`, one file per decision.
- **Naming**: `NNNN-kebab-case-title.md`, zero-padded, never renumbered.
- **Format**: the template at `docs/adr/template.md` — Status, Date, Context,
  Decision, Alternatives Considered, Consequences, References. It is a trimmed
  MADR / Nygard hybrid; we keep only the sections that earn their keep.
- **Lifecycle**: `Proposed` → `Accepted` → (`Deprecated` | `Superseded by
  NNNN`). Status changes are real commits, not silent edits.
- **Index**: `docs/adr/README.md` lists every ADR with its current status.
- **Granularity**: one decision per ADR. If a document needs two "Decision:"
  lines, split it. Coupled decisions that only make sense together are the
  exception.
- **No code in ADRs**: ADRs record decisions, not implementation. Code lives in
  source; ADRs link to it under References.

## Alternatives Considered

### Option A — No convention; rely on commit messages + descriptive docs
Rejected. Commit messages are local to a change and rarely state the rejected
alternatives. Descriptive docs describe the *what-is*, not the *why-not-Y*.
This is the gap ADRs fill.

### Option B — Full MADR with YAML frontmatter and structured fields
Rejected for now. The full MADR spec (compliance, decision drivers as separate
sections, confiders, amendments table) is more ceremony than a solo-fork
needs. We can promote to it later if multiple maintainers join.

### Option C — Inline decision notes inside the existing descriptive docs
Rejected. Decisions get buried inside reference prose, lose their date/status,
and become impossible to enumerate. A dedicated directory makes the decision
history scannable.

## Consequences

**Positive:**
- The rationale for the upcoming agentmemory and RTK integrations survives the
  person who made them.
- New contributors can read `docs/adr/README.md` and understand both *what was
  decided* and *what is still open* in one glance.
- Status field makes it explicit which decisions are settled vs. up for debate.

**Negative:**
- One more document type to keep current. ADRs that drift from the code become
  misleading; the convention only works if `Accepted` decisions are honored
  (or explicitly superseded) when the code diverges.

**Neutral:**
- ADR-0001 onward can now be written against this convention.

## References

- MADR — https://adr.github.io/madr/
- Michael Nygard's original ADR article —
  https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
- Existing descriptive docs: `docs/architecture.md`, `docs/agents.md`
