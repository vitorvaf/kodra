export type ReplayEntry = {
  id: string;
  ts: number;
  bytes: number;
  payload: unknown;
};

export type ReplayDelivery = {
  id: string;
  payload: unknown;
};

export type ReplayBufferOptions = {
  clock?: () => number;
};

export class ReplayBuffer {
  private readonly entries: ReplayEntry[] = [];
  private totalBytes = 0;
  private readonly clock: () => number;

  constructor(opts: ReplayBufferOptions = {}) {
    this.clock = opts.clock ?? (() => Date.now());
  }

  push(eventId: string, payload: unknown): void {
    const bytes = sizeOf(payload);
    this.entries.push({
      id: eventId,
      ts: this.clock(),
      bytes,
      payload,
    });
    this.totalBytes += bytes;
  }

  evict(maxBytes: number, maxAgeMs: number): number {
    const cutoff = this.clock() - maxAgeMs;
    let evicted = 0;

    while (this.entries.length > 0) {
      const head = this.entries[0];
      if (head === undefined) break;
      if (head.ts >= cutoff) break;
      this.entries.shift();
      this.totalBytes -= head.bytes;
      evicted++;
    }

    while (this.entries.length > 0 && this.totalBytes > maxBytes) {
      const head = this.entries[0];
      if (head === undefined) break;
      this.entries.shift();
      this.totalBytes -= head.bytes;
      evicted++;
    }

    return evicted;
  }

  getSince(lastEventId: string | null | undefined): ReplayDelivery[] {
    if (lastEventId == null) {
      return this.entries.map(toDelivery);
    }
    const idx = this.entries.findIndex((e) => e.id === lastEventId);
    if (idx === -1) {
      return this.entries.map(toDelivery);
    }
    return this.entries.slice(idx + 1).map(toDelivery);
  }

  size(): number {
    return this.entries.length;
  }

  bytes(): number {
    return this.totalBytes;
  }
}

function toDelivery(e: ReplayEntry): ReplayDelivery {
  return { id: e.id, payload: e.payload };
}

function sizeOf(payload: unknown): number {
  if (payload === undefined) return 0;
  return Buffer.byteLength(JSON.stringify(payload) ?? '', 'utf8');
}
