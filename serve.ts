// Solmar Bay — tiny static dev server for game/ (W4, attempt #7, fresh
// build). Node 22, standard library only, no build step:
//
//   node serve.ts                 serves game/ on http://127.0.0.1:8080
//   node serve.ts --port 9000     serves game/ on port 9000
//   node serve.ts --port 9000 --host 127.0.0.1
//   node serve.ts --root ../other-game   serves a different directory
//   node serve.ts --help          prints the flags and exits
//
// The geometry harness spawns `node serve.ts --port <n>`, so --port is
// parsed EXPLICITLY: argv[2] is the literal string "--port", and
// Number("--port") is NaN, so a blind argv[2] parse crashes the server
// instantly. A positional [port] argument and $PORT still work as
// fallbacks. Every response carries X-Content-Type-Options: nosniff so
// the browser never sniffs a .js module as something else. HEAD answers
// headers only. Paths outside the served root are refused. This is a
// development convenience, not a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('usage: node serve.ts [--port N] [--host ADDR] [--root DIR] [PORT]');
  console.log('  --port N    listen port (default 8080)');
  console.log('  --host ADDR listen address (default 127.0.0.1)');
  console.log('  --root DIR  directory to serve (default ./game)');
  console.log('  PORT        positional port fallback (default 8080)');
  process.exit(0);
}

// ---- flag parsing (explicit; never Number(argv[2]) blindly) ----------------
function flagValue(name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? null : v;
}

function parsePort(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n >= 65536) return fallback;
  return n;
}

const rootFlag = flagValue('--root');
const root = rootFlag
  ? resolve(rootFlag)
  : resolve(fileURLToPath(new URL('./game', import.meta.url)));
const host = flagValue('--host') || '127.0.0.1';
// --port wins; a bare positional number is the fallback; $PORT after that.
const positionalPort = args.find((a) => /^\d+$/.test(a)) || null;
const envPort = process.env.PORT || null;
const port = parsePort(
  flagValue('--port'),
  parsePort(positionalPort, parsePort(envPort, 8080)),
);

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

  // Health endpoint: the harness (or a human) can tell the server is up
  // without fetching the game.
  if (pathname === '/__health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, game: 'solmar-bay', root }));
    return;
  }
  // Version endpoint: build identity, no file access, no state.
  if (pathname === '/__version') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        game: 'solmar-bay',
        competition: 'gta6-01',
        round: 9,
        features: ['staged-shots', 'hud-density', 'save-v8', 'lagoon-arm', 'west-bend'],
        root,
      }),
    );
    return;
  }

  // A static file server only answers GET and HEAD.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, {
      allow: 'GET, HEAD',
      'content-type': 'text/plain; charset=utf-8',
    });
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
// crashing — the harness and a stray server can coexist.
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
