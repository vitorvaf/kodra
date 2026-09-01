#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { KANBOTS_TOOLS } from './index.js';
import { CLOUD_SIGNIN_HINT, readCloudSession } from './auth.js';

// Local-only launch by default. Cloud sign-in is OPTIONAL: we read the
// session status once at startup so we can annotate tool errors with a
// helpful hint, but missing/expired cloud credentials never block the
// server from starting. Cloud-dependent tools surface their own errors
// when invoked without a session (the desktop tool-bridge enforces the
// real auth boundary; this layer only proxies).
const cloudSession = await readCloudSession();

const BRIDGE_URL = process.env.KANBOTS_TOOL_BRIDGE_URL;
const BRIDGE_TOKEN = process.env.KANBOTS_TOOL_BRIDGE_TOKEN;

if (!BRIDGE_URL || !BRIDGE_TOKEN) {
  process.stderr.write(
    '[kanbots-mcp] KANBOTS_TOOL_BRIDGE_URL and KANBOTS_TOOL_BRIDGE_TOKEN env vars are required\n',
  );
  process.exit(1);
}

async function callBridge(name: string, args: unknown): Promise<unknown> {
  const response = await fetch(`${BRIDGE_URL}/tool/${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify(args ?? {}),
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (typeof parsed.error === 'string') message = parsed.error;
    } catch {
      // not JSON
    }
    throw new Error(message || `tool bridge returned ${response.status}`);
  }
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const server = new Server(
  { name: 'kanbots', version: '0.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, () =>
  Promise.resolve({ tools: KANBOTS_TOOLS as unknown as never[] }),
);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await callBridge(name, args);
    return {
      content: [
        {
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // If the bridge rejected the call with what looks like an auth /
    // cloud-session error and there is no signed-in session, append the
    // sign-in hint so model clients get an actionable next step.
    const looksLikeAuthError = /\b(401|403|unauthorized|forbidden|sign[\s-]?in|cloud)\b/i.test(
      message,
    );
    const text =
      !cloudSession.signedIn && looksLikeAuthError
        ? `Error: ${message}\n\n${CLOUD_SIGNIN_HINT}`
        : `Error: ${message}`;
    return {
      isError: true,
      content: [{ type: 'text' as const, text }],
    };
  }
});

const transport = new StdioServerTransport();
server
  .connect(transport)
  .catch((err: unknown) => {
    process.stderr.write(
      `[kanbots-mcp] failed to start: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
