// A tiny static server for game/ (Node 22, standard library only), so an
// entry can be played locally without a build step:
//   node serve.ts                serves game/ on http://127.0.0.1:8080
//   node serve.ts --port 9000    serves game/ on http://127.0.0.1:9000
//   node serve.ts --port 9000 --host 127.0.0.1
//   node serve.ts --root ../other-game   serves a different directory
//   node serve.ts --help         prints the flags and exits
//
// Round-9 rebuild: the server parses --port explicitly (a missing or
// non-numeric value falls back to 8080, never NaN) and serves game/ as
// the static root. /health and /__health both answer 200 so the test
// harness can tell the server is up without fetching the game. Every
// response carries X-Content-Type-Options: nosniff, so the browser never
// sniffs a .js module as something else. HEAD requests are answered with
// headers only. Paths outside the served root are refused, and only GET
// and HEAD are answered (anything else gets 405).
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

const args = process.argv.slice(2);

// Parse --port explicitly: the value after the flag, or the default when
// the flag is absent. A missing, empty, or non-numeric value falls back
// to 8080 — it never becomes NaN and never crashes the server.
function parsePort(argv) {
  const i = argv.indexOf('--port');
  if (i === -1) return 8080;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n <= 0 || n >= 65536) return 8080;
  return n;
}

function parseFlag(argv, flag, fallback) {
  const i = argv.indexOf(flag);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v === undefined || v === '' ? fallback : v;
}

const port = parsePort(args);
const host = parseFlag(args, '--host', '127.0.0.1');
const root = resolve(parseFlag(args, '--root', fileURLToPath(new URL('./game', import.meta.url))));

const MIME = {
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

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  if (pathname === '/health' || pathname === '/__health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, game: 'solmar-bay', competition: 'gta6-01', root }));
    return;
  }
  if (pathname === '/__version') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      game: 'solmar-bay', competition: 'gta6-01', round: 9,
      features: ['round9-rebuild', 'round16-composition', 'round27-west-bend', 'round26-lagoon-arm', 'staged-shots', 'hud-density', 'save-v8'],
      root,
    }));
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { 'allow': 'GET, HEAD', 'content-type': 'text/plain; charset=utf-8' });
    response.end('method not allowed');
    return;
  }
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size;
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

// If the port is taken, step to the next one (up to 10 tries) instead of
// crashing — the test harness and a stray server can coexist.
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
