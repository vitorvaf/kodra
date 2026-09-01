// Mirrors claude-code's <SpinnerWithVerb>. We can't run the same animation
// loop as the CLI (50ms tick), but we keep the exact verb pool, the same
// glyph cycle, and a "(Ns · ↑/↓ Ntok)" status line.

import { useEffect, useMemo, useRef, useState } from 'react';
import { pickSpinnerVerb, SPINNER_GLYPHS } from '../../spinnerVerbs.js';

interface AgentSpinnerProps {
  // Stable seed so the verb stays the same across re-renders. Pass the
  // active runId.
  seed: string | number;
  // Wall-clock start of the spin window (ISO or epoch ms).
  startedAt?: string | number | null;
  // Optional override — claude-code uses the active todo's "activeForm" when
  // present.
  override?: string | null;
  // Optional running-token counter — shown after the elapsed time.
  tokensOut?: number | null;
}

const FRAMES = [...SPINNER_GLYPHS, ...[...SPINNER_GLYPHS].reverse()];

export function AgentSpinner({ seed, startedAt, override, tokensOut }: AgentSpinnerProps) {
  const verb = useMemo(() => pickSpinnerVerb(seed), [seed]);
  const startMs = useMemo(() => parseStart(startedAt), [startedAt]);
  const [frame, setFrame] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(() => Math.max(0, (Date.now() - startMs) / 1000));
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    let lastFrameSwap = performance.now();
    function tick(now: number): void {
      // 120ms per glyph keeps the animation visible without burning CPU.
      if (now - lastFrameSwap > 120) {
        setFrame((f) => (f + 1) % FRAMES.length);
        lastFrameSwap = now;
      }
      setElapsedSec(Math.max(0, (Date.now() - startMs) / 1000));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [startMs]);

  const message = override ?? verb;
  const elapsed = formatElapsed(elapsedSec);
  const tokens = typeof tokensOut === 'number' && tokensOut > 0 ? formatNumber(tokensOut) : null;

  return (
    <div className="kb-agent-spinner" role="status" aria-live="polite">
      <span className="kb-spin-glyph" aria-hidden>
        {FRAMES[frame]}
      </span>
      <span className="kb-spin-verb">{message}…</span>
      <span className="kb-spin-meta">
        ({elapsed}
        {tokens ? ` · ${tokens} tokens` : ''} · esc to interrupt)
      </span>
    </div>
  );
}

function parseStart(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return Date.now();
  if (typeof v === 'number') return v;
  const n = new Date(v).getTime();
  return Number.isFinite(n) ? n : Date.now();
}

function formatElapsed(sec: number): string {
  if (sec < 60) return `${Math.floor(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
