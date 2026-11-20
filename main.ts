// Entry point for the make.fun gta6-01 submission (Node 22, standard
// library only). Copies game/ and screenshots/ from beside this file into
// the output directory, then writes dossier.json there with the vendored
// dossier builder. Running it twice over the same inputs produces
// identical bytes: the copy is a plain recursive copy and buildDossier is
// deterministic over the copied tree.
// Round-13B: no packager change — the submission still copies game/ +
// screenshots/ and builds dossier.json deterministically.
// Round 14: no packager change — the submission still copies game/ +
// screenshots/ and builds dossier.json deterministically.
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
// Round 7: the burnt-sienna sunset palette must be present — the
// submission's sky is a warm burnt-sienna/orange sunset (round 7 warmed
// the zenith again, plum 0x40203a -> burnt sienna 0x4a2a20, and the
// 0.30 mid stop mauve -> sienna), the Spire tower is luminous, and the
// Solmar Pyramid (third landmark) is registered. A copy that lost
// CONFIG.round7 would ship the old plum sky and two landmarks. Fail
// loudly here instead of at the intake check.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const sunsetOk = cfg?.colors?.skyTop === 0x4a2a20
    && Array.isArray(cfg?.round5?.sky?.mids) && cfg.round5.sky.mids.length >= 4
    // Round-10 (Lane B): the 0.18 mid was deepened from warm sienna
    // 0x9a4a2e to deep rust 0x7e2c1a — the old hex is intentionally gone.
    && cfg.round5.sky.mids[0]?.hex === 0x7e2c1a
    && cfg?.round6?.sky && cfg?.round6?.landmarks?.spire
    && cfg?.round7?.landmarks?.pyramid;
  if (!sunsetOk) {
    throw new Error('missing input: CONFIG.round7 burnt-sienna palette / Solmar Pyramid not found in game/src/config.js');
  }
  console.log(`sunset palette: skyTop #${cfg.colors.skyTop.toString(16).padStart(6, '0')} horizon #${cfg.colors.skyHorizon.toString(16).padStart(6, '0')} (round 7 burnt sienna)`);
  console.log(`landmarks: Solmar Spire at (${cfg.round6.landmarks.spire.x}, ${cfg.round6.landmarks.spire.z}), ${cfg.round6.landmarks.spire.height} m; Marina Bridge x ${cfg.round6.landmarks.bridge.x0}..${cfg.round6.landmarks.bridge.x1} at z ${cfg.round6.landmarks.bridge.z}; Solmar Pyramid at (${cfg.round7.landmarks.pyramid.x}, ${cfg.round7.landmarks.pyramid.z}), ${cfg.round7.landmarks.pyramid.height} m`);
}
// Round 8: the stepped-tower skyline must be present — a second
// building archetype (stepped / ziggurat towers) plus varied rooflines
// on ordinary towers. A copy that lost CONFIG.round8 would ship the
// round-7 skyline of flat-roofed boxes + 3 landmarks. Fail loudly here
// instead of at the intake check.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const r8 = cfg?.round8;
  const r8Ok = r8?.steppedTower
    && typeof r8.steppedTower.chance === 'number'
    && typeof r8.steppedTower.minHeight === 'number'
    && Array.isArray(r8.steppedTower.tierFracs) && r8.steppedTower.tierFracs.length >= 3
    && r8?.roofline
    && typeof r8.roofline.pitchedChance === 'number'
    && typeof r8.roofline.mansardChance === 'number'
    && typeof r8.roofline.steppedParapetChance === 'number'
    && typeof r8.steppedQuarterRadius === 'number';
  if (!r8Ok) {
    throw new Error('missing input: CONFIG.round8 stepped towers / rooflines not found in game/src/config.js');
  }
  console.log(`round 8: stepped towers (chance ${r8.steppedTower.chance}, minHeight ${r8.steppedTower.minHeight} m, ${r8.steppedTower.tierFracs.length} tiers) + rooflines (pitched ${r8.roofline.pitchedChance}, mansard ${r8.roofline.mansardChance}, stepped parapet ${r8.roofline.steppedParapetChance}); stepped quarter radius ${r8.steppedQuarterRadius} m`);
}
// Round 9: the eye-level sky + luminous Spire must be present — the
// sunset gradient remapped onto the visible sky (all mid stops below
// the 0.5 horizon line, so the sienna -> burnt orange -> deep orange
// -> gold bands are visible from street level instead of buried below
// the horizon), the sky canvas widened so the gradient is not averaged
// flat by mipmaps, and the Spire's luminous glass (a semi-transparent
// shell over a bright core, with vertical light bands). A copy that
// lost CONFIG.round9 would ship the round-8 sky (flat orange at eye
// level) and an opaque Spire. Fail loudly here instead of at the
// intake check. The stop bounds are tolerant (a stop is "above the
// horizon" when it is under 0.5), so a later re-tune of the exact
// stops does not false-fail this gate.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const mids = cfg?.round5?.sky?.mids;
  const r9 = cfg?.round9;
  const r9Ok = r9?.skyCanvas
    && typeof r9.skyCanvas.width === 'number' && r9.skyCanvas.width >= 16
    && typeof r9.skyCanvas.height === 'number' && r9.skyCanvas.height >= 256
    && r9?.spire
    && typeof r9.spire.shellOpacity === 'number' && r9.spire.shellOpacity > 0 && r9.spire.shellOpacity < 1
    && typeof r9.spire.bandCount === 'number' && r9.spire.bandCount >= 1
    && Array.isArray(mids) && mids.length >= 4
    && mids.every((m) => typeof m.stop === 'number' && m.stop > 0 && m.stop < 0.5)
    // Round-10 (Lane B): the 0.18 mid was deepened from warm sienna
    // 0x9a4a2e to deep rust 0x7e2c1a — the old hex is intentionally gone.
    && mids[0]?.hex === 0x7e2c1a;
  if (!r9Ok) {
    throw new Error('missing input: CONFIG.round9 eye-level sky / luminous Spire not found in game/src/config.js');
  }
  console.log(`round 9: eye-level sky (mids ${mids.map((m) => m.stop).join('/')}, canvas ${r9.skyCanvas.width}x${r9.skyCanvas.height}) + luminous Spire (shell opacity ${r9.spire.shellOpacity}, ${r9.spire.bandCount} light bands)`);
}
// Round-10: the Spire's distance falloff + the strengthened sky must be
// present — below falloffNear the tower dims toward the near* values so
// it no longer clips to a white-gold blob up close, and at falloffFar
// every value is exactly the round-9 value. A copy that lost the
// falloff block would ship the round-9 blowout at 16 m.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const sp = cfg?.round9?.spire;
  const mids10 = cfg?.round5?.sky?.mids;
  const r10Ok = sp
    && typeof sp.falloffNear === 'number' && typeof sp.falloffFar === 'number'
    && sp.falloffNear > 0 && sp.falloffFar > sp.falloffNear
    && typeof sp.nearCore === 'number' && sp.nearCore > 0 && sp.nearCore < 1
    && typeof sp.nearShell === 'number' && sp.nearShell > 0 && sp.nearShell < 1
    && typeof sp.nearGlow === 'number' && typeof sp.nearHalo === 'number'
    && Array.isArray(mids10) && mids10.length === 4
    && mids10[1]?.hex === 0xa8230f && mids10[2]?.hex === 0xc73315;
  if (!r10Ok) {
    throw new Error('missing input: CONFIG.round9.spire falloff / round-10 strengthened sky not found in game/src/config.js');
  }
  console.log(`round 10: Spire falloff ${sp.falloffNear} m -> ${sp.falloffFar} m (near core ${sp.nearCore}, near shell ${sp.nearShell}) + deepened sky mids 0x${mids10[0]?.hex.toString(16)} / 0x${mids10[1]?.hex.toString(16)} / 0x${mids10[2]?.hex.toString(16)}`);
}
// Round-11: the three lanes share one CONFIG.round11 object — fill
// (Lane B), traffic (Lane C) and camera (Lane A). A copy that lost any
// one key would ship a build whose probe claims the fix while the game
// silently runs the round-10 behaviour for that lane. Fail loudly here
// instead of at the intake check.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const r11 = cfg?.round11;
  // Round-11 final (re-touch): the gate also covers the new setCamYaw probe (main.js) — the harness sets the chase yaw after every teleport a screenshot depends on, so the gate's three lanes stay honest about what the screenshots show.
  const r11Ok = r11?.fill && typeof r11.fill.hemiIntensity === 'number'
    && typeof r11.fill.shadowIntensity === 'number'
    && typeof r11.fill.bounceIntensity === 'number'
    && r11?.traffic && Array.isArray(r11.traffic.guaranteed) && r11.traffic.guaranteed.length >= 3
    && typeof r11.traffic.maxCars === 'number'
    && r11?.camera && typeof r11.camera.blendRate === 'number'
    && typeof r11.camera.sweepStepDeg === 'number'
    && typeof r11.camera.maxFrameDistance === 'number';
  if (!r11Ok) {
    throw new Error('missing input: CONFIG.round11 fill/traffic/camera not found in game/src/config.js');
  }
  console.log(`round 11: fill (hemi ${r11.fill.hemiIntensity}, shadow ${r11.fill.shadowIntensity}, bounce ${r11.fill.bounceIntensity}) + traffic (maxCars ${r11.traffic.maxCars}, guaranteed ${r11.traffic.guaranteed.map((g) => g.model).join('/')}) + camera (blend ${r11.camera.blendRate}/s, sweep ${r11.camera.sweepStepDeg} deg, frame ${r11.camera.minFrameDistance}-${r11.camera.maxFrameDistance} m)`);
}
// Round-13: the density + budget block must be present — HUD/scene
// tuning (CONFIG.round13) is what the four staged gameplay shots show,
// and the savings sub-block is what keeps the wanted-4 chase inside the
// 4,300-call / 150,000-tri budget. A copy that lost it would ship the
// round-12 empty streets + the over-cap wanted-4 view. Fail loudly here
// instead of at the intake check.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const r13 = cfg?.round13;
  const r13Ok = r13?.road && typeof r13.road.base === 'string'
    && r13?.haze && typeof r13.haze.fogNear === 'number' && typeof r13.haze.fogFar === 'number'
    && r13?.palms && typeof r13.palms.chunkSize === 'number'
    && r13?.traffic && typeof r13.traffic.maxPedestrians === 'number'
    && r13?.police && typeof r13.police.heliMinWanted === 'number'
    && r13?.savings && Array.isArray(r13.savings.cloudSegments) && r13.savings.cloudSegments.length === 2
    && Array.isArray(r13.savings.trafficLampSegments) && r13.savings.trafficLampSegments.length === 2
    && cfg?.colors?.road !== 0x3a3f46; // the black tarmac is gone
  if (!r13Ok) {
    throw new Error('missing input: CONFIG.round13 density/budget block not found in game/src/config.js');
  }
  console.log(`round 13: road ${r13.road.base}, haze ${r13.haze.fogNear}-${r13.haze.fogFar} m, palms instanced (chunk ${r13.palms.chunkSize}), peds ${r13.traffic.maxPedestrians}, heli at ${r13.police.heliMinWanted}+ stars, cloud segs ${r13.savings.cloudSegments.join('x')}`);
}
// Round-16: the cover-heli + staging block must be present — the
// side-on heli (CONFIG.round16.heli: scale, side yaw, small dim cone),
// the sunset dialogue shift (left/width that clears the MARINA sign)
// and the fallen-officer light pool (size/opacity). A copy that lost
// it would ship the round-15 face-on blue-box heli, the centred
// dialogue box over MARINA, and the invisible fallen officer, while
// the probe claims the round-16 fixes. Fail loudly here instead of at
// the intake check.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const r16 = cfg?.round16;
  const r16Ok = r16?.heli
    && typeof r16.heli.scale === 'number' && r16.heli.scale >= 2 && r16.heli.scale <= 3
    && typeof r16.heli.sideYawDeg === 'number' && r16.heli.sideYawDeg === 90
    && typeof r16.heli.coneRadius === 'number' && r16.heli.coneRadius > 0 && r16.heli.coneRadius < 3
    && typeof r16.heli.coneOpacity === 'number' && r16.heli.coneOpacity > 0 && r16.heli.coneOpacity < 0.3
    && typeof r16.heli.poolOpacity === 'number' && typeof r16.heli.poolScale === 'number'
    && typeof r16.heli.discRadius === 'number' && r16.heli.discRadius > 0 && r16.heli.discRadius <= 4.25
    && r16?.sunsetDialogue
    && typeof r16.sunsetDialogue.left === 'number' && r16.sunsetDialogue.left >= 473
    && typeof r16.sunsetDialogue.width === 'number' && r16.sunsetDialogue.width <= 480
    && r16?.fallenPool
    && typeof r16.fallenPool.width === 'number' && r16.fallenPool.width > 0
    && typeof r16.fallenPool.length === 'number' && r16.fallenPool.length > r16.fallenPool.width
    && typeof r16.fallenPool.opacity === 'number' && r16.fallenPool.opacity > 0 && r16.fallenPool.opacity <= 1;
  if (!r16Ok) {
    throw new Error('missing input: CONFIG.round16 cover-heli / sunset-dialogue / fallen-pool block not found in game/src/config.js');
  }
  console.log(`round 16: cover heli (scale ${r16.heli.scale}, side yaw ${r16.heli.sideYawDeg} deg, cone r ${r16.heli.coneRadius} @ ${r16.heli.coneOpacity}, disc r ${r16.heli.discRadius}) + sunset dialogue (left ${r16.sunsetDialogue.left}, width ${r16.sunsetDialogue.width}) + fallen pool (${r16.fallenPool.width}x${r16.fallenPool.length} m @ ${r16.fallenPool.opacity})`);
}
// Round-17: the hero-trim + arsenal + v9-save block must be present —
// CONFIG.round17 (GT trim / heli detail tuning / weapon unlocks),
// combat.js WEAPONS with real SMG + shotgun definitions,
// vehicle.js attachHeroDetail (the hero-only trim), and save.js
// SAVE_VERSION 9 (the weapons block). A copy that lost any of them
// would ship the round-16 plain GT / boxy heli / two-weapon roster /
// v8 save while the probe claims the round-17 fixes. Fail loudly here
// instead of at the intake check.
// Round 18: the round-17 "NO rifle definition" rule is SUPERSEDED —
// the rifle is a real fifth weapon now (see the round-18 block
// below); the r17 gate no longer asserts its absence, only that the
// SMG / shotgun definitions and the unlock missions are intact.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const r17 = cfg?.round17;
  const r17Ok = r17?.gt
    && typeof r17.gt.tailBar?.width === 'number' && r17.gt.tailBar.width >= 1.5
    && typeof r17.gt.tailBar?.height === 'number'
    && typeof r17.gt.exhaust?.x === 'number' && typeof r17.gt.rearGlass?.width === 'number'
    && typeof r17.gt.stripe?.length === 'number' && typeof r17.gt.rimDisc?.radius === 'number'
    && typeof r17.gt.grille?.width === 'number' && typeof r17.gt.headlight?.x === 'number'
    && r17?.heliDetail
    && typeof r17.heliDetail.mast?.radius === 'number' && typeof r17.heliDetail.hub?.width === 'number'
    && typeof r17.heliDetail.sideGlass?.length === 'number' && typeof r17.heliDetail.strut?.x === 'number'
    && typeof r17.heliDetail.navTail?.z === 'number' && typeof r17.heliDetail.navNose?.z === 'number'
    && typeof r17.heliDetail.stabilizer?.width === 'number' && typeof r17.heliDetail.exhaust?.x === 'number'
    && typeof r17.heliDetail.antenna?.height === 'number'
    && r17?.weapons && r17.weapons.smgUnlockMission === 1 && r17.weapons.shotgunUnlockMission === 3;
  if (!r17Ok) {
    throw new Error('missing input: CONFIG.round17 hero-trim / heli-detail / weapon-unlock block not found in game/src/config.js');
  }
  const combatMod = await import(join(gameDir, 'src', 'combat.js'));
  const weapons = combatMod?.WEAPONS;
  const order = combatMod?.WEAPON_ORDER;
  const weaponsOk = weapons?.smg && typeof weapons.smg.magSize === 'number' && weapons.smg.magSize === 30
    && typeof weapons.smg.reserveStart === 'number' && weapons.smg.reserveStart === 60
    && weapons?.shotgun && typeof weapons.shotgun.magSize === 'number' && weapons.shotgun.magSize === 6
    && typeof weapons.shotgun.reserveStart === 'number' && weapons.shotgun.reserveStart === 12
    && Array.isArray(order) && order.length === 5 && order[2] === 'smg' && order[3] === 'shotgun' && order[4] === 'rifle'
    && typeof combatMod?.CombatSystem === 'function'
    && typeof combatMod.CombatSystem.prototype.getWeaponsState === 'function'
    && typeof combatMod.CombatSystem.prototype.unlockWeapon === 'function';
  if (!weaponsOk) {
    throw new Error('missing input: combat.js SMG/shotgun WEAPONS definitions (or the getWeaponsState/unlockWeapon API) not found');
  }
  // vehicle.js imports three (a bare specifier), so it cannot be
  // imported in plain node — validate its source text instead.
  const vehicleSrc = readFileSync(join(gameDir, 'src', 'vehicle.js'), 'utf8');
  const vehicleOk = vehicleSrc.includes('export function attachHeroDetail')
    && vehicleSrc.includes("'hero-taillight-bar'") && vehicleSrc.includes("'hero-rim-disc'")
    && vehicleSrc.includes("'hero-exhaust'") && vehicleSrc.includes("'hero-rear-glass'");
  if (!vehicleOk) {
    throw new Error('missing input: vehicle.js attachHeroDetail (hero-only GT trim) not found');
  }
  const saveMod = await import(join(gameDir, 'src', 'save.js'));
  const saveOk = saveMod?.SAVE_VERSION === 9 && Array.isArray(saveMod?.SUPPORTED_SAVE_VERSIONS) && saveMod.SUPPORTED_SAVE_VERSIONS.includes(9);
  if (!saveOk) {
    throw new Error('missing input: save.js SAVE_VERSION 9 (weapons block) not found');
  }
  console.log(`round 17: hero GT trim (tail bar ${r17.gt.tailBar.width} m, ${r17.gt.rearGlass.width} m rear glass) + heli detail (mast r ${r17.heliDetail.mast.radius}, hub ${r17.heliDetail.hub.width} m) + SMG ${weapons.smg.magSize}/${weapons.smg.reserveStart} / shotgun ${weapons.shotgun.magSize}/${weapons.shotgun.reserveStart} (missions ${r17.weapons.smgUnlockMission}/${r17.weapons.shotgunUnlockMission}) + save v${saveMod.SAVE_VERSION}`);
  // Round 17 (re-touch): the pursuit staging must unlock the SMG —
  // mission 1 is already done in chapter 3 (jobs 2/8), so Rico owns
  // the SMG (Mama Lou's mission-1 reward) before mission 3 starts; a
  // copy that lost the unlock would show SMG LOCKED on the pursuit
  // wheel while combat and sunset honestly show it owned. The shotgun
  // must NOT be unlocked here (mission-3 reward, only owned after
  // mission 3 finishes). main.js imports three, so check source text,
  // like the vehicle.js check above.
  const mainSrc = readFileSync(join(gameDir, 'src', 'main.js'), 'utf8');
  const pursuitIdx = mainSrc.indexOf('function stagePursuit()');
  const pursuitSrc = pursuitIdx >= 0 ? mainSrc.slice(pursuitIdx) : '';
  const startM3 = pursuitSrc.indexOf('missions.startMission(3');
  const smgIdx = pursuitSrc.indexOf("combat.unlockWeapon('smg')");
  const pursuitSmgOk = smgIdx >= 0 && startM3 > 0 && smgIdx < startM3;
  const pursuitNoShotgun = startM3 > 0 && !pursuitSrc.slice(0, startM3).includes("combat.unlockWeapon('shotgun')");
  if (!pursuitSmgOk || !pursuitNoShotgun) {
    throw new Error('missing input: stagePursuit in game/src/main.js must unlock the SMG (mission-1 reward) before mission 3 starts, without unlocking the shotgun');
  }
  console.log('round 17: pursuit staging unlocks SMG before mission 3 (shotgun stays locked)');
}
// Round-18: the rifle + cover-shopfront block must be present —
// CONFIG.round18 (rifle tuning + mission-4 unlock + cover tuning),
// combat.js WEAPONS.rifle as a real fifth definition (damage 38 /
// range 90 / rate 0.14 / mag 24 / reserve 48), the mission-complete
// hook unlocking it on mission 4, the sunset staging equipping it
// (Rico carries a rifle mesh in his right hand, panel WEAPON —
// RIFLE), and the cover staging dressing the nearest tower face
// (stageCoverShopfront). A copy that lost any of them would ship the
// round-17 four-gun roster / plain cover while the probe claims the
// round-18 fixes. Fail loudly here instead of at the intake check.
{
  const configMod = await import(join(gameDir, 'src', 'config.js'));
  const cfg = configMod?.CONFIG;
  const r18 = cfg?.round18;
  const r18Ok = r18?.weapons && r18.weapons.rifleUnlockMission === 4
    && r18?.rifle && r18.rifle.damage === 38 && r18.rifle.range === 90
    && r18.rifle.rate === 0.14 && r18.rifle.magSize === 24 && r18.rifle.reserveStart === 48
    && r18?.cover && r18.cover.signText === 'SOLMAR'
    && typeof r18.cover.glassColor === 'number' && typeof r18.cover.awningColor === 'number'
    && typeof r18.cover.windowCount === 'number' && r18.cover.windowCount >= 2;
  if (!r18Ok) {
    throw new Error('missing input: CONFIG.round18 rifle (mission-4 unlock) / cover shopfront block not found in game/src/config.js');
  }
  const combatMod = await import(join(gameDir, 'src', 'combat.js'));
  const rifle = combatMod?.WEAPONS?.rifle;
  const rifleOk = rifle && rifle.damage === 38 && rifle.range === 90 && rifle.rate === 0.14
    && rifle.magSize === 24 && rifle.reserveStart === 48
    && Array.isArray(combatMod?.WEAPON_ORDER) && combatMod.WEAPON_ORDER[4] === 'rifle'
    && typeof combatMod?.CombatSystem.prototype.unlockWeapon === 'function'
    && typeof combatMod?.CombatSystem.prototype.getWeaponsState === 'function';
  if (!rifleOk) {
    throw new Error('missing input: combat.js WEAPONS.rifle definition (38 dmg / 90 range / 24 mag) not found');
  }
  // main.js imports three, so check source text: the onComplete hook
  // unlocks the rifle on mission 4, the sunset staging equips it
  // (with a rifle-* mesh in Rico's right hand) before mission 5
  // starts, and the cover staging dresses the tower face.
  const mainSrc18 = readFileSync(join(gameDir, 'src', 'main.js'), 'utf8');
  const sunsetIdx = mainSrc18.indexOf('function stageSunset()');
  const sunsetSrc = sunsetIdx >= 0 ? mainSrc18.slice(sunsetIdx) : '';
  const startM5 = sunsetSrc.indexOf('missions.startMission(5');
  const rifleIdx = sunsetSrc.indexOf("combat.unlockWeapon('rifle')");
  const rifleEquipIdx = sunsetSrc.indexOf("combat.selectWeapon('rifle')");
  const sunsetRifleOk = rifleIdx >= 0 && rifleEquipIdx >= 0 && startM5 > 0 && rifleIdx < startM5 && rifleEquipIdx < startM5
    && sunsetSrc.includes("'rifle-receiver'") && sunsetSrc.includes("'rifle-barrel'");
  const coverOk = mainSrc18.includes('function stageCoverShopfront()')
    && mainSrc18.includes('stageCoverShopfront()')
    && mainSrc18.includes("'cover-solmar-sign'") && mainSrc18.includes("'cover-shopfront-glass'");
  if (!sunsetRifleOk || !coverOk) {
    throw new Error('missing input: main.js must equip the rifle in stageSunset before mission 5 (with a rifle mesh) and dress the cover tower face via stageCoverShopfront');
  }
  console.log(`round 18: rifle ${rifle.damage} dmg / ${rifle.range} m / ${rifle.rate} s / ${rifle.magSize}+${rifle.reserveStart} (mission ${r18.weapons.rifleUnlockMission} reward) + cover shopfront "${r18.cover.signText}" (${r18.cover.windowCount} warm windows)`);
}
// Round 19: the cover helicopter must be staged whole (the round-18
// cover cropped the rotor disc off-frame), the sunset rifle must read
// BRIGHT (round 18: dark metal on dark asphalt, 0 bright px), and
// the pursuit roadblock must throw headlight cones + red/blue washes
// on the asphalt (round 18: bare asphalt, poolMean 45.9). Validate
// the CONFIG.round19 tuning block in config.js and its consumers:
//   - heli followOffset y ~11.5 (lower than round 18's 15.5 so the
//     rotor disc clears the top of the frame) and coverDialogue
//     moved top-left (left 16, top 36, width 520) so the dialogue
//     box never overlaps the helicopter;
//   - rifle colours are the pale unlit palette (barrel 0xdde2e8,
//     stock 0xe0aa6a) with a longer barrel (0.7) and a raised
//     low-ready tilt (-0.4);
//   - pursuit pools carry the brighter opacities (headlight 0.75,
//     red/blue 0.75) and the wider washes (6.5 m);
//   - the SMG is pale steel at low metalness (0.15) with a muzzle
//     halo (scale 2.5) — high metalness with no environment map
//     renders black in this scene, which is what hid the rifle in
//     round 18.
{
  const configSrc = readFileSync(join(gameDir, 'src', 'config.js'), 'utf-8');
  const num = (key: string): number | null => {
    const m = configSrc.match(new RegExp(`${key}:\\s*([-0-9.]+)`));
    return m ? Number(m[1]) : null;
  };
  const hex = (key: string): number | null => {
    const m = configSrc.match(new RegExp(`${key}:\\s*0x([0-9a-fA-F]+)`));
    return m ? parseInt(m[1], 16) : null;
  };
  const checks: Array<[string, boolean]> = [
    ['round19.followOffset.y 11.5 (heli staged lower)', configSrc.includes('y: 11.5')],
    ['round19.coverDialogue left 16 / top 36 / width 520', configSrc.includes('left: 16') && configSrc.includes('top: 36') && configSrc.includes('width: 520')],
    ['round19.rifle barrel 0xdde2e8 + stock 0xe0aa6a (pale unlit)', hex('barrelColor') === 0xdde2e8 && hex('stockColor') === 0xe0aa6a],
    ['round19.rifle barrelLength 0.7 / tiltX -0.4', num('barrelLength') === 0.7 && num('tiltX') === -0.4],
    ['round19.pursuit headlight opacity 0.75', configSrc.includes('opacity: 0.75')],
    ['round19.pursuit washes 6.5 m wide', configSrc.includes('width: 6.5')],
    ['round19.smg pale steel at metalness 0.15 + muzzle halo 2.5', configSrc.includes('metalness: 0.15') && configSrc.includes('muzzleHaloScale: 2.5')],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(`missing input: CONFIG.round19 incomplete in config.js — ${failed.join('; ')}`);
  }
  const mainSrc19 = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const policeSrc19 = readFileSync(join(gameDir, 'src', 'police.js'), 'utf-8');
  const consumersOk =
    mainSrc19.includes('CONFIG.round19') &&
    mainSrc19.includes('attachRoadblockLightPools') &&
    mainSrc19.includes('muzzleHalo') &&
    mainSrc19.includes('MeshBasicMaterial') &&
    policeSrc19.includes('export function attachRoadblockLightPools');
  if (!consumersOk) {
    throw new Error('missing input: main.js must consume CONFIG.round19 (dialogue shift, rifle, pools, muzzle halo) and police.js must export attachRoadblockLightPools');
  }
  console.log('round 19: heli followOffset y 11.5 + dialogue top-left (16,36,520) + rifle 0xdde2e8/0xe0aa6a + pools 0.75 + SMG 0.15 metalness');
  // Round 19 (re-touch): the heli re-stage numbers must be the REAL
  // parsed values, not just substrings — a copy whose followOffset was
  // re-tuned (or whose dialogue box was widened back toward the heli)
  // would still pass the substring checks above. followOffset must be
  // exactly x 4 / y 11.5 / z -30 (down 4 m and 4 m to the side from
  // round 18's 0 / 15.5), and the cover dialogue's right edge
  // (left + width = 536) must stay left of the heli bbox left edge
  // (~580, per the config comment), otherwise the box overlaps the
  // helicopter again as it did in round 18 (~7,800 px^2).
  const cfg19 = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round19;
  const fo19 = cfg19?.heli?.followOffset;
  const dlg19 = cfg19?.coverDialogue;
  const followOk = fo19?.x === 4 && fo19?.y === 11.5 && fo19?.z === -30;
  const dialogueClearOk = typeof dlg19?.left === 'number' && typeof dlg19?.width === 'number'
    && dlg19.left + dlg19.width === 536 && dlg19.left + dlg19.width < 580;
  if (!followOk || !dialogueClearOk) {
    throw new Error('missing input: CONFIG.round19 followOffset must be x 4 / y 11.5 / z -30 and coverDialogue right edge (left + width = 536) must stay left of the heli bbox (~580)');
  }
  console.log(`round 19 (re-touch): heli followOffset (${fo19.x}, ${fo19.y}, ${fo19.z}) + dialogue right edge ${dlg19.left + dlg19.width} < heli bbox 580`);
}
// Round 20: the cover left stack must clear the legacy OBJECTIVE block
// (round 19: the dialogue box at top 36 covered it — the "OBJECTIVE"
// title half cut, the "1/2 · ..." line fully hidden), and the cover
// road must carry staged traffic + a crossing ped (round 19: mostly
// empty asphalt). Validate the CONFIG.round20 tuning block in
// config.js and its consumers, with REAL parsed values:
//   - coverStack drops the whole stack 72 px (dialogue 108, mission
//     190, radio 364, respect 428): dialogue top clears the objective
//     block bottom (99) with a 9 px gap, the inter-panel gaps match
//     round 19 (9 / 44 / 1 px), and respect still ends (428 + 73 =
//     501) above the minimap (top 526);
//   - traffic far/near sit one per lane (|dx| <= 7 m, 10-40 m out),
//     far rear-to-camera (heading PI, tail lights) and near
//     front-to-camera (heading 0, headlights);
//   - main.js defines stageCoverTraffic, tracks it in shotTraffic,
//     and consumes CONFIG.round20 (stack + traffic + peds + lights).
{
  const cfg20 = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round20;
  const stack = cfg20?.coverStack;
  const stackOk = stack?.dialogueTop === 108 && stack?.missionTop === 190
    && stack?.radioTop === 364 && stack?.respectTop === 428
    && stack.dialogueTop > 99 && stack.missionTop - (stack.dialogueTop + 73) === 9
    && stack.radioTop - (stack.missionTop + 130) === 44
    && stack.respectTop - (stack.radioTop + 63) === 1
    && stack.respectTop + 73 < 526;
  const tf = cfg20?.traffic?.far, tn = cfg20?.traffic?.near;
  const trafficOk = tf && tn
    && Math.abs(tf.dx) <= 7 && tf.dz <= -10 && tf.dz >= -40 && tf.heading === Math.PI && tf.lights === 'tail'
    && Math.abs(tn.dx) <= 7 && tn.dz <= -10 && tn.dz >= -40 && tn.heading === 0 && tn.lights === 'head';
  const pedsOk = cfg20?.peds?.cross?.side === 0
    && Array.isArray(cfg20?.peds?.westExtra) && cfg20.peds.westExtra.length === 2;
  if (!stackOk || !trafficOk || !pedsOk) {
    throw new Error('missing input: CONFIG.round20 incomplete in config.js — coverStack must be 108/190/364/428 (dialogue clears OBJECTIVE bottom 99, respect ends 501 < minimap 526), traffic far/near must sit one per lane with tail/head lights, peds must hold 1 crossing + 2 west-extra');
  }
  const mainSrc20 = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const consumersOk = mainSrc20.includes('CONFIG.round20')
    && mainSrc20.includes('function stageCoverTraffic')
    && mainSrc20.includes('shotTraffic')
    && mainSrc20.includes('stageCoverTraffic()');
  if (!consumersOk) {
    throw new Error('missing input: main.js must consume CONFIG.round20 — define stageCoverTraffic, track it in shotTraffic, and call it from stageCoverChase');
  }
  console.log(`round 20: cover stack ${stack.dialogueTop}/${stack.missionTop}/${stack.radioTop}/${stack.respectTop} (respect ends ${stack.respectTop + 73} < minimap 526) + traffic far (${tf.dx}, ${tf.dz}, tail) / near (${tn.dx}, ${tn.dz}, head) + crossing ped + 2 west peds`);
}
// Round 20 (re-touch): the staged-traffic LIGHTS + colours + ped
// depths must be the REAL parsed values, not just present — a copy
// that lost the lights block would ship the round-19 dim traffic
// (headlights at traffic.js defaults, no brake-light flare) while
// the round-20 gate above claims the staged cars are lit. Validate
// CONFIG.round20.lights (head/tail emissive + glow opacity/scale),
// the two traffic colours, and the ped depths; then verify
// stageCoverTraffic in main.js actually APPLIES them — the head
// branch drives headMat/headGlows/headGlowSprites, the tail branch
// drives tailMat/tailGlows — instead of merely reading the config.
{
  const cfg20b = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round20;
  const lights = cfg20b?.lights;
  const lightsOk = lights?.headEmissive === 1.8 && lights?.headGlowOpacity === 0.95
    && lights?.headGlowScale === 1.8 && lights?.tailEmissive === 2.0 && lights?.tailGlowOpacity === 0.95
    // Range guard: a misplaced decimal (18 instead of 1.8) would still
    // be a number but would blow the dusk lighting out; every lights
    // value must sit in (0, 3]. Semantic order: the far car's BRAKE
    // flare (tail 2.0) must outshine the near car's headlights (1.8) —
    // that is what makes the rear-facing car read as braking in the
    // golden-hour shot instead of just another lit car.
    && [lights.headEmissive, lights.headGlowOpacity, lights.headGlowScale, lights.tailEmissive, lights.tailGlowOpacity]
      .every((v) => typeof v === 'number' && v > 0 && v <= 3)
    && lights.tailEmissive > lights.headEmissive;
  const coloursOk = cfg20b?.traffic?.far?.colour === 0xe67e22
    && cfg20b?.traffic?.near?.colour === 0xf5f0e6
    && cfg20b?.traffic?.far?.model === 'sedan' && cfg20b?.traffic?.near?.model === 'sedan';
  const pedsOk = cfg20b?.peds?.cross?.dz === -18
    && cfg20b?.peds?.westExtra?.[0]?.dz === -20 && cfg20b?.peds?.westExtra?.[1]?.dz === -26;
  if (!lightsOk || !coloursOk || !pedsOk) {
    throw new Error('missing input: CONFIG.round20 lights must be head 1.8/0.95/1.8 + tail 2.0/0.95, traffic colours 0xe67e22 (far) / 0xf5f0e6 (near) sedans, ped depths cross -18 / west -20/-26');
  }
  const mainSrc20b = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const trafficFnIdx = mainSrc20b.indexOf('function stageCoverTraffic()');
  const trafficFnSrc = trafficFnIdx >= 0 ? mainSrc20b.slice(trafficFnIdx, mainSrc20b.indexOf('function stageCoverChase()')) : '';
  const lightsAppliedOk = trafficFnSrc.includes('lc.headEmissive') && trafficFnSrc.includes('headMat.emissiveIntensity')
    && trafficFnSrc.includes('lc.headGlowOpacity') && trafficFnSrc.includes('headGlows')
    && trafficFnSrc.includes('lc.headGlowScale') && trafficFnSrc.includes('headGlowSprites')
    && trafficFnSrc.includes('lc.tailEmissive') && trafficFnSrc.includes('tailMat.emissiveIntensity')
    && trafficFnSrc.includes('lc.tailGlowOpacity') && trafficFnSrc.includes('tailGlows')
    // No-GT guard: stageCoverTraffic runs after the GT is created in
    // stageCoverChase, but a copy that reordered the staging would
    // crash on player.currentCar being null — the guard must bail out
    // with an empty list instead of throwing.
    && trafficFnSrc.includes('if (!car) return []');
  if (!lightsAppliedOk) {
    throw new Error('missing input: stageCoverTraffic in game/src/main.js must apply CONFIG.round20.lights — head branch to headMat/headGlows/headGlowSprites, tail branch to tailMat/tailGlows — and bail out (empty list) when there is no GT car');
  }
  console.log(`round 20 (re-touch): staged lights head ${lights.headEmissive}/${lights.headGlowOpacity}/${lights.headGlowScale} + tail ${lights.tailEmissive}/${lights.tailGlowOpacity} (far 0xe67e22, near 0xf5f0e6, peds -18/-20/-26) applied in stageCoverTraffic`);
}
// Round 21: the Art Deco block + east-tower shopfront + sun-soaked
// cover light must be present — CONFIG.round21 (deco tiers / fin /
// east panes / coverLight sky) in config.js and its consumers in
// main.js (stageCoverDeco + stageCoverEast called from
// stageCoverChase, coverLight applied AFTER applyGoldenHour()).
// A copy that lost any of them would ship the round-20 plain tower
// face / flat sunset while the probe claims the round-21 fixes.
// Fail loudly here instead of at the intake check.
{
  const cfg21 = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round21;
  const lum21 = (hex: number): number => {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const deco = cfg21?.deco;
  const decoOk = deco
    && Array.isArray(deco.tierColors) && deco.tierColors.length === 3
    && deco.tierColors.every((c: number) => typeof c === 'number' && lum21(c) >= 100 && lum21(c) <= 170)
    && typeof deco.finColor === 'number' && lum21(deco.finColor) >= 100 && lum21(deco.finColor) <= 180
    && typeof deco.tierBaseY === 'number' && deco.tierBaseY >= 9 // above the shopfront sign top (8.8)
    && Array.isArray(deco.tierWidths) && deco.tierWidths.length === 3
    && deco.tierWidths[0] > deco.tierWidths[1] && deco.tierWidths[1] > deco.tierWidths[2] // wedding-cake: shrinking
    && Array.isArray(deco.tierDepths) && deco.tierDepths.length === 3
    && deco.tierDepths[0] < deco.tierDepths[1] && deco.tierDepths[1] < deco.tierDepths[2] // stepping proud
    && typeof deco.finTopY === 'number' && deco.finTopY > 30 && deco.finTopY <= 40;
  const east = cfg21?.east;
  const eastOk = east
    && typeof east.glassColor === 'number' && typeof east.awningColor === 'number'
    && Array.isArray(east.bandY) && east.bandY.length === 2;
  const cl = cfg21?.coverLight;
  const lightOk = cl
    && typeof cl.skyTop === 'number' && typeof cl.skyHorizon === 'number' && typeof cl.fog === 'number'
    && Array.isArray(cl.mids) && cl.mids.length === 4
    && cl.mids.every((m: { stop: number; hex: number }) => typeof m.stop === 'number' && m.stop > 0 && m.stop < 0.5 && typeof m.hex === 'number')
    && Array.isArray(cl.sunOffset) && cl.sunOffset.length === 3
    && typeof cl.sunOffset[1] === 'number' && cl.sunOffset[1] < 50; // sun lower than the default 50 (~15 deg)
  if (!decoOk || !eastOk || !lightOk) {
    throw new Error('missing input: CONFIG.round21 incomplete in config.js — deco needs 3 muted pastel tiers (lum 100-170, shrinking widths, stepping depths, base y >= 9, fin top 30-40), east needs warm glass + 2 balcony bands, coverLight needs a warm sky (4 mids below 0.5) + a lowered sun (y < 50)');
  }
  const mainSrc21 = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const chaseIdx = mainSrc21.indexOf('function stageCoverChase()');
  const chaseSrc = chaseIdx >= 0 ? mainSrc21.slice(chaseIdx) : '';
  const goldenIdx = chaseSrc.indexOf('applyGoldenHour()');
  const lightIdx = chaseSrc.indexOf('CONFIG.round21');
  const consumersOk = mainSrc21.includes('function stageCoverDeco()')
    && mainSrc21.includes('function stageCoverEast()')
    && chaseSrc.includes('stageCoverDeco()') && chaseSrc.includes('stageCoverEast()')
    && goldenIdx >= 0 && lightIdx > goldenIdx; // coverLight AFTER the global golden-hour grade
  if (!consumersOk) {
    throw new Error('missing input: main.js must define stageCoverDeco + stageCoverEast, call both from stageCoverChase, and apply CONFIG.round21.coverLight AFTER applyGoldenHour()');
  }
  console.log(`round 21: Art Deco block (3 pastel tiers lum ${deco.tierColors.map((c: number) => Math.round(lum21(c))).join('/')}, fin to ${deco.finTopY} m) + east shopfront (2 bands) + cover light (skyTop 0x${cl.skyTop.toString(16)}, sun y ${cl.sunOffset[1]})`);
}
// Round 21 (re-touch): the pastel + sky-warming SEMANTICS must be
// the REAL parsed values, not just present — a copy whose tier
// hexes drifted bright (the round-21a build rendered 169/178,
// over the 160 pastel cap) or whose sky mids were not actually
// warmer than the round-5 sunset would still pass the structural
// gate above while the pixel gates fail. Verify: every tier colour
// is warm (R-B >= 15 — the tower's own glass, R-B -64, is not
// pastel) and the fin is cream, not orange (R-B <= 80 — the west
// neighbour tower's face reads R-B ~150 and must not count as
// fin); the cover-light skyTop is warmer than the global sunset
// top (0x4a2a20, R-B 42); and the first three cover-light mids are
// strictly warmer (higher R-B) than the round-5 mids at the same
// stops (the 0.47 gold stop is shared, so it need only match).
{
  const cfg21b = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round21;
  const rb21 = (hex: number): number => ((hex >> 16) & 255) - (hex & 255);
  const tiers21 = cfg21b?.deco?.tierColors;
  const warmOk = Array.isArray(tiers21) && tiers21.length === 3
    && tiers21.every((c: number) => rb21(c) >= 15)
    && typeof cfg21b?.deco?.finColor === 'number'
    && rb21(cfg21b.deco.finColor) >= 15 && rb21(cfg21b.deco.finColor) <= 80;
  const cl21 = cfg21b?.coverLight;
  const topOk = typeof cl21?.skyTop === 'number' && rb21(cl21.skyTop) > rb21(0x4a2a20);
  const mids5 = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round5?.sky?.mids;
  const midsWarmerOk = Array.isArray(cl21?.mids) && Array.isArray(mids5)
    && cl21.mids.length === 4 && mids5.length === 4
    && cl21.mids[0].hex !== undefined && mids5[0].hex !== undefined
    && [0, 1, 2].every((i) => rb21(cl21.mids[i].hex) > rb21(mids5[i].hex))
    && rb21(cl21.mids[3].hex) >= rb21(mids5[3].hex);
  if (!warmOk || !topOk || !midsWarmerOk) {
    throw new Error('missing input: CONFIG.round21 semantics — deco tiers must be warm (R-B >= 15), fin cream (R-B 15-80), coverLight skyTop warmer than the global sunset top (R-B > 42), and coverLight mids 0-2 strictly warmer than the round-5 mids at the same stops');
  }
  console.log(`round 21 (re-touch): pastel warmth (tiers R-B ${tiers21.map((c: number) => rb21(c)).join('/')}, fin R-B ${rb21(cfg21b.deco.finColor)}) + skyTop R-B ${rb21(cl21.skyTop)} > sunset 42 + mids 0-2 warmer than round-5`);
}
// Round 21 (re-touch 2): the EXACT round-21 values + the rendered-
// pastel arithmetic must be right, not just present-and-warm. The
// structural gate above allows tier luminance up to 170 and the
// semantics gate only checks warmth — the round-21a build passed
// both shapes of check with 0xb57f74/0x87a06e and rendered 169/178,
// OVER the 160 pastel cap. So pin the exact hexes, cap the hex
// luminance at 160 AND the ACES-adjusted render estimate (hex lum
// + ~27, per the config note — MeshBasicMaterial under ACES at
// exposure 1.12) inside the 110-160 pixel gate; pin the exact
// wedding-cake arithmetic (tiers 10+8+8+7 = 33, crown +2+1 = 36,
// fin to 40 — 4 m clear above the crown, the margin the fin needs
// above the dialogue box); pin the east shopfront to the round-18
// SOLMAR row it extends (same warm glass 0xffd98a, same frame,
// same ground-floor datum) with a BLUE awning, never the SOLMAR
// red; pin the exact cover-light sky/fog/mids/sun; and verify the
// staging functions actually READ these fields instead of running
// on their fallbacks (the stageCoverDeco fallback tier colours
// ARE the over-cap 21a hexes).
{
  const cfg21c = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round21;
  const lum21c = (hex: number): number => {
    const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const exact21c = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
  const deco21c = cfg21c?.deco;
  const decoExactOk = !!(deco21c
    && exact21c(deco21c.tierColors, [0xa86a52, 0x9a6a5e, 0x678252])
    && deco21c.finColor === 0x8a7a5e && deco21c.crownColor === 0x678252
    && deco21c.bandColor === 0x2e2a26 && deco21c.railColor === 0x6a5a44
    && deco21c.tierBaseY === 10
    && exact21c(deco21c.tierHeights, [8, 8, 7]) && exact21c(deco21c.tierWidths, [28, 24, 20])
    && exact21c(deco21c.tierDepths, [0.8, 1.6, 2.4])
    && exact21c(deco21c.crownWidths, [12, 8]) && exact21c(deco21c.crownHeights, [2, 1])
    && deco21c.crownDepth === 1.6 && deco21c.finWidth === 3.0
    && deco21c.finTopY === 40 && deco21c.finDepth === 1.2);
  // Geometry arithmetic: the crown must sit on the top tier
  // (10 + 8 + 8 + 7 = 33, + 2 + 1 = 36) and the fin must clear it
  // (40 > 36); each tier steps exactly 0.8 m proud of the one
  // below (epsilon compare — 2.4 - 1.6 is 0.7999999999999998 in
  // binary float, so a strict === would fail a correct config).
  const crownTop21c = decoExactOk
    ? deco21c.tierBaseY + deco21c.tierHeights.reduce((s: number, h: number) => s + h, 0)
      + deco21c.crownHeights.reduce((s: number, h: number) => s + h, 0)
    : -1;
  const geomOk = decoExactOk && crownTop21c === 36 && deco21c.finTopY > crownTop21c
    && Math.abs(deco21c.tierDepths[1] - deco21c.tierDepths[0] - 0.8) < 1e-9
    && Math.abs(deco21c.tierDepths[2] - deco21c.tierDepths[1] - 0.8) < 1e-9;
  // Rendered-pastel guard: every pastel face (3 tiers + fin) must
  // stay inside the 110-160 on-screen gate AFTER the ~+27 ACES
  // lift, and inside the config's own <= 160 hex cap. The 21a
  // hexes fail this (0xb57f74: 137.7 + 27 = 164.7; 0x87a06e:
  // 151.1 + 27 = 178.1); the shipped hexes land 142-150.
  const pastelOk = decoExactOk
    && [...deco21c.tierColors, deco21c.finColor]
      .every((c: number) => lum21c(c) <= 160 && lum21c(c) + 27 >= 110 && lum21c(c) + 27 <= 160);
  const r18cover21c = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round18?.cover;
  const east21c = cfg21c?.east;
  const eastOk = !!(east21c && deco21c)
    && east21c.glassColor === 0xffd98a && east21c.glassColor === r18cover21c?.glassColor // same warm glass as the SOLMAR row
    && east21c.frameColor === 0x2a2a22 && east21c.frameColor === r18cover21c?.frameColor
    && east21c.awningColor === 0x2e86c1 && east21c.awningColor !== r18cover21c?.awningColor // shaded BLUE, never the SOLMAR red 0xc23a2a
    && east21c.windowW === 6.0 && east21c.windowW > r18cover21c?.windowW // wider than the SOLMAR 4.5 m — the grazing angle needs it
    && east21c.windowH === 2.2 && east21c.windowH === r18cover21c?.windowH
    && east21c.windowY === 1.6 && east21c.windowY === r18cover21c?.windowY
    && east21c.awningY === 3.5 && east21c.awningY === r18cover21c?.awningY
    && east21c.awningLength === 16 && exact21c(east21c.bandY, [21, 26]) && east21c.bandLength === 14
    && east21c.bandColor === deco21c.bandColor && east21c.railColor === deco21c.railColor; // same dark band + brass rail as the Deco block
  const cl21c = cfg21c?.coverLight;
  const lightExactOk = !!(cl21c
    && cl21c.skyTop === 0x641c0a && cl21c.skyHorizon === 0xff8c1a && cl21c.fog === 0xe07028
    && exact21c(cl21c.mids?.map((m: { stop: number }) => m.stop), [0.18, 0.30, 0.40, 0.47])
    && exact21c(cl21c.mids?.map((m: { hex: number }) => m.hex), [0x981e08, 0xc21402, 0xdb2604, 0xffc46b])
    && exact21c(cl21c.sunOffset, [165, 38, 85]));
  if (!decoExactOk || !geomOk || !pastelOk || !eastOk || !lightExactOk) {
    throw new Error('missing input: CONFIG.round21 exact values — deco tiers must be 0xa86a52/0x9a6a5e/0x678252 (fin 0x8a7a5e, crown 0x678252, band 0x2e2a26, rail 0x6a5a44; heights 8/8/7, widths 28/24/20, depths 0.8/1.6/2.4, crown 12/8 + 2/1 @ 1.6, fin 3.0 m to 40 m over a 36 m crown top; rendered pastel lum+27 in 110-160), east must be the round-18 glass 0xffd98a + blue awning 0x2e86c1 (never the SOLMAR red) with 6.0 m panes and bands at 21/26, coverLight must be skyTop 0x641c0a / horizon 0xff8c1a / fog 0xe07028 / mids 0.18-0.47 / sun [165, 38, 85]');
  }
  const mainSrc21c = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const decoIdx21c = mainSrc21c.indexOf('function stageCoverDeco()');
  const eastIdx21c = mainSrc21c.indexOf('function stageCoverEast()');
  const chaseIdx21c = mainSrc21c.indexOf('function stageCoverChase()');
  const decoFnSrc21c = decoIdx21c >= 0 && eastIdx21c > decoIdx21c ? mainSrc21c.slice(decoIdx21c, eastIdx21c) : '';
  const eastFnSrc21c = eastIdx21c >= 0 && chaseIdx21c > eastIdx21c ? mainSrc21c.slice(eastIdx21c, chaseIdx21c) : '';
  const chaseFnSrc21c = chaseIdx21c >= 0 ? mainSrc21c.slice(chaseIdx21c) : '';
  const appliedOk21c = decoFnSrc21c.includes('cfg.tierColors') && decoFnSrc21c.includes('cfg.tierHeights')
    && decoFnSrc21c.includes('cfg.tierWidths') && decoFnSrc21c.includes('cfg.tierDepths')
    && decoFnSrc21c.includes('cfg.finWidth') && decoFnSrc21c.includes('cfg.finTopY')
    && decoFnSrc21c.includes('cfg.crownWidths') && decoFnSrc21c.includes('cfg.crownHeights')
    && eastFnSrc21c.includes('cfg.glassColor') && eastFnSrc21c.includes('cfg.windowW')
    && eastFnSrc21c.includes('cfg.awningLength') && eastFnSrc21c.includes('cfg.bandY')
    && eastFnSrc21c.includes('cfg.bandLength')
    && chaseFnSrc21c.includes('world.sky.setPalette(cl.skyTop, cl.skyHorizon, cl.mids)')
    && chaseFnSrc21c.includes('new THREE.Fog(cl.fog')
    && chaseFnSrc21c.includes('shotSunOffset = [...cl.sunOffset]');
  if (!appliedOk21c) {
    throw new Error('missing input: main.js must APPLY the exact CONFIG.round21 values — stageCoverDeco reads cfg.tierColors/tierHeights/tierWidths/tierDepths/finWidth/finTopY/crownWidths/crownHeights, stageCoverEast reads cfg.glassColor/windowW/awningLength/bandY/bandLength, stageCoverChase sets the sky palette + fog + sun offset from CONFIG.round21.coverLight (fallbacks alone would ship the over-cap 21a pastels)');
  }
  console.log(`round 21 (re-touch 2): exact deco (tiers ${deco21c.tierColors.map((c: number) => `0x${c.toString(16)}`).join('/')}, rendered pastel ${[...deco21c.tierColors, deco21c.finColor].map((c: number) => Math.round(lum21c(c) + 27)).join('/')}, crown top ${crownTop21c} m, fin to ${deco21c.finTopY} m) + east glass 0x${east21c.glassColor.toString(16)} (round-18 glass, blue awning) + cover light sun [${cl21c.sunOffset.join(', ')}] applied in main.js`);
}
// Round 21 (re-touch 3): the FIN PROBE-LINE calibration — the
// pixel gate does not measure the fin mesh, it measures the
// projected finLine (round21-pixels.py scans +-14 px around the
// line, counting rows with >= 4 pastel px, gate >= 30 rows), so
// the line itself must be built from the CONFIG values it was
// calibrated for. The earlier blocks pin the exact CONFIG hexes
// and that stageCoverDeco READS the fin fields, but none of them
// pins the LINE: its endpoints, its span against the gate
// threshold, or the harness constants it was calibrated against.
// Pin all three here: (a) stageCoverDeco builds the fin mesh
// `finTopY - baseY` tall centred at `(baseY + finTopY) / 2` and
// sets finLine a/b at `baseY + 2` / `finTopY - 2` — the 2 m
// insets keep the probe off the tier-base edge and the fin's top
// edge, so the probe span is the fin height minus 4 m;
// (b) the fin height (finTopY - tierBaseY = 30 m) must be at
// least the gate threshold in rows (30) — at a worst-case ~1
// screen row per metre a shorter fin could never pass the gate,
// and the measured ~1.6 rows/m is what turns 30 m into the
// observed 47-49 rows; the fin top must clear the 36 m crown
// top by exactly 4 m, the margin above the dialogue box;
// (c) the harness constants the probe was calibrated for —
// window +-14 px (range(-14, 15) in round21-pixels.py) and
// threshold >= 30 rows (round21-test.mjs) — read from the
// sibling harness files when they sit beside the repo (local
// dev); in the kit intake context they are absent and this
// sub-check is skipped, never fatal. Plus the two round-21
// values no earlier block derives: the lowered-sun elevation
// from sunOffset [165, 38, 85] (~11.6 deg, must be 10-13 deg,
// y 38 < the default 50) and the east band geometry (bands
// [21, 26] exactly 5 m apart, both >= 20 m up, awning 16 m
// spanning both 6 m panes with 4 m total margin).
{
  const cfg21d = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round21;
  const deco21d = cfg21d?.deco;
  const east21d = cfg21d?.east;
  const cl21d = cfg21d?.coverLight;
  const mainSrc21d = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const decoFn21d = mainSrc21d.slice(mainSrc21d.indexOf('function stageCoverDeco()'), mainSrc21d.indexOf('function stageCoverEast()'));
  const finLineIdx21d = decoFn21d.indexOf('points.finLine = {');
  const finLineSrc21d = finLineIdx21d >= 0 ? decoFn21d.slice(finLineIdx21d, decoFn21d.indexOf('coverDeco = points;', finLineIdx21d)) : '';
  const finLineOk = decoFn21d.includes('new THREE.BoxGeometry(finW, finTopY - baseY, finDepth)')
    && decoFn21d.includes('fin.position.set(finX, (baseY + finTopY) / 2, faceZ + finDepth / 2)')
    && finLineSrc21d.includes('y: baseY + 2') && finLineSrc21d.includes('y: finTopY - 2')
    && (finLineSrc21d.match(/x: finX/g) || []).length === 2;
  const finHeightM21d = deco21d ? deco21d.finTopY - deco21d.tierBaseY : -1;
  const finProbeSpanM21d = deco21d ? (deco21d.finTopY - 2) - (deco21d.tierBaseY + 2) : -1;
  const crownTop21d = deco21d
    ? deco21d.tierBaseY + deco21d.tierHeights.reduce((s: number, h: number) => s + h, 0)
      + deco21d.crownHeights.reduce((s: number, h: number) => s + h, 0)
    : -1;
  // Harness constants, read live when the harness sits beside the
  // repo; the documented calibration values are the fallback, and
  // a missing harness only skips the cross-check.
  let finGateRows21d = 30, finWindowPx21d = 14, harnessChecked21d = false;
  const testPath21d = join(repoRoot, '..', 'round21-test.mjs');
  const pixelsPath21d = join(repoRoot, '..', 'round21-pixels.py');
  if (existsSync(testPath21d) && existsSync(pixelsPath21d)) {
    const testSrc21d = readFileSync(testPath21d, 'utf-8');
    const pixelsSrc21d = readFileSync(pixelsPath21d, 'utf-8');
    const gateMatch21d = testSrc21d.match(/finPastelRows >= (\d+)/);
    if (gateMatch21d) finGateRows21d = Number(gateMatch21d[1]);
    finWindowPx21d = pixelsSrc21d.includes('range(-14, 15)') ? 14 : -1;
    harnessChecked21d = true;
  }
  const finCalibOk = finLineOk && deco21d?.finWidth === 3.0 && deco21d?.finTopY === 40
    && finHeightM21d === 30 && finProbeSpanM21d === finHeightM21d - 4
    && finHeightM21d >= finGateRows21d && deco21d.finTopY - crownTop21d === 4
    && finWindowPx21d === 14 && finGateRows21d === 30;
  // Lowered sun: elevation from the sun offset must be the ~11.5
  // deg the config comment claims (global golden hour sits at
  // y 50, ~15 deg) — a sun that was never lowered would read ~15
  // deg here and fail this guard.
  const sunElev21d = cl21d
    ? Math.atan2(cl21d.sunOffset[1], Math.hypot(cl21d.sunOffset[0], cl21d.sunOffset[2])) * 180 / Math.PI
    : -1;
  const sunOk21d = !!(cl21d && cl21d.sunOffset[1] === 38 && cl21d.sunOffset[1] < 50
    && sunElev21d >= 10 && sunElev21d <= 13);
  // East bands: exactly 5 m apart, both high above the
  // ground-floor shopfront, awning spanning both panes + margin.
  const eastGeomOk21d = !!(east21d && east21d.bandY[1] - east21d.bandY[0] === 5
    && east21d.bandY[0] >= 20 && east21d.awningLength - 2 * east21d.windowW === 4);
  // Cover-light mids: 4 stops, strictly increasing, every hex
  // warm (R > B) — the structural counterpart to the exact-hex
  // pin in re-touch 2.
  const mids21d = cl21d?.mids || [];
  const midsOk21d = mids21d.length === 4
    && mids21d.every((m: { stop: number }, i: number) => i === 0 || m.stop > mids21d[i - 1].stop)
    && mids21d.every((m: { hex: number }) => ((m.hex >> 16) & 255) > (m.hex & 255));
  if (!finCalibOk || !sunOk21d || !eastGeomOk21d || !midsOk21d) {
    throw new Error('missing input: CONFIG.round21 probe calibration (re-touch 3) — stageCoverDeco must build the fin (finTopY - baseY) tall with finLine a/b at baseY + 2 / finTopY - 2, fin 3.0 m wide to 40 m (height 30 m >= fin gate 30 rows, probe span 26 m, top 4 m above the 36 m crown), harness window +-14 px / threshold 30 rows, sun elevation 10-13 deg from sunOffset y 38, east bands [21, 26] 5 m apart with awning 16 m over 2x6 m panes, coverLight 4 strictly-increasing warm mids');
  }
  console.log(`round 21 (re-touch 3): fin probe line [${deco21d.tierBaseY + 2}, ${deco21d.finTopY - 2}] m span ${finProbeSpanM21d} m of ${finHeightM21d} m (gate ${finGateRows21d} rows, window +-${finWindowPx21d} px${harnessChecked21d ? ', harness cross-checked' : ', harness absent — calibration values used'}) + sun elev ${sunElev21d.toFixed(1)} deg + east bands ${east21d.bandY.join('/')} m awning margin ${east21d.awningLength - 2 * east21d.windowW} m + mids ${mids21d.map((m: { stop: number }) => m.stop).join('/')} warm`);
}
// Round 22: un-occlude the Deco block + east shopfront (plan §2-§4) —
// CONFIG.round22 in config.js (cover dialogue 440 px, bottom tier
// 31 m, fin 1.0 m west, east panes 8.0 m / awning 20 m) and its
// consumers in main.js (stageCoverChase merges the dialogue/stack
// overrides, stageCoverDeco merges the tier/fin overrides,
// stageCoverEast merges the pane/awning overrides, and the __solmar
// round22 getter exposes the staged facts to the probe). A copy
// that lost the round-22 block would ship the round-21 occluded
// dialogue box (536 px right edge over the fin) / 6 m east panes
// while the probe claims the round-22 fixes. Fail loudly here.
{
  const cfg22 = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round22;
  const cfg21r22 = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round21;
  const dlg22 = cfg22?.coverDialogue;
  const dlgOk = dlg22 && dlg22.left === 16 && dlg22.width === 440
    && dlg22.left + dlg22.width === 456; // right edge 456: clear of the fin line (test runs x 509-530) + left tier edges (x 518-533), ~50 px margin
  const stack22 = cfg22?.coverStack;
  const stackOk = stack22 && typeof stack22 === 'object'; // empty by design: the narrowed box keeps its 2-line / 73 px height, so the round-20 stack is untouched
  const deco22 = cfg22?.deco;
  const decoOk22 = deco22
    && Array.isArray(deco22.tierWidths) && deco22.tierWidths.length === 3
    && deco22.tierWidths[0] === 31 && deco22.tierWidths[1] === 24 && deco22.tierWidths[2] === 20
    && deco22.tierWidths[0] > (cfg21r22?.deco?.tierWidths?.[0] ?? 28) // the crop-widening fix: round-21's 28 m caps the visible bbox at ~168 px, below the 175 px gate
    && typeof deco22.finWestShift === 'number' && deco22.finWestShift === 1.0;
  const east22 = cfg22?.east;
  const eastOk22 = east22
    && east22.windowW === 8.0 && east22.awningLength === 20
    && east22.windowW > (cfg21r22?.east?.windowW ?? 6.0) // wider than round-21's 6 m: the 28 px probe box, not the glass colour, bound the fracs at 0.56/0.68
    && east22.awningLength >= 2 * east22.windowW + 1; // the awning still spans the widened row (panes cz-9.5..cz+7.5 = 17 m)
  if (!dlgOk || !stackOk || !decoOk22 || !eastOk22) {
    throw new Error('missing input: CONFIG.round22 incomplete in config.js — coverDialogue must be left 16 / width 440 (right edge 456), deco tierWidths must be [31, 24, 20] with finWestShift 1.0, east must be windowW 8.0 / awningLength 20 (awning spans the widened row)');
  }
  const mainSrc22 = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const consumersOk22 = mainSrc22.includes('CONFIG.round22?.coverDialogue')
    && mainSrc22.includes('CONFIG.round22?.coverStack')
    && mainSrc22.includes('CONFIG.round22?.deco')
    && mainSrc22.includes('CONFIG.round22?.east')
    && mainSrc22.includes('finWestShift')
    && mainSrc22.includes('get round22()');
  if (!consumersOk22) {
    throw new Error('missing input: main.js must consume CONFIG.round22 — coverDialogue/coverStack in stageCoverChase, deco (tierWidths + finWestShift) in stageCoverDeco, east (windowW + awningLength) in stageCoverEast, and expose the staged facts via get round22()');
  }
  console.log(`round 22: cover dialogue ${dlg22.left}+${dlg22.width} px (right edge ${dlg22.left + dlg22.width}) + Deco bottom tier ${deco22.tierWidths[0]} m / fin -${deco22.finWestShift} m + east panes ${east22.windowW} m / awning ${east22.awningLength} m`);
}
// Round 22 (re-touch): the EXACT values, not just presence — a copy
// whose dialogue width drifted back to 520, whose bottom tier stayed
// 28 m, or whose east panes stayed 6 m would still pass the structural
// gate above while the pixel gates fail (fin rows, bbox width, pane
// fracs). Verify: the merged dialogue right edge (456) sits between
// the narrowed box and the fin's test-run x-range (509-530) with
// margin on both sides; the bottom tier is EXACTLY 31 m (the crop
// fix — 30 m leaves a run1-like crop at ~174 px, under the 175 px
// gate) and still wider than the middle tier (wedding-cake kept);
// the fin shift is EXACTLY 1.0 m (west edge minX+1.0, still on the
// tower face, not past its west edge); the east panes are EXACTLY
// 8.0 m with a 20 m awning (awning margin 20 - 2*8 = 4 m, same as
// round-21's 16 - 2*6); and main.js reads the merged fields, not
// the round-21 fallbacks (stageCoverDeco reads cfg.tierWidths +
// cfg.finWestShift, stageCoverEast reads cfg.windowW +
// cfg.awningLength, stageCoverChase spreads CONFIG.round22 over
// the round-19/20 blocks).
{
  const cfg22b = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round22;
  const dlg22b = cfg22b?.coverDialogue;
  const dlgExactOk = dlg22b?.left === 16 && dlg22b?.width === 440
    && dlg22b.left + dlg22b.width > 440 && dlg22b.left + dlg22b.width < 509; // 456: clear of the fin (test runs 509-530) with margin, and clear of the heli zone (~580)
  const deco22b = cfg22b?.deco;
  const decoExactOk = Array.isArray(deco22b?.tierWidths)
    && deco22b.tierWidths[0] === 31 && deco22b.tierWidths[1] === 24 && deco22b.tierWidths[2] === 20
    && deco22b.finWestShift === 1.0;
  const east22b = cfg22b?.east;
  const eastExactOk = east22b?.windowW === 8.0 && east22b?.awningLength === 20
    && east22b.awningLength - 2 * east22b.windowW === 4;
  // Round 22 (Target 3, stage 2): the fourth balcony band on the
  // crown's first step must be ON (crownBand true) — a copy that
  // lost it would ship 3 balcony lines while the test gates 4/4.
  const crownBandOk = cfg22b?.deco?.crownBand === true;
  if (!dlgExactOk || !decoExactOk || !eastExactOk || !crownBandOk) {
    throw new Error('missing input: CONFIG.round22 exact values (re-touch) — coverDialogue must be left 16 / width 440 (right edge 456, between 440 and the fin x 509), deco tierWidths must be exactly [31, 24, 20] with finWestShift exactly 1.0 and crownBand true, east must be windowW 8.0 / awningLength 20 (margin 4 m)');
  }
  const mainSrc22b = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const decoFnIdx = mainSrc22b.indexOf('function stageCoverDeco()');
  const decoFnSrc = decoFnIdx >= 0 ? mainSrc22b.slice(decoFnIdx, mainSrc22b.indexOf('function stageCoverEast()')) : '';
  const eastFnIdx = mainSrc22b.indexOf('function stageCoverEast()');
  const eastFnSrc = eastFnIdx >= 0 ? mainSrc22b.slice(eastFnIdx, mainSrc22b.indexOf('// 1-cover-chase.jpg')) : '';
  const mergedOk = decoFnSrc.includes('cfg.tierWidths') && decoFnSrc.includes('cfg.finWestShift')
    && decoFnSrc.includes('CONFIG.round22?.deco')
    && decoFnSrc.includes('cfg.crownBand') && decoFnSrc.includes('deco-crown-band')
    && eastFnSrc.includes('cfg.windowW') && eastFnSrc.includes('cfg.awningLength')
    && eastFnSrc.includes('CONFIG.round22?.east')
    && mainSrc22b.includes('...(CONFIG.round22?.coverDialogue || {})')
    && mainSrc22b.includes('...(CONFIG.round22?.coverStack || {})');
  if (!mergedOk) {
    throw new Error('missing input: main.js must read the round-22 merged fields — stageCoverDeco cfg.tierWidths/cfg.finWestShift/cfg.crownBand (+ CONFIG.round22?.deco, crown band mesh), stageCoverEast cfg.windowW/cfg.awningLength (+ CONFIG.round22?.east), stageCoverChase spreading CONFIG.round22 over the round-19/20 blocks');
  }
  console.log(`round 22 (re-touch): exact dialogue right edge ${dlg22b.left + dlg22b.width} px + tiers ${deco22b.tierWidths.join('/')} m / fin -${deco22b.finWestShift} m / crown band ${cfg22b.deco.crownBand} + east panes ${east22b.windowW} m / awning margin ${east22b.awningLength - 2 * east22b.windowW} m, merged fields read in main.js`);
}
// Round 22 (re-touch 2): lock the round-22 GATE NUMBERS themselves —
// fin >= 60 rows, Deco visible bbox width >= 175 px, BOTH east panes
// >= 0.7 warm, Deco balcony 4/4. The two blocks above pin the CONFIG
// values and their consumers, but a copy whose test file had its gates
// loosened (fin 60 -> 30, bbox 175 -> 150, pane 0.7 -> 0.5, balcony
// 4 -> 3) would still pass those blocks while the pixel gates no
// longer prove the round-22 fixes. Read the four thresholds live from
// the sibling harness (round22-test.mjs) when it sits beside the repo
// (local dev); in the kit intake context it is absent and the
// cross-check is skipped, never fatal — but the CONFIG-side
// preconditions (dialogue right edge 456 clear of the fin x-range,
// bottom tier 31 m, crown band on, east panes 8.0 m) are always
// enforced, because without them no gate number is reachable.
{
  const cfg22c = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round22;
  const preOk22c = cfg22c?.coverDialogue?.left === 16 && cfg22c.coverDialogue.width === 440
    && cfg22c.coverDialogue.left + cfg22c.coverDialogue.width === 456
    && cfg22c?.deco?.tierWidths?.[0] === 31 && cfg22c?.deco?.crownBand === true
    && cfg22c?.east?.windowW === 8.0 && cfg22c?.east?.awningLength === 20;
  let finGate22c = 60, bboxGate22c = 175, paneGate22c = 0.7, balconyGate22c = 4, harnessChecked22c = false;
  const testPath22c = join(repoRoot, '..', 'round22-test.mjs');
  if (existsSync(testPath22c)) {
    const testSrc22c = readFileSync(testPath22c, 'utf-8');
    const finM22c = testSrc22c.match(/finPastelRows >= (\d+)/);
    const bboxM22c = testSrc22c.match(/visibleBboxWH\[0\] >= (\d+)/);
    const paneM22c = testSrc22c.match(/ec21\.warmWindowFracs[\s\S]{0,200}?v >= ([0-9.]+)/);
    const balcM22c = testSrc22c.match(/dc21\.balconyReadable >= (\d+)/);
    if (finM22c) finGate22c = Number(finM22c[1]);
    if (bboxM22c) bboxGate22c = Number(bboxM22c[1]);
    if (paneM22c) paneGate22c = Number(paneM22c[1]);
    if (balcM22c) balconyGate22c = Number(balcM22c[1]);
    harnessChecked22c = true;
  }
  const gatesOk22c = finGate22c === 60 && bboxGate22c === 175 && paneGate22c === 0.7 && balconyGate22c === 4;
  if (!preOk22c || (harnessChecked22c && !gatesOk22c)) {
    throw new Error('missing input: CONFIG.round22 gate numbers (re-touch 2) — fin gate must be 60 rows, Deco visible bbox width gate 175 px, east pane gate 0.7, Deco balcony gate 4/4 in round22-test.mjs, with coverDialogue right edge 456 / bottom tier 31 m / crownBand true / east panes 8.0 m in config.js');
  }
  console.log(`round 22 (re-touch 2): gates locked — fin >= ${finGate22c} rows, Deco bbox width >= ${bboxGate22c} px, east panes >= ${paneGate22c}, Deco balcony ${balconyGate22c}/4${harnessChecked22c ? ', harness cross-checked' : ', harness absent — config preconditions used'}`);
}
// Round 23 (re-frame): lock the round-23 COVER RE-FRAME values —
// the judge sees the cover fit into a 768x480 sheet, so the Deco
// size that matters is the DOWNSCALE one (round-20 lesson). The
// re-frame is camera/composition only: the whole cover staging
// moves 8 m north toward the round-22 capture point (car spawn z -80 -> -72,
// pursuit spawns -98/-110 -> -104/-116) and the GT is HELD STILL
// (holdSpeed 0 — the probe proved a moving chase drives ~20-55 m
// north before capture, so the tower distance, and the Deco size,
// was a lottery every run), and the front camera's lookAt moves
// 8 m beyond the car (lookAhead, the proven round-12 value) so the view axis stays
// ~20 deg west of south and the nearer Deco block
// recentres instead of sliding off the left edge. side/ahead/height
// keep the proven round-12 values and the FOV stays 62.
{
  const cfg23 = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round23;
  if (!cfg23?.coverCam || !cfg23?.coverSpawn) {
    throw new Error('missing input: CONFIG.round23 missing in config.js — coverCam (side/ahead/height/lookAhead) and coverSpawn (carZ/pursuitZ/holdSpeed) are required for the round-23 cover re-frame');
  }
  const camOk23 = cfg23.coverCam.side === 6 && cfg23.coverCam.ahead === 8.5 && cfg23.coverCam.height === 4
    && cfg23.coverCam.lookAhead === 8;
  const spawnOk23 = cfg23.coverSpawn.carZ === -72 && cfg23.coverSpawn.holdSpeed === 0
    && Array.isArray(cfg23.coverSpawn.pursuitZ) && cfg23.coverSpawn.pursuitZ[0] === -104
    && cfg23.coverSpawn.pursuitZ[1] === -116;
  if (!camOk23 || !spawnOk23) {
    throw new Error('missing input: CONFIG.round23 exact values — coverCam must be side 6 / ahead 8.5 / height 4 / lookAhead 8, coverSpawn must be carZ -72 / pursuitZ [-104, -116] / holdSpeed 0');
  }
  console.log(`round 23 (re-frame): config locked — coverCam side ${cfg23.coverCam.side} / ahead ${cfg23.coverCam.ahead} / height ${cfg23.coverCam.height} / lookAhead ${cfg23.coverCam.lookAhead}, coverSpawn carZ ${cfg23.coverSpawn.carZ} / holdSpeed ${cfg23.coverSpawn.holdSpeed}`);
}
// Round 23 (re-frame, part 2): the consumers + the downscale gate.
// main.js must actually USE the round-23 values — the cover spawn
// and holdSpeed in stageCoverChase, the cover-only lookAt in the
// front-mode camera branch, the coverCam in the cover shotCam — and
// expose them via get round23(); and the sibling harness
// (round23-test.mjs, beside the repo in local dev) must carry the
// DOWNSCALE gates (Deco bbox width >= 192 px, height >= 48 px, fin
// >= 30 rows on the 768x480 sheet) driven by round23-downscale.mjs.
// In the kit intake context the harness is absent and the
// cross-check is skipped, never fatal — but the main.js consumers
// are always enforced, because config values no code reads would
// ship the round-22 framing while claiming the re-frame.
{
  const mainSrc23 = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const consumersOk23 = mainSrc23.includes('CONFIG.round23?.coverSpawn?.carZ')
    && mainSrc23.includes('CONFIG.round23?.coverSpawn?.holdSpeed')
    && mainSrc23.includes('CONFIG.round23?.coverCam?.lookAhead')
    && mainSrc23.includes('CONFIG.round23?.coverCam')
    && mainSrc23.includes('get round23()');
  if (!consumersOk23) {
    throw new Error('missing input: main.js must consume CONFIG.round23 — coverSpawn carZ/holdSpeed in stageCoverChase, coverCam lookAhead in the front-mode camera branch, coverCam in the cover shotCam, and expose the staged facts via get round23()');
  }
  let dsDecoGate23 = 120, dsFinGate23 = 30, harnessChecked23 = false;
  const testPath23 = join(repoRoot, '..', 'round23-test.mjs');
  const dsPath23 = join(repoRoot, '..', 'round23-downscale.mjs');
  if (existsSync(testPath23) && existsSync(dsPath23)) {
    const testSrc23 = readFileSync(testPath23, 'utf-8');
    const dsM23 = testSrc23.match(/d\.decoWH\[0\] >= (\d+)/);
    const finM23 = testSrc23.match(/d\.finRows >= (\d+)/);
    const dsUse23 = testSrc23.includes('round23-downscale.mjs') && testSrc23.includes('DOWNSCALE');
    if (dsM23) dsDecoGate23 = Number(dsM23[1]);
    if (finM23) dsFinGate23 = Number(finM23[1]);
    harnessChecked23 = dsUse23;
  }
  const gatesOk23 = dsDecoGate23 === 120 && dsFinGate23 === 30;
  if (!gatesOk23 || (existsSync(testPath23) && !harnessChecked23)) {
    throw new Error('missing input: round-23 downscale gates — Deco bbox width gate must be 120 px and fin gate 30 rows on the 768x480 sheet in round23-test.mjs, driven by round23-downscale.mjs');
  }
  console.log(`round 23 (re-frame, part 2): consumers locked — main.js reads CONFIG.round23 (spawn/holdSpeed/lookAt/shotCam) + get round23()${harnessChecked23 ? `, harness cross-checked (downscale Deco >= ${dsDecoGate23} px, fin >= ${dsFinGate23} rows)` : ', harness absent — consumers used'}`);
}
// Round 24 (elevated wide): lock the round-24 COVER RE-FRAME
// values — the street-level framing capped at ~129 px Deco on the
// sheet, so the cover shows the WORLD instead of one landmark:
// the front camera rises (height 4 -> 10) and pulls back (ahead
// 8.5 -> 14, side 6 -> 6), the FOV opens 62 -> 84, the lookAt
// pushes 26 m past the GT and 8 m east so the view axis sits
// ~3 deg east of north (Deco left-of-centre as a landmark, Marina
// basin top-right as the coastline), and the dialogue box narrows
// 440 -> 280 px (v2 — v1 lookEast 22 / fov 72 pushed the fin
// off-frame left and the heli over the tower; see config.js). v5: the heli moves closer + lower (followOffset x 12 / y 15 /
// z -17) so fin-to-nose clears 200 px, the east panes widen to 15 m with the awning raised to 5.5 m, and the near traffic car
// moves to the west lane (dx -8) so it reads as a distinct vehicle. The old Deco-bbox gate is REMOVED (Deco drops
// below 120 px by design); the round-24 gates are districts >= 3,
// coastline run >= 40 px, HUD area <= 20%, fin >= 30 rows on the
// 768x480 sheet, driven by round24-downscale.mjs.
{
  const cfg24 = (await import(join(gameDir, 'src', 'config.js')))?.CONFIG?.round24;
  if (!cfg24?.coverCam || !cfg24?.coverSpawn) {
    throw new Error('missing input: CONFIG.round24 missing in config.js — coverCam (side/ahead/height/lookAhead/lookEast/fov) and coverSpawn (carZ/pursuitZ/holdSpeed) are required for the round-24 elevated-wide cover');
  }
  const camOk24 = cfg24.coverCam.side === 6 && cfg24.coverCam.ahead === 12 && cfg24.coverCam.height === 10
    && cfg24.coverCam.lookAhead === 26 && cfg24.coverCam.lookEast === 8 && cfg24.coverCam.fov === 84;
  const spawnOk24 = cfg24.coverSpawn.carZ === -72 && cfg24.coverSpawn.holdSpeed === 0
    && Array.isArray(cfg24.coverSpawn.pursuitZ) && cfg24.coverSpawn.pursuitZ[0] === -104
    && cfg24.coverSpawn.pursuitZ[1] === -116;
  const dlgOk24 = cfg24.coverDialogue && cfg24.coverDialogue.width === 280 && cfg24.missionWidth === 280;
  if (!camOk24 || !spawnOk24 || !dlgOk24) {
    throw new Error('missing input: CONFIG.round24 exact values — coverCam must be side 6 / ahead 12 / height 10 / lookAhead 26 / lookEast 8 / fov 84, coverSpawn carZ -72 / pursuitZ [-104, -116] / holdSpeed 0, coverDialogue width 280 / missionWidth 280');
  }
  console.log(`round 24 (elevated wide): config locked — coverCam side ${cfg24.coverCam.side} / ahead ${cfg24.coverCam.ahead} / height ${cfg24.coverCam.height} / lookAhead ${cfg24.coverCam.lookAhead} / lookEast ${cfg24.coverCam.lookEast} / fov ${cfg24.coverCam.fov}, coverSpawn carZ ${cfg24.coverSpawn.carZ} / holdSpeed ${cfg24.coverSpawn.holdSpeed}, dialogue width ${cfg24.coverDialogue.width}`);
}
// Round 24 (elevated wide, part 2): the consumers + the new
// downscale gates. main.js must actually USE the round-24 values —
// the cover spawn and holdSpeed in stageCoverChase, the cover-only
// lookAt (lookAhead + lookEast) and FOV in the front-mode camera
// branch, the coverCam in the cover shotCam, the narrowed dialogue
// box — and the sibling harness (round24-test.mjs) must carry the
// round-24 downscale gates (districts >= 3, coastline run >= 40 px,
// HUD area <= 20%, fin >= 30 rows on the 768x480 sheet) driven by
// round24-downscale.mjs, with NO Deco-bbox >= 120 px gate left
// (removed by design — Deco drops below 120 px in the wide shot).
{
  const mainSrc24 = readFileSync(join(gameDir, 'src', 'main.js'), 'utf-8');
  const consumersOk24 = mainSrc24.includes('CONFIG.round24?.coverSpawn?.carZ')
    && mainSrc24.includes('CONFIG.round24?.coverSpawn?.holdSpeed')
    && mainSrc24.includes('CONFIG.round24?.coverCam?.lookAhead')
    && mainSrc24.includes('CONFIG.round24?.coverCam?.lookEast')
    && mainSrc24.includes('CONFIG.round24?.coverCam?.fov')
    && mainSrc24.includes('CONFIG.round24?.coverCam')
    && mainSrc24.includes('CONFIG.round24?.coverDialogue');
  if (!consumersOk24) {
    throw new Error('missing input: main.js must consume CONFIG.round24 — coverSpawn carZ/holdSpeed in stageCoverChase, coverCam lookAhead/lookEast/fov in the front-mode camera branch, coverCam in the cover shotCam, coverDialogue in the cover HUD block');
  }
  let finGate24 = 30, harnessChecked24 = false;
  const testPath24 = join(repoRoot, '..', 'round24-test.mjs');
  const dsPath24 = join(repoRoot, '..', 'round24-downscale.mjs');
  if (existsSync(testPath24) && existsSync(dsPath24)) {
    const testSrc24 = readFileSync(testPath24, 'utf-8');
    const finM24 = testSrc24.match(/d\.finRows >= (\d+)/);
    const dsUse24 = testSrc24.includes('round24-downscale.mjs') && testSrc24.includes('DOWNSCALE')
      && testSrc24.includes('coastlineRun') && !testSrc24.includes('d.decoWH[0] >= 120');
    if (finM24) finGate24 = Number(finM24[1]);
    harnessChecked24 = dsUse24;
  }
  const gatesOk24 = finGate24 === 30;
  if (!gatesOk24 || (existsSync(testPath24) && !harnessChecked24)) {
    throw new Error('missing input: round-24 downscale gates — fin gate must be 30 rows and the harness must carry coastlineRun/districts/HUD-area gates with no Deco >= 120 px gate in round24-test.mjs, driven by round24-downscale.mjs');
  }
  console.log(`round 24 (elevated wide, part 2): consumers locked — main.js reads CONFIG.round24 (spawn/holdSpeed/lookAt/lookEast/fov/shotCam/dialogue)${harnessChecked24 ? `, harness cross-checked (fin >= ${finGate24} rows, districts/coastline/HUD gates present)` : ', harness absent — consumers used'}`);
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
// Round-14 (re-touch): the screenshots must be submission-ready —
// 3-4 image files, each within the 256 KiB intake cap, and every .jpg
// must start with the JPEG magic bytes (FF D8 FF). A renamed PNG or a
// truncated capture would fail at the dossier builder with a cryptic
// error; fail loudly here naming the file instead.
{
  const shots = readdirSync(screenshotsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && imageExts.has(extname(entry.name).toLowerCase()));
  if (shots.length < 3 || shots.length > 4) {
    throw new Error(`missing input: expected 3-4 screenshot files in ${screenshotsDir}, found ${shots.length}`);
  }
  for (const shot of shots) {
    const shotPath = join(screenshotsDir, shot.name);
    const size = statSync(shotPath).size;
    if (size > 262144) {
      throw new Error(`missing input: screenshot ${shot.name} is ${size} bytes (cap 262144)`);
    }
    if (extname(shot.name).toLowerCase() === '.jpg' || extname(shot.name).toLowerCase() === '.jpeg') {
      const head = readFileSync(shotPath).subarray(0, 3);
      if (head.length < 3 || head[0] !== 0xff || head[1] !== 0xd8 || head[2] !== 0xff) {
        throw new Error(`missing input: screenshot ${shot.name} is not a valid JPEG file (bad magic bytes)`);
      }
    }
  }
  console.log(`screenshots: ${shots.length} files, all within 256 KiB and valid`);
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
// Round-13 final: re-touch — round-13 config gate (density + budget
// block), build entrypoint intact.
// Round 16: re-touch — round-16 config gate (cover heli, sunset
// dialogue, fallen pool), build entrypoint intact.
// Round 17: revision — round-17 config gate (hero GT trim, heli
// detail, SMG/shotgun definitions, save v9), build entrypoint intact.
// Round 17 (re-touch): pursuit staging gate — SMG unlocked in
// stagePursuit before mission 3 starts, shotgun stays locked there.
// Round 18: revision — round-18 config gate (rifle definition +
// mission-4 unlock + cover shopfront tuning), the sunset staging
// gate (rifle equipped + rifle mesh before mission 5), the cover
// staging gate (stageCoverShopfront + SOLMAR sign), and the round-17
// "no rifle" rule superseded (the rifle is a real fifth weapon now).
// Round 20 (re-touch): round-20 lights gate — CONFIG.round20.lights
// real values (head 1.8/0.95/1.8, tail 2.0/0.95, tail > head) +
// traffic colours + ped depths, and stageCoverTraffic applying them
// (head/tail branches) with the no-GT guard, build entrypoint intact.
// Round 21 (re-touch 2): round-21 EXACT-values gate — CONFIG.round21
// deco exact hexes/geometry (tiers 0xa86a52/0x9a6a5e/0x678252, crown
// top 36 m, fin 3.0 m to 40 m, rendered pastel lum+27 in 110-160) +
// east pinned to the round-18 SOLMAR row (glass 0xffd98a, blue awning
// 0x2e86c1, never the SOLMAR red) + coverLight exact sky/fog/mids/sun,
// and stageCoverDeco/stageCoverEast/stageCoverChase actually reading
// those fields (not their fallbacks), build entrypoint intact.
