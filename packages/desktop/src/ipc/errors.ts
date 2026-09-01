export interface IpcError {
  name: string;
  message: string;
  details?: unknown;
}

export function toIpcError(err: unknown): IpcError {
  if (err instanceof Error) {
    const { name, message } = err;
    const e = err as { run?: unknown; cooldown?: unknown };
    const details = e.run !== undefined ? e.run : e.cooldown;
    return details !== undefined ? { name, message, details } : { name, message };
  }
  return { name: 'UnknownError', message: String(err) };
}
