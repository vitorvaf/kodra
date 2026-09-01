import { createServer, type Server } from 'node:net';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startPreviewProxy } from '../src/preview-proxy.js';

async function pickFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const probe: Server = createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        probe.close(() => resolve(port));
      } else {
        probe.close(() => reject(new Error('no address')));
      }
    });
  });
}

async function startEchoHtmlServer(body: string): Promise<{ port: number; close: () => Promise<void> }> {
  const port = await pickFreePort();
  const server: HttpServer = createHttpServer((req, res) => {
    if (req.url === '/json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Frame-Options': 'DENY',
    });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()));
  return {
    port,
    async close() {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('preview-proxy', () => {
  let upstream: { port: number; close: () => Promise<void> } | null = null;
  let proxy: Awaited<ReturnType<typeof startPreviewProxy>> | null = null;

  beforeEach(() => {
    upstream = null;
    proxy = null;
  });

  afterEach(async () => {
    if (proxy) await proxy.stop();
    if (upstream) await upstream.close();
  });

  it('injects eruda + inspect script tags into HTML responses', async () => {
    upstream = await startEchoHtmlServer('<html><body><h1>hi</h1></body></html>');
    proxy = await startPreviewProxy({ upstreamUrl: `http://localhost:${upstream.port}` });

    const res = await fetch(proxy.url);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<h1>hi</h1>');
    expect(text).toContain('/__kanbots/eruda.js');
    expect(text).toContain('/__kanbots/eruda-init.js');
    expect(text).toContain('/__kanbots/inspect.js');
    // Scripts must land before </body>.
    expect(text.indexOf('/__kanbots/inspect.js')).toBeLessThan(text.indexOf('</body>'));
  });

  it('strips iframe-blocking response headers', async () => {
    upstream = await startEchoHtmlServer('<html><body></body></html>');
    proxy = await startPreviewProxy({ upstreamUrl: `http://localhost:${upstream.port}` });

    const res = await fetch(proxy.url);
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('x-frame-options')).toBeNull();
  });

  it('serves the eruda asset on its reserved path', async () => {
    upstream = await startEchoHtmlServer('<html><body></body></html>');
    proxy = await startPreviewProxy({ upstreamUrl: `http://localhost:${upstream.port}` });

    const res = await fetch(`${proxy.url}/__kanbots/eruda.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/javascript');
    const body = await res.text();
    expect(body).toContain('eruda');
  });

  it('serves the inspect injector on its reserved path', async () => {
    upstream = await startEchoHtmlServer('<html><body></body></html>');
    proxy = await startPreviewProxy({ upstreamUrl: `http://localhost:${upstream.port}` });

    const res = await fetch(`${proxy.url}/__kanbots/inspect.js`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('kb-inspect');
  });

  it('proxies non-HTML responses without rewriting', async () => {
    upstream = await startEchoHtmlServer('<html></html>');
    proxy = await startPreviewProxy({ upstreamUrl: `http://localhost:${upstream.port}` });

    const res = await fetch(`${proxy.url}/json`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json).toEqual({ ok: true });
  });

  it('returns 502 when the upstream is unreachable', async () => {
    const unusedPort = await pickFreePort();
    proxy = await startPreviewProxy({ upstreamUrl: `http://localhost:${unusedPort}` });

    const res = await fetch(proxy.url);
    expect(res.status).toBe(502);
  });

  it('injects scripts when the body has no closing tag', async () => {
    upstream = await startEchoHtmlServer('<html><body><h1>fragment</h1>');
    proxy = await startPreviewProxy({ upstreamUrl: `http://localhost:${upstream.port}` });

    const res = await fetch(proxy.url);
    const text = await res.text();
    expect(text).toContain('/__kanbots/inspect.js');
    expect(text).toContain('<h1>fragment</h1>');
  });
});
