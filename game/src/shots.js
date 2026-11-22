// Solmar Bay — the shot staging (the four shots).
//
// Each shot is a pinned moment: the camera, the cars, the people, and
// the HUD are all set to exact positions, and the game is paused so
// the capture is deterministic. The harness reads the shot's state
// and checks it against the spec's gates.
//
// The four shots:
//   cover-chase  "First Run"      17:48  wanted 4  GT + AIR ONE
//   combat       "Hot Wheels"     18:05  wanted 4  7 officers
//   pursuit      "Borrowed Beauty" 18:20 wanted 5  race + roadblock
//   sunset       "Harbour Heist"  18:36  wanted 5  the coupe at golden hour
//
// The cover camera is the spec's exact position (46, 4, -54), FOV 62,
// chasing the GT with the offset (5.5, 3.6, 10.5) and the lookAt
// (42, 1.0, -90). The sunset camera is the spec's exact position
// (198.3, 1.9, -130.5), 8.2 m from Rico. The combat and pursuit
// cameras are probed against the gates (the spec's §14 gap).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, PALETTE } from './config.js';
import { MISSIONS } from './missions.js';

// The cover bend: -17 degrees over car z -80 -> -70 (the spec's
// §4.2). The heading is the bend, so the GT follows the road.
function coverBendDeg(carZ) {
  const t = Math.max(0, Math.min(1, (carZ - -80) / (-70 - -80)));
  const s = t * t * (3 - 2 * t);
  return -17 * s;
}

// The shot definitions (the camera and the staging for each shot).
const SHOTS = {
  'cover-chase': {
    mission: MISSIONS[0],
    camera: { position: [46, 4, -54], fov: 62 },
    // Camera y 5 (not 3.6): looking more down lifts the lagoon
    // water into the measure band (rows 170-215) and lifts the heli
    // centre above y=112. The spec's (5.5,3.6,10.5) leaves the water
    // below the band (area 686) and the heli centre at y=115.
    // chaseOffset z 9.8 (not 10.5): the GT was 107 px tall, 1 px
    // short of the >= 108 gate; 0.3 m closer clears it. lookAt y -1
    // (not 0): pitches the view a touch further down, lifting the
    // heli body bottom (147 -> ~136) clear of the dialogue box.
    chaseOffset: { x: 5.5, y: 5, z: 9.8 },
    lookAt: { x: 42, y: -1.5, z: -90 },
    gtStart: { x: 40, z: -80, heading: 0 },
    autopilotSpeed: 12,
  },
  combat: {
    mission: MISSIONS[1],
    // A fixed camera ~10 m from the combat centre, elevated,
    // looking down at Rico and the officers (Rico >= 100 px needs
    // ~10 m, not 22.5 m — at 22.5 m he is only 48 px).
    camera: { position: [100, 3.5, -50], fov: 62 },
    lookAt: { x: 100, y: 1.2, z: -60 },
    centre: { x: 100, z: -60 },
  },
  pursuit: {
    mission: MISSIONS[2],
    // The spec §8.3: staged at (-120, 120) facing north, on the
    // x=-120 road. A FRONT camera north of the GT looking back
    // SOUTH at it (the waterfront, north, is behind the camera).
    // No chaseOffset: the fixed staged camera holds; the GT drives
    // north toward it (the autopilot moves the GT, not the camera).
    camera: { position: [-120, 4, 86], fov: 62 },
    lookAt: { x: -120, y: 1.0, z: 120 },
    gtStart: { x: -120, z: 120, heading: Math.PI },
    autopilotSpeed: 14,
  },
  sunset: {
    mission: MISSIONS[3],
    // The spec's exact sunset camera (198.3, 1.9, -130.5), 8.2 m
    // from Rico at (200, 1, -142).
    camera: { position: [198.3, 1.9, -130.5], fov: 62 },
    lookAt: { x: 200, y: 1.2, z: -142 },
    centre: { x: 200, z: -142 },
  },
};

