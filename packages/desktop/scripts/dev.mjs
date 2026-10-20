// Dev runner for the desktop app: Vite renderer, tsup watch on the main
// process, and Electron pointed at the renderer.
//
// The renderer port is picked at random from the free ports the OS hands
// out, so it never collides with another project's dev server, and the
// Electron env is set here instead of inline (`VAR=value cmd`), which
// cmd.exe on Windows can't parse.
import { createServer } from 'node:net';
import concurrently from 'concurrently';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const port = Number(process.env.KODRA_DEV_PORT) || (await freePort());
const rendererUrl = `http://127.0.0.1:${port}`;
console.log(`[dev] renderer on ${rendererUrl}`);

const { result } = concurrently(
  [
    {
      name: 'web',
      prefixColor: 'blue',
      command: `pnpm --filter @kanbots/web dev --port ${port} --strictPort`,
    },
    { name: 'main', prefixColor: 'yellow', command: 'tsup --watch' },
    {
      name: 'electron',
      prefixColor: 'magenta',
      command: `wait-on ${rendererUrl} ./dist/main.cjs && electronmon ./dist/main.cjs`,
      env: { KANBOTS_RENDERER_URL: rendererUrl },
    },
  ],
  { killOthers: ['failure', 'success'] },
);

result.then(
  () => process.exit(0),
  () => process.exit(1),
);
