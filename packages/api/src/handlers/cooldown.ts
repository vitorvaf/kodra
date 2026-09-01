import type { CooldownStatePayload } from '../bridge.js';
import type { HandlerDeps } from './types.js';

export async function get(deps: HandlerDeps): Promise<CooldownStatePayload> {
  return deps.supervisor.getCooldown();
}
