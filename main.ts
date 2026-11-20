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
