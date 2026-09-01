import { Logo } from '../Logo.js';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react';
import { api } from '../../api.js';
import { dispatchIssuesRefetch } from '../../hooks/useIssues.js';
import {
  ageString,
  areaLabels,
  priorityFromLabels,
  tagFromLabels,
} from '../../labels.js';
import type { Issue } from '../../types.js';

export interface ArchiveModalProps {
  onClose: () => void;
  onOpenDetail: (issueNumber: number) => void;
}

const searchIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const archiveIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 5h18v4H3z" />
    <path d="M5 9v10h14V9" />
    <path d="M10 13h4" />
  </svg>
);

function matchesQuery(issue: Issue, q: string): boolean {
  if (!q) return true;
  const lower = q.trim().toLowerCase();
  if (!lower) return true;
  // "#123" or "123" → match by issue number
  const numericQuery = lower.startsWith('#') ? lower.slice(1) : lower;
  if (/^\d+$/.test(numericQuery) && String(issue.number).includes(numericQuery)) {
    return true;
  }
  if (issue.title.toLowerCase().includes(lower)) return true;
  if (issue.body && issue.body.toLowerCase().includes(lower)) return true;
  for (const label of issue.labels) {
    if (label.toLowerCase().includes(lower)) return true;
  }
  return false;
}

export function ArchiveModal({ onClose, onOpenDetail }: ArchiveModalProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [query, setQuery] = useState('');
  const [busyNumber, setBusyNumber] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listArchivedIssues();
      setIssues(list);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const handle = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(handle);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => issues.filter((i) => matchesQuery(i, query)), [issues, query]);

  function stopInner(e: MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
  }

  async function handleUnarchive(issueNumber: number): Promise<void> {
    if (busyNumber !== null) return;
    setBusyNumber(issueNumber);
    try {
      await api.unarchiveIssue(issueNumber);
      setIssues((prev) => prev.filter((i) => i.number !== issueNumber));
      dispatchIssuesRefetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(new Error(`Couldn't unarchive #${issueNumber}: ${message}`));
    } finally {
      setBusyNumber(null);
    }
  }

  function handleOpen(issueNumber: number): void {
    onOpenDetail(issueNumber);
    onClose();
  }

  return (
    <div
      className="kb-modal-scrim kb-app"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Archive"
    >
      <div className="kb-modal kb-archive-modal" onClick={stopInner}>
        <div className="kb-modal-head">
          <Logo size={11} withWordmark />
          <span style={{ color: 'var(--ink-4)' }}>·</span>
          <h2>Archive</h2>
          <span className="grow" />
          <button
            type="button"
            className="x-btn"
            onClick={onClose}
            aria-label="Close (Esc)"
            title="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        </div>

        <div className="kb-archive-search">
          {searchIcon}
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search archived tasks by title, #number, label, or body…"
            onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            aria-label="Search archived tasks"
          />
          <span className="kb-archive-count">
            {loading ? 'loading…' : `${filtered.length} of ${issues.length}`}
          </span>
        </div>

        <div className="kb-archive-body">
          {error ? (
            <div className="kb-archive-error" role="alert">
              {error.message}
              <button
                type="button"
                className="kb-btn ghost"
                onClick={() => void load()}
                style={{ marginLeft: 12 }}
              >
                Retry
              </button>
            </div>
          ) : null}

          {!loading && !error && issues.length === 0 ? (
            <div className="kb-archive-empty">
              <div className="kb-archive-empty-icon">{archiveIcon}</div>
              <div className="kb-archive-empty-h">Nothing archived yet</div>
              <div className="kb-archive-empty-sub">
                Archive a task from its detail view and it will land here.
              </div>
            </div>
          ) : null}

          {!loading && !error && issues.length > 0 && filtered.length === 0 ? (
            <div className="kb-archive-empty">
              <div className="kb-archive-empty-h">No matches for "{query}"</div>
              <div className="kb-archive-empty-sub">
                Try a different word, an issue number, or clear the search.
              </div>
            </div>
          ) : null}

          {filtered.length > 0 ? (
            <ul className="kb-archive-list" role="list">
              {filtered.map((issue) => (
                <ArchiveRow
                  key={issue.number}
                  issue={issue}
                  busy={busyNumber === issue.number}
                  disabled={busyNumber !== null}
                  onOpen={() => handleOpen(issue.number)}
                  onUnarchive={() => void handleUnarchive(issue.number)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ArchiveRowProps {
  issue: Issue;
  busy: boolean;
  disabled: boolean;
  onOpen: () => void;
  onUnarchive: () => void;
}

function ArchiveRow({ issue, busy, disabled, onOpen, onUnarchive }: ArchiveRowProps) {
  const tag = tagFromLabels(issue.labels, issue.isPullRequest);
  const priority = priorityFromLabels(issue.labels);
  const areas = areaLabels(issue.labels);
  const archivedAt = issue.closedAt ?? issue.updatedAt;
  return (
    <li className="kb-archive-row">
      <button
        type="button"
        className="kb-archive-row-main"
        onClick={onOpen}
        title={`Open #${issue.number}`}
      >
        <div className="kb-archive-row-title-line">
          <span className="kb-archive-num">#{issue.number}</span>
          {tag ? <span className={`kb-tag kb-tag-${tag}`}>{tag}</span> : null}
          <span className="kb-archive-title">{issue.title}</span>
        </div>
        <div className="kb-archive-row-meta">
          {priority ? <span className="kb-chip mono">priority:{priority}</span> : null}
          {areas.map((a) => (
            <span key={a} className="kb-chip mono">
              {a}
            </span>
          ))}
          <span className="kb-archive-time">archived {ageString(archivedAt)} ago</span>
        </div>
      </button>
      <div className="kb-archive-row-actions">
        <button type="button" className="kb-btn ghost" onClick={onOpen} disabled={disabled}>
          Open
        </button>
        <button
          type="button"
          className="kb-btn ghost"
          onClick={onUnarchive}
          disabled={disabled}
          title="Restore this task to the board"
        >
          {busy ? 'Restoring…' : 'Unarchive'}
        </button>
      </div>
    </li>
  );
}
