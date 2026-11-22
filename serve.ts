// serve.ts — a tiny static server for game/ (Node 22, standard library
// only), so Solmar Bay can be played locally without a build step:
//   node serve.ts               serves game/ on http://localhost:8080
//   node serve.ts --port 8899   serves game/ on http://localhost:8899
// It sends the MIME types a browser game needs, refuses any path outside
// game/, and otherwise does nothing clever: a development convenience, not
// a web server for the internet.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);

// The port, in priority order: --port <n>, then a positional [port], then
// $PORT, then 8080. argv[2] is NEVER parsed blindly: when the caller writes
// "--port 8899", argv[2] is the string "--port" itself, and Number("--port")
// is NaN, which used to crash the server before it served a single file.
function pickPort(argv) {
  const flagIndex = argv.indexOf('--port');
  if (flagIndex !== -1 && flagIndex + 1 < argv.length) {
    const fromFlag = Number(argv[flagIndex + 1]);
    if (Number.isInteger(fromFlag) && fromFlag > 0 && fromFlag < 65536) return fromFlag;
  }
  for (const token of argv) {
    if (token === '--port') continue;
    const fromPositional = Number(token);
    if (Number.isInteger(fromPositional) && fromPositional > 0 && fromPositional < 65536) {
      return fromPositional;
    }
  }
  const fromEnv = Number(process.env.PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0 && fromEnv < 65536) return fromEnv;
  return 8080;
}

const port = pickPort(args);

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

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
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
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Solmar Bay game/ is on http://localhost:${port}`);
});
