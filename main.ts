// main.ts — the Solmar Bay entrypoint (Node 22, standard library only).
// It hands the game in: it copies game/ and screenshots/ from beside this
// file to the output directory and writes dossier.json with the vendored
// make.fun library, exactly as the kit's gate expects.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// In the grader the output directory is /output (read-only /bot, writable
// /output, no network, 10 seconds). The program NEVER deletes the output
// directory itself: the grader user cannot remove /output, and deleting it
// fails the run. It only creates directories inside it and copies files in.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

function fail(message) {
  throw new Error('main.ts: ' + message);
}

// ---- validate the inputs, naming the missing one -----------------------
// A missing input must fail here with its name, not later inside the
// dossier builder with a generic error.
if (!existsSync(gameDir) || !statSync(gameDir).isDirectory()) {
  fail('missing input: game/ directory not found beside main.ts');
}
const indexPath = join(gameDir, 'index.html');
if (!existsSync(indexPath) || !statSync(indexPath).isFile()) {
  fail('missing input: game/index.html not found');
}
const faviconPath = join(gameDir, 'favicon.ico');
if (!existsSync(faviconPath) || !statSync(faviconPath).isFile()) {
  fail('missing input: game/favicon.ico not found');
}
const srcDir = join(gameDir, 'src');
let srcFiles = [];
try {
  srcFiles = readdirSync(srcDir).filter((name) => name.endsWith('.js'));
} catch {
  srcFiles = [];
}
if (srcFiles.length < 1) {
  fail('missing input: game/src/ holds no .js source file');
}
if (!existsSync(shotsDir) || !statSync(shotsDir).isDirectory()) {
  fail('missing input: screenshots/ directory not found beside main.ts');
}
const shotFiles = readdirSync(shotsDir).filter((name) => /\.(png|jpe?g)$/i.test(name));
if (shotFiles.length < 1) {
  fail('missing input: screenshots/ holds no PNG or JPEG image');
}

// ---- copy game/ and screenshots/ into the output directory -------------
// cpSync only adds files: a file removed from the source since an earlier
// run into the same output dir would linger and break the verification
// below. pruneStale removes such files one by one (unlink only — the
// output directory itself is never removed; see the header note).
function pruneStale(outDir, srcDir) {
  const stack = [outDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const outPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(outPath);
      } else if (entry.isFile()) {
        if (!existsSync(join(srcDir, relative(outDir, outPath)))) {
          unlinkSync(outPath);
        }
      }
    }
  }
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
pruneStale(join(out, 'game'), gameDir);
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
pruneStale(join(out, 'screenshots'), shotsDir);

// ---- verify the copy: same file counts and same bytes -------------------
function countFiles(dir) {
  let count = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile()) {
        count += 1;
        bytes += statSync(path).size;
      }
    }
  }
  return { count, bytes };
}

const gameCopy = countFiles(join(out, 'game'));
const gameSource = countFiles(gameDir);
if (gameCopy.count !== gameSource.count || gameCopy.bytes !== gameSource.bytes) {
  fail(
    `game/ copy mismatch: copied ${gameCopy.count} files (${gameCopy.bytes} bytes), ` +
    `source holds ${gameSource.count} files (${gameSource.bytes} bytes)`,
  );
}
const shotsCopy = countFiles(join(out, 'screenshots'));
const shotsSource = countFiles(shotsDir);
if (shotsCopy.count !== shotsSource.count || shotsCopy.bytes !== shotsSource.bytes) {
  fail(
    `screenshots/ copy mismatch: copied ${shotsCopy.count} files (${shotsCopy.bytes} bytes), ` +
    `source holds ${shotsSource.count} files (${shotsSource.bytes} bytes)`,
  );
}

// ---- write the dossier the judge reads ----------------------------------
// The scorer's own caps (reference/gate.json): only text_max_bytes shapes
// the bytes; the others refuse an entry the scorer would refuse (more than
// 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB
// of game files in all, or a path under game/ over 1000 bytes).
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// ---- verify the dossier landed ------------------------------------------
const dossierStat = statSync(join(out, 'dossier.json'));
if (dossierStat.size !== dossier.length) {
  fail(`dossier.json write mismatch: wrote ${dossier.length} bytes, file holds ${dossierStat.size}`);
}
