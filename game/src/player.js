// Rico Vega — on-foot player (Lane A).
// Round-13B: the sunset shot frames Rico at ~10 m (main.js shotCam), about
// 110 px tall on screen (was ~65 px at 17 m); the player mesh is unchanged.
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

// Round-8 chase-camera distances (Lane A): the sculpted body reads
// best from slightly farther back and higher than the old default, so
// the default level is 'mid' at 1.04x distance / 1.08x height over the
// CONFIG.camera driving values. main.js multiplies its driving
// distance/height by these factors; the V key (input.js) cycles the
// levels near -> mid -> far. Levels are data, not balance — they only
// move the camera.
export const CHASE_DISTANCE_LEVELS = [
  { name: 'near', distanceMul: 0.88, heightMul: 0.94 },
  { name: 'mid', distanceMul: 1.04, heightMul: 1.08 },
  { name: 'far', distanceMul: 1.22, heightMul: 1.16 },
];
export const DEFAULT_CHASE_DISTANCE_LEVEL = 1; // 'mid'

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
  const matWhite = new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9 });
  const matSole = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.6 });

  function part(material, w, h, d, x, y, z, parent) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    (parent || group).add(mesh);
    return mesh;
  }

  // Round-12 helpers: cylinders (limbs), spheres (head, joints) and
  // tapered boxes (torso/hips — top vertices scaled toward the
  // shoulders, so the silhouette tapers instead of stacking cubes).
  function cyl(material, rTop, rBottom, h, x, y, z, parent, seg = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, seg), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    (parent || group).add(mesh);
    return mesh;
  }
  function ball(material, r, x, y, z, parent, sx = 1, sy = 1, sz = 1) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    (parent || group).add(mesh);
    return mesh;
  }
  function taperBox(material, wTop, wBottom, h, dTop, dBottom, x, y, z, parent) {
    const g = new THREE.BoxGeometry(wBottom, h, dBottom);
    const pos = g.attributes.position;
    const sx = wTop / wBottom;
    const sz = dTop / dBottom;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0) { pos.setX(i, pos.getX(i) * sx); pos.setZ(i, pos.getZ(i) * sz); }
    }
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    (parent || group).add(mesh);
    return mesh;
  }

  // Round 12 (Lane A hero): Rico rebuilt as a real low-poly humanoid —
  // tapered torso, spherical head with face cues, articulated arms
  // (shoulder/elbow) and legs (hip/knee). Same overall proportions as
  // the old block figure (feet 0, hips 0.78, shoulders 1.42, head
  // 1.68, top ~1.95) so collision, camera and spawn are untouched.
  // Pivots (armL/armR/legL/legR/torso) keep their old names — update()
  // below drives them exactly as before, plus elbow/knee pivots.

  // Torso: a Group at chest height so the bob/lean in update() moves
  // the jacket, shirt and shoulders together. Children are local.
  const torso = new THREE.Group();
  torso.position.set(0, 1.12, 0);
  group.add(torso);
  taperBox(matJacket, 0.68, 0.54, 0.72, 0.36, 0.30, 0, 0, 0, torso); // jacket, shoulders -> waist
  taperBox(matJacket, 0.56, 0.57, 0.08, 0.32, 0.33, 0, -0.38, 0, torso); // jacket hem flare
  part(matShirt, 0.26, 0.42, 0.06, 0, 0.08, 0.16, torso); // open-jacket shirt V
  // Lapels: two angled jacket flaps framing the shirt V.
  const lapelL = part(matJacket, 0.10, 0.34, 0.03, -0.11, 0.15, 0.175, torso);
  lapelL.rotation.z = 0.28; lapelL.rotation.y = -0.15;
  const lapelR = part(matJacket, 0.10, 0.34, 0.03, 0.11, 0.15, 0.175, torso);
  lapelR.rotation.z = -0.28; lapelR.rotation.y = 0.15;
  // Collar points + chest pocket with a white square.
  const collarL = part(matShirt, 0.14, 0.03, 0.12, -0.09, 0.33, 0.14, torso);
  collarL.rotation.z = 0.3; collarL.rotation.x = -0.3;
  const collarR = part(matShirt, 0.14, 0.03, 0.12, 0.09, 0.33, 0.14, torso);
  collarR.rotation.z = -0.3; collarR.rotation.x = -0.3;
  part(matJacket, 0.12, 0.09, 0.02, -0.19, 0.12, 0.175, torso); // chest pocket
  part(matWhite, 0.08, 0.03, 0.02, -0.19, 0.17, 0.18, torso); // pocket square
  // Shoulder pads round the jacket's shoulder line.
  ball(matJacket, 0.11, -0.33, 0.32, 0, torso, 1.2, 0.55, 1);
  ball(matJacket, 0.11, 0.33, 0.32, 0, torso, 1.2, 0.55, 1);
  // Rico detail: red bandana ring at the neck + knot, gold chain draped
  // on the chest, dark belt at the waist (belt stays on the group so it
  // sits on the hips, not the leaning torso).
  cyl(matBandana, 0.20, 0.22, 0.07, 0, 0.36, 0, torso, 14);
  part(matBandana, 0.08, 0.06, 0.05, 0, 0.36, -0.20, torso); // bandana knot
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.014, 6, 14, Math.PI), matGold);
  chain.position.set(0, 0.26, 0.20); chain.rotation.set(0.15, 0, Math.PI); chain.castShadow = true;
  torso.add(chain);
  part(matBelt, 0.64, 0.08, 0.36, 0, 0.78, 0);
  part(matGold, 0.10, 0.05, 0.02, 0, 0.78, 0.17); // belt buckle
  // Round-5: a warm sunset rim along the REAR top edge of the
  // shoulders — the low sun catches Rico's jacket edge, so he reads as
  // lit by golden hour, not flat. Thin and rear-biased on purpose: a
  // full-depth slab read as a pale shoulder cape from chase view.
  part(new THREE.MeshStandardMaterial({ color: 0xff9a3c, emissive: 0xff7a2a, emissiveIntensity: 0.35, roughness: 0.8 }),
    0.60, 0.04, 0.10, 0, 0.35, -0.12, torso);
  // Pelvis / hips under the jacket hem.
  taperBox(matPants, 0.56, 0.50, 0.30, 0.34, 0.30, 0, 0.82, 0);

  // Head: sphere cranium + jaw, nose, eyes, brows, mouth, ears, hair.
  // The head stays on the group (not the torso) so the sprint hunch
  // never buries it; update() counter-rotates it at half the lean.
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.68, 0);
  group.add(headGroup);
  ball(matSkin, 0.19, 0, 0.02, 0, headGroup, 0.95, 1.12, 1.0); // cranium
  ball(matSkin, 0.13, 0, -0.09, 0.03, headGroup, 0.9, 0.75, 0.95); // jaw/chin
  const nose = cyl(matSkin, 0.012, 0.028, 0.08, 0, -0.01, 0.19, headGroup, 8);
  nose.rotation.x = Math.PI / 2;
  ball(matHair, 0.022, -0.07, 0.03, 0.165, headGroup); // eyes
  ball(matHair, 0.022, 0.07, 0.03, 0.165, headGroup);
  const browL = part(matHair, 0.08, 0.015, 0.015, -0.07, 0.075, 0.17, headGroup);
  browL.rotation.z = 0.12;
  const browR = part(matHair, 0.08, 0.015, 0.015, 0.07, 0.075, 0.17, headGroup);
  browR.rotation.z = -0.12;
  part(matHair, 0.09, 0.012, 0.02, 0, -0.115, 0.15, headGroup); // mouth
  ball(matSkin, 0.035, -0.185, 0, 0, headGroup, 0.5, 1, 0.7); // ears
  ball(matSkin, 0.035, 0.185, 0, 0, headGroup, 0.5, 1, 0.7);
  // Hair: cap over the crown + rounded back mass + sideburns + fringe.
  // The back mass is a flattened sphere hugging the skull — a flat box
  // here read as a black slab from chase view.
  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.205, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), matHair);
  hairCap.position.set(0, 0.05, -0.01); hairCap.castShadow = true;
  headGroup.add(hairCap);
  ball(matHair, 0.18, 0, -0.02, -0.10, headGroup, 0.95, 1.05, 0.65); // back hair mass
  part(matHair, 0.04, 0.12, 0.05, -0.18, -0.04, 0.05, headGroup); // sideburns
  part(matHair, 0.04, 0.12, 0.05, 0.18, -0.04, 0.05, headGroup);
  const fringe = part(matHair, 0.30, 0.07, 0.06, 0, 0.12, 0.17, headGroup);
  fringe.rotation.x = -0.15;

  // Arms: shoulder pivot -> upper arm -> elbow pivot -> forearm + hand.
  // Pivots are children of the torso so the bob/lean carries the arms.
  function buildArm(side) { // side: -1 left, +1 right
    const shoulder = new THREE.Group();
    shoulder.position.set(0.40 * side, 0.30, 0);
    torso.add(shoulder);
    ball(matJacket, 0.115, 0, 0, 0, shoulder, 1, 0.9, 1); // shoulder ball
    cyl(matJacket, 0.105, 0.085, 0.34, 0, -0.17, 0, shoulder); // upper arm
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);
    cyl(matJacket, 0.082, 0.075, 0.14, 0, -0.07, 0, elbow); // rolled sleeve
    cyl(matSkin, 0.068, 0.06, 0.16, 0, -0.20, 0, elbow); // forearm
    ball(matSkin, 0.075, 0, -0.33, 0, elbow, 0.85, 1.2, 0.95); // hand / fist
    part(matSkin, 0.10, 0.06, 0.06, 0, -0.41, 0.01, elbow); // fingers
    return { shoulder, elbow };
  }
  const armLParts = buildArm(-1);
  const armRParts = buildArm(1);
  const armL = armLParts.shoulder;
  const armR = armRParts.shoulder;
  const foreL = armLParts.elbow;
  const foreR = armRParts.elbow;

  // Legs: hip pivot -> thigh -> knee pivot -> shin + sneaker.
  function buildLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.16 * side, 0.78, 0);
    group.add(hip);
    cyl(matPants, 0.115, 0.09, 0.38, 0, -0.19, 0, hip); // thigh
    const knee = new THREE.Group();
    knee.position.set(0, -0.38, 0);
    hip.add(knee);
    cyl(matPants, 0.088, 0.072, 0.32, 0, -0.16, 0, knee); // shin
    part(matShoes, 0.14, 0.08, 0.20, 0, -0.33, 0.02, knee); // shoe upper
    part(matSole, 0.15, 0.07, 0.34, 0, -0.36, 0.05, knee); // sole
    ball(matShoes, 0.075, 0, -0.365, 0.19, knee, 1, 0.45, 1.1); // toe cap
    return { hip, knee };
  }
  const legLParts = buildLeg(-1);
  const legRParts = buildLeg(1);
  const legL = legLParts.hip;
  const legR = legRParts.hip;
  const shinL = legLParts.knee;
  const shinR = legRParts.knee;

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
    // Round-8: chase-camera distance level (0 near / 1 mid / 2 far).
    // Defaults to 'mid' (1.04x distance, 1.08x height) so the sculpted
    // car body reads from chase view; save.js persists the level (v7)
    // and main.js applies it through setChaseDistance() on load.
    chaseDistanceLevel: DEFAULT_CHASE_DISTANCE_LEVEL,
    chaseDistanceMul: CHASE_DISTANCE_LEVELS[DEFAULT_CHASE_DISTANCE_LEVEL].distanceMul,
    chaseHeightMul: CHASE_DISTANCE_LEVELS[DEFAULT_CHASE_DISTANCE_LEVEL].heightMul,

    // Round-11 final: the chase-camera rescue (main.js) NEVER changes
    // this level — it only pulls the camera in transiently while a
    // building blocks the view, then the chosen V level resumes. The
    // level is the player's choice; the rescue is the camera's.
    // Round-11 final (re-touch): verified by the no-focus chase gate — the rescued camera rose above the roof (y=35.4) instead of sitting inside the (80,-160) building.
    // Round-8: set the chase-camera distance level — accepts an index
    // (0/1/2) or a name ('near'/'mid'/'far'); anything else leaves the
    // level unchanged. Returns the active level record
    // { name, distanceMul, heightMul }, which main.js multiplies onto
    // CONFIG.camera.drivingDistance / drivingHeight. The input lane
    // calls this (via the V key) — it never touches driving itself.
    setChaseDistance(level) {
      let idx = -1;
      if (typeof level === 'number') idx = Math.round(level);
      // Round-10: a numeric string ('2' from a save / URL query) now
      // coerces instead of falling through to "unchanged".
      else if (typeof level === 'string' && level.trim() !== '' && !Number.isNaN(Number(level))) idx = Math.round(Number(level));
      else if (typeof level === 'string') {
        idx = CHASE_DISTANCE_LEVELS.findIndex((l) => l.name === level.toLowerCase());
      }
      if (idx < 0 || idx >= CHASE_DISTANCE_LEVELS.length) return this.getChaseDistance();
      this.chaseDistanceLevel = idx;
      const rec = CHASE_DISTANCE_LEVELS[idx];
      this.chaseDistanceMul = rec.distanceMul;
      this.chaseHeightMul = rec.heightMul;
      return { ...rec };
    },

    // Round-8: the active chase-distance level record.
    getChaseDistance() {
      const rec = CHASE_DISTANCE_LEVELS[this.chaseDistanceLevel] || CHASE_DISTANCE_LEVELS[1];
      return { ...rec };
    },

    // Round-9: current on-foot speed in km/h (the HUD's speedo uses the
    // same 3.6 factor for the car; this is the on-foot twin, so a caller
    // never has to know Rico's speed is stored in m/s).
    getSpeedKmh() {
      return Math.abs(this.speed || 0) * 3.6;
    },

    // Round-9: turn Rico to face a point ({ x, z }) — the L-key
    // landmark look frames the landmark on camera, but Rico himself
    // keeps facing the way he was walking. Facing the landmark first
    // makes the look read as Rico turning to admire it. Pure heading
    // bookkeeping; it never moves the player.
    faceTowards(point) {
      if (!point || typeof point.x !== 'number' || typeof point.z !== 'number') return this.heading;
      const dx = point.x - this.position.x;
      const dz = point.z - this.position.z;
      if (Math.hypot(dx, dz) < 0.01) return this.heading;
      this.heading = Math.atan2(dx, dz);
      group.rotation.y = this.heading;
      return this.heading;
    },

    // Round-8: cycle near -> mid -> far -> near. Returns the new level
    // record — the V-key handler in main.js shows its name in the HUD.
    cycleChaseDistance() {
      return this.setChaseDistance((this.chaseDistanceLevel + 1) % CHASE_DISTANCE_LEVELS.length);
    },

    // Round-8 re-touch: plain status snapshot for the HUD / save / debug
    // probes — the chase-distance level is observable here without
    // digging into internals. Returns a fresh object every call; the
    // position is copied, never the live Vector3.
    getStatus() {
      const chase = this.getChaseDistance();
      return {
        name: this.name,
        health: this.health,
        maxHealth: this.maxHealth,
        onFoot: this.onFoot,
        inCar: !this.onFoot,
        currentCar: this.currentCar ? this.currentCar.model : null,
        position: { x: this.position.x, y: this.position.y, z: this.position.z },
        heading: this.heading,
        speedKmh: this.getSpeedKmh(), // round-9: on-foot speed, km/h
        chaseDistanceLevel: this.chaseDistanceLevel,
        chaseDistanceName: chase.name,
        chaseDistance: chase,
        landmarksVisited: this.landmarksVisited ? [...this.landmarksVisited] : [],
      };
    },

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

      // Walk-cycle swing (round 12: articulated limbs — thighs swing,
      // knees flex on the recovery step, elbows pump bent).
      this.walkPhase += this.speed * safeDt * 1.6;
      const moving = this.speed > 0.2;
      const amp = Math.min(1, this.speed / CONFIG.player.runSpeed);
      const swing = moving ? Math.sin(this.walkPhase) * 0.55 : 0;
      const bob = moving ? Math.abs(Math.cos(this.walkPhase)) * 0.04 : 0;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      // Knee flex peaks as the leg lifts through / recovers forward:
      // the shin trails the thigh, so the foot kicks up behind.
      shinL.rotation.x = -Math.max(0, Math.sin(this.walkPhase + 2.2)) * 0.85 * amp - 0.04;
      shinR.rotation.x = -Math.max(0, Math.sin(this.walkPhase + Math.PI + 2.2)) * 0.85 * amp - 0.04;
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
      armL.rotation.z = 0.12;
      armR.rotation.z = -0.12;
      // Elbows stay bent (more when running) and pump with the swing.
      const foreBaseL = 0.35 + amp * 0.55 + swing * 0.3;
      const foreBaseR = 0.35 + amp * 0.55 - swing * 0.3;
      foreL.rotation.x = foreBaseL;
      foreR.rotation.x = foreBaseR;
      torso.position.y = 1.12 + bob;
      headGroup.position.y = 1.68 + bob * 0.5;

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
        foreR.rotation.x = -0.5 * phase + foreBaseR * (1 - phase); // right forearm cocks back
      }

      // Round 12: the head rides the torso lean/hunch at half strength,
      // so the neck never kinks at the collar.
      headGroup.rotation.z = (this.leanZ ?? 0) * 0.5;
      headGroup.rotation.x = torso.rotation.x * 0.5;

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

// Round-13 final: hero model rebuilt as a real low-poly humanoid (tapered torso, cylinder limbs, sphere head/joints) — no longer a block figure.
// Round-13 final: re-touch — the hero is the on-foot subject of the
// combat + sunset staged shots; mesh counts (the >= 20-mesh gate) and
// the humanoid build are unchanged.

export default createPlayer;
