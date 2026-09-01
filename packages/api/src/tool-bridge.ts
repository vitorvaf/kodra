import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { Handlers } from './handlers/index.js';

/**
 * Localhost HTTP bridge that the kanbots MCP server forwards tool calls
 * through. The bridge is bound to 127.0.0.1 with a random ephemeral port
 * so it cannot be reached from the network. Each tool call must include
 * a valid bearer token; tokens are issued per chat run by `issueToken`
 * and revoked when the run ends.
 */

interface ToolBridgeOptions {
  handlers: Handlers;
  /**
   * Map an MCP-friendly tool name to a handler invocation. The dispatcher
   * receives the arguments shipped over MCP and returns either an awaited
   * handler result or a transformed payload.
   */
  dispatch: ToolDispatcher;
}

export type ToolDispatcher = (
  name: string,
  args: unknown,
  handlers: Handlers,
) => Promise<unknown>;

export interface ToolBridge {
  baseUrl(): string;
  issueToken(): string;
  revokeToken(token: string): void;
  close(): Promise<void>;
}

export async function startToolBridge(opts: ToolBridgeOptions): Promise<ToolBridge> {
  const { handlers, dispatch } = opts;
  const tokens = new Set<string>();

  const handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }
    const auth = req.headers.authorization;
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token || !tokens.has(token)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    const url = req.url ?? '';
    const match = url.match(/^\/tool\/([^/?#]+)/);
    if (!match || !match[1]) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    const toolName = decodeURIComponent(match[1]);
    let body: unknown;
    try {
      body = await readJson(req);
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          error: `bad json body: ${err instanceof Error ? err.message : String(err)}`,
        }),
      );
      return;
    }

    try {
      const result = await dispatch(toolName, body, handlers);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result ?? null));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: message }));
    }
  };

  const server: Server = createServer((req, res) => {
    void handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    // Bind to 127.0.0.1 only — never expose this beyond the loopback.
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('tool bridge: failed to bind');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl: () => baseUrl,
    issueToken: () => {
      const token = randomBytes(24).toString('hex');
      tokens.add(token);
      return token;
    },
    revokeToken: (token: string) => {
      tokens.delete(token);
    },
    close: () =>
      new Promise<void>((resolve) => {
        tokens.clear();
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.length === 0) return {};
  return JSON.parse(text);
}
