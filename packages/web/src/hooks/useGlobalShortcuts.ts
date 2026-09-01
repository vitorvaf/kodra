import { useEffect } from 'react';

export interface ShortcutHandlers {
  onPalette: () => void;
  onCreate: () => void;
  onClosePopovers: () => void;
  onResolveTopDecision?: () => void;
  onTogglePreview?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useGlobalShortcuts(handlers: ShortcutHandlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        handlers.onClosePopovers();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        handlers.onPalette();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handlers.onCreate();
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handlers.onResolveTopDecision?.();
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        handlers.onTogglePreview?.();
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}