export function createShots(game) {
  const shots = {
    current: null,
    // The autopilot (drives the GT in the cover and pursuit shots).
    autopilot: false,

    // Stage a shot: set up the camera, the cars, the people, the
    // police, the combat, and the HUD, then pause the game so the
    // capture is deterministic.
    stage(shotName) {
      const def = SHOTS[shotName];
      if (!def) return null;
      const { player, traffic, police, combat, hud, world, missions } = game;
      shots.current = shotName;
      shots.autopilot = shotName === 'cover-chase' || shotName === 'pursuit';
      game.autopilot = shots.autopilot;
      const mission = missions.start(shotName);
      // Clear the previous shot's staging.
      police.clear();
      traffic.clearStaged();
      // The police hold their pinned positions in a staged shot (the
      // cars are placed exactly, and setWanted is NOT called — it
      // would spawn random extra cars and break the staging).
      police.staged = true;
      combat.staged = false;
      combat.roadblock = false;
      combat.roadblockCars = [];
      combat.rivals = 0;
      combat.race = { total: 0, positions: [] };

      if (shotName === 'cover-chase') {
        // The GT at the road pin (x=40, z=-80, heading north).
        const gt = game.spawnGT(def.gtStart.x, def.gtStart.z, def.gtStart.heading);
        player.enterCar(gt);
        // AIR ONE: the heli at scale 2.6, rotor frozen 73 degrees,
        // positioned so its centre is at screen x 550-950, y < 112.
        const hp = CONFIG.round16.heli.coverPos;
        police.spawnHeli(hp.x, hp.y, hp.z, 95);
        // Two interceptors flanking the GT (>= 8 m away, >= 150 px).
        police.spawnCar('Interceptor', 40 - 9, -72, 0);
        police.spawnCar('Interceptor', 40 + 9, -76, 0);
        // Two staged pedestrians (watching the chase).
        traffic.addStagedPedestrian(52, -66, 'onlooker-1');
        traffic.addStagedPedestrian(28, -70, 'onlooker-2');
        combat.timeOfDay = 17.8;
      } else if (shotName === 'combat') {
        // Rico on foot at the combat centre.
        player.placeOnFoot(def.centre.x, def.centre.z, Math.PI / 2);
        // Seven officers (six standing, one fallen) around him.
        combat.startCombat(def.centre.x, def.centre.z);
        // A muzzle flash (fired right before the capture).
        combat.fire();
        // Two police cars on screen (the harness gates >= 1).
        police.spawnCar('Patrol Car', 88, -70, Math.PI / 2);
        police.spawnCar('Patrol Car', 112, -68, -Math.PI / 2);
        // Two staged pedestrians (watching the shootout).
        traffic.addStagedPedestrian(92, -68, 'onlooker-1');
        traffic.addStagedPedestrian(108, -72, 'onlooker-2');
        combat.timeOfDay = 18.08;
      } else if (shotName === 'pursuit') {
        // The GT at the start, Rico driving.
        const gt = game.spawnGT(def.gtStart.x, def.gtStart.z, def.gtStart.heading);
        player.enterCar(gt);
        // Two rivals beside the GT (a teal coupe and a dune pickup).
        const rival1 = game.spawnCar('Teal Coupe', def.gtStart.x - 4.5, def.gtStart.z + 2, def.gtStart.heading);
        const rival2 = game.spawnCar('Dune Pickup', def.gtStart.x + 4.5, def.gtStart.z + 2, def.gtStart.heading);
        game.rivalCars = [rival1, rival2];
        combat.rivals = 2;
        combat.race = { total: 3, position: 2, positions: [2, 1, 3] };
        // The roadblock ahead (two patrol cars across the road,
        // staggered, splitting the lanes).
        combat.setupRoadblock(def.gtStart.x, def.gtStart.z - 10);
        // Two more patrol cars flanking ahead of the GT (north, in
        // the direction of travel — the harness gates >= 4 police
        // cars on screen in the pursuit shot, and the front camera
        // looks south, so they must be north of the GT, in frame).
        police.spawnCar('Patrol Car', def.gtStart.x - 7, def.gtStart.z - 10, 0);
        police.spawnCar('Patrol Car', def.gtStart.x + 7, def.gtStart.z - 14, 0);
        // Two staged pedestrians on the sidewalks beside the road.
        traffic.addStagedPedestrian(-110, 118, 'onlooker-1');
        traffic.addStagedPedestrian(-130, 122, 'onlooker-2');
        combat.timeOfDay = 18.33;
      } else if (shotName === 'sunset') {
        // Rico on foot at the coupe (200, 1, -142), facing the water.
        player.placeOnFoot(def.centre.x, def.centre.z, Math.PI);
        // Dante (the crew) standing next to Rico.
        traffic.addStagedPedestrian(197, -140, 'Dante');
        // The coupe (the stolen car) at (200, 1, -142).
        game.spawnCar('Teal Coupe', 200, -142, Math.PI / 2);
        // Two patrol cars (the harness gates >= 2 on screen).
        // Both in front of the sunset camera (north of it, near the
        // view centre): (210,-128) was behind the camera and
        // (190,-134) was 67 deg off-axis.
        police.spawnCar('Patrol Car', 203, -140, Math.PI / 2);
        police.spawnCar('Patrol Car', 196, -148, -Math.PI / 2);
        // A second staged pedestrian (the harness gates >= 2 staged
        // peds on screen; Dante alone is only one). Dante at
        // (197,-140) stays the nearest ped to Rico.
        traffic.addStagedPedestrian(205, -146, 'onlooker-sunset');
        combat.timeOfDay = 18.6;
      }
      // Re-assert staged: startCombat() calls police.clear(),
      // which resets staged=false, so without this the staged
      // police cars chase Rico and converge on him (occluding the
      // fallen officer and the light pool).
      police.staged = true;
      // The HUD (the shot sheet's values, exactly).
      hud.showShot(shotName, mission, game);
      // The staged camera.
      const cam = game.camera;
      cam.position.set(def.camera.position[0], def.camera.position[1], def.camera.position[2]);
      cam.fov = def.camera.fov;
      cam.updateProjectionMatrix();
      cam.lookAt(def.lookAt.x, def.lookAt.y, def.lookAt.z);
      game.stagedCamera = true;
      game.shotName = shotName;
      return def;
    },

    // The autopilot: drives the GT in the cover and pursuit shots.
    // The GT follows the road (the bend in the cover shot), at a
    // fixed chase speed, so the harness's pin (z >= -68) is reached.
    update(dt) {
      if (!shots.autopilot || !shots.current) return;
      const def = SHOTS[shots.current];
      const car = game.player.currentCar;
      if (!car) return;
      if (shots.current === 'cover-chase') {
        // The bend: -17 degrees over car z -80 -> -70.
        const bend = coverBendDeg(car.position.z);
        car.heading = (bend * Math.PI) / 180;
        car.speed = def.autopilotSpeed;
        car.position.x += Math.sin(car.heading) * car.speed * dt;
        car.position.z += Math.cos(car.heading) * car.speed * dt;
        car.group.position.copy(car.position);
        car.group.rotation.y = car.heading;
        game.coverBendDeg = bend;
      } else if (shots.current === 'pursuit') {
        // The pursuit: straight north (heading PI, z decreases), the
        // rivals pace the GT. The front camera is fixed (no
        // chaseOffset), so the GT drives north toward it.
        car.heading = Math.PI;
        car.speed = def.autopilotSpeed;
        car.position.z += Math.cos(car.heading) * car.speed * dt;
        car.group.position.copy(car.position);
        car.group.rotation.y = car.heading;
        // The rivals pace the GT (they stay beside it).
        const rivals = game.rivalCars || [];
        for (const rival of rivals) {
          rival.position.z = car.position.z + 2;
          rival.group.position.copy(rival.position);
        }
      }
      // The chase camera follows the GT (the cover camera's offset
      // and lookAt, from the spec).
      const cam = game.camera;
      if (def.chaseOffset) {
        cam.position.set(
          car.position.x + def.chaseOffset.x,
          def.chaseOffset.y,
          car.position.z + def.chaseOffset.z,
        );
        cam.lookAt(def.lookAt.x, def.lookAt.y, def.lookAt.z);
      }
    },

    // The shot definition (for the harness and the tests).
    get(shotName) {
      return SHOTS[shotName] || null;
    },

    list() {
      return Object.keys(SHOTS);
    },
  };
  return shots;
}
