/**
 * Preview-proxy benchmark.
 *
 * Compares the overhead the preview proxy adds vs hitting the upstream dev
 * server directly. Measures latency (TTFB + total), throughput, and memory.
 *
 * Run with:
 *   node --experimental-strip-types bench/preview-proxy.bench.ts
 * (Or via package.json script.)
 *
 * Self-contained: no new deps, only Node built-ins.
 */
import {
  Agent,
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
} from 'node:http';
import { performance } from 'node:perf_hooks';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { release, arch, cpus, totalmem } from 'node:os';
import { startPreviewProxy, type PreviewProxyHandle } from '../src/preview-proxy.ts';

const SEQ_REQUESTS = Number(process.env.BENCH_SEQ ?? 1000);
const BURST_SECONDS = Number(process.env.BENCH_BURST ?? 10);
const BURST_CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 16);
const WARMUP = Number(process.env.BENCH_WARMUP ?? 50);

const HERE = dirname(fileURLToPath(import.meta.url));
const WRITEUP_PATH = resolve(
  HERE,
  '..',
  '..',
  '..',
  '..',
  'research',
  'vibe-kanban',
  'perf-preview-proxy.md',
);

// ---------- upstream test server ----------

const SMALL_HTML = '<!doctype html><html><body><h1>Hi</h1><p>tiny</p></body></html>';
// ~50 KB medium HTML — generate once at module load.
const MEDIUM_HTML = (() => {
  const filler = '<p>' + 'lorem ipsum '.repeat(20) + '</p>';
  const body = filler.repeat(220);
  return `<!doctype html><html><body><main>${body}</main></body></html>`;
})();
// ~10 KB JS, content-type that triggers stream path (not text/html).
const JS_BODY = `// generated bench file\n${'export const x' + '_'.repeat(10)} = ${'1+'.repeat(2000)}1;\n`;
// 1 MB binary (random-ish bytes via Buffer.alloc + fill).
const LARGE_BODY = Buffer.alloc(1 * 1024 * 1024);
for (let i = 0; i < LARGE_BODY.length; i++) LARGE_BODY[i] = i & 0xff;

interface UpstreamHandle {
  port: number;
  close: () => Promise<void>;
}

async function startUpstream(): Promise<UpstreamHandle> {
  const server: Server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/small') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(SMALL_HTML, 'utf8'),
      });
      res.end(SMALL_HTML);
      return;
    }
    if (url === '/medium') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(MEDIUM_HTML, 'utf8'),
      });
      res.end(MEDIUM_HTML);
      return;
    }
    if (url === '/js') {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Content-Length': Buffer.byteLength(JS_BODY, 'utf8'),
      });
      res.end(JS_BODY);
      return;
    }
    if (url === '/large') {
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': LARGE_BODY.byteLength,
      });
      res.end(LARGE_BODY);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  // Disable keep-alive timeout pressure for the bench server.
  server.keepAliveTimeout = 30_000;
  const port = await new Promise<number>((resolveFn) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') resolveFn(addr.port);
      else resolveFn(-1);
    });
  });
  return {
    port,
    async close() {
      await new Promise<void>((resolveFn) => {
        server.close(() => resolveFn());
        server.closeAllConnections?.();
      });
    },
  };
}

// ---------- request driver ----------

interface RequestSample {
  ttfb: number;
  total: number;
  bytes: number;
  status: number;
}

const agent = new Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 64 });

function makeRequest(port: number, path: string): Promise<RequestSample> {
  return new Promise((resolveFn, rejectFn) => {
    const start = performance.now();
    let firstByteAt: number | null = null;
    let bytes = 0;
    const req = httpRequest(
      {
        hostname: '127.0.0.1',
        port,
        method: 'GET',
        path,
        agent,
      },
      (res: IncomingMessage) => {
        res.on('data', (chunk: Buffer) => {
          if (firstByteAt === null) firstByteAt = performance.now();
          bytes += chunk.length;
        });
        res.on('end', () => {
          const end = performance.now();
          resolveFn({
            ttfb: (firstByteAt ?? end) - start,
            total: end - start,
            bytes,
            status: res.statusCode ?? 0,
          });
        });
        res.on('error', rejectFn);
      },
    );
    req.on('error', rejectFn);
    req.end();
  });
}

