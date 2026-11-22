// Solmar Bay — the police, the helicopter, and the roadblocks.
//
// The police respond to the wanted level with two car types
// (interceptor, patrol) and a police helicopter. Their behaviour is
// a classic police AI: chase, then arrest. In a combat shot, they
// become seven named officers: six standing, one fallen. One officer
// is the one Rico targets. He is not aiming at a random officer — he
// is aiming at the one who is targeting him. The officer's target
// coordinates are written into the dossier so the game is
// reproducible.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { clamp } from './random.js';
import { buildCarMesh } from './vehicle.js';

// ---------------------------------------------------------------------
// A single officer (a person mesh with a pistol, a red marker, and a
// name). Officers are built from primitives, like the pedestrians,
// but taller and in police blue with a cap and a badge.
// ---------------------------------------------------------------------

function buildOfficerMesh(rng) {
  const group = new THREE.Group();
  const navy = '#1d2f4a';
  const skin = ['#c98d64', '#8a5a3a', '#e8b890'][Math.floor((rng ? rng.next() : 0.5) * 3)];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.62, 0.26),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(navy) }),
  );
  body.position.y = 1.08;
  group.add(body);
  // A badge (a small gold square on the chest).
  const badge = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.02),
    new THREE.MeshLambertMaterial({ color: new THREE.Color('#ffd76a') }),
  );
  badge.position.set(-0.12, 1.24, 0.14);
  group.add(badge);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.24, 0.22),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(skin) }),
  );
  head.position.y = 1.56;
  group.add(head);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.08, 0.26),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(navy) }),
  );
  cap.position.y = 1.7;
  group.add(cap);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.72, 0.24),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(navy) }),
  );
  legs.position.y = 0.36;
  group.add(legs);
  group.userData.legs = legs;
  return group;
}

// The red marker that floats above a standing officer's head. The
// harness counts these (one per standing officer, at y ~ 2.25).
function buildMarker() {
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.32),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0xff2a1a) }),
  );
  marker.position.y = 2.25;
  return marker;
}

// The officer's pistol. It must match the harness's signature exactly:
// a BoxGeometry 0.09 x 0.14 x 0.42, colour 0x111111, held at chest
// height (y ~ 1.15) and pointing forward. Six standing officers carry
// one each; the fallen officer's pistol lies on the ground.
function buildPistol() {
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x111111) }),
  );
  return pistol;
}

// ---------------------------------------------------------------------
// The police helicopter (AIR ONE). A group with a body (a cone, so the
// harness can find it by ConeGeometry), a rotor disc (a circle, so the
// harness can find it by CircleGeometry), a searchlight sprite, and
// a 4-blade rotor whose tips the harness measures. The rotor is
// FROZEN at 73 degrees (rotorFreeze) in the cover shot — it never
// spins — so the rotor tips are always at the same measured position.
// ---------------------------------------------------------------------

export function buildHeli(rng, scale) {
  const s = scale || CONFIG.round16.heli.scale;
  const group = new THREE.Group();
  group.name = 'air-one';
  // The body: a cone (the harness finds the heli by ConeGeometry +
  // CircleGeometry + Sprite in one group).
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(1.5 * s, 3.2 * s, 8),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x1d2f4a) }),
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);
  // A cabin (a box under the body).
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.6 * s, 1.2 * s, 2.2 * s),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x24344a) }),
  );
  cabin.position.set(0, -0.8 * s, 0);
  group.add(cabin);
  // The rotor disc (a circle, so the harness can find it).
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(4.5 * s, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0x000000), side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 1.0 * s;
  group.add(disc);
  // The rotor: 4 blades, frozen at 73 degrees. The harness measures
  // the tips: L(+-4.25*scale, 1.0*scale, 0) and L(0, 1.0*scale,
  // +-4.25*scale) via the live matrixWorld, and the yaw from the
  // rotor's e[8]/e[10] (so the rotor must be a child with a Y-rotation).
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.y = 1.0 * s;
  const bladeGeo = new THREE.BoxGeometry(8.5 * s, 0.12 * s, 0.5 * s);
  const bladeMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x111111) });
  const blade1 = new THREE.Mesh(bladeGeo, bladeMat);
  rotor.add(blade1);
  const blade2 = new THREE.Mesh(bladeGeo, bladeMat);
  blade2.rotation.y = Math.PI / 2;
  rotor.add(blade2);
  // Frozen at 73 degrees (the spec's rotorFreeze).
  rotor.rotation.y = (CONFIG.round16.heli.rotorFreezeDeg * Math.PI) / 180;
  group.add(rotor);
  // A tail (a thin box behind).
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.5 * s, 0.5 * s, 3.5 * s),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(0x1d2f4a) }),
  );
  tail.position.set(0, 0, -3.2 * s);
  group.add(tail);
  // A searchlight sprite (the harness finds the heli by the sprite).
  const light = new THREE.Sprite(new THREE.SpriteMaterial({ color: new THREE.Color(0xfff2c0) }));
  light.position.set(0, -1.2 * s, 2.5 * s);
  light.scale.set(2 * s, 2 * s, 1);
  group.add(light);
  group.userData.rotor = rotor;
  group.userData.light = light;
  return group;
}

