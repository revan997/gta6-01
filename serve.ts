// Solmar Bay — local development server: serves game/ as the document root.
// Usage: node serve.ts --port <n>   (also accepts a positional [port] and $PORT)
// Fresh build for the round-16 rebuild (attempt #8). Written from the
// interface contract + rebuild spec; no old source read or copied.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = resolve(ROOT, 'game');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function parsePort(argv) {
  // Explicit --port <n> first (never parse argv[2] blindly: with
  // "--port 8928" argv[2] is the flag itself and Number("--port") is NaN).
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' && i + 1 < argv.length) {
      const n = Number(argv[i + 1]);
      if (Number.isSafeInteger(n) && n > 0 && n < 65536) return n;
    }
    const m = /^--port=(\d+)$/.exec(argv[i] || '');
    if (m) {
      const n = Number(m[1]);
      if (Number.isSafeInteger(n) && n > 0 && n < 65536) return n;
    }
  }
  // Positional [port] fallback: the first bare numeric argument.
  for (const a of argv) {
    if (/^\d+$/.test(a)) {
      const n = Number(a);
      if (n > 0 && n < 65536) return n;
    }
  }
  // $PORT fallback, then the default.
  const env = Number(process.env.PORT || '');
  if (Number.isSafeInteger(env) && env > 0 && env < 65536) return env;
  return 8080;
}

const PORT = parsePort(process.argv.slice(2));

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/index.html';
    const target = normalize(join(GAME_DIR, rel));
    if (!target.startsWith(GAME_DIR)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found: ' + rel);
      return;
    }
    const body = readFileSync(target);
    const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'content-length': body.length });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error: ' + (err && err.message ? err.message : String(err)));
  }
});

server.listen(PORT, () => {
  console.log('Solmar Bay serving game/ at http://localhost:' + PORT);
});
