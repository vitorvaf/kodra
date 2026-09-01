export interface FakeRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

export interface FakeResponseInit {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export class FakeFetch {
  readonly calls: FakeRequest[] = [];
  private readonly queue: FakeResponseInit[] = [];

  enqueue(...responses: FakeResponseInit[]): void {
    this.queue.push(...responses);
  }

  fetch: typeof fetch = async (input, init) => {
    const req = new Request(input, init);
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      headers[k] = v;
    });

    let body: string | null = null;
    if (init?.body != null) {
      body = typeof init.body === 'string' ? init.body : await req.clone().text();
    }

    this.calls.push({
      url: req.url,
      method: req.method,
      headers,
      body,
    });

    const next = this.queue.shift();
    if (!next) {
      throw new Error(`No queued response for ${req.method} ${req.url}`);
    }

    const responseInit: ResponseInit = {
      status: next.status,
      headers: { 'content-type': 'application/json', ...(next.headers ?? {}) },
    };
    const responseBody =
      next.status === 304 || next.body === undefined ? null : JSON.stringify(next.body);

    return new Response(responseBody, responseInit);
  };

  findCall(predicate: (c: FakeRequest) => boolean): FakeRequest | undefined {
    return this.calls.find(predicate);
  }
}
