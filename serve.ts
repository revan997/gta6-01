// A tiny static server for game/ (Node 22, standard library only), so an entry can be played
// locally without a build step: `node serve.ts` serves game/ on http://localhost:8080.
// `node serve.ts --port 9000 --host 127.0.0.1` changes the port/host.
// `node serve.ts --root ../other-game` serves a different directory instead
// of game/ (round 3: handy when comparing two builds side by side).
// `node serve.ts --help` prints the flags and exits. Every response also
// carries X-Content-Type-Options: nosniff (round 4), so the browser never
// sniffs a .js module as something else.
// HEAD requests are answered with headers only (no body). It sends the MIME
// types a browser game needs, refuses any path outside the served root, and
// otherwise does nothing clever: this is a development convenience, not a
// web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('usage: node serve.ts [--port N] [--host ADDR] [--root DIR]');
  console.log('  --port N    listen port (default 8080)');
  console.log('  --host ADDR listen address (default 127.0.0.1)');
  console.log('  --root DIR  directory to serve (default ./game)');
  process.exit(0);
}

const rootArgIndex = process.argv.indexOf('--root');
const root = rootArgIndex === -1
  ? resolve(fileURLToPath(new URL('./game', import.meta.url)))
  : resolve(process.argv[rootArgIndex + 1] || './game');
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const requested = portIndex === -1 ? 8080 : Number(args[portIndex + 1]);
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;
const hostIndex = args.indexOf('--host');
const host = hostIndex === -1 ? '127.0.0.1' : (args[hostIndex + 1] || '127.0.0.1');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

// Round-4b: if the port is taken, step to the next one (up to 10 tries)
// instead of crashing — the test harness and a stray server can coexist.
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  // Round-5: a tiny health endpoint so the test harness (or a human) can
  // tell the dev server is up without fetching the game.
  if (pathname === '/__health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, round: 5, root }));
    return;
  }
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});
let listenPort = port;
let listenTries = 0;
function listen() {
  server.listen(listenPort, host, () => {
    console.log(`game/ is on http://${host}:${listenPort}`);
  });
}
server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE' && listenTries < 10) {
    listenTries += 1;
    listenPort += 1;
    listen();
  } else {
    throw err;
  }
});
listen();
