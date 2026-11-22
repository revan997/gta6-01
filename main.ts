// Entry point for the make.fun gta6-01 submission (Node 22, standard
// library only). Copies game/ and screenshots/ from beside this file into
// the output directory, then writes dossier.json there with the vendored
// dossier builder. Running it twice over the same inputs produces
// identical bytes: the copy is a plain recursive copy and buildDossier is
// deterministic over the copied tree.
//
// Round-9 rebuild: this packager was written fresh for the rebuild. It
// validates the ESSENTIALS before anything is copied (or any previous
// output cleared) — game/ and game/index.html must exist, the favicon
// must exist and be a real ICO, game/src/ must hold at least one .js
// file, and screenshots/ must exist and hold at least one image file.
// Any missing input stops the run immediately with an error naming what
// is missing, instead of failing halfway through with a cryptic copy
// error. It also sanity-checks the round-9 CONFIG gates the submission
// depends on (cover camera, lagoon arm minX 50, basin, perf budget, save
// version 8) — the old round-26 packager's round-7/round-8 palette
// checks are NOT carried over: the rebuild's CONFIG does not carry those
// keys (no colors.skyTop / round5.sky.mids / round7.landmarks.pyramid),
// and a packager that demanded them would fail a correct build.
//
//   MAKEFUN_OUTPUT_DIR=/path/to/out node main.ts
//   node main.ts   (defaults to /output)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Validate inputs before any copying (or clearing previous output).
const gameDir = join(repoRoot, 'game');
if (!existsSync(gameDir)) {
  throw new Error(`missing input: game folder not found at ${gameDir}`);
}
const gameIndex = join(gameDir, 'index.html');
if (!existsSync(gameIndex)) {
  throw new Error(`missing input: game/index.html not found at ${gameIndex}`);
}
const gameFavicon = join(gameDir, 'favicon.ico');
if (!existsSync(gameFavicon)) {
  throw new Error(`missing input: game/favicon.ico not found at ${gameFavicon}`);
}
// The favicon must be a real ICO (magic bytes 00 00 01 00); a renamed
// PNG would load in some browsers and fail in others, and the intake
// check counts a broken favicon as a failed request.
{
  const ico = readFileSync(gameFavicon);
  if (ico.length < 4 || ico[0] !== 0 || ico[1] !== 0 || ico[2] !== 1 || ico[3] !== 0) {
    throw new Error(`missing input: game/favicon.ico at ${gameFavicon} is not a valid ICO file (bad magic bytes)`);
  }
}
const srcDir = join(gameDir, 'src');
if (!existsSync(srcDir)) {
  throw new Error(`missing input: game/src folder not found at ${srcDir}`);
}
{
  const jsFiles = readdirSync(srcDir).filter((f) => f.endsWith('.js'));
  if (jsFiles.length === 0) {
    throw new Error(`missing input: game/src holds no .js files at ${srcDir}`);
  }
  console.log(`game/src: ${jsFiles.length} modules (${jsFiles.sort().join(', ')})`);
}
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(shotsDir)) {
  throw new Error(`missing input: screenshots folder not found at ${shotsDir}`);
}
{
  const images = readdirSync(shotsDir).filter((f) => ['.jpg', '.jpeg', '.png', '.webp'].includes(extname(f).toLowerCase()));
  if (images.length === 0) {
    throw new Error(`missing input: screenshots holds no image files at ${shotsDir}`);
  }
  console.log(`screenshots: ${images.length} images (${images.sort().join(', ')})`);
}
// Round-9 CONFIG sanity check: the submission's gates live in CONFIG.
// The cover camera/lookAt, the lagoon arm minX 50, the basin, the perf
// budget, and save version 8 must all be present and at their spec
// values — a copy that lost any of them ships the wrong game.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  if (!cfg || typeof cfg !== 'object') {
    throw new Error('missing input: CONFIG not exported from game/src/config.js');
  }
  const problems = [];
  if (!cfg.cover || !cfg.cover.camera || cfg.cover.camera.x !== 43.5 || cfg.cover.camera.y !== 3.5 || cfg.cover.camera.z !== -56) {
    problems.push('CONFIG.cover.camera is not the round-9 tuned (43.5, 3.5, -56)');
  }
  if (!cfg.cover || !cfg.cover.lookAt || cfg.cover.lookAt.x !== 46 || cfg.cover.lookAt.y !== -10 || cfg.cover.lookAt.z !== -140) {
    problems.push('CONFIG.cover.lookAt is not the round-9 tuned (46, -10, -140)');
  }
  if (!cfg.lagoonArm || cfg.lagoonArm.minX !== 50) {
    problems.push('CONFIG.lagoonArm.minX is not 50 (round 26 final)');
  }
  if (!cfg.basin || cfg.basin.minX !== 60 || cfg.basin.maxZ !== -100) {
    problems.push('CONFIG.basin is not { minX: 60, maxZ: -100 }');
  }
  if (!cfg.perf || cfg.perf.maxDrawCalls !== 4300 || cfg.perf.maxTriangles !== 150000) {
    problems.push('CONFIG.perf budgets are not 4300 draw calls / 150000 triangles');
  }
  if (!cfg.save || cfg.save.version !== 8) {
    problems.push('CONFIG.save.version is not 8');
  }
  if (problems.length > 0) {
    throw new Error(`missing input: CONFIG failed the round-9 sanity check: ${problems.join('; ')}`);
  }
  console.log('CONFIG: cover (43.5, 3.5, -56) -> (46, -10, -140); lagoon arm minX 50; basin 60/-100; perf 4300/150000; save v8');
}

// Fresh output: drop any previous game/, screenshots/ or dossier.json so
// a second run cannot leave stale files behind.
mkdirSync(outDir, { recursive: true });
rmSync(join(outDir, 'game'), { recursive: true, force: true });
rmSync(join(outDir, 'screenshots'), { recursive: true, force: true });
rmSync(join(outDir, 'dossier.json'), { force: true });

cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${join(outDir, 'dossier.json')} (${dossier.length} bytes)`);

// Print what was copied, so a bad copy is visible at a glance (file
// count + total bytes of the game tree that was just assembled).
function treeStats(dir) {
  let files = 0;
  let bytes = 0;
  let lines = 0;
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) {
        files += 1;
        bytes += statSync(p).size;
        if (p.endsWith('.js') || p.endsWith('.ts') || p.endsWith('.html')) {
          lines += readFileSync(p, 'utf8').split('\n').length;
        }
      }
    }
  };
  walk(dir);
  return { files, bytes, lines };
}
const gameStats = treeStats(join(outDir, 'game'));
console.log(`game/: ${gameStats.files} files, ${gameStats.bytes} bytes, ${gameStats.lines} source lines`);
console.log('packager: round-9 rebuild — Solmar Bay ready for intake check');