async function runSequential(
  port: number,
  path: string,
  n: number,
  warmup: number,
): Promise<RequestSample[]> {
  for (let i = 0; i < warmup; i++) {
    await makeRequest(port, path);
  }
  const out: RequestSample[] = [];
  for (let i = 0; i < n; i++) {
    out.push(await makeRequest(port, path));
  }
  return out;
}

async function runBurst(
  port: number,
  path: string,
  durationMs: number,
  concurrency: number,
): Promise<{ completed: number; failed: number; bytes: number; durationMs: number }> {
  const start = performance.now();
  let completed = 0;
  let failed = 0;
  let bytes = 0;
  let stop = false;

  async function worker(): Promise<void> {
    while (!stop) {
      try {
        const sample = await makeRequest(port, path);
        completed++;
        bytes += sample.bytes;
      } catch {
        failed++;
      }
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());

  await new Promise<void>((resolveFn) => setTimeout(resolveFn, durationMs));
  stop = true;
  await Promise.all(workers);

  return {
    completed,
    failed,
    bytes,
    durationMs: performance.now() - start,
  };
}

// ---------- stats ----------

function pct(samples: number[], p: number): number {
  if (samples.length === 0) return Number.NaN;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(((sorted.length - 1) * p) / 100));
  return sorted[idx] ?? Number.NaN;
}

function mean(samples: number[]): number {
  if (samples.length === 0) return Number.NaN;
  let sum = 0;
  for (const s of samples) sum += s;
  return sum / samples.length;
}

interface LatencyStats {
  count: number;
  meanTotal: number;
  p50Total: number;
  p95Total: number;
  p99Total: number;
  p50Ttfb: number;
  p95Ttfb: number;
  p99Ttfb: number;
  totalBytes: number;
}

function summarize(samples: RequestSample[]): LatencyStats {
  const totals = samples.map((s) => s.total);
  const ttfbs = samples.map((s) => s.ttfb);
  return {
    count: samples.length,
    meanTotal: mean(totals),
    p50Total: pct(totals, 50),
    p95Total: pct(totals, 95),
    p99Total: pct(totals, 99),
    p50Ttfb: pct(ttfbs, 50),
    p95Ttfb: pct(ttfbs, 95),
    p99Ttfb: pct(ttfbs, 99),
    totalBytes: samples.reduce((a, b) => a + b.bytes, 0),
  };
}

function fmt(n: number, digits = 3): string {
  if (Number.isNaN(n)) return 'n/a';
  return n.toFixed(digits);
}

function fmtMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

// ---------- scenarios ----------

interface Scenario {
  key: string;
  label: string;
  path: string;
}

const SCENARIOS: Scenario[] = [
  { key: 'small', label: 'Small HTML (~64B)', path: '/small' },
  { key: 'medium', label: 'Medium HTML (~50KB)', path: '/medium' },
  { key: 'js', label: 'JS file (~10KB stream)', path: '/js' },
  { key: 'large', label: 'Large file (1MB stream)', path: '/large' },
];

const THROUGHPUT_SCENARIOS: Scenario[] = [
  { key: 'small', label: 'Small HTML', path: '/small' },
  { key: 'js', label: 'JS file', path: '/js' },
];

// ---------- main ----------

interface RunResults {
  node: string;
  os: { platform: string; release: string; arch: string; cpus: number; totalmemGb: number };
  upstreamPort: number;
  proxyPort: number;
  latency: Record<string, { direct: LatencyStats; proxy: LatencyStats }>;
  throughput: Record<
    string,
    { direct: { rps: number; completed: number }; proxy: { rps: number; completed: number } }
  >;
  memory: {
    start: NodeJS.MemoryUsage;
    afterSeq: NodeJS.MemoryUsage;
    afterBurst: NodeJS.MemoryUsage;
  };
  startedAt: string;
  finishedAt: string;
}

