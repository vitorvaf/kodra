import type { Config } from '../bridge.js';
import type { HandlerDeps } from './types.js';

export async function getConfig(deps: HandlerDeps): Promise<Config> {
  const { repoPath, ...rest } = deps.config;
  return { ...rest, ...(repoPath ? { repoPath } : {}) };
}
