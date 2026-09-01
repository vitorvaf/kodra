/**
 * HTTP proxy that sits in front of a project's dev server. The iframe loads
 * the proxy URL instead of the raw dev server so we can inject scripts on
 * same-origin HTML responses — devtools (Eruda) and the click-to-component
 * inspector both need this since the parent and the iframe live on
 * different origins.
 *
 * Design notes:
 *   - Streams every response except text/html, which we buffer to inject
 *     `<script>` tags before `</body>`.
 *   - Strips Content-Security-Policy / X-Frame-Options / X-Content-Type so
 *     the iframe will actually load and the injected scripts will execute.
 *     We do NOT touch Set-Cookie or Location.
 *   - Pipes WebSocket upgrades transparently so Vite/Next HMR keeps working.
 *   - The asset path `/__kanbots/…` is reserved for our injected scripts;
 *     all other paths are proxied to the upstream.
 */
import { readFile } from 'node:fs/promises';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { connect as netConnect, createServer as createNetServer, type Socket } from 'node:net';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export interface PreviewProxyHandle {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

export interface StartPreviewProxyOptions {
  /** Upstream dev server URL, e.g. http://localhost:3000 */
  upstreamUrl: string;
  /** Preferred listen port. Defaults to upstream + 100. */
  preferredPort?: number;
  /**
   * When true, injects the Eruda + inspect scripts into HTML responses.
   * Defaults to true. Disable for headless probing.
   */
  injectDevtools?: boolean;
  /**
   * Optional override for where the injection assets (`eruda.js`,
   * `eruda-init.js`, `inspect.js`) live. When dispatcher is bundled into a
   * downstream binary (e.g. Electron's main.cjs), the host should copy the
   * assets to a known location and pass it here.
   */
  assetsDir?: string;
}

interface UpstreamTarget {
  hostname: string;
  port: number;
}

// Resolve the directory of the running file in a way that survives being
// bundled into a CJS target (e.g. Electron's main.cjs). The dispatcher's own
// dist is ESM (`import.meta.url` works), but downstream consumers like the
// desktop app re-bundle this module to CJS where `import.meta.url` is
// `undefined` and `__dirname` is the truth. Probe both, defensively.
function detectModuleDir(): string {
  // CJS path: __dirname is a real string in any tsup CJS bundle.
  // Read via globalThis to avoid touching the ESM-default type surface.
  const cjsDirname = (globalThis as { __dirname?: unknown }).__dirname;
  if (typeof cjsDirname === 'string' && cjsDirname.length > 0) {
    return cjsDirname;
  }
  try {
    const meta = import.meta as { url?: unknown };
    if (typeof meta.url === 'string' && meta.url.length > 0) {
      return dirname(fileURLToPath(meta.url));
    }
  } catch {
    // import.meta may not be available in some hosts; fall through.
  }
  return process.cwd();
}

function buildAssetCandidates(override?: string): string[] {
  const here = detectModuleDir();
  const candidates = [
    resolve(here, '..', 'assets'),
    resolve(here, '..', '..', 'assets'),
    resolve(here, 'assets'),
  ];
  return override ? [override, ...candidates] : candidates;
}
const HEADERS_TO_STRIP = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'x-content-type-options',
  // Hop-by-hop & encoding-related — we always speak identity to the iframe
  // because we may rewrite the body.
  'content-encoding',
  'transfer-encoding',
  'connection',
  'keep-alive',
  'proxy-connection',
  'upgrade',
]);
const REQUEST_HEADERS_TO_STRIP = new Set([
  'host',
  'connection',
  'transfer-encoding',
  'proxy-connection',
  'keep-alive',
  'te',
  'trailer',
  // We force identity so we can rewrite HTML; let our own pipe negotiate.
  'accept-encoding',
]);

const ASSET_CACHE = new Map<string, Buffer>();

