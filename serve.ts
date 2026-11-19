// A tiny static server for game/ (Node 22, standard library only), so an entry can be played
// locally without a build step: `node serve.ts` serves game/ on http://localhost:8080.
// Round-13B: no server change — the 13B harness reuses this server unchanged.
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
  // Round 9: round 9 — eye-level sky, luminous Spire, integrated roofs.
  // Round 10: round 10 — Spire distance falloff, stronger sky gradient,
  // facade variation (lit windows, tints, cornices, parapets).
  // Round 12: round 12 — hero humanoid, facade cladding, Bridge suspension span (art round).
  // Round 13: round 13 — HUD density (mission / police response /
  // weapon wheel / dialogue / radio / vehicle / respect / district),
  // scene density (palms instanced, heli, police halos, peds 24),
  // golden-hour art (blue-grey asphalt, haze, roof tones) + the four
  // staged gameplay screenshots (?shot=cover-chase|combat|pursuit|sunset).
  if (pathname === '/__health') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, round: 13, root }));
    return;
  }
  // Round-6: a version endpoint — the build identity (game, round,
  // landmark count) for the test harness and for a human checking which
  // polish pass is being served. No file access, no state.
  // Round 7: round 7, three landmarks, luminous Spire, burnt-sienna sky.
  // Round 8: round 8, stepped towers, varied rooflines, sculpted car bodies.
  // Round 9: round 9, eye-level sky gradient, luminous Spire glass,
  // integrated car roofs, minimap landmark stars, save v8.
  // Round 10: round 10, Spire distance falloff, stronger sky gradient,
  // facade variation, save still v8.
  // Round 11: round 11, occlusion-safe focus camera, shadow-side fill
  // Round-11 final (re-touch): version 11 ships the persistent guaranteed fleet, the setCamYaw harness probe, and the lookFrac framing fix — all verified by two all-green consolidated runs before this serve.
  // light, guaranteed bus/coupe/pickup fleet, save still v8.
  // Round 12: round 12, hero humanoid, facade cladding, Bridge suspension span.
  // Round 13: round 13, HUD density, scene density (instanced palms,
  // heli, police halos), golden-hour art, four staged gameplay shots.
  if (pathname === '/__version') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      game: 'solmar-bay', competition: 'gta6-01', round: 13,
      features: ['sculpted-cars', 'solmar-spire', 'marina-bridge', 'warm-sunset', 'luminous-spire', 'solmar-pyramid', 'burnt-sienna-sky', 'sculpted-car-bodies', 'stepped-towers', 'varied-rooflines', 'integrated-roofs', 'eye-level-sky', 'luminous-spire-glass', 'minimap-landmarks', 'spire-falloff', 'stronger-sky-gradient', 'facade-variation', 'round11-fill-light', 'round11-guaranteed-fleet', 'round11-occlusion-camera', 'round12-hero-humanoid', 'round12-facade-cladding', 'round12-bridge-span', 'round13-hud-density', 'round13-scene-density', 'round13-staged-shots', 'round13-budget-savings'],
      root,
    }));
    return;
  }
  // Round-9: this is a static file server — it only answers GET and
  // HEAD. A POST/PUT/DELETE used to fall through to the file branch and
  // serve the file back with a 200, which is misleading (and a test
  // harness probing for write methods would read it as "accepted").
  // Anything else gets a 405 with an Allow header, before any file
  // access happens.
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
// Round-13 final: re-touch — version 13 (HUD + scene density, staged
// gameplay shots, budget savings), server intact.