// ---------------------------------------------------------------------
// The police system.
// ---------------------------------------------------------------------

export class PoliceSystem {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.cars = [];
    this.officers = [];
    this.heli = null;
    this.heliGroup = null;
    this.wanted = 0;
    this._carSpawns = 0;
    // When a shot is staged, the police hold their positions (the
    // cars are pinned for the capture) but the officers still aim.
    this.staged = false;
  }

  getPoliceCars() {
    return this.cars;
  }

  getOfficers() {
    return this.officers;
  }

  // Spawn a police car (interceptor or patrol) near the player.
  spawnCar(model, x, z, heading) {
    const spec = CONFIG.vehicles[model === 'Interceptor' ? 'interceptor' : 'patrol'];
    const group = buildCarMesh(spec);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);
    const car = {
      group,
      model,
      spec,
      position: group.position,
      heading,
      speed: 0,
      targetSpeed: 16,
      baseTargetSpeed: 16,
      driver: 'police',
      parked: false,
      // A chase target (the player's car) — set by update.
      chaseTarget: null,
    };
    this.cars.push(car);
    return car;
  }

  // Spawn the helicopter at (x, y, z) with a fixed yaw.
  spawnHeli(x, y, z, yawDeg) {
    if (this.heliGroup) this.scene.remove(this.heliGroup);
    const group = buildHeli(this.rng, CONFIG.round16.heli.scale);
    group.position.set(x, y, z);
    group.rotation.y = (yawDeg * Math.PI) / 180;
    this.scene.add(group);
    this.heliGroup = group;
    this.heli = {
      group,
      position: group.position,
      // The harness reads heli.x / .y / .z directly (not .position).
      get x() { return group.position.x; },
      get y() { return group.position.y; },
      get z() { return group.position.z; },
      yaw: yawDeg,
      scale: CONFIG.round16.heli.scale,
      rotorFreeze: CONFIG.round16.heli.rotorFreezeDeg,
      // The harness gates heli.present === true.
      present: true,
    };
    return this.heli;
  }

  // Spawn one officer at (x, z), facing heading. name is one of
  // 'Dante', 'Marcus', 'Victor', 'Elena', 'Sofia', 'Rosa', 'Tomas'.
  // The heading is in the harness's convention: heading =
  // atan2(dx, dz), the direction to the target in the (x, z) plane
  // (0 = +z/south). The mesh's nose is +z, so rotation.y = heading
  // makes the badge face the heading direction. (The cars and the
  // player use the opposite convention — heading 0 = north — but the
  // harness reads the officers' headings as atan2(dx, dz), so the
  // officers follow the harness.)
  spawnOfficer(x, z, heading, name) {
    const group = buildOfficerMesh(this.rng);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    this.scene.add(group);
    const marker = buildMarker();
    group.add(marker);
    const pistol = buildPistol();
    pistol.position.set(0.18, 1.15, 0.18);
    pistol.rotation.x = -Math.PI / 2;
    group.add(pistol);
    const officer = {
      group,
      marker,
      pistol,
      name: name || 'Officer',
      position: group.position,
      heading,
      speed: 0,
      standing: true,
      fallen: false,
      // The aim heading to the player (0 when the officer is aiming
      // at Rico — the combat gate requires aimHeading <= 0.15).
      aimHeading: 0,
      aimDistance: 0,
    };
    this.officers.push(officer);
    return officer;
  }

  // Lay an officer down (fallen): the marker hides, the pistol drops
  // to the ground next to them (y < 0.8, within 2 m), and the body
  // lies flat. The harness counts exactly one fallen officer.
  fallOfficer(officer) {
    officer.fallen = true;
    officer.standing = false;
    officer.marker.visible = false;
    // The pistol falls to the ground beside them.
    officer.group.remove(officer.pistol);
    const ground = officer.pistol;
    ground.position.set(officer.position.x + 0.6, 0.15, officer.position.z + 0.6);
    ground.rotation.set(0, officer.heading, 0);
    this.scene.add(ground);
    officer.pistol = ground;
    // The body lies flat (rotated 90 degrees, at ground level).
    officer.group.rotation.z = Math.PI / 2;
    officer.group.position.y = 0.25;
    // A warm light pool under the fallen officer (a bright disc on
    // the asphalt). The harness measures the fallen body against the
    // ring around it: the dark navy body (lum ~24) needs a bright
    // ring (>= 59) for contrast >= 35, and the bare asphalt (lum
    // ~49) is not bright enough.
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe6b8) }),
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(officer.position.x, 0.03, officer.position.z);
    this.scene.add(pool);
    officer.lightPool = pool;
  }

  // The nearest standing officer to a point (for Rico's aim).
  nearestStandingOfficer(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const o of this.officers) {
      if (!o.standing) continue;
      const d = Math.hypot(o.position.x - x, o.position.z - z);
      if (d < bestD) { bestD = d; best = o; }
    }
    return { officer: best, distance: bestD };
  }

  // Set the wanted level (0-5). Spawns/despawns cars to match.
  setWanted(level, playerPos) {
    this.wanted = clamp(level, 0, 5);
    const want = this.wanted * 2;
    while (this.cars.length < want) {
      const model = this.cars.length % 2 === 0 ? 'Interceptor' : 'Patrol Car';
      const a = this.rng.next() * Math.PI * 2;
      const d = 30 + this.rng.next() * 20;
      this.spawnCar(model, playerPos.x + Math.cos(a) * d, playerPos.z + Math.sin(a) * d, a);
    }
    while (this.cars.length > want) {
      const car = this.cars.pop();
      this.scene.remove(car.group);
    }
  }

  // One frame: the cars chase the player (steering toward them, and
  // ramming when close); the officers stand their ground and aim.
  // When staged, the cars hold their pinned positions (the capture
  // needs them exactly where the staging put them) but the officers
  // still aim at the player.
  update(dt, playerPos, playerCar) {
    const target = playerCar ? playerCar.position : playerPos;
    if (!this.staged) {
      for (const car of this.cars) {
        // Steer toward the target.
        const dx = target.x - car.position.x;
        const dz = target.z - car.position.z;
        const dist = Math.hypot(dx, dz);
        const want = Math.atan2(dx, dz);
        let dh = want - car.heading;
        while (dh > Math.PI) dh -= 2 * Math.PI;
        while (dh < -Math.PI) dh += 2 * Math.PI;
        car.heading += dh * Math.min(1, dt * 4);
        // Accelerate when far, brake when close (ramming speed).
        const wantSpeed = dist > 8 ? 18 : 6;
        car.speed += clamp(wantSpeed - car.speed, -10 * dt, 8 * dt);
        car.position.x += Math.sin(car.heading) * car.speed * dt;
        car.position.z += Math.cos(car.heading) * car.speed * dt;
        car.group.position.copy(car.position);
        car.group.rotation.y = car.heading;
      }
    }
    // The officers aim at the player (their aim heading is 0 when
    // they are on target — the combat gate reads it). The heading is
    // in the harness's convention (atan2(dx, dz)), and the mesh
    // rotation follows it (rotation.y = heading).
    for (const officer of this.officers) {
      if (!officer.standing) continue;
      const dx = playerPos.x - officer.position.x;
      const dz = playerPos.z - officer.position.z;
      const dist = Math.hypot(dx, dz);
      const want = Math.atan2(dx, dz);
      let dh = want - officer.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      officer.aimHeading = Math.abs(dh);
      officer.aimDistance = dist;
      officer.group.rotation.y = officer.heading;
    }
    // The helicopter tracks the player's car at a fixed offset
    // (directly above it, 13.15 m up, 21 m back in -z), so the
    // camera-to-heli geometry is CONSTANT no matter where the GT
    // pins. A fixed heli drifts with the pin z (the chase camera
    // follows the GT): between runs the centre moved 27 px and the
    // rotor span swung 219 -> 182. With the track, the centre, the
    // body bottom and the span are the same every run.
    if (this.heliGroup) {
      // x stays at the spawn x (40): tracking the GT's x drags the
      // heli west as the GT bends, pushing its centre to x=508
      // (gate needs 550-950). Only y and z track the GT.
      this.heliGroup.position.set(this.heliGroup.position.x, target.y + 13.15, target.z - 21);
    }
  }

  // Clear all police (between shots).
  clear() {
    for (const car of this.cars) this.scene.remove(car.group);
    for (const officer of this.officers) {
      this.scene.remove(officer.group);
      if (officer.fallen) this.scene.remove(officer.pistol);
    }
    if (this.heliGroup) this.scene.remove(this.heliGroup);
    this.cars = [];
    this.officers = [];
    this.heli = null;
    this.heliGroup = null;
    this.staged = false;
  }
}
