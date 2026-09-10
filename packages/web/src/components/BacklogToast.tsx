import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefsStore } from '../stores/usePrefsStore.js';

export const HIDDEN_BACKLOG_CREATED_EVENT = 'kanbots:backlog-created-hidden';
const HIDDEN_BACKLOG_MESSAGE =
  'Task added to backlog (hidden) — enable "Backlog" in the board filter to see it.';

/** Notify the app-level toast when a newly-created issue will be filtered out. */
export function notifyBacklogCreated(labels: readonly string[]): void {
  if (!labels.includes('status:backlog')) return;
  if (usePrefsStore.getState().board.includeBacklog) return;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(HIDDEN_BACKLOG_CREATED_EVENT));
  }
}

/** Bottom-right, auto-dismissing feedback for hidden backlog creations. */
export function BacklogToast() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const show = useCallback(() => {
    setVisible(true);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setVisible(false);
    }, 5000);
  }, []);

  useEffect(() => {
    window.addEventListener(HIDDEN_BACKLOG_CREATED_EVENT, show);
    return () => {
      window.removeEventListener(HIDDEN_BACKLOG_CREATED_EVENT, show);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [show]);

  if (!visible) return null;
  return (
    <div className="kb-app kb-updater">
      <div className="kb-upd-toast" role="status" aria-live="polite">
        <div className="kb-upd-head">
          <span className="kb-upd-dot" aria-hidden />
          <span className="kb-upd-title">Task created</span>
        </div>
        <div className="kb-upd-body">
          <p className="kb-upd-line">{HIDDEN_BACKLOG_MESSAGE}</p>
        </div>
      </div>
    </div>
  );
}
