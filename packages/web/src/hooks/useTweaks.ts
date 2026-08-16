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
  // Kodra accent: dark #5B7CFF ≈ oklch(0.631 0.198 269), paper #3D5BF5 ≈
  // oklch(0.548 0.231 269). Only the hue is user-tweakable; lightness and
  // chroma stay pinned to the brand accent so the slider cannot drift into
  // low-contrast territory.
  const lightness = t.theme === 'paper' ? '0.548' : '0.631';
  const chroma = t.theme === 'paper' ? '0.231' : '0.198';
  document.documentElement.style.setProperty(
    '--accent',
    `oklch(${lightness} ${chroma} ${t.accentHue})`,
  );
  document.documentElement.style.setProperty(
    '--accent-line',
    `oklch(${lightness} ${chroma} ${t.accentHue} / 0.45)`,
  );
  document.documentElement.style.setProperty(
    '--accent-soft',
    `oklch(${lightness} ${chroma} ${t.accentHue} / 0.14)`,
  );
  // NOTE: --running is intentionally NOT overridden here. Mint (#35E0A1) is
  // Kodra's activity/execution color and comes from tokens.css; coupling it
  // to the accent hue would break the state-color semantics.
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
