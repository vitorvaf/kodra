// Offline-only mode: every cloud entry point — the first-run sign-in
// prompt (App.tsx) and the "Want team sync?" footer in the workspace
// picker — is temporarily hidden and the app stays fully local. Flip back
// to `true` to restore them; the auth/dismissal plumbing is untouched so
// re-enabling is a one-line change.
export const CLOUD_FEATURES_ENABLED = false;
