#!/usr/bin/env node
// Reports whether the AgentMemory server is reachable and, when a secret is
// configured, whether it is accepted. Exit code 0 = healthy, 1 = unavailable,
// 2 = reachable but the secret was rejected.
//
//   pnpm memory:health
//   AGENTMEMORY_URL=http://localhost:3111 AGENTMEMORY_SECRET=... node scripts/memory-health.mjs

const url = (process.env.AGENTMEMORY_URL ?? 'http://localhost:3111').replace(/\/+$/, '');
const secret = process.env.AGENTMEMORY_SECRET?.trim() || null;
const timeoutMs = Number.parseInt(process.env.AGENTMEMORY_TIMEOUT_MS ?? '2000', 10) || 2000;

async function get(path, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${url}${path}`, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

try {
  const live = await get('/agentmemory/livez');
  if (!live.ok) {
    console.log(`agentmemory: unavailable (${url} → HTTP ${live.status})`);
    process.exit(1);
  }
  const body = await live.json().catch(() => ({}));
  console.log(`agentmemory: reachable at ${url} (service=${body.service ?? '?'})`);

  const flags = await get(
    '/agentmemory/config/flags',
    secret ? { Authorization: `Bearer ${secret}` } : {},
  );
  if (flags.status === 401) {
    console.log(
      secret
        ? 'auth: secret rejected (401)'
        : 'auth: server requires a secret (set AGENTMEMORY_SECRET)',
    );
    process.exit(2);
  }
  const info = await flags.json().catch(() => ({}));
  console.log(`auth: ok${info.version ? ` (version ${info.version})` : ''}`);
  process.exit(0);
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  console.log(`agentmemory: unavailable (${url}) — ${msg}`);
  process.exit(1);
}
