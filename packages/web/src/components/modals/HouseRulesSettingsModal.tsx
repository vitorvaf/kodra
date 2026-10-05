import { useEffect, useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import { api } from '../../api.js';
import { MarkdownEditor } from '../forms/MarkdownEditor.js';
import { ModalFrame } from './ModalFrame.js';

const HOUSE_RULES_MAX_BYTES = 8 * 1024;

export interface HouseRulesSettingsModalProps {
  onClose: () => void;
}

export function HouseRulesSettingsModal({ onClose }: HouseRulesSettingsModalProps) {
  const [initial, setInitial] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await api.getWorkspaceHouseRules();
        if (cancelled) return;
        const value = res.houseRules ?? '';
        setInitial(value);
        setDraft(value);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = draft.trim();
  const byteLength = useMemo(() => new TextEncoder().encode(trimmed).length, [trimmed]);
  const overLimit = byteLength > HOUSE_RULES_MAX_BYTES;
  const dirty = trimmed !== initial.trim();

  async function handleSave(): Promise<void> {
    if (saving || overLimit) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api.setWorkspaceHouseRules({
        houseRules: trimmed.length === 0 ? null : trimmed,
      });
      const value = next.houseRules ?? '';
      setInitial(value);
      setDraft(value);
      window.dispatchEvent(new CustomEvent('kanbots:house-rules-updated'));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame
      title="House rules"
      ariaLabel="House rules"
      width={560}
      onClose={onClose}
      bodyClassName="kb-sentry-body"
      footerHint={
        <>
          Saved to <code>.kanbots/config.json</code>; takes effect on the next run started.
        </>
      }
      actions={
        <>
          <Button color="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving || !dirty || overLimit}
            title={overLimit ? `Rules exceed ${HOUSE_RULES_MAX_BYTES} bytes` : undefined}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="kb-sentry-hint">
        Workspace-wide guidance prepended to every agent run started here. Use it for the things
        you'd otherwise repeat per task — package manager, libraries to prefer, lint commands, files
        never to touch.
      </div>

      {loading ? <div className="kb-sentry-row">Loading…</div> : null}

      {error ? (
        <div className="kb-sentry-error" role="alert">
          {error.message}
        </div>
      ) : null}

      {!loading ? (
        <div className="kb-sentry-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span className="kb-sentry-label" style={{ marginBottom: 6 }}>
            Rules
          </span>
          <MarkdownEditor
            value={draft}
            onChange={setDraft}
            rows={12}
            ariaLabel="House rules"
            placeholder={
              'Examples:\n- Always use pnpm, never npm or yarn.\n- Prefer TanStack Query over hand-rolled fetch wrappers.\n- Run `pnpm lint` before declaring work done.'
            }
          />
          <div
            className="kb-sentry-hint"
            style={{
              marginTop: 4,
              display: 'flex',
              justifyContent: 'space-between',
              color: overLimit ? 'var(--danger, #c43)' : undefined,
            }}
          >
            <span>
              {trimmed.length === 0
                ? 'No rules set — runs will not include a workspace-rules block.'
                : 'Applied to issue runs, chat runs, and autopilot child runs.'}
            </span>
            <span>
              {byteLength} / {HOUSE_RULES_MAX_BYTES} bytes
            </span>
          </div>
        </div>
      ) : null}
    </ModalFrame>
  );
}
