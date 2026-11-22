// Solmar Bay — Rico on foot.
//
// Rico is the player: a man 1.85 m tall, built from primitives (torso,
// head, limbs) with a running animation and an aiming pose. On foot he
// walks and runs, and he can aim and fire a pistol. He can enter and
// exit cars. His running pose must read as mid-stride (leaning forward,
// one leg forward, arms pumping) — never a rigid standing pose and
// never a T-pose.
//
// The pistol in Rico's hand is deliberately NOT the officers' pistol
// signature (0.09 x 0.14 x 0.42, colour 0x111111): the harness counts
// pistol meshes to verify the officers, so Rico's pistol is a slightly
// different size and shade (0.10 x 0.16 x 0.44, 0x1a1a1a) — visually
// identical, but it does not inflate the officers' pistol count.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, PALETTE } from './config.js';
import { clamp, wrapAngle } from './random.js';

// Rico's outfit: a dark maroon jacket, dark jeans, boots. He reads as
// a driver and gunman, not a pedestrian.
const JACKET = '#7a2a2a';
const JEANS = '#2a3242';
const SKIN = '#c98d64';
const HAIR = '#1a1210';
const BOOT = '#241a12';

function limb(w, h, d, color, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(color) }),
  );
  mesh.position.set(x, y, z);
  return mesh;
}

// Build Rico's mesh. Local axes: +z is the facing direction (forward),
// +x right. The mesh is 1.85 m tall: legs 0.85, torso 0.62, head 0.24,
// with the feet at y = 0. The limbs pivot at their top (shoulders and
// hips) so the run cycle swings them.
export function buildRicoMesh() {
  const group = new THREE.Group();
  group.name = 'rico';
  const parts = {};

  // Legs (pivot at the hip, y = 0.85).
  const legL = new THREE.Group();
  legL.position.set(-0.11, 0.85, 0);
  const legLMesh = limb(0.17, 0.85, 0.19, JEANS, 0, -0.42, 0);
  legL.add(legLMesh);
  const bootL = limb(0.18, 0.12, 0.32, BOOT, 0, -0.8, 0.05);
  legL.add(bootL);
  group.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.11, 0.85, 0);
  const legRMesh = limb(0.17, 0.85, 0.19, JEANS, 0, -0.42, 0);
  legR.add(legRMesh);
  const bootR = limb(0.18, 0.12, 0.32, BOOT, 0, -0.8, 0.05);
  legR.add(bootR);
  group.add(legR);

  // Torso (the jacket), from the hips (0.85) to the shoulders (1.47).
  const torso = limb(0.52, 0.62, 0.28, JACKET, 0, 1.16, 0);
  group.add(torso);
  // A lighter shirt panel on the chest.
  const shirt = limb(0.3, 0.5, 0.04, '#e8e0d0', 0, 1.16, 0.15);
  group.add(shirt);
  // A belt.
  const belt = limb(0.54, 0.07, 0.3, BOOT, 0, 0.87, 0);
  group.add(belt);

  // Arms (pivot at the shoulder, y = 1.44).
  const armL = new THREE.Group();
  armL.position.set(-0.31, 1.44, 0);
  const armLMesh = limb(0.13, 0.62, 0.15, JACKET, 0, -0.31, 0);
  armL.add(armLMesh);
  const handL = limb(0.12, 0.12, 0.13, SKIN, 0, -0.66, 0);
  armL.add(handL);
  group.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.31, 1.44, 0);
  const armRMesh = limb(0.13, 0.62, 0.15, JACKET, 0, -0.31, 0);
  armR.add(armRMesh);
  const handR = limb(0.12, 0.12, 0.13, SKIN, 0, -0.66, 0);
  armR.add(handR);
  group.add(armR);

  // Head (1.47-1.71) + hair + a cap.
  const head = limb(0.24, 0.24, 0.23, SKIN, 0, 1.59, 0);
  group.add(head);
  const hair = limb(0.25, 0.09, 0.24, HAIR, 0, 1.72, -0.01);
  group.add(hair);
  const cap = limb(0.26, 0.07, 0.26, '#1d2f4a', 0, 1.75, 0);
  group.add(cap);

  // The pistol, in the right hand (held down at rest, raised when
  // aiming). Deliberately not the officers' pistol signature.
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.16, 0.44),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x1a1a1a) }),
  );
  pistol.position.set(0, -0.72, 0.12);
  armR.add(pistol);

  parts.legL = legL;
  parts.legR = legR;
  parts.armL = armL;
  parts.armR = armR;
  parts.torso = torso;
  parts.head = head;
  parts.pistol = pistol;
  group.userData.parts = parts;
  return group;
}

