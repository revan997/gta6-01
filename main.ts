// Solmar Bay — the make.fun gta6-01 entrypoint (Node 22, standard
// library only).
//
// The game is this directory's game/ folder: plain static files a
// desktop browser loads offline (game/index.html and its ES modules,
// the vendored three.js under game/vendor/, no network request). This
// program hands it in: it copies game/ and screenshots/ from beside
// this file to /output and writes /output/dossier.json, the summary
// the judge reads, with the vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open
// http://localhost:8080. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The directory this file lives in (the repo root).
const here = fileURLToPath(new URL('.', import.meta.url));
// The output directory: /output in the grader, or MAKEFUN_OUTPUT_DIR
// when running locally.
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The game (game/ -> /output/game) and the screenshots
// (screenshots/ -> /output/screenshots, when present).
mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Guard (added after the full-suite runs): the first build test ran
// with the kit starter screenshots (1-start.jpg, 2-play.jpg,
// 3-end.jpg) still in screenshots/ and the dossier happily included
// them — a build that ships starter images is a wrong entry. So
// before writing the dossier, require exactly the four real shots
// the harness produces, each non-empty and within the 256 KiB cap,
// and fail fast with a clear error otherwise. The harness writes
// these four into screenshots/ on every full-suite run.
import { readdirSync, statSync } from 'node:fs';
const EXPECTED_SHOTS = [
  '1-cover-chase.jpg',
  '2-combat.jpg',
  '3-pursuit.jpg',
  '4-sunset.jpg',
];
const shotDir = join(here, 'screenshots');
const shotFiles = existsSync(shotDir) ? readdirSync(shotDir).sort() : [];
for (const name of EXPECTED_SHOTS) {
  if (!shotFiles.includes(name)) {
    throw new Error(`main.ts: missing screenshot ${name} in screenshots/ (run the full suite first; it writes the four shots)`);
  }
  const size = statSync(join(shotDir, name)).size;
  if (size === 0 || size > 262144) {
    throw new Error(`main.ts: screenshot ${name} is ${size} bytes (must be 1..262144)`);
  }
}
const extra = shotFiles.filter((f) => !EXPECTED_SHOTS.includes(f));
if (extra.length > 0) {
  throw new Error(`main.ts: unexpected files in screenshots/: ${extra.join(', ')} (only the four real shots belong there)`);
}

// The scorer's own caps (reference/gate.json): only text_max_bytes
// shapes the bytes; the others refuse an entry the scorer would
// refuse (more than 4 screenshots or one over 256 KiB; more than 993
// files in game/ or 48 MiB of game files, in all, or a path under
// game/ over 1000 bytes: game/ counts beside /output's own 1000-entry
// cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
