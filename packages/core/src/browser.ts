/**
 * Browser-safe subset of @kanbots/core consumed by the web renderer via a
 * vite alias (see packages/web/vite.config.ts). The package entry
 * (index.ts) pulls in Node-only Octokit code that must not enter the
 * renderer bundle — only re-export modules here that are dependency-free
 * and safe to run in a browser.
 */
export * from './issue-ref.js';
export * from './limits.js';
