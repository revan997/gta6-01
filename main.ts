// Entry point for the make.fun gta6-01 submission (Node 22, standard
// library only). Copies game/ and screenshots/ from beside this file into
// the output directory, then writes dossier.json there with the vendored
// dossier builder. Running it twice over the same inputs produces
// identical bytes: the copy is a plain recursive copy and buildDossier is
// deterministic over the copied tree.
//
// Validation: before anything is copied (or any previous output cleared),
// the inputs are checked — game/ and game/index.html must exist, the
// favicon must exist (browsers request it on every load; a missing one
// shows up as a console error), game/src/ must hold at least one .js
// file, and screenshots/ must exist and hold at least one image file.
// Any missing input stops the run immediately with an error naming what
// is missing, instead of failing halfway through with a cryptic copy
// error.
//
//   MAKEFUN_OUTPUT_DIR=/path/to/out node main.ts
//   node main.ts   (defaults to /output)
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, sep } from 'node:path';
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
// Round-4b: the favicon must be a real ICO (magic bytes 00 00 01 00);
// a renamed PNG would load in some browsers and fail in others, and the
// intake check counts a broken favicon as a failed request.
{
  const ico = readFileSync(gameFavicon);
  if (ico.length < 4 || ico[0] !== 0 || ico[1] !== 0 || ico[2] !== 1 || ico[3] !== 0) {
    throw new Error(`missing input: game/favicon.ico at ${gameFavicon} is not a valid ICO file (bad magic bytes)`);
  }
}
const gameSrc = join(gameDir, 'src');
const gameJsFiles = existsSync(gameSrc)
  ? readdirSync(gameSrc).filter((name) => name.endsWith('.js'))
  : [];
if (gameJsFiles.length === 0) {
  throw new Error(`missing input: no .js file found in ${gameSrc}`);
}
// Round 3: the game ships 15 source modules; fewer than 10 means the
// copy is incomplete (a partial tree would still pass the single-file
// check above and fail later, at the intake check, instead of here).
if (gameJsFiles.length < 10) {
  throw new Error(`missing input: only ${gameJsFiles.length} .js files in ${gameSrc} (expected at least 10)`);
}
const screenshotsDir = join(repoRoot, 'screenshots');
if (!existsSync(screenshotsDir)) {
  throw new Error(`missing input: screenshots folder not found at ${screenshotsDir}`);
}
const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const hasImage = readdirSync(screenshotsDir, { withFileTypes: true }).some(
  (entry) => entry.isFile() && imageExts.has(extname(entry.name).toLowerCase()),
);
if (!hasImage) {
  throw new Error(`missing input: no image file (.jpg/.jpeg/.png/.webp/.gif) found in ${screenshotsDir}`);
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
// Round 3: print what was copied, so a bad copy is visible at a glance
// (file count + total bytes of the game tree that was just assembled).
// Round 4: the summary also counts the source lines across game/src —
// one deterministic number (same inputs, same count) that makes a
// truncated or half-written module visible before the intake check does.
{
  let files = 0;
  let bytes = 0;
  let srcLines = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile()) {
        files += 1;
        bytes += statSync(p).size;
        // Own source only — the vendored three.js build would swamp the
        // count, so only game/src modules contribute to the line total.
        if (p.includes(`${sep}src${sep}`) && p.endsWith('.js')) srcLines += readFileSync(p, 'utf8').split('\n').length;
      }
    }
  };
  walk(join(outDir, 'game'));
  console.log(`game tree: ${files} files, ${bytes} bytes (${gameJsFiles.length} .js modules, ${srcLines} source lines)`);
}
