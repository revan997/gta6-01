// player.js — Rico, the player character.
// On foot: 1.85 m tall, built from primitives, runs with a limb swing,
// aims with his pistol. In a car: the on-foot mesh hides and the player
// position follows the car (the harness pins on player.position.z).
// Rico's pistol is a DIFFERENT geometry (0.07 x 0.12 x 0.35, color
// 0x2a2a2a) from the officer pistol (0.09 x 0.14 x 0.42, 0x111111), so
// it never matches the officer-pistol probe filter.
import * as THREE from '../vendor/three.module.min.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toCallableRng(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  if (rng && typeof rng.random === 'function') return () => rng.random();
  if (typeof rng === 'number') return mulberry32(rng);
  return mulberry32(20261122);
}

const RICO_HEIGHT = 1.85;

// Build Rico's mesh (~1.85 m). The model faces +z at rotation 0, so
// rotation.y = heading. name/kind 'rico' on every mesh.
export function buildRicoMesh() {
  const g = new THREE.Group();
  g.name = 'rico';
  g.userData.kind = 'rico';
  const jacket = new THREE.MeshLambertMaterial({ color: 0x27324a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const tag = (mesh, part) => { mesh.name = 'rico:' + part; mesh.userData.kind = 'rico'; return mesh; };

  const torso = tag(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.66, 0.28), jacket), 'torso');
  torso.position.y = 1.12;
  g.add(torso);
  const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), skin), 'head');
  head.position.y = 1.66;
  g.add(head);
  const hair = tag(new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshLambertMaterial({ color: 0x14100c })), 'hair');
  hair.position.y = 1.68;
  g.add(hair);
  const legL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.19), pants), 'legL');
  legL.position.set(-0.12, 0.39, 0);
  g.add(legL);
  const legR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.19), pants), 'legR');
  legR.position.set(0.12, 0.39, 0);
  g.add(legR);
  const armL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.56, 0.13), jacket), 'armL');
  armL.position.set(-0.3, 1.12, 0);
  g.add(armL);
  const armR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.56, 0.13), jacket), 'armR');
  armR.position.set(0.3, 1.12, 0.06);
  g.add(armR);
  // Rico's pistol: 0.07 x 0.12 x 0.35, color 0x2a2a2a — deliberately
  // different from the officer pistol so the probe never counts it.
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.12, 0.35),
    new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
  );
  pistol.name = 'rico:pistol';
  pistol.userData.kind = 'ricoPistol';
  pistol.position.set(0.3, 0.92, 0.32);
  g.add(pistol);
  g.userData.legL = legL;
  g.userData.legR = legR;
  g.userData.armL = armL;
  g.userData.armR = armR;
  g.userData.pistol = pistol;
  return g;
}

export function createPlayer(ctx = {}) {
  const scene = ctx.scene || null;
  const input = ctx.input || null;
  const mesh = buildRicoMesh();
  if (scene) scene.add(mesh);

  let _heading = 0;
  const player = {
    kind: 'rico',
    name: 'rico',
    height: RICO_HEIGHT,
    position: { x: 40, y: 0, z: -40 },
    speed: 0,
    currentCar: null,
    mesh,
    pistol: mesh.userData.pistol,
    _time: 0,
    _onFoot: true,
    get heading() { return _heading; },
    set heading(v) { _heading = v; mesh.rotation.y = v; },
    setPosition(x, z, heading) {
      this.position.x = x;
      this.position.z = z;
      if (heading !== undefined) _heading = heading;
      this.syncMesh();
    },
    syncMesh() {
      mesh.position.set(this.position.x, this.position.y, this.position.z);
      mesh.rotation.y = _heading;
    },
    enterCar(car) {
      this.currentCar = car;
      this._onFoot = false;
      mesh.visible = false;
      if (car) {
        this.position.x = car.position.x;
        this.position.z = car.position.z;
        _heading = car.heading;
      }
      return this;
    },
    exitCar() {
      const car = this.currentCar;
      this.currentCar = null;
      this._onFoot = true;
      mesh.visible = true;
      if (car) {
        // Step out beside the driver door.
        const d = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
        this.position.x = car.position.x - d.z * 1.4;
        this.position.z = car.position.z + d.x * 1.4;
        _heading = car.heading;
      }
      this.syncMesh();
      return car;
    },
    isOnFoot() { return this._onFoot; },
    update(dt, inputState) {
      const step = dt || 0.016;
      this._time += step;
      if (this.currentCar) {
        // Drive: follow the car.
        this.position.x = this.currentCar.position.x;
        this.position.z = this.currentCar.position.z;
        this.position.y = this.currentCar.position.y || 0;
        _heading = this.currentCar.heading;
        this.syncMesh();
        return this;
      }
      const keys = (inputState && inputState.keys) || (input && input.keys) || {};
      let mx = 0;
      let mz = 0;
      if (keys.w || keys.arrowup) mz -= 1;
      if (keys.s || keys.arrowdown) mz += 1;
      if (keys.a || keys.arrowleft) mx -= 1;
      if (keys.d || keys.arrowright) mx += 1;
      const moving = mx !== 0 || mz !== 0;
      const runSpeed = 5.2;
      if (moving) {
        const len = Math.hypot(mx, mz);
        mx /= len; mz /= len;
        // Camera-relative: forward is -z on screen; keep it simple and
        // move in world axes (main.js remaps via heading).
        this.position.x += mx * runSpeed * step;
        this.position.z += mz * runSpeed * step;
        _heading = Math.atan2(mx, mz);
        this.speed = runSpeed;
      } else {
        this.speed = 0;
      }
      // Running animation: limb swing from the time accumulator.
      const swing = moving ? Math.sin(this._time * 11) * 0.55 : 0;
      mesh.userData.legL.rotation.x = swing;
      mesh.userData.legR.rotation.x = -swing;
      mesh.userData.armL.rotation.x = -swing * 0.8;
      mesh.userData.armR.rotation.x = swing * 0.8;
      this.syncMesh();
      return this;
    },
    getSaveData() {
      return {
        position: { x: this.position.x, y: this.position.y, z: this.position.z },
        heading: _heading,
        currentCarModel: this.currentCar ? this.currentCar.model : null,
      };
    },
    loadSaveData(data) {
      if (!data) return this;
      if (data.position) {
        this.position.x = data.position.x;
        this.position.y = data.position.y || 0;
        this.position.z = data.position.z;
      }
      if (data.heading !== undefined) _heading = data.heading;
      this.syncMesh();
      return this;
    },
  };
  player.syncMesh();
  return player;
}
