// Entry point for the make.fun gta6-01 submission "Solmar Bay" (Node 22,
// standard library only). Copies game/ and screenshots/ from beside this
// file into the output directory, then writes dossier.json there with the
// vendored dossier builder. Running it twice over the same inputs
// produces identical bytes: the copy is a plain recursive copy and
// buildDossier is deterministic over the copied tree.
//
//   MAKEFUN_OUTPUT_DIR=/path/to/out node main.ts
//   node main.ts   (defaults to /output)
//
// Validation runs BEFORE anything is copied (or any previous output
// cleared): game/ and game/index.html must exist, the favicon must exist
// (browsers request it on every load; a missing one shows up as a console
// error), game/src/ must hold at least one .js file, and screenshots/
// must exist and hold at least one image file. Any missing input stops
// the run immediately with an error naming what is missing, instead of
// failing halfway through with a cryptic copy error.
//
// The dossier is built from the COPIED tree (not the repo), so the bytes
// the scorer reads are exactly the bytes this program wrote.
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// ---- validation (before any copying or clearing) ---------------------------
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
const gameSrc = join(gameDir, 'src');
let srcFiles = [];
try {
  srcFiles = readdirSync(gameSrc).filter((f) => f.endsWith('.js'));
} catch {
  srcFiles = [];
}
if (srcFiles.length === 0) {
  throw new Error(`missing input: no .js files under ${gameSrc}`);
}
const shotsDir = join(repoRoot, 'screenshots');
if (!existsSync(shotsDir)) {
  throw new Error(`missing input: screenshots folder not found at ${shotsDir}`);
}
let shotFiles = [];
try {
  shotFiles = readdirSync(shotsDir).filter((f) =>
    /\.(png|jpe?g)$/i.test(f),
  );
} catch {
  shotFiles = [];
}
if (shotFiles.length === 0) {
  throw new Error(`missing input: no image files under ${shotsDir}`);
}

// ---- copy ------------------------------------------------------------------
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
cpSync(gameDir, join(outDir, 'game'), { recursive: true });
cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });

// ---- dossier ---------------------------------------------------------------
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

// ---- verify + summary --------------------------------------------------------
// The copy must land whole: count every file under the copied game/ and
// screenshots/ trees and compare against the repo. A partial copy (a
// crashed cpSync, a permission error mid-tree) must fail loudly here,
// not surface later as a dossier built from a half entry.
function countTree(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countTree(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}
const repoGame = countTree(gameDir);
const repoShots = countTree(shotsDir);
const outGame = countTree(join(outDir, 'game'));
const outShots = countTree(join(outDir, 'screenshots'));
if (outGame.files !== repoGame.files || outGame.bytes !== repoGame.bytes) {
  throw new Error(
    `copy incomplete: game/ copied ${outGame.files} files / ${outGame.bytes} bytes, repo has ${repoGame.files} / ${repoGame.bytes}`,
  );
}
if (outShots.files !== repoShots.files || outShots.bytes !== repoShots.bytes) {
  throw new Error(
    `copy incomplete: screenshots/ copied ${outShots.files} files / ${outShots.bytes} bytes, repo has ${repoShots.files} / ${repoShots.bytes}`,
  );
}

console.log(`Solmar Bay entry written to ${outDir}`);
console.log(`  game: ${outGame.files} files (${outGame.bytes} bytes, ${srcFiles.length} src modules)`);
console.log(`  screenshots: ${shotFiles.join(', ')}`);
console.log(`  dossier.json: ${dossier.length} bytes`);