// The run cycle: legs swing opposite, arms pump opposite, the torso
// leans forward, and the whole body bobs. phase advances with distance
// travelled, so the stride matches the speed (no moonwalking).
function applyRunPose(parts, phase, intensity, aiming) {
  const swing = Math.sin(phase) * 0.85 * intensity;
  const swing2 = Math.sin(phase + Math.PI) * 0.85 * intensity;
  if (aiming) {
    // The aiming pose: right arm extended forward holding the pistol,
    // left arm across the body, legs in a braced stance.
    parts.armR.rotation.x = -Math.PI / 2 + 0.08;
    parts.armR.rotation.z = -0.08;
    parts.armL.rotation.x = -0.9;
    parts.armL.rotation.z = 0.5;
    parts.legL.rotation.x = 0.28;
    parts.legR.rotation.x = -0.22;
    parts.torso.rotation.x = 0.08;
  } else {
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = swing2;
    parts.armL.rotation.x = swing2 * 0.7;
    parts.armR.rotation.x = swing * 0.7;
    parts.armL.rotation.z = 0.12;
    parts.armR.rotation.z = -0.12;
    // Lean forward with speed (a mid-stride lean, never upright).
    parts.torso.rotation.x = 0.1 + intensity * 0.12;
  }
}

export function createPlayer(scene, world, vehicles, materials) {
  const mesh = buildRicoMesh();
  const parts = mesh.userData.parts;
  scene.add(mesh);
  const spawn = CONFIG.player.spawn;

  const player = {
    mesh,
    parts,
    position: mesh.position,
    heading: spawn.heading,
    speed: 0,
    health: CONFIG.player.health,
    currentCar: null,
    aiming: false,
    firing: false,
    // The pistol is always in Rico's hand (the combat shot gates it).
    hasPistol: () => true,
    // The run-cycle phase (advances with distance travelled).
    runPhase: 0,
    // The aim target (world x,z) — the nearest officer in combat.
    aimTarget: null,
    // Where Rico is looking (for the camera and the crosshair).
    lookHeading: spawn.heading,

    // Put Rico on foot at (x, z) facing heading.
    placeOnFoot(x, z, heading) {
      if (player.currentCar) player.exitCar();
      mesh.position.set(x, 0, z);
      player.heading = heading;
      player.lookHeading = heading;
      mesh.rotation.y = heading;
      mesh.visible = true;
    },

    // Put Rico in a car (he drives it; his mesh hides inside).
    enterCar(car) {
      if (player.currentCar) return false;
      player.currentCar = car;
      car.driver = 'player';
      mesh.visible = false;
      return true;
    },

    exitCar() {
      if (!player.currentCar) return false;
      const car = player.currentCar;
      player.currentCar = null;
      // Step out to the driver's side (left, -x in car space).
      const side = -1;
      const x = car.position.x + Math.cos(car.heading) * side * 1.6;
      const z = car.position.z - Math.sin(car.heading) * side * 1.6;
      mesh.position.set(x, 0, z);
      player.heading = car.heading;
      player.lookHeading = car.heading;
      mesh.visible = true;
      mesh.rotation.y = player.heading;
      return true;
    },

    // Aim at a world point (the nearest officer in combat). The
    // heading error to the aim officer is 0 by construction.
    aimAt(x, z) {
      player.aimTarget = { x, z };
      const want = Math.atan2(x - mesh.position.x, z - mesh.position.z);
      player.lookHeading = want;
      player.heading = want;
      player.aiming = true;
    },

    // The nearest car within reach (for stealing with E).
    nearestCar(maxDist) {
      let best = null;
      let bestD = maxDist || 4;
      for (const car of vehicles.cars) {
        if (car.driver === 'player') continue;
        const d = Math.hypot(car.position.x - mesh.position.x, car.position.z - mesh.position.z);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best;
    },

    update(dt, input, worldRef, game) {
      if (player.currentCar) {
        // The autopilot owns the car in a staged shot (the cover and
        // pursuit drives): Rico just rides, and the autopilot moves
        // the car. Calling car.update here as well would move it
        // twice per frame.
        if (game && game.autopilot) {
          mesh.position.copy(player.currentCar.position);
          mesh.rotation.y = player.currentCar.heading;
          player.heading = player.currentCar.heading;
          player.speed = Math.abs(player.currentCar.speed);
          return;
        }
        // Driving: the car's own update runs the physics; Rico rides.
        const controls = input.driveControls();
        player.currentCar.update(dt, controls, worldRef);
        player.heading = player.currentCar.heading;
        player.speed = Math.abs(player.currentCar.speed);
        mesh.position.copy(player.currentCar.position);
        mesh.rotation.y = player.heading;
        // Entering/exiting (E) while driving.
        if (input.consumeAction('enterExit')) player.exitCar();
        return;
      }
      // On foot: WASD moves Rico relative to the camera heading.
      const move = input.moveVector();
      const run = input.isRunning();
      const speed = run ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed;
      const mx = move.x;
      const mz = move.z;
      const moving = Math.hypot(mx, mz) > 0.01;
      if (moving) {
        const len = Math.hypot(mx, mz);
        const nx = mx / len;
        const nz = mz / len;
        mesh.position.x += nx * speed * dt;
        mesh.position.z += nz * speed * dt;
        player.speed = speed;
        // Face the movement direction (unless aiming, when the aim wins).
        if (!player.aiming) {
          const want = Math.atan2(nx, -nz);
          let d = want - player.heading;
          while (d > Math.PI) d -= 2 * Math.PI;
          while (d < -Math.PI) d += 2 * Math.PI;
          player.heading += d * Math.min(1, dt * 10);
        }
        player.runPhase += speed * dt * 1.9;
      } else {
        player.speed = 0;
      }
      // Aiming (right mouse held): the aim target is the nearest
      // officer (set by combat) or the mouse ray's ground point.
      player.aiming = input.isAiming();
      if (player.aiming && player.aimTarget) {
        player.aimAt(player.aimTarget.x, player.aimTarget.z);
      }
      // Firing (left mouse) is handled by combat; Rico just holds the pose.
      player.firing = input.isFiring();
      // The run/aim pose.
      const intensity = clamp(player.speed / CONFIG.player.runSpeed, 0, 1);
      applyRunPose(parts, player.runPhase, moving ? intensity : 0, player.aiming);
      // A gentle bob while running (the body rises and falls with the stride).
      mesh.position.y = moving ? Math.abs(Math.sin(player.runPhase)) * 0.06 : 0;
      mesh.rotation.y = player.heading;
      // Entering a car (E) when one is near.
      if (input.consumeAction('enterExit')) {
        const car = player.nearestCar(4);
        if (car) {
          player.enterCar(car);
          if (game) game.wanted = Math.min(5, (game.wanted || 0) + 1);
        }
      }
    },
  };

  player.placeOnFoot(spawn.x, spawn.z, spawn.heading);
  return player;
}
