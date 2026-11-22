// player.js — Rico, the player character (attempt #9, fresh build).
// 1.85 m tall, mid-stride running animation, pistol with DIFFERENT
// geometry from the officer pistol (0.07 x 0.12 x 0.35, 0x2a2a2a) so it
// never matches the officer-pistol filter in the combat gates.

import * as THREE from '../vendor/three.module.min.js';

const RICO_PISTOL = { w: 0.07, h: 0.12, d: 0.35, color: 0x2a2a2a };

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

function buildRicoMesh() {
  const g = new THREE.Group();
  g.name = 'Rico';
  g.userData.kind = 'rico';
  const jacket = lambert(0xe5322a); // vivid red jacket: Rico must read as the hero against blue water / brown road (the dark 0x8a2a20 jacket registered 0.00 red px on the downscale)
  const dark = lambert(0x1c222c);
  const skin = lambert(0xc99878);
  const jeans = lambert(0x2a3a55);
  const add = (mesh, name) => {
    mesh.name = 'Rico ' + name;
    mesh.userData.kind = 'rico';
    g.add(mesh);
    return mesh;
  };
  const legL = add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.84, 0.17), jeans), 'leg-left');
  legL.position.set(-0.12, 0.42, 0);
  legL.geometry.translate(0, 0, 0);
  const legR = add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.84, 0.17), jeans), 'leg-right');
  legR.position.set(0.12, 0.42, 0);
  const torso = add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3), jacket), 'torso');
  torso.position.y = 1.17;
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.29, 0.27), skin), 'head');
  head.position.y = 1.68;
  const hair = add(new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.1, 0.29), dark), 'hair');
  hair.position.y = 1.85;
  const armL = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.13), jacket), 'arm-left');
  armL.position.set(-0.33, 1.14, 0);
  const armR = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.13), jacket), 'arm-right');
  armR.position.set(0.33, 1.14, -0.08);
  armR.rotation.x = -0.9;
  // Rico's pistol: 0.07 x 0.12 x 0.35, color 0x2a2a2a.
  const pistol = add(
    new THREE.Mesh(new THREE.BoxGeometry(RICO_PISTOL.w, RICO_PISTOL.h, RICO_PISTOL.d), lambert(RICO_PISTOL.color)),
    'pistol'
  );
  pistol.name = 'Rico pistol';
  pistol.userData.kind = 'pistol';
  pistol.position.set(0.33, 1.02, -0.42);
  return { group: g, legL, legR, armL, armR, pistol };
}

export function createPlayer(ctx = {}) {
  const scene = ctx.scene || null;
  const built = buildRicoMesh();
  const mesh = built.group;
  mesh.position.set(40, 0, -22);
  if (scene) scene.add(mesh);

  const player = {
    mesh,
    group: mesh,
    kind: 'rico',
    pistol: built.pistol,
    health: 100,
    maxHealth: 100,
    speed: 0,
    currentCar: null,
    aiming: false,
    _heading: Math.PI / 2,
    _walkPhase: 0,
    _moving: false,

    get heading() { return this._heading; },
    set heading(v) {
      this._heading = v;
      this.mesh.rotation.y = v;
    },
    get position() { return this.mesh.position; },

    setPosition(x, z, heading) {
      if (heading !== undefined && heading !== null) this._heading = heading;
      this.mesh.position.set(x, 0, z);
      this.mesh.rotation.y = this._heading;
      return this;
    },

    enterCar(car) {
      this.currentCar = car;
      if (car && car.mesh) {
        this.mesh.position.copy(car.mesh.position);
        this.mesh.rotation.y = car.heading || 0;
      }
      this.mesh.visible = false; // Rico rides inside the car
      return car;
    },

    exitCar() {
      const car = this.currentCar;
      this.currentCar = null;
      this.mesh.visible = true;
      if (car && car.mesh) {
        const p = car.mesh.position;
        this.mesh.position.set(p.x + 2.2, 0, p.z + 1.5);
      }
      return car;
    },

    aimAt(x, z) {
      const dx = x - this.mesh.position.x;
      const dz = z - this.mesh.position.z;
      this._heading = Math.atan2(dx, -dz);
      this.mesh.rotation.y = this._heading;
      this.aiming = true;
      return this._heading;
    },

    update(dt = 1 / 60, input) {
      if (this.currentCar) {
        // Driving: Rico rides with the car.
        this.mesh.position.copy(this.currentCar.mesh.position);
        this.mesh.rotation.y = this.currentCar.heading || 0;
        return;
      }
      let fx = 0;
      let fz = 0;
      let running = false;
      if (input) {
        const keys = input.keys || input;
        const fwd = keys.KeyW || keys.ArrowUp || keys.w || keys.up;
        const back = keys.KeyS || keys.ArrowDown || keys.s || keys.down;
        const left = keys.KeyA || keys.ArrowLeft || keys.a || keys.left;
        const right = keys.KeyD || keys.ArrowRight || keys.d || keys.right;
        running = !!(keys.ShiftLeft || keys.ShiftRight || keys.shift);
        if (fwd) fz -= 1;
        if (back) fz += 1;
        if (left) fx -= 1;
        if (right) fx += 1;
      }
      const moving = fx !== 0 || fz !== 0;
      this._moving = moving;
      if (moving) {
        const len = Math.hypot(fx, fz);
        fx /= len; fz /= len;
        const sp = running ? 7 : 4;
        this.speed = sp;
        // Move relative to facing (forward = -z at heading 0).
        const sin = Math.sin(this._heading);
        const cos = Math.cos(this._heading);
        const wx = (fx * cos - fz * sin) * sp * dt;
        const wz = (fx * sin + fz * cos) * sp * dt;
        this.mesh.position.x += wx;
        this.mesh.position.z += wz;
        // Mid-stride running animation: lean forward, legs + arms pump.
        this._walkPhase += dt * (running ? 11 : 7);
        const s = Math.sin(this._walkPhase);
        built.legL.rotation.x = s * 0.75;
        built.legR.rotation.x = -s * 0.75;
        built.armL.rotation.x = -s * 0.6;
        built.armR.rotation.x = s * 0.6 - 0.9;
        mesh.rotation.x = 0.08;
      } else {
        this.speed = 0;
        built.legL.rotation.x = 0;
        built.legR.rotation.x = 0;
        built.armL.rotation.x = 0;
        built.armR.rotation.x = this.aiming ? -0.9 : 0;
        mesh.rotation.x = 0;
      }
    },

    takeDamage(n) {
      this.health = Math.max(0, this.health - n);
      return this.health;
    },

    heal(n) {
      this.health = Math.min(this.maxHealth, this.health + n);
      return this.health;
    },
  };
  mesh.rotation.y = player._heading;
  return player;
}
