export interface EventDedupOptions {
  maxKeys?: number;
  ttlMs?: number;
}

export class EventDedup {
  private readonly map = new Map<string, number>();
  private readonly maxKeys: number;
  private readonly defaultTtlMs: number;

  constructor(opts: EventDedupOptions = {}) {
    this.maxKeys = opts.maxKeys ?? 10_000;
    this.defaultTtlMs = opts.ttlMs ?? 60 * 60 * 1000;
  }

  seen(idempotencyKey: string): boolean {
    const expiresAt = this.map.get(idempotencyKey);
    if (expiresAt === undefined) return false;
    if (expiresAt <= Date.now()) {
      this.map.delete(idempotencyKey);
      return false;
    }
    return true;
  }

  remember(key: string, ttlMs?: number): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, Date.now() + (ttlMs ?? this.defaultTtlMs));
    while (this.map.size > this.maxKeys) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}
