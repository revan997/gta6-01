// Solmar Bay — Rico, the player character (W3, attempt #7, fresh build).
// On-foot movement, running animation, aiming/firing, entering and
// exiting cars. Written fresh for this recording from the round-9
// interface contract (W3 section) and the rebuild spec. Nothing copied
// from an old repo.
//
// Rico is 1.85 m tall. His pistol is 0.07 x 0.12 x 0.35, color
// 0x2a2a2a — DIFFERENT geometry from the officer pistol (0.09 x 0.14 x
// 0.42, 0x111111) so it never matches the officer-pistol filter
// (fix 6.5: the combat pistol count must be exactly 7).

import * as THREE from '../vendor/three.module.min.js';
import { WORLD_SEED, mulberry32 } from './random.js';

function toCallableRng(r) {
  if (typeof r === 'function') return r;
  if (r && typeof r.next === 'function') return () => r.next();
  if (r && typeof r.random === 'function') return () => r.random();
  if (typeof r === 'number') return mulberry32(r);
  return mulberry32(WORLD_SEED);
}

export const RICO_HEIGHT = 1.85;
export const RICO_PISTOL = { w: 0.07, h: 0.12, d: 0.35 };
export const RICO_PISTOL_COLOR = 0x2a2a2a;

function buildRicoMesh() {
  const g = new THREE.Group();
  g.name = 'rico';
  g.userData.kind = 'rico';
  const jacket = new THREE.MeshLambertMaterial({ color: 0x7a2a2a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const jeans = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
  const shoe = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 0.28), jacket);
  torso.position.y = 1.12;
  torso.name = 'rico-torso';
  torso.userData.kind = 'rico';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.27, 0.27), skin);
  head.position.y = 1.63;
  head.name = 'rico-head';
  head.userData.kind = 'rico';
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.1, 0.29), shoe);
  hair.position.y = 1.79;
  hair.name = 'rico-hair';
  hair.userData.kind = 'rico';
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.78, 0.18), jeans);
  legL.position.set(-0.13, 0.39, 0);
  legL.name = 'rico-leg-l';
  legL.userData.kind = 'rico';
  const legR = legL.clone();
  legR.position.x = 0.13;
  legR.name = 'rico-leg-r';
  legR.userData.kind = 'rico';
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.58, 0.13), jacket);
  armL.position.set(-0.32, 1.12, 0);
  armL.name = 'rico-arm-l';
  armL.userData.kind = 'rico';
  const armR = armL.clone();
  armR.position.x = 0.32;
  armR.name = 'rico-arm-r';
  armR.userData.kind = 'rico';
  // Rico's pistol: 0.07 x 0.12 x 0.35, 0x2a2a2a (NOT the officer size).
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(RICO_PISTOL.w, RICO_PISTOL.h, RICO_PISTOL.d),
    new THREE.MeshLambertMaterial({ color: RICO_PISTOL_COLOR }),
  );
  pistol.position.set(0.32, 1.2, -0.28);
  pistol.name = 'pistol';
  pistol.userData.kind = 'pistol';
  g.add(torso, head, hair, legL, legR, armL, armR, pistol);
  return { group: g, pistol, legL, legR, armL, armR, torso };
}

// createPlayer(ctx = {}) — OBJECT arg, never positional (contract §1).
export function createPlayer(ctx = {}) {
  const scene = ctx.scene || null;
  void toCallableRng(ctx.rng);
  const built = buildRicoMesh();
  const mesh = built.group;
  mesh.position.set(40, 0, -22);
  if (scene) scene.add(mesh);

  let _heading = 0;
  let _currentCar = null;
  let _health = 100;
  let _money = 4500;
  let _aiming = false;
  let _walkPhase = 0;
  let _moving = false;

  const player = {
    mesh,
    kind: 'rico',
    name: 'Rico',
    height: RICO_HEIGHT,
    pistol: built.pistol,
    get position() { return mesh.position; },
    get x() { return mesh.position.x; },
    get z() { return mesh.position.z; },
    get heading() { return _heading; },
    set heading(h) {
      _heading = h;
      if (!_currentCar) mesh.rotation.y = h;
    },
    get currentCar() { return _currentCar; },
    get health() { return _health; },
    set health(v) { _health = Math.max(0, Math.min(100, v)); },
    get money() { return _money; },
    set money(v) { _money = v; },
    get aiming() { return _aiming; },
    get moving() { return _moving; },

    setPosition(x, z, heading) {
      mesh.position.x = x;
      mesh.position.z = z;
      if (heading !== undefined) {
        _heading = heading;
        mesh.rotation.y = heading;
      }
      return player;
    },

    // Enter a car: Rico's mesh hides inside the car and the player
    // drives it. Called during staging for cover + pursuit (fix 6.2).
    enterCar(car) {
      if (!car) return player;
      _currentCar = car;
      mesh.visible = false;
      mesh.position.copy(car.mesh.position);
      return player;
    },
    exitCar() {
      if (!_currentCar) return player;
      const car = _currentCar;
      _currentCar = null;
      mesh.visible = true;
      mesh.position.set(car.mesh.position.x + 2.2, 0, car.mesh.position.z + 1.5);
      mesh.rotation.y = _heading;
      return player;
    },
    isInCar() { return _currentCar !== null; },

    aim(on) {
      _aiming = !!on;
      built.armR.rotation.x = _aiming ? -Math.PI / 2 : 0;
      return player;
    },
    fire() {
      if (_currentCar) return null;
      return { x: mesh.position.x, z: mesh.position.z, heading: _heading };
    },

    // Per-frame update: walk/run with a visible mid-stride cycle
    // (lean forward, one leg forward, arms pumping — never a T-pose).
    update(dt, input) {
      const step = dt === undefined ? 1 / 60 : dt;
      if (_currentCar) {
        // Driving is handled by the car; Rico rides along.
        mesh.position.copy(_currentCar.mesh.position);
        return player;
      }
      _moving = false;
      if (input) {
        const speed = (input.run ? 5.2 : 2.6) * step;
        let dx = 0;
        let dz = 0;
        if (input.forward) { dx += Math.sin(_heading); dz += Math.cos(_heading); }
        if (input.back) { dx -= Math.sin(_heading); dz -= Math.cos(_heading); }
        if (input.left) _heading += 2.4 * step;
        if (input.right) _heading -= 2.4 * step;
        if (dx !== 0 || dz !== 0) {
          _moving = true;
          const len = Math.hypot(dx, dz) || 1;
          mesh.position.x += (dx / len) * speed;
          mesh.position.z += (dz / len) * speed;
          _walkPhase += step * (input.run ? 11 : 7);
        }
      }
      mesh.rotation.y = _heading;
      // Mid-stride pose: legs swing opposite, arms pump, slight lean.
      const swing = _moving ? Math.sin(_walkPhase) * 0.55 : 0;
      built.legL.rotation.x = swing;
      built.legR.rotation.x = -swing;
      built.armL.rotation.x = -swing * 0.8;
      if (!_aiming) built.armR.rotation.x = swing * 0.8;
      built.torso.rotation.x = _moving ? 0.12 : 0;
      return player;
    },

    reset(x, z, heading) {
      _currentCar = null;
      mesh.visible = true;
      _health = 100;
      _aiming = false;
      return player.setPosition(x === undefined ? 40 : x, z === undefined ? -22 : z, heading === undefined ? 0 : heading);
    },
  };
  return player;
}

export default createPlayer;