async function readAsset(filename: string, candidates: readonly string[]): Promise<Buffer> {
  const cacheKey = `${candidates.join('|')}::${filename}`;
  const cached = ASSET_CACHE.get(cacheKey);
  if (cached) return cached;
  let lastErr: unknown = null;
  for (const dir of candidates) {
    try {
      const buf = await readFile(resolve(dir, filename));
      ASSET_CACHE.set(cacheKey, buf);
      return buf;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `preview-proxy: asset "${filename}" not found in ${candidates.join(', ')}: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

function parseUpstream(rawUrl: string): UpstreamTarget {
  const url = new URL(rawUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`preview-proxy: unsupported upstream protocol ${url.protocol}`);
  }
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  return { hostname: url.hostname, port };
}

async function isPortFree(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolveFn) => {
    const server = createNetServer();
    server.once('error', () => resolveFn(false));
    server.once('listening', () => {
      server.close(() => resolveFn(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

async function pickPort(start: number, attempts = 16): Promise<number> {
  for (let i = 0; i < attempts; i++) {
    const candidate = start + i;
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error(`preview-proxy: no free port near ${start}`);
}

function filterRequestHeaders(
  headers: IncomingMessage['headers'],
): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (REQUEST_HEADERS_TO_STRIP.has(name.toLowerCase())) continue;
    out[name] = value;
  }
  return out;
}

function filterResponseHeaders(
  headers: IncomingMessage['headers'],
  isHtml: boolean,
): Record<string, number | string | string[]> {
  const out: Record<string, number | string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    if (HEADERS_TO_STRIP.has(lower)) continue;
    // Content-Length is wrong after we rewrite HTML; node fills it back in.
    if (isHtml && lower === 'content-length') continue;
    out[name] = value;
  }
  return out;
}

function isHtmlContentType(contentType: string | string[] | undefined): boolean {
  if (!contentType) return false;
  const v = Array.isArray(contentType) ? contentType[0] ?? '' : contentType;
  return v.toLowerCase().includes('text/html');
}

function injectIntoHtml(html: string, scripts: string): string {
  const lower = html.toLowerCase();
  const closingBody = lower.lastIndexOf('</body>');
  if (closingBody >= 0) {
    return html.slice(0, closingBody) + scripts + html.slice(closingBody);
  }
  // Fragment / no closing body — just append.
  return html + scripts;
}

const INJECTED_SCRIPTS =
  '<script src="/__kanbots/eruda.js" defer></script>' +
  '<script src="/__kanbots/eruda-init.js" defer></script>' +
  '<script src="/__kanbots/inspect.js" defer></script>';

async function serveAsset(
  filename: string,
  contentType: string,
  res: ServerResponse,
  candidates: readonly string[],
): Promise<void> {
  try {
    const buf = await readAsset(filename, candidates);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': buf.byteLength,
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`preview-proxy: asset error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function readBufferedRequestBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((resolveFn, rejectFn) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolveFn(Buffer.concat(chunks)));
    req.on('error', (err) => rejectFn(err));
  });
}

function readUpstreamBody(res: IncomingMessage): Promise<Buffer> {
  return new Promise<Buffer>((resolveFn, rejectFn) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    res.on('end', () => resolveFn(Buffer.concat(chunks)));
    res.on('error', (err) => rejectFn(err));
  });
}

export async function startPreviewProxy(
  opts: StartPreviewProxyOptions,
): Promise<PreviewProxyHandle> {
  const upstream = parseUpstream(opts.upstreamUrl);
  const inject = opts.injectDevtools !== false;
  const assetCandidates = buildAssetCandidates(opts.assetsDir);

  const defaultPreferred = upstream.port + 100;
  const port = await pickPort(opts.preferredPort ?? defaultPreferred);

  const server: Server = createServer();

  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    const reqUrl = req.url ?? '/';

    // Reserved asset paths
    if (inject && reqUrl === '/__kanbots/eruda.js') {
      void serveAsset('eruda.js', 'application/javascript; charset=utf-8', res, assetCandidates);
      return;
    }
    if (inject && reqUrl === '/__kanbots/eruda-init.js') {
      void serveAsset('eruda-init.js', 'application/javascript; charset=utf-8', res, assetCandidates);
      return;
    }
    if (inject && reqUrl === '/__kanbots/inspect.js') {
      void serveAsset('inspect.js', 'application/javascript; charset=utf-8', res, assetCandidates);
      return;
    }

    void proxyHttpRequest(req, res, upstream, inject).catch((err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
      }
      res.end(`preview-proxy: upstream error: ${err instanceof Error ? err.message : String(err)}`);
    });
  });

  server.on('upgrade', (req: IncomingMessage, clientSocket: Socket, head: Buffer) => {
    proxyWebSocketUpgrade(req, clientSocket, head, upstream);
  });

  await new Promise<void>((resolveFn, rejectFn) => {
    const onError = (err: Error): void => {
      server.off('listening', onListen);
      rejectFn(err);
    };
    const onListen = (): void => {
      server.off('error', onError);
      resolveFn();
    };
    server.once('error', onError);
    server.once('listening', onListen);
    server.listen(port, '127.0.0.1');
  });

  const url = `http://localhost:${port}`;

  return {
    port,
    url,
    async stop() {
      await new Promise<void>((resolveFn) => {
        server.close(() => resolveFn());
        // Force-drop any keep-alive connections.
        server.closeAllConnections?.();
      });
    },
  };
}

