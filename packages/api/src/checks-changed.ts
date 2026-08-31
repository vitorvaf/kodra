import { EventEmitter } from 'node:events';
import type { CheckChangePayload } from './bridge.js';
import { CHECKS_CHANGED_CHANNEL } from './bridge.js';

export type CheckChangeListener = (payload: CheckChangePayload) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function notifyChecksChanged(runId: number): void {
  const payload: CheckChangePayload = { runId };
  emitter.emit(CHECKS_CHANGED_CHANNEL, payload);
}

export function subscribeChecksChanged(listener: CheckChangeListener): () => void {
  const wrap = (payload: CheckChangePayload): void => listener(payload);
  emitter.on(CHECKS_CHANGED_CHANNEL, wrap);
  return () => {
    emitter.off(CHECKS_CHANGED_CHANNEL, wrap);
  };
}
