// Solmar Bay — a tiny static server for local play.
//
// Serves the game/ directory on http://localhost:8080 (or the port
// given with --port), so the entry can be played locally without a
// build step: `node serve.ts --port 8080`. Node 22, standard library
// only. It sends the MIME types a browser game needs, refuses any
// path that escapes game/, and does nothing else — this is a
// development convenience, not a web server for the internet.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// The directory this file lives in, and the game/ directory next to it.
const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const gameRoot = resolve(join(here, 'game'));

// The port: --port N, or 8080. Anything outside 1..65535 falls back.
const argv = process.argv.slice(2);
const portFlag = argv.indexOf('--port');
const wanted = portFlag === -1 ? 8080 : Number(argv[portFlag + 1]);
const port = Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;

// The MIME types a browser game needs.
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

function mimeFor(file) {
  return MIME[extname(file).toLowerCase()] || 'application/octet-stream';
}

const server = createServer((req, res) => {
  // The path, decoded. A directory request serves its index.html.
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('bad request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Resolve inside game/ and refuse anything that escapes it.
  const file = resolve(join(gameRoot, normalize(pathname)));
  if (file !== gameRoot && !file.startsWith(gameRoot + sep)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }

  // It must be a real file.
  let size;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    res.writeHead(404);
    res.end('not found');
    return;
  }

  res.writeHead(200, {
    'content-type': mimeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Solmar Bay is on http://localhost:${port}`);
});
