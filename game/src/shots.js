// Solmar Bay — staged shots: the four pinned moments (cover chase, combat,
// pursuit, sunset). Coordinates the world/player/police/combat/traffic
// staging per shot and keeps the car meshes in sync with logical headings.
// Fresh build for the round-16 rebuild (attempt #8). Written from the
// interface contract + rebuild spec; no old source read or copied.
import { createGT, createPalmCoupe, createTealCoupe } from './vehicle.js';

export const SHOT_DEFS = {
  'cover-chase': {
    file: '1-cover-chase.jpg',
    mission: 1,
    missionName: 'First Run',
    chapterLabel: 'CHAPTER 1',
    wanted: 4,
    money: 1200,
    jobsDone: 0,
    completed: [],
    timeOfDay: 17.8,
    clock: '17:48',
    dialogue: { speaker: 'DANTE', text: 'Four stars and a chopper' },
    objective: 'Lose the heat — outrun the interceptors on the waterfront',
    race: { total: 3, position: 1 },
  },
  combat: {
    file: '2-combat.jpg',
    mission: 2,
    missionName: 'Hot Wheels',
    chapterLabel: 'CHAPTER 2',
    wanted: 4,
    money: 2450,
    jobsDone: 1,
    completed: [1],
    timeOfDay: 18 + 5 / 60,
    clock: '18:05',
    dialogue: { speaker: 'DANTE', text: 'Four stars and counting' },
    objective: 'Hold the line — drop the officers and reach the car',
    race: { total: 3, position: 1 },
  },
  pursuit: {
    file: '3-pursuit.jpg',
    mission: 3,
    missionName: 'Borrowed Beauty',
    chapterLabel: 'CHAPTER 3',
    wanted: 5,
    money: 3200,
    jobsDone: 2,
    completed: [1, 2],
    timeOfDay: 18 + 20 / 60,
    clock: '18:20',
    dialogue: { speaker: 'DISPATCH', text: 'VEHICLE STOLEN' },
    objective: 'Steal the Palm Coupe and break through the roadblock',
    race: { total: 3, position: 1 },
  },
  sunset: {
    file: '4-sunset.jpg',
    mission: 4,
    missionName: 'Harbour Heist',
    chapterLabel: 'CHAPTER 5',
    wanted: 5,
    money: 4500,
    jobsDone: 4,
    completed: [1, 2, 3, 4],
    timeOfDay: 18.6,
    clock: '18:36',
    dialogue: { speaker: 'DANTE', text: 'Golden hour over the Bay' },
    objective: 'Meet Dante at the harbour for the final briefing',
    race: { total: 3, position: 1 },
  },
};

// Staged cars move on the +z convention but the model faces -z: the mesh
// rotation is the logical heading + PI. This is staging-only; main.js
// syncCarPose (free-play boot, -z convention) is a different path.
export function syncCarMesh(car) {
  if (!car || !car.mesh) return;
  if (car.position) {
    car.mesh.position.set(car.position.x, car.position.y || 0, car.position.z);
  }
  const h = typeof car.heading === 'number' ? car.heading : 0;
  car.mesh.rotation.y = h + Math.PI;
}

export function placeCar(car, x, z, heading) {
  if (!car) return;
  if (typeof car.setPosition === 'function') car.setPosition(x, z, heading);
  else {
    if (car.position) { car.position.x = x; car.position.z = z; }
    car.heading = heading;
  }
  syncCarMesh(car);
}

export function createShotStaging(ctx) {
  const { scene, player, police, combat, traffic, missions, hud, game } = ctx || {};

  function stageShot(shotId) {
    const def = SHOT_DEFS[shotId];
    if (!def) return false;

    if (shotId === 'cover-chase') {
      // Hero GT starts north and drives south down the x=40 road; the
      // cover autopilot in main.js bends it west over z -80..-70 and
      // pins it at z >= -67. Player rides in the GT from the start.
      const gt = createGT(40, -95, 0);
      if (gt && gt.mesh) scene.add(gt.mesh);
      if (game) game.heroCar = gt;
      if (player && typeof player.enterCar === 'function') player.enterCar(gt);
      if (police && typeof police.stageShot === 'function') police.stageShot('cover');
      if (traffic && typeof traffic.stageShot === 'function') traffic.stageShot('cover');
    }

    if (shotId === 'combat') {
      // FIX #1 (attempt #8): the OLD order called combat.stageShot
      // BEFORE police.stageShot — combat saw only the 6 live officers
      // (wanted 4) so arrangeCombatOfficers (needs >= 7) returned
      // false, then police staging added 7 more = 13 officers, 0
      // fallen. Now: clear the live officers, stage the 7 FIRST, then
      // arrange them — officers[0..6] ARE the staged 7.
      if (player && typeof player.setPosition === 'function') player.setPosition(40, -22, Math.PI / 2);
      if (police && typeof police.clearLiveOfficers === 'function') police.clearLiveOfficers();
      if (police && typeof police.stageShot === 'function') police.stageShot('combat', { x: 40, z: -22 });
      if (combat && typeof combat.stageShot === 'function') combat.stageShot('combat', player);
      if (traffic && typeof traffic.stageShot === 'function') traffic.stageShot('combat');
    }

    if (shotId === 'pursuit') {
      // Stolen Palm Coupe facing north (toward the camera); the player
      // is in it. Interceptors + roadblock come from police staging.
      const coupe = createPalmCoupe(-120, 122, Math.PI);
      if (coupe && coupe.mesh) scene.add(coupe.mesh);
      if (game) game.heroCar = coupe;
      if (player && typeof player.enterCar === 'function') player.enterCar(coupe);
      if (police && typeof police.stageShot === 'function') police.stageShot('pursuit');
      if (traffic && typeof traffic.stageShot === 'function') traffic.stageShot('pursuit');
    }

    if (shotId === 'sunset') {
      // Rico on foot at the harbour, centre-frame, facing the camera.
      if (player && typeof player.setPosition === 'function') player.setPosition(194.3, -137.7, Math.PI / 2);
      // Teal coupe parked at the right of the frame.
      const teal = createTealCoupe(200, -142, 0);
      if (teal && teal.mesh) scene.add(teal.mesh);
      if (game) game.tealCoupe = teal;
      if (police && typeof police.stageShot === 'function') police.stageShot('sunset');
      if (traffic && typeof traffic.stageShot === 'function') traffic.stageShot('sunset');
    }

    return true;
  }

  return { stageShot, syncCarMesh, placeCar, SHOT_DEFS };
}
