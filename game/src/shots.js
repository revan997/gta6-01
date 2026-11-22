// Solmar Bay — shot staging (W4, attempt #7, fresh build). Written fresh
// for this recording from the round-9 interface contract (W4 section +
// fixes 6/7) and the rebuild spec.
//
// stageShot(game, shotId) pins one of the four judged frames: cover (the
// coastal chase), combat (the firefight), pursuit (the stolen coupe), sunset
// (the harbour briefing). Staging is deterministic: fixed positions, zero
// random draws. The cover GT then rolls in main.js until the pin at z=-67.
//
// Rules baked in from the fix history:
// - syncCarMesh: mesh rotation is heading + PI (the model faces -z while
//   the car moves on the +z convention). The +PI NEVER leaks into
//   car.heading — the logical heading lives separately in the car object.
// - placeCar MUST call car.setPosition(x, z, heading): the old (x, 0, z)
//   call put every staged car at z=0.
// - traffic.stageShot(shotId) runs for ALL four shots (2 pinned peds each).
// - combat runs TWO independent ifs so BOTH combat.stageShot (officers) AND
//   police.stageShot('combat') (patrol car at (50,-28)) run.
// - staging calls player.enterCar(gt) for cover AND pursuit (fix 6.2): the
//   harness gates on player.currentCar being set at probe time.
// - Rico is pre-positioned to (40,-22) heading PI/2 BEFORE combat staging,
//   so officers arrange around his FINAL spot (fix 3.6).
// - Sunset Rico stands at (194.3, -137.7), facing the MARINA sign.

import { CONFIG } from './config.js';

export const SHOT_IDS = ['cover', 'combat', 'pursuit', 'sunset'];

/** Keep a car mesh in sync with its logical heading (visual only). */
export function syncCarMesh(car) {
  if (!car || !car.mesh) return car;
  car.mesh.rotation.y = car.heading + Math.PI;
  return car;
}

/** Place a car: position + heading through the car's own setter. */
export function placeCar(car, x, z, heading) {
  if (!car) return null;
  car.setPosition(x, z, heading);
  return syncCarMesh(car);
}

/** Normalize a requested shot id ('cover-chase' is the cover alias). */
export function normalizeShotId(raw) {
  if (raw === 'cover-chase' || raw === 'cover') return 'cover';
  if (SHOT_IDS.includes(raw)) return raw;
  return null;
}

function stageCover(game) {
  const { vehicles, player, police, traffic, missions } = game;
  const gtCfg = CONFIG.coverGT || { startX: 40, startZ: -95 };
  // Hero GT at the cover start; it rolls south in main.js until the pin.
  const gt = vehicles.spawn('gt', gtCfg.startX, gtCfg.startZ, 0);
  game.gt = gt;
  placeCar(gt, gtCfg.startX, gtCfg.startZ, 0);
  // Rico rides the GT (fix 6.2: player.currentCar must be set at probe).
  player.enterCar(gt);
  // 2 interceptors + heli, from CONFIG (police.js reads the same block).
  police.stageShot('cover');
  // 2 pinned peds.
  if (traffic.stageShot) traffic.stageShot('cover');
  // Mission 1 context for the HUD.
  if (missions.startMission) missions.startMission(1);
  // Sheet jobs 0/8: nothing done yet.
  game.jobsDone = 0;
  if (missions.setCompletedMissions) missions.setCompletedMissions([]);
  if (missions.setJobsDone) missions.setJobsDone(0);
  game.wanted = 4;
  if (police.setWanted) police.setWanted(4);
  return game;
}

function stageCombat(game) {
  const { player, police, combat, traffic, missions } = game;
  // Rico FIRST, at his final spot, so officers arrange around him.
  const rico = CONFIG.combat.ricoFinal || { x: 40, z: -22, heading: Math.PI / 2 };
  player.exitCar();
  player.setPosition(rico.x, rico.z, rico.heading);
  // TWO independent ifs (fix 2.5): officers AND the patrol car both run.
  if (combat && combat.stageShot) combat.stageShot('combat', player);
  if (police && police.stageShot) {
    police.stageShot('combat', { x: rico.x, z: rico.z });
  }
  if (traffic.stageShot) traffic.stageShot('combat');
  if (missions.startMission) missions.startMission(2);
  // Sheet jobs 1/8: mission 1 done.
  game.jobsDone = 1;
  if (missions.setCompletedMissions) missions.setCompletedMissions([1]);
  if (missions.setJobsDone) missions.setJobsDone(1);
  game.wanted = 4;
  if (police.setWanted) police.setWanted(4);
  return game;
}

function stagePursuit(game) {
  const { vehicles, player, police, traffic, missions } = game;
  // Stolen Palm Coupe ahead of the camera, driving at the roadblock.
  // z 121 (not 124): the coupe must read >= 86 px tall — at 124 it
  // measured 75 px (roof is probed at fixed y 2.0, so only distance
  // moves the gate); at 121 it measures 92 px. Camera stays at z 110
  // so the nearest interceptor stays on screen.
  const coupe = vehicles.spawn('palmCoupe', -120, 121, 0);
  game.coupe = coupe;
  placeCar(coupe, -120, 121, 0);
  // Rico drives the coupe (fix 6.2).
  player.enterCar(coupe);
  // 4 interceptors (z>108, north of the camera) + roadblock pair.
  police.stageShot('pursuit');
  if (traffic.stageShot) traffic.stageShot('pursuit');
  if (missions.startMission) missions.startMission(3);
  // Sheet jobs 2/8: missions 1-2 done. Wanted 5 (harness expects 5).
  game.jobsDone = 2;
  if (missions.setCompletedMissions) missions.setCompletedMissions([1, 2]);
  if (missions.setJobsDone) missions.setJobsDone(2);
  game.wanted = 5;
  if (police.setWanted) police.setWanted(5);
  return game;
}

function stageSunset(game) {
  const { player, police, traffic, missions } = game;
  // Rico on foot at the harbour, facing the MARINA sign.
  player.exitCar();
  const ricoHeading = Math.atan2(183 - 194.3, -140 - -137.7);
  player.setPosition(194.3, -137.7, ricoHeading);
  // 2 patrol cars, read from CONFIG inside police.js (fix 6.8).
  police.stageShot('sunset');
  if (traffic.stageShot) traffic.stageShot('sunset');
  if (missions.startMission) missions.startMission(4);
  // Sheet jobs 4/8: missions 1-4 done (finale shot). Wanted 5
  // (harness expects 5); the "no AIR ONE row" sunset gate is keyed to
  // the staged heli, not the wanted level, so it still passes.
  game.jobsDone = 4;
  if (missions.setCompletedMissions) missions.setCompletedMissions([1, 2, 3, 4]);
  if (missions.setJobsDone) missions.setJobsDone(4);
  game.wanted = 5;
  if (police.setWanted) police.setWanted(5);
  return game;
}

/** Stage one of the four judged shots on a live game object. */
export function stageShot(game, rawShotId) {
  const shotId = normalizeShotId(rawShotId);
  if (!shotId) throw new Error(`[shots] unknown shot: ${String(rawShotId)}`);
  game.stagedShot = shotId;
  if (shotId === 'cover') return stageCover(game);
  if (shotId === 'combat') return stageCombat(game);
  if (shotId === 'pursuit') return stagePursuit(game);
  return stageSunset(game);
}

export default stageShot;