async function proxyHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  upstream: UpstreamTarget,
  inject: boolean,
): Promise<void> {
  const requestBody = await readBufferedRequestBody(req);

  const headers = filterRequestHeaders(req.headers);
  headers['accept-encoding'] = 'identity';
  headers['host'] = `${upstream.hostname}:${upstream.port}`;
  headers['x-forwarded-host'] =
    typeof req.headers.host === 'string' ? req.headers.host : `localhost`;
  headers['x-forwarded-proto'] = 'http';

  const upstreamReq = httpRequest({
    hostname: upstream.hostname,
    port: upstream.port,
    method: req.method ?? 'GET',
    path: req.url ?? '/',
    headers,
  });

  const upstreamRes = await new Promise<IncomingMessage>((resolveFn, rejectFn) => {
    upstreamReq.once('response', (response) => resolveFn(response));
    upstreamReq.once('error', (err) => rejectFn(err));
    if (requestBody.byteLength > 0) {
      upstreamReq.end(requestBody);
    } else {
      upstreamReq.end();
    }
  });

  const isHtml = inject && isHtmlContentType(upstreamRes.headers['content-type']);
  const respHeaders = filterResponseHeaders(upstreamRes.headers, isHtml);
  const status = upstreamRes.statusCode ?? 502;

  if (isHtml) {
    const bodyBuf = await readUpstreamBody(upstreamRes);
    const original = bodyBuf.toString('utf8');
    const injected = injectIntoHtml(original, INJECTED_SCRIPTS);
    const outBuf = Buffer.from(injected, 'utf8');
    respHeaders['Content-Length'] = outBuf.byteLength;
    res.writeHead(status, respHeaders);
    res.end(outBuf);
    return;
  }

  res.writeHead(status, respHeaders);
  upstreamRes.pipe(res);
  upstreamRes.on('error', () => {
    res.end();
  });
}

function proxyWebSocketUpgrade(
  req: IncomingMessage,
  clientSocket: Socket,
  head: Buffer,
  upstream: UpstreamTarget,
): void {
  const upstreamSocket = netConnect(upstream.port, upstream.hostname, () => {
    const method = req.method ?? 'GET';
    const path = req.url ?? '/';
    const headerLines = [`${method} ${path} HTTP/1.1`];
    const rawHeaders = req.headers;
    const hostHeader = `${upstream.hostname}:${upstream.port}`;
    headerLines.push(`Host: ${hostHeader}`);
    for (const [name, value] of Object.entries(rawHeaders)) {
      if (value === undefined) continue;
      const lower = name.toLowerCase();
      if (lower === 'host') continue;
      if (Array.isArray(value)) {
        for (const v of value) headerLines.push(`${name}: ${v}`);
      } else {
        headerLines.push(`${name}: ${value}`);
      }
    }
    upstreamSocket.write(headerLines.join('\r\n') + '\r\n\r\n');
    if (head && head.length > 0) upstreamSocket.write(head);
    upstreamSocket.pipe(clientSocket);
    clientSocket.pipe(upstreamSocket);
  });

  const teardown = (): void => {
    try {
      clientSocket.destroy();
    } catch {
      /* ignore */
    }
    try {
      upstreamSocket.destroy();
    } catch {
      /* ignore */
    }
  };

  clientSocket.on('error', teardown);
  upstreamSocket.on('error', teardown);
  clientSocket.on('close', teardown);
  upstreamSocket.on('close', teardown);
}
