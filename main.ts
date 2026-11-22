// Solmar Bay — entrypoint. Validates the game + screenshots, copies them
// into MAKEFUN_OUTPUT_DIR, and writes the make.fun dossier (dossier.json).
// Run: node main.ts   (or MAKEFUN_OUTPUT_DIR=out node main.ts)
// The grader runs this as user 65534 with a read-only repo and an empty
// writable /output: this program NEVER deletes the output directory
// itself — it only creates it and copies into it.
// Fresh build for the round-16 rebuild (attempt #8). Written from the
// interface contract + rebuild spec; no old source read or copied.
import { buildDossier } from './vendor/makefun-game.ts';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const GAME_DIR = join(ROOT, 'game');
const SHOTS_DIR = join(ROOT, 'screenshots');
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || '/output';

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

function fail(message) {
  throw new Error('Solmar Bay entry: ' + message);
}

function walkFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      fail('cannot read directory ' + cur);
    }
    for (const e of entries) {
      const p = join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out.sort();
}

function totalBytes(files) {
  let n = 0;
  for (const f of files) n += statSync(f).size;
  return n;
}

function validateInputs() {
  if (!existsSync(GAME_DIR) || !lstatSync(GAME_DIR).isDirectory()) {
    fail('missing input: game/ directory not found');
  }
  const indexHtml = join(GAME_DIR, 'index.html');
  if (!existsSync(indexHtml) || !lstatSync(indexHtml).isFile()) {
    fail('missing input: game/index.html not found');
  }
  const favicon = join(GAME_DIR, 'favicon.ico');
  if (!existsSync(favicon) || !lstatSync(favicon).isFile()) {
    fail('missing input: game/favicon.ico not found');
  }
  const srcDir = join(GAME_DIR, 'src');
  if (!existsSync(srcDir) || !lstatSync(srcDir).isDirectory()) {
    fail('missing input: game/src/ directory not found');
  }
  const srcFiles = walkFiles(srcDir).filter((f) => extname(f).toLowerCase() === '.js');
  if (srcFiles.length < 1) {
    fail('missing input: game/src/ holds no .js source file');
  }
  if (!existsSync(SHOTS_DIR) || !lstatSync(SHOTS_DIR).isDirectory()) {
    fail('missing input: screenshots/ directory not found');
  }
  const shots = readdirSync(SHOTS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((n) => ['.jpg', '.jpeg', '.png'].includes(extname(n).toLowerCase()));
  if (shots.length < 1) {
    fail('missing input: screenshots/ holds no image');
  }
  // The kit ships 3 starter shots (1-start/2-play/3-end.jpg). They are
  // NOT staged shots and must never be submitted: the dossier caps
  // screenshots at 4, so leaving them in would push the staged shots out.
  const starters = shots.filter((n) => ['1-start.jpg', '2-play.jpg', '3-end.jpg'].includes(n));
  if (starters.length > 0) {
    fail('screenshots/ still holds kit starter shot(s): ' + starters.join(', ') + ' — remove them, only the 4 staged shots belong here');
  }
  if (shots.length > CAPS.screenshots.max) {
    fail('screenshots/ holds ' + shots.length + ' images, cap is ' + CAPS.screenshots.max);
  }
  return { srcFiles, shots };
}

function main() {
  const { srcFiles, shots } = validateInputs();

  // The output directory is created, never deleted: the grader user
  // cannot remove it, so any rmSync here would fail the whole run.
  mkdirSync(OUT_DIR, { recursive: true });
  const outGame = join(OUT_DIR, 'game');
  const outShots = join(OUT_DIR, 'screenshots');
  mkdirSync(outGame, { recursive: true });
  mkdirSync(outShots, { recursive: true });
  cpSync(GAME_DIR, outGame, { recursive: true });
  cpSync(SHOTS_DIR, outShots, { recursive: true });

  const dossier = buildDossier(OUT_DIR, CAPS);
  const dossierPath = join(OUT_DIR, 'dossier.json');
  writeFileSync(dossierPath, dossier);

  // Verify the copy: same file counts and byte totals as the source.
  const copiedGame = walkFiles(outGame);
  const copiedShots = walkFiles(outShots);
  const sourceGame = walkFiles(GAME_DIR);
  const sourceShots = walkFiles(SHOTS_DIR);
  if (copiedGame.length !== sourceGame.length) {
    fail('copy verification failed: game/ copied ' + copiedGame.length + ' files, source has ' + sourceGame.length);
  }
  if (totalBytes(copiedGame) !== totalBytes(sourceGame)) {
    fail('copy verification failed: game/ bytes differ after copy');
  }
  if (copiedShots.length !== sourceShots.length) {
    fail('copy verification failed: screenshots/ copied ' + copiedShots.length + ' files, source has ' + sourceShots.length);
  }
  if (totalBytes(copiedShots) !== totalBytes(sourceShots)) {
    fail('copy verification failed: screenshots/ bytes differ after copy');
  }
  const dossierStat = statSync(dossierPath);
  if (dossierStat.size !== dossier.length) {
    fail('copy verification failed: dossier.json size mismatch');
  }
  // Dossier self-check: the dossier must embed exactly the screenshots
  // that were copied — a mismatch means the entry ships different images
  // than the ones staged above.
  let parsedDossier;
  try {
    parsedDossier = JSON.parse(readFileSync(dossierPath, 'utf8'));
  } catch {
    fail('copy verification failed: dossier.json does not parse');
  }
  if (!parsedDossier || !Array.isArray(parsedDossier.images) || parsedDossier.images.length !== copiedShots.length) {
    fail('copy verification failed: dossier embeds ' + (parsedDossier && Array.isArray(parsedDossier.images) ? parsedDossier.images.length : '?') + ' images, copied ' + copiedShots.length);
  }

  console.log('Solmar Bay entry written to ' + OUT_DIR);
  console.log('  game: ' + copiedGame.length + ' files (' + totalBytes(copiedGame) + ' bytes, ' + srcFiles.length + ' src modules)');
  console.log('  screenshots: ' + shots.join(', '));
  console.log('  dossier.json: ' + dossierStat.size + ' bytes');
}

main();