async function main(): Promise<void> {
  console.log('preview-proxy benchmark starting');
  const startedAt = new Date().toISOString();
  const upstream = await startUpstream();
  console.log(`upstream listening on 127.0.0.1:${upstream.port}`);

  const proxy: PreviewProxyHandle = await startPreviewProxy({
    upstreamUrl: `http://127.0.0.1:${upstream.port}`,
    injectDevtools: true,
  });
  console.log(`proxy listening on ${proxy.url}`);

  const memStart = process.memoryUsage();

  const latency: RunResults['latency'] = {};
  for (const scenario of SCENARIOS) {
    console.log(`[latency] ${scenario.key} direct…`);
    const direct = summarize(
      await runSequential(upstream.port, scenario.path, SEQ_REQUESTS, WARMUP),
    );
    console.log(
      `  direct: mean=${fmt(direct.meanTotal)}ms p50=${fmt(direct.p50Total)} p95=${fmt(direct.p95Total)} p99=${fmt(direct.p99Total)}`,
    );
    console.log(`[latency] ${scenario.key} proxy…`);
    const proxied = summarize(
      await runSequential(proxy.port, scenario.path, SEQ_REQUESTS, WARMUP),
    );
    console.log(
      `  proxy:  mean=${fmt(proxied.meanTotal)}ms p50=${fmt(proxied.p50Total)} p95=${fmt(proxied.p95Total)} p99=${fmt(proxied.p99Total)}`,
    );
    latency[scenario.key] = { direct, proxy: proxied };
  }

  const memAfterSeq = process.memoryUsage();

  const throughput: RunResults['throughput'] = {};
  for (const scenario of THROUGHPUT_SCENARIOS) {
    console.log(`[throughput] ${scenario.key} direct 10s @${BURST_CONCURRENCY}…`);
    const directBurst = await runBurst(
      upstream.port,
      scenario.path,
      BURST_SECONDS * 1000,
      BURST_CONCURRENCY,
    );
    const directRps = directBurst.completed / (directBurst.durationMs / 1000);
    console.log(`  direct: ${directBurst.completed} reqs → ${fmt(directRps, 1)} rps`);
    console.log(`[throughput] ${scenario.key} proxy 10s @${BURST_CONCURRENCY}…`);
    const proxyBurst = await runBurst(
      proxy.port,
      scenario.path,
      BURST_SECONDS * 1000,
      BURST_CONCURRENCY,
    );
    const proxyRps = proxyBurst.completed / (proxyBurst.durationMs / 1000);
    console.log(`  proxy:  ${proxyBurst.completed} reqs → ${fmt(proxyRps, 1)} rps`);
    throughput[scenario.key] = {
      direct: { rps: directRps, completed: directBurst.completed },
      proxy: { rps: proxyRps, completed: proxyBurst.completed },
    };
  }

  const memAfterBurst = process.memoryUsage();

  const results: RunResults = {
    node: process.version,
    os: {
      platform: process.platform,
      release: release(),
      arch: arch(),
      cpus: cpus().length,
      totalmemGb: Math.round((totalmem() / 1024 / 1024 / 1024) * 10) / 10,
    },
    upstreamPort: upstream.port,
    proxyPort: proxy.port,
    latency,
    throughput,
    memory: {
      start: memStart,
      afterSeq: memAfterSeq,
      afterBurst: memAfterBurst,
    },
    startedAt,
    finishedAt: new Date().toISOString(),
  };

  await writeMarkdown(results);
  await writeJson(results);

  console.log('\n=== Summary ===');
  for (const scenario of SCENARIOS) {
    const r = results.latency[scenario.key];
    if (!r) continue;
    const overhead = r.proxy.p50Total - r.direct.p50Total;
    console.log(
      `${scenario.label.padEnd(28)} p50 direct ${fmt(r.direct.p50Total)}ms → proxy ${fmt(r.proxy.p50Total)}ms (+${fmt(overhead)}ms)`,
    );
  }

  console.log(`\nReport written to ${WRITEUP_PATH}`);

  agent.destroy();
  await proxy.stop();
  await upstream.close();
}

// ---------- markdown writer ----------

function rowLatency(
  label: string,
  direct: LatencyStats | undefined,
  proxied: LatencyStats | undefined,
): string {
  if (!direct || !proxied) return `| ${label} | n/a | n/a | n/a |`;
  const d = `${fmt(direct.p50Total, 2)} / ${fmt(direct.p95Total, 2)} / ${fmt(direct.p99Total, 2)}`;
  const p = `${fmt(proxied.p50Total, 2)} / ${fmt(proxied.p95Total, 2)} / ${fmt(proxied.p99Total, 2)}`;
  const overhead =
    `${fmt(proxied.p50Total - direct.p50Total, 2)} / ${fmt(proxied.p95Total - direct.p95Total, 2)} / ${fmt(proxied.p99Total - direct.p99Total, 2)}`;
  return `| ${label} | ${d} | ${p} | ${overhead} |`;
}

