import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../../api.js';
import type { AgentCheck, AgentRun } from '../../types.js';

const STATUS_LABEL: Record<string, string> = {
  starting: 'starting',
  running: 'running',
  awaiting_input: 'awaiting input',
  complete: 'complete',
  failed: 'failed',
  stopped: 'stopped',
};

function fmtElapsed(startIso: string, endIso?: string | null): string {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return '—';
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function fmtCost(spent: number | null | undefined, budget: number | null | undefined): ReactNode {
  const spentStr = spent != null ? `$${spent.toFixed(2)}` : '—';
  if (budget == null) return spentStr;
  const ratio = spent != null && budget > 0 ? Math.min(1, spent / budget) : 0;
  const overBudget = spent != null && spent >= budget;
  const cls = overBudget ? 'kb-cost-over' : ratio >= 0.8 ? 'kb-cost-warn' : '';
  return (
    <span className={cls} title={`Cost budget: $${budget.toFixed(2)}`}>
      {spentStr} <small>/ ${budget.toFixed(2)}</small>
    </span>
  );
}

function fmtTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export interface RunSummaryProps {
  run: AgentRun | null;
  layout?: 'inspector' | 'aside';
  onRunChecks?: () => void;
}

type CheckCommandsMap = Record<
  'typecheck' | 'tests' | 'lint' | 'e2e',
  { command: string; args: string[] }
>;

export function RunSummary({ run, layout = 'inspector', onRunChecks }: RunSummaryProps) {
  const [checks, setChecks] = useState<AgentCheck[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [commands, setCommands] = useState<CheckCommandsMap | null>(null);
  const [houseRulesActive, setHouseRulesActive] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    function load(): void {
      api
        .getWorkspaceHouseRules()
        .then((res) => {
          if (!cancelled) setHouseRulesActive(res.houseRules !== null);
        })
        .catch(() => undefined);
    }
    load();
    function onUpdate(): void {
      load();
    }
    window.addEventListener('kanbots:house-rules-updated', onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener('kanbots:house-rules-updated', onUpdate);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .getCheckCommands()
      .then((res) => {
        if (!cancelled) setCommands(res);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!run) {
      setChecks([]);
      return;
    }
    let cancelled = false;
    api
      .getAgentRunChecks(run.id)
      .then((rows) => {
        if (!cancelled) setChecks(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [run?.id, refreshTick]);

  // Light polling while any check is running
  useEffect(() => {
    const anyRunning = checks.some((c) => c.status === 'running');
    if (!anyRunning) return undefined;
    const handle = window.setInterval(() => setRefreshTick((t) => t + 1), 2_000);
    return () => window.clearInterval(handle);
  }, [checks]);

  if (!run) return null;

  const status = run.status;
  const statusClass =
    status === 'awaiting_input'
      ? 'awaiting_input'
      : status === 'complete'
        ? 'complete'
        : status === 'failed'
          ? 'failed'
          : status === 'stopped'
            ? 'stopped'
            : 'running';

  async function handleRunChecks(): Promise<void> {
    if (!run) return;
    try {
      await api.runAgentRunChecks(run.id);
      setRefreshTick((t) => t + 1);
      onRunChecks?.();
    } catch {
      // surfaced elsewhere
    }
  }

  async function handleRevealWorktree(): Promise<void> {
    if (!run) return;
    try {
      await api.revealAgentRunWorktree(run.id);
    } catch {
      // surfaced elsewhere
    }
  }

  const checkByKind = new Map(checks.map((c) => [c.kind, c]));
  const tsc = checkByKind.get('typecheck');
  const tests = checkByKind.get('tests');
  const lint = checkByKind.get('lint');

  return (
    <div className={`kb-run-card${layout === 'aside' ? ' kb-run-card-aside' : ''}`}>
      {layout === 'inspector' ? (
        <div className="kb-run-head" data-status={statusClass}>
          <span className="kb-pulse" />
          <span className="kb-run-label">Agent {STATUS_LABEL[status] ?? status}</span>
          <span className="kb-run-id">run #{run.id}</span>
          <span className="kb-run-elapsed">{fmtElapsed(run.startedAt, run.endedAt)}</span>
          {houseRulesActive ? (
            <button
              type="button"
              className="kb-pill"
              style={{ marginLeft: 'auto', cursor: 'pointer' }}
              onClick={() =>
                window.dispatchEvent(new CustomEvent('kanbots:open-house-rules'))
              }
              title="House rules from .kanbots/config.json are prepended to this run's system prompt. Click to edit."
              aria-label="House rules in effect"
            >
              House rules
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="kb-run-stats">
        <Stat k="Model" v={run.model ?? '—'} />
        <Stat k="Elapsed" v={fmtElapsed(run.startedAt, run.endedAt)} />
        <Stat
          k="Tokens"
          v={
            <>
              {fmtTokens(run.tokenUsageInput)} <small>in</small>{' '}
              {fmtTokens(run.tokenUsageOutput)} <small>out</small>
            </>
          }
        />
        <Stat k="Cost" v={fmtCost(run.totalCostUsd, run.costBudgetUsd)} />
      </div>
      <div className="kb-run-checks">
        <CheckPill kind="tsc" check={tsc} command={fmtCmd(commands?.typecheck)} />
        <CheckPill kind="tests" check={tests} command={fmtCmd(commands?.tests)} />
        <CheckPill kind="lint" check={lint} command={fmtCmd(commands?.lint)} />
        <button
          type="button"
          className="kb-btn ghost kb-run-checks-run"
          onClick={() => void handleRunChecks()}
          title="Run checks now"
        >
          Run checks
        </button>
        {run.worktreePath ? (
          <button
            type="button"
            className="kb-btn ghost kb-run-checks-run"
            onClick={() => void handleRevealWorktree()}
            title="Open worktree in file manager"
          >
            Open worktree ↗
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kb-run-stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function CheckPill({
  kind,
  check,
  command,
}: {
  kind: string;
  check: AgentCheck | undefined;
  command: string | undefined;
}) {
  const status = check?.status ?? 'idle';
  const cls = status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : status === 'running' ? 'run' : '';
  const icon = status === 'pass' ? '✓' : status === 'fail' ? '×' : status === 'running' ? '⟳' : '·';
  const meta =
    check && check.finishedAt
      ? fmtDuration(check.startedAt, check.finishedAt)
      : status === 'running'
        ? 'live'
        : '';
  const baseTitle = check?.summary ?? `${kind} ${status}`;
  const title = command ? `${baseTitle}\n$ ${command}` : baseTitle;
  return (
    <span
      className={`kb-check-pill ${cls}`}
      title={title}
      aria-label={`${kind} ${status}`}
    >
      <span className="ico">{icon}</span>
      <span className="lbl">{kind}</span>
      {meta ? <span className="meta">{meta}</span> : null}
    </span>
  );
}

function fmtCmd(c: { command: string; args: string[] } | undefined): string | undefined {
  if (!c) return undefined;
  return [c.command, ...c.args].join(' ');
}

function fmtDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m${String(s).padStart(2, '0')}`;
}
