import { useCallback, useEffect } from 'react';
import {
  TWEAK_DEFAULTS as STORE_TWEAK_DEFAULTS,
  usePrefsStore,
  type Tweaks as StoreTweaks,
} from '../stores/usePrefsStore.js';

export type Tweaks = StoreTweaks;

// Re-exported for backward compatibility with consumers importing the
// defaults from this module.
export const TWEAK_DEFAULTS = STORE_TWEAK_DEFAULTS;

function applyTheme(t: Tweaks): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t.theme);
  const lightness = t.theme === 'paper' ? '0.585' : '0.745';
  document.documentElement.style.setProperty(
    '--accent',
    `oklch(${lightness} 0.155 ${t.accentHue})`,
  );
  document.documentElement.style.setProperty(
    '--accent-line',
    `oklch(${lightness} 0.155 ${t.accentHue} / 0.45)`,
  );
  document.documentElement.style.setProperty(
    '--accent-soft',
    `oklch(${lightness} 0.155 ${t.accentHue} / 0.14)`,
  );
  document.documentElement.style.setProperty(
    '--running',
    `oklch(${lightness} 0.155 ${t.accentHue})`,
  );
}

/**
 * Thin wrapper around the unified prefs store. Persistence and the DOM
 * theme-application side-effect live here; the canonical state lives in
 * `usePrefsStore.tweaks` and is persisted to the `kanbots:prefs` localStorage
 * key. The wrapper preserves the existing `{ tweaks, set, reset }` shape so
 * call sites don't change.
 */
export function useTweaks(): {
  tweaks: Tweaks;
  set: <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => void;
  reset: () => void;
} {
  const tweaks = usePrefsStore((s) => s.tweaks);
  const setTweakStore = usePrefsStore((s) => s.setTweak);
  const resetTweaksStore = usePrefsStore((s) => s.resetTweaks);

  // Apply theme to <html> on every change. Lives here (rather than the
  // store) because it touches the DOM — the store stays a pure data layer.
  useEffect(() => {
    applyTheme(tweaks);
  }, [tweaks]);

  const set = useCallback(
    <K extends keyof Tweaks>(key: K, value: Tweaks[K]) => {
      setTweakStore(key, value);
    },
    [setTweakStore],
  );

  const reset = useCallback(() => {
    resetTweaksStore();
  }, [resetTweaksStore]);

  return { tweaks, set, reset };
}