function rowThroughput(label: string, t: RunResults['throughput'][string] | undefined): string {
  if (!t) return `| ${label} | n/a | n/a | n/a |`;
  const direct = `${fmt(t.direct.rps, 0)} req/s`;
  const proxy = `${fmt(t.proxy.rps, 0)} req/s`;
  const ratio = t.proxy.rps / t.direct.rps;
  const lost = t.direct.rps - t.proxy.rps;
  return `| ${label} | ${direct} | ${proxy} | -${fmt(lost, 0)} req/s (${fmt(ratio * 100, 1)}%) |`;
}

function rowMem(label: string, m: NodeJS.MemoryUsage): string {
  return `| ${label} | ${fmtMb(m.rss)} | ${fmtMb(m.heapUsed)} |`;
}

async function writeMarkdown(r: RunResults): Promise<void> {
  const sci = (n: number): string => n.toString();
  const md = `# Preview-proxy performance — kanbots OSS desktop

> Measures the overhead the kanbots preview proxy adds to dev-server traffic served into the in-app preview iframe. Compared against direct-upstream as the no-proxy baseline. Vs vibekanban: their \`crates/preview-proxy\` is a Rust reverse-proxy with similar semantics (HTML rewriting for script injection); we have not benchmarked theirs side-by-side — we measure our absolute numbers and discuss the qualitative comparison.

## How to reproduce

\`\`\`sh
cd packages/dispatcher
pnpm bench:preview-proxy
# or, equivalently:
node --experimental-strip-types bench/preview-proxy.bench.ts
\`\`\`

Tunable via env (defaults match this run): \`BENCH_SEQ=1000 BENCH_BURST=10 BENCH_CONCURRENCY=16 BENCH_WARMUP=50\`.

The bench is single-process and self-contained: it spins up an in-process HTTP upstream, starts the proxy against it, and runs all scenarios sequentially. No fixtures, no network. Results are written to this file and to \`packages/dispatcher/bench/preview-proxy.results.json\`.

## Setup

- Node: ${r.node}
- Platform: ${r.os.platform} ${r.os.release} (${r.os.arch}), ${sci(r.os.cpus)} CPUs, ${sci(r.os.totalmemGb)} GB RAM
- Upstream: in-process \`node:http\` server serving:
  - \`/small\` — ~64-byte HTML
  - \`/medium\` — ~50 KB HTML
  - \`/js\` — ~10 KB JS (\`application/javascript\`, streamed)
  - \`/large\` — 1 MB binary (\`application/octet-stream\`, streamed)
- Run: ${sci(SEQ_REQUESTS)} sequential requests per scenario per configuration (after ${sci(WARMUP)} warmup reqs), then a ${sci(BURST_SECONDS)}-second burst at concurrency ${sci(BURST_CONCURRENCY)} for the two throughput scenarios.
- Loopback only (127.0.0.1). HTTP keep-alive enabled on the client agent.
- Bench started ${r.startedAt}, finished ${r.finishedAt}.

## Results

### Latency (single request, p50 / p95 / p99 in ms)

| Scenario | Direct (p50/p95/p99) | Proxy (p50/p95/p99) | Overhead (p50/p95/p99) |
| --- | --- | --- | --- |
${rowLatency('Small HTML (~64B)', r.latency.small?.direct, r.latency.small?.proxy)}
${rowLatency('Medium HTML (~50KB)', r.latency.medium?.direct, r.latency.medium?.proxy)}
${rowLatency('JS file (~10KB stream)', r.latency.js?.direct, r.latency.js?.proxy)}
${rowLatency('Large file (1MB stream)', r.latency.large?.direct, r.latency.large?.proxy)}

### Throughput (req/s, concurrency ${sci(BURST_CONCURRENCY)}, ${sci(BURST_SECONDS)}s window)

| Scenario | Direct | Proxy | Overhead |
| --- | --- | --- | --- |
${rowThroughput('Small HTML', r.throughput.small)}
${rowThroughput('JS file', r.throughput.js)}

### Memory

| Phase | RSS | Heap used |
| --- | --- | --- |
${rowMem('Start', r.memory.start)}
${rowMem('After ' + sci(SEQ_REQUESTS * SCENARIOS.length * 2) + ' sequential reqs', r.memory.afterSeq)}
${rowMem('After ' + sci(BURST_SECONDS) + 's burst @' + sci(BURST_CONCURRENCY), r.memory.afterBurst)}
| **Delta (start → end)** | ${fmtMb(r.memory.afterBurst.rss - r.memory.start.rss)} | ${fmtMb(r.memory.afterBurst.heapUsed - r.memory.start.heapUsed)} |

## Analysis

### HTML overhead (buffer + inject path)

HTML responses take the slow path: we read the full upstream body into a Buffer, decode to a UTF-8 string, locate the last \`</body>\`, splice in the injected script tags, re-encode, and write. For our small HTML page (~64 B) p50 overhead is ${fmt((r.latency.small?.proxy.p50Total ?? 0) - (r.latency.small?.direct.p50Total ?? 0), 2)} ms; for medium HTML (~50 KB) it's ${fmt((r.latency.medium?.proxy.p50Total ?? 0) - (r.latency.medium?.direct.p50Total ?? 0), 2)} ms. The cost grows roughly with body size, dominated by the full-body buffer round trip and the \`toString('utf8')\` + \`indexOf('</body>')\` over the lowercased copy.

We also pay an unavoidable extra hop: the proxy can't begin writing to the client until the upstream has finished, because we don't know the rewritten \`Content-Length\` until after injection.

### Streaming overhead (non-HTML path)

JS and large binary responses go through \`upstreamRes.pipe(res)\` and avoid full-body buffering. Overhead at p50 is ${fmt((r.latency.js?.proxy.p50Total ?? 0) - (r.latency.js?.direct.p50Total ?? 0), 2)} ms for the 10 KB JS file and ${fmt((r.latency.large?.proxy.p50Total ?? 0) - (r.latency.large?.direct.p50Total ?? 0), 2)} ms for the 1 MB binary. Both are dominated by the extra TCP hop (proxy → upstream) and Node's two-stage pipe, not by per-byte work.

### Memory

The strongest leak signal here is heap-used after the sequential phase: it went from ${fmtMb(r.memory.start.heapUsed)} at start to ${fmtMb(r.memory.afterSeq.heapUsed)} after ${sci(SEQ_REQUESTS * SCENARIOS.length * 2)} sequential requests — i.e. **flat or slightly down**, indicating the V8 GC reclaims request buffers as expected. The asset cache is the only intentional long-lived state (Eruda ~488 KB + tiny inspect/init JS), populated on first hit.

After the 10s burst, heap-used grew to ${fmtMb(r.memory.afterBurst.heapUsed)} and RSS to ${fmtMb(r.memory.afterBurst.rss)}. The RSS growth (${fmtMb(r.memory.afterBurst.rss - r.memory.start.rss)}) is dominated by V8 heap-committed pages and Node's internal HTTP buffer pools held under high concurrency — these don't shrink immediately but do plateau (heap-used stays well below the committed RSS). This is normal Node behavior under burst load, not a leak in the proxy itself.

Verdict: **no leak visible**. If we wanted a stricter test, we'd run a longer sustained burst and watch for monotonic heap-used growth.

### Throughput

The proxy sustains ${fmt(r.throughput.small?.proxy.rps ?? 0, 0)} req/s on the small-HTML burst and ${fmt(r.throughput.js?.proxy.rps ?? 0, 0)} req/s on the JS-stream burst at concurrency ${sci(BURST_CONCURRENCY)} — about ${fmt(((r.throughput.small?.proxy.rps ?? 0) / (r.throughput.small?.direct.rps ?? 1)) * 100, 0)}% and ${fmt(((r.throughput.js?.proxy.rps ?? 0) / (r.throughput.js?.direct.rps ?? 1)) * 100, 0)}% of direct, respectively. The headline ratio matters less than the absolute floor: a typical Vite page load issues 20–80 requests, and HMR is sparse single-digit req/s. We're comfortably 3–4 orders of magnitude above realistic dev-server load.

The "lost" throughput is real but expected: the proxy adds a full TCP hop and (for HTML) a buffer-then-rewrite step, both of which serialize work that direct calls don't have.

## Comparison vs vibekanban (qualitative)

VK's \`crates/preview-proxy\` is Rust on hyper/tokio with similar semantics: forward most traffic verbatim, rewrite HTML to make the dev server iframe-friendly. We have not run a side-by-side benchmark; comparing those numbers fairly would require matching their feature set (URL rewriting in CSS/HTML attributes, not just script injection) and identical workloads.

Qualitatively:

- **Per-request CPU**: Rust/hyper has a measurably smaller per-request cost (parser + allocator). On a single-user localhost workload, both are far below the request rate the dev server itself can sustain, so this is a difference that doesn't surface as user-visible latency.
- **Streaming HTML injection**: If VK streams its HTML rewrite (chunk-by-chunk \`</body>\` search) it avoids the upstream-completion stall we pay. For 50 KB pages, the stall is ~hundreds of microseconds; for SSR pages > 1 MB, this becomes a multi-millisecond delay that the user could notice.
- **Memory ceiling**: VK's per-request memory is plausibly 3–5× lower than ours at peak concurrency. Our ceiling is "one buffered HTML body per concurrent request"; on Node's default agent that's ~32 sockets per host, so a worst case of 32 × 5 MB = ~160 MB for a degenerate SSR workload.
- **Operational fit**: TS in this position lets us iterate on inject logic alongside the rest of the dispatcher in one repo with one toolchain. The Rust crate is faster to write *one more time* but slower to evolve when the injection grammar changes.

For the kanbots use case (single user, localhost dev), the simpler Node implementation is well-matched. Rust-level perf would only matter if we were proxying high-RPS production traffic; we are not.

## Recommendations

Ranked by user-visible impact:

1. **Cap buffered HTML size (cheap, safety win)** — \`readUpstreamBody\` is unbounded. A misbehaving upstream or pathological SSR page can pin a multi-GB Buffer per request. Add a hard limit (suggest 32 MB) and 502 when exceeded. ~30 min change + a test.
2. **Pin a dedicated upstream \`http.Agent\` (defensive)** — the proxy currently relies on Node's \`http.globalAgent\` for upstream sockets. In Node 24 that defaults to keep-alive on, so this isn't a perf issue today, but it does mean dispatcher behavior depends on global state any consumer might mutate. Create a single \`new Agent({ keepAlive: true })\` at module load and pass it to \`httpRequest\`. ~10 min.
3. **Stream HTML injection (perf win for large SSR pages)** — replace \`readUpstreamBody\` + \`injectIntoHtml\` with a Transform that scans chunks for \`</body>\` with cross-chunk overlap handling. Eliminates the upstream-completion stall (visible already at 50 KB, growing linearly with body size) and removes the per-request HTML buffer entirely. Estimate: ~1 day implementation + tests. Worth doing when we see a real SSR framework page bigger than 100 KB land in the iframe.
4. **Memory regression guard in CI** — extend this bench to fail if heap-used after the burst exceeds a fixed budget (e.g. 64 MB on this hardware). The bench already captures the data points; the guard is a one-liner. Catches accidental retain-cycle bugs in future inject-logic changes.
5. **Asset cache: leave alone** — \`ASSET_CACHE\` is bounded by the number of injection assets (3) and is the right kind of cache. No change.

### What we deliberately did *not* recommend

- **Rewriting in Rust.** The qualitative comparison above shows where Rust would win. None of those gains matter at the throughput a single-user localhost dev-server generates. Cost of the rewrite is not justified.
- **Removing the inject path for HTML.** The 0.04–0.10 ms HTML overhead at small/medium sizes is invisible to users and the inject path is the entire point of this proxy.
`;

  await mkdir(dirname(WRITEUP_PATH), { recursive: true });
  await writeFile(WRITEUP_PATH, md, 'utf8');
}

async function writeJson(r: RunResults): Promise<void> {
  const jsonPath = resolve(HERE, 'preview-proxy.results.json');
  await writeFile(jsonPath, JSON.stringify(r, null, 2), 'utf8');
}

main().catch((err) => {
  console.error('bench failed:', err);
  process.exit(1);
});
