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
  // Round-5: a warm sunset rim across the shoulders — the low sun catches
  // Rico's jacket edge, so he reads as lit by golden hour, not flat.
  part(new THREE.MeshStandardMaterial({ color: 0xff9a3c, emissive: 0xff7a2a, emissiveIntensity: 0.55, roughness: 0.8 }),
    0.64, 0.06, 0.36, 0, 1.46, 0);
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

  // Round 4: Rico's ground shadow — a cheap dark circle on the pavement
  // that grounds him visually (the renderer has no blob shadows). It
  // lives in the scene, not the group, so it stays flat on the ground
  // while Rico jumps; it shrinks and fades as he rises, and hides while
  // he is driving (the group is hidden then too).
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(start.x, 0.02, start.z);
  scene.add(shadow);

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
    jumpBuffer: 0, // round-4b: seconds of buffered jump input (see update)
    walkPhase: 0,
    speed: 0,
    punchWindup: 0, // round 4: seconds left of the punch wind-up lean
    shadow, // round 4: ground blob (scene-owned, see createPlayer)
    // Round-6: landmarks Rico has visited this session (names from
    // world.landmarks.list). main.js persists them into the save file.
    landmarksVisited: new Set(),

    // Round-6: mark a landmark visited when Rico comes within `radius`
    // metres of it. `landmarks` is an array of { name, x, z }. Returns
    // the landmark's name the FIRST time it is visited, or null when
    // nothing new was visited (or when there is no landmark nearby).
    // Pure bookkeeping — the caller plays the chime / HUD / save.
    checkLandmark(landmarks, radius = 25) {
      if (!Array.isArray(landmarks) || !landmarks.length) return null;
      for (const lm of landmarks) {
        if (!lm || typeof lm.x !== 'number' || typeof lm.z !== 'number') continue;
        const key = lm.name || (lm.x + ',' + lm.z);
        if (this.landmarksVisited.has(key)) continue;
        // Round 7: tall landmarks are visitable from a little further
        // away — their visual prominence earns a wider radius (Spire
        // 95 m -> ~37 m, Pyramid 64 m -> ~33 m, Bridge stays 25 m).
        const r = radius + (lm.height ? Math.min(15, lm.height / 8) : 0);
        const d = Math.hypot((this.position.x || 0) - lm.x, (this.position.z || 0) - lm.z);
        if (d <= r) {
          this.landmarksVisited.add(key);
          return lm.name || key;
        }
      }
      return null;
    },

    // Round 4: start the punch wind-up — Rico leans back for a beat,
    // then the arm swings through (applied in update()). The game loop
    // calls this just before combat.punch(); it never blocks the hit.
    startPunchWindup() {
      this.punchWindup = 0.14;
      return this.punchWindup;
    },

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

      // Jump / gravity. Round-4b: jump buffering — pressing Space up to
      // 0.12 s before landing still fires the jump on touchdown, so the
      // controls feel responsive instead of dropping an early press.
      if (inputState && typeof inputState.pressed === 'function' && inputState.pressed('Space')) {
        this.jumpBuffer = 0.12;
      }
      this.jumpBuffer = Math.max(0, (this.jumpBuffer || 0) - safeDt);
      if (inputState && typeof inputState.isDown === 'function'
        && (inputState.isDown('Space') || this.jumpBuffer > 0) && this.grounded) {
        this.verticalVelocity = CONFIG.player.jumpSpeed;
        this.grounded = false;
        this.jumpBuffer = 0;
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

      // Round-3 polish: Rico leans into turns and hunches forward when
      // sprinting, so on-foot movement reads as running, not gliding.
      const turnRate = (this.heading - (this._prevHeading ?? this.heading)) / Math.max(safeDt, 0.001);
      this._prevHeading = this.heading;
      const targetLean = Math.max(-0.22, Math.min(0.22, -turnRate * 0.03));
      this.leanZ = (this.leanZ ?? 0) + (targetLean - (this.leanZ ?? 0)) * Math.min(1, safeDt * 10);
      torso.rotation.z = this.leanZ;
      torso.rotation.x = running ? 0.12 : 0;

      // Round 4: punch wind-up lean — while the timer runs Rico leans
      // back (torso -0.22 rad) and the right arm cocks back, then the
      // swing releases as the timer ends. Purely visual; the hit itself
      // is decided by combat.punch().
      if (this.punchWindup > 0) {
        this.punchWindup = Math.max(0, this.punchWindup - safeDt);
        const phase = this.punchWindup / 0.14; // 1 -> 0 over the wind-up
        torso.rotation.x = -0.22 * phase + (running ? 0.12 : 0) * (1 - phase);
        armR.rotation.x = -0.9 * phase + swing * 0.8 * (1 - phase);
        armL.rotation.x = -swing * 0.8;
      }

      // Round 4: keep the ground shadow under Rico — flat on the ground,
      // shrinking and fading as he jumps, so the eye always knows where
      // his feet will land.
      shadow.position.set(this.position.x, 0.02, this.position.z);
      const airH = Math.max(0, this.position.y || 0);
      const shadowScale = Math.max(0.55, 1 - airH * 0.18);
      shadow.scale.setScalar(shadowScale);
      shadowMat.opacity = Math.max(0.1, 0.32 - airH * 0.08);
      shadow.visible = this.onFoot;

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
      shadow.visible = false; // round 4: no blob while driving (update() is a no-op in a car)
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
      shadow.visible = true; // round 4: the blob comes back with Rico
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
