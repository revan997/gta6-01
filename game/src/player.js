// Rico Vega — on-foot player (Lane A).
// Stylised low-poly human built from boxes. Walks, runs, jumps, collides
// against building boxes and stays inside the city. Also owns the
// enter/exit-car handoff: the player object is the contract Lane B reads
// (position, heading, health, onFoot, currentCar).
import * as THREE from 'three';
import { CONFIG } from './config.js';

const SKIN = 0xc98d64;
const SHIRT = 0x2e8b8b;
const JACKET = 0x274060;
const PANTS = 0x2a2f3a;
const SHOES = 0x1c1c1c;
const HAIR = 0x14100c;

export function createPlayer(scene, world, spawn) {
  const start = spawn || (world && world.spawns ? world.spawns.player : { x: 40, y: 0, z: 40 });
  const group = new THREE.Group();
  group.position.set(start.x, start.y || 0, start.z);
  scene.add(group);

  const matSkin = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.8 });
  const matShirt = new THREE.MeshStandardMaterial({ color: SHIRT, roughness: 0.85 });
  const matJacket = new THREE.MeshStandardMaterial({ color: JACKET, roughness: 0.85 });
  const matPants = new THREE.MeshStandardMaterial({ color: PANTS, roughness: 0.9 });
  const matShoes = new THREE.MeshStandardMaterial({ color: SHOES, roughness: 0.7 });
  const matHair = new THREE.MeshStandardMaterial({ color: HAIR, roughness: 1 });
  const matBandana = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.85 });
  const matGold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 });
  const matBelt = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });

  function part(material, w, h, d, x, y, z, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    (parent || group).add(mesh);
    return mesh;
  }

  // Torso (jacket over shirt), head, hair, arms, legs, shoes.
  const torso = part(matJacket, 0.62, 0.72, 0.34, 0, 1.12, 0);
  part(matShirt, 0.5, 0.6, 0.1, 0, 1.12, 0.16);
  // Rico detail: red bandana at the neck, gold chain on the chest front,
  // dark belt at the waist. Static meshes, like the shirt — they sit on
  // the group, not on the bobbing torso.
  part(matBandana, 0.38, 0.07, 0.36, 0, 1.5, 0);
  part(matGold, 0.3, 0.06, 0.05, 0, 1.32, 0.2);
  part(matBelt, 0.64, 0.08, 0.36, 0, 0.78, 0);
  const head = part(matSkin, 0.36, 0.38, 0.34, 0, 1.68, 0);
  part(matHair, 0.38, 0.14, 0.36, 0, 1.9, 0);
  part(matHair, 0.38, 0.22, 0.08, 0, 1.78, -0.16);
  const armL = part(matJacket, 0.18, 0.66, 0.2, -0.42, 1.12, 0);
  const armR = part(matJacket, 0.18, 0.66, 0.2, 0.42, 1.12, 0);
  // Arm pivots sit at the shoulder so the swing below looks like walking.
  armL.geometry.translate(0, -0.28, 0);
  armL.position.y = 1.42;
  armR.geometry.translate(0, -0.28, 0);
  armR.position.y = 1.42;
  const legL = part(matPants, 0.22, 0.72, 0.24, -0.16, 0.42, 0);
  const legR = part(matPants, 0.22, 0.72, 0.24, 0.16, 0.42, 0);
  legL.geometry.translate(0, -0.3, 0);
  legL.position.y = 0.78;
  legR.geometry.translate(0, -0.3, 0);
  legR.position.y = 0.78;
  part(matShoes, 0.24, 0.12, 0.36, -0.16, 0.06, 0.04);
  part(matShoes, 0.24, 0.12, 0.36, 0.16, 0.06, 0.04);

  const player = {
    group,
    mesh: group,
    name: 'Rico Vega',
    position: group.position, // THREE.Vector3 — Lane B reads player.position
    heading: start.heading || 0,
    health: CONFIG.player.maxHealth,
    maxHealth: CONFIG.player.maxHealth,
    onFoot: true,
    currentCar: null,
    verticalVelocity: 0,
    grounded: true,
    walkPhase: 0,
    speed: 0,

    // Per-frame update. `inputState` is the input singleton (or any object
    // with moveVector() / isDown()); `cameraHeading` rotates movement to
    // the camera. When driving, the car owns movement and this is a no-op.
    update(dt, inputState, worldDesc, cameraHeading) {
      if (!this.onFoot) return;
      const w = worldDesc || world;
      const safeDt = Math.min(dt || 0.016, 0.05);
      const move = inputState && typeof inputState.moveVector === 'function'
        ? inputState.moveVector()
        : { x: 0, y: 0 };
      const running = inputState && typeof inputState.isDown === 'function'
        ? (inputState.isDown('ShiftLeft') || inputState.isDown('ShiftRight'))
        : false;
      const targetSpeed = (move.x !== 0 || move.y !== 0)
        ? (running ? CONFIG.player.runSpeed : CONFIG.player.walkSpeed)
        : 0;

      const camH = cameraHeading || 0;
      let mx = 0;
      let mz = 0;
      if (move.x !== 0 || move.y !== 0) {
        const len = Math.hypot(move.x, move.y) || 1;
        const fx = -Math.sin(camH);
        const fz = -Math.cos(camH);
        const rx = Math.cos(camH);
        const rz = -Math.sin(camH);
        mx = (fx * (move.y / len) + rx * (move.x / len));
        mz = (fz * (move.y / len) + rz * (move.x / len));
        this.heading = Math.atan2(mx, mz);
      }

      // Smooth acceleration toward the target speed.
      this.speed += (targetSpeed - this.speed) * Math.min(1, CONFIG.player.accel * safeDt / Math.max(targetSpeed, 1) + safeDt * 6);
      if (targetSpeed === 0) this.speed = Math.max(0, this.speed - CONFIG.player.accel * safeDt);

      const nx = this.position.x + mx * this.speed * safeDt;
      const nz = this.position.z + mz * this.speed * safeDt;

      // Building collision: slide along walls by testing each axis separately.
      const r = CONFIG.player.radius;
      let px = this.position.x;
      let pz = this.position.z;
      if (w && typeof w.collidesCircle === 'function') {
        if (!w.collidesCircle(nx, pz, r)) px = nx;
        if (!w.collidesCircle(px, nz, r)) pz = nz;
      } else {
        px = nx;
        pz = nz;
      }
      // Stay inside the city.
      if (w && typeof w.clampToCity === 'function') {
        const c = w.clampToCity(px, pz, 2);
        px = c.x;
        pz = c.z;
      } else {
        px = Math.max(-CONFIG.halfCity + 2, Math.min(CONFIG.halfCity - 2, px));
        pz = Math.max(-CONFIG.halfCity + 2, Math.min(CONFIG.halfCity - 2, pz));
      }
      this.position.x = px;
      this.position.z = pz;

      // Jump / gravity.
      if (inputState && typeof inputState.isDown === 'function' && inputState.isDown('Space') && this.grounded) {
        this.verticalVelocity = CONFIG.player.jumpSpeed;
        this.grounded = false;
      }
      if (!this.grounded) {
        this.verticalVelocity -= CONFIG.player.gravity * safeDt;
        this.position.y += this.verticalVelocity * safeDt;
        if (this.position.y <= 0) {
          this.position.y = 0;
          this.verticalVelocity = 0;
          this.grounded = true;
        }
      }

      // Walk-cycle swing.
      this.walkPhase += this.speed * safeDt * 1.6;
      const swing = this.speed > 0.2 ? Math.sin(this.walkPhase) * 0.55 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      torso.position.y = 1.12 + (this.speed > 0.2 ? Math.abs(Math.cos(this.walkPhase)) * 0.04 : 0);

      group.rotation.y = this.heading;
    },

    takeDamage(amount) {
      this.health = Math.max(0, this.health - (amount || 0));
      return this.health;
    },

    heal(amount) {
      this.health = Math.min(this.maxHealth, this.health + (amount || 0));
      return this.health;
    },

    get isAlive() {
      return this.health > 0;
    },

    // Get into a car (Lane B calls this after findNearestCar).
    // Returns true on success.
    enterCar(car) {
      if (!car || this.currentCar) return false;
      this.currentCar = car;
      this.onFoot = false;
      if (typeof car.setDriver === 'function') car.setDriver(this);
      group.visible = false;
      return true;
    },
    // Alias used by some callers.
    getInCar(car) {
      return this.enterCar(car);
    },

    // Step out beside the car. Returns true on success.
    exitCar() {
      const car = this.currentCar;
      if (!car) return false;
      const sideX = Math.cos(car.heading || 0);
      const sideZ = -Math.sin(car.heading || 0);
      let ex = car.position.x + sideX * 2.2;
      let ez = car.position.z + sideZ * 2.2;
      const w = world;
      if (w && typeof w.collidesCircle === 'function' && w.collidesCircle(ex, ez, CONFIG.player.radius)) {
        ex = car.position.x - sideX * 2.2;
        ez = car.position.z - sideZ * 2.2;
      }
      if (typeof car.setDriver === 'function') car.setDriver(null);
      this.currentCar = null;
      this.onFoot = true;
      this.position.set(ex, 0, ez);
      this.heading = car.heading || 0;
      this.verticalVelocity = 0;
      this.grounded = true;
      group.visible = true;
      group.rotation.y = this.heading;
      return true;
    },
    // Alias.
    getOutCar() {
      return this.exitCar();
    },

    teleport(x, z, heading) {
      this.position.set(x, 0, z);
      if (heading !== undefined) this.heading = heading;
      group.rotation.y = this.heading;
    },
  };

  group.rotation.y = player.heading;

  // Lane B aliases for the Lane A fields: Lane B reads player.inCar and
  // player.vehicle / player.car, Lane A owns player.onFoot and
  // player.currentCar. These stay in sync through accessors, so either
  // spelling works everywhere.
  Object.defineProperties(player, {
    inCar: {
      get() { return !this.onFoot; },
      set(v) { this.onFoot = !v; },
      enumerable: true, configurable: true,
    },
    vehicle: {
      get() { return this.currentCar; },
      set(c) { this.currentCar = c || null; this.onFoot = !c; },
      enumerable: true, configurable: true,
    },
    car: {
      get() { return this.currentCar; },
      set(c) { this.currentCar = c || null; this.onFoot = !c; },
      enumerable: true, configurable: true,
    },
  });

  return player;
}

export default createPlayer;
