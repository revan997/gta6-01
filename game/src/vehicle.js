// vehicle.js — Solmar Bay vehicles and driving.
// Every vehicle is built from primitives with flat materials. No imported
// models. The car model faces -z at rotation 0, so a mesh that should face
// its heading gets rotation.y = heading + PI (see syncMesh / syncCarMesh).
// Heading convention: heading 0 faces +z (south), heading PI/2 faces +x
// (east); direction = (sin(heading), cos(heading)) in (x, z).
import * as THREE from '../vendor/three.module.min.js';

// ---- local seeded random (tiny, self-contained; never touches Math.random
// for scene content) ----
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

export function headingToDir(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}

// ---- model registry: 13 models. Short key -> label + dimensions.
// The traffic deck cycles these keys; the guaranteed slots are
// pickup / bus / coupe, whose labels are Dune Pickup / City Bus /
// Palm Coupe (the unit harness gates on the FULL labels). ----
export const MODELS = {
  gt: { label: 'Solmar GT', length: 4.6, width: 1.9, height: 1.25, color: 0xd21f26, kind: 'sports', silhouette: 'coupe' },
  palmCoupe: { label: 'Palm Coupe', length: 4.4, width: 1.85, height: 1.3, color: 0xe8722a, kind: 'coupe', silhouette: 'coupe' },
  coupe: { label: 'Palm Coupe', length: 4.4, width: 1.85, height: 1.3, color: 0xe8722a, kind: 'coupe', silhouette: 'coupe' },
  interceptor: { label: 'Interceptor', length: 4.9, width: 1.95, height: 1.45, color: 0x14161c, kind: 'police', silhouette: 'sedan' },
  patrol: { label: 'Patrol Car', length: 4.9, width: 1.95, height: 1.45, color: 0x1a1d24, kind: 'police', silhouette: 'sedan' },
  tealCoupe: { label: 'Teal Coupe', length: 4.3, width: 1.8, height: 1.28, color: 0x0f7d7a, kind: 'coupe', silhouette: 'coupe' },
  sedan: { label: 'Sedan', length: 4.7, width: 1.85, height: 1.45, color: 0x8a8f98, kind: 'sedan', silhouette: 'sedan' },
  hatch: { label: 'Hatchback', length: 4.1, width: 1.75, height: 1.5, color: 0xc7a23a, kind: 'hatch', silhouette: 'hatch' },
  pickup: { label: 'Dune Pickup', length: 5.1, width: 2.0, height: 1.7, color: 0x7a2e1d, kind: 'pickup', silhouette: 'pickup' },
  van: { label: 'Van', length: 5.0, width: 2.0, height: 2.1, color: 0xd8d8d8, kind: 'van', silhouette: 'van' },
  taxi: { label: 'Taxi', length: 4.6, width: 1.85, height: 1.5, color: 0xf2c200, kind: 'taxi', silhouette: 'sedan' },
  bus: { label: 'City Bus', length: 9.0, width: 2.5, height: 3.0, color: 0x2a6db0, kind: 'bus', silhouette: 'bus' },
  suv: { label: 'SUV', length: 4.8, width: 1.95, height: 1.75, color: 0x2e4a2e, kind: 'suv', silhouette: 'suv' },
};

export const CAR_MODELS = Object.keys(MODELS);

let vehicleIdCounter = 0;

function tagMesh(mesh, modelName, part) {
  mesh.name = modelName + ':' + part;
  mesh.userData.kind = modelName;
  return mesh;
}

// Build the visible mesh for a model. Every mesh carries name and
// userData.kind = the model name. The group origin sits at ground centre
// (y = 0 at the bottom of the wheels); the model faces -z.
export function buildVehicleMesh(modelName) {
  const def = MODELS[modelName] || MODELS.sedan;
  const g = new THREE.Group();
  g.name = modelName;
  g.userData.kind = modelName;
  const L = def.length, W = def.width, H = def.height;
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x101418 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x0c0d10 });
  const wheelR = 0.35;
  const wheelW = 0.28;

  if (def.kind === 'bus') {
    // City bus: one tall box + windshield + side windows + wheels.
    const body = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W, H - 0.5, L), bodyMat), modelName, 'body');
    body.position.y = wheelR + (H - 0.5) / 2;
    g.add(body);
    const shield = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.8, 0.1), glassMat), modelName, 'windshield');
    shield.position.set(0, H - 0.9, -L / 2 + 0.05);
    g.add(shield);
    const stripe = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 0.35, L * 0.92), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })), modelName, 'stripe');
    stripe.position.y = H - 1.5;
    g.add(stripe);
  } else if (def.kind === 'pickup') {
    // Pickup: cab + open bed + bed walls.
    const cab = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.62, L * 0.42), bodyMat), modelName, 'cab');
    cab.position.set(0, wheelR + (H * 0.62) / 2, -L * 0.22);
    g.add(cab);
    const bed = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.42, L * 0.5), bodyMat), modelName, 'bed');
    bed.position.set(0, wheelR + (H * 0.42) / 2, L * 0.24);
    g.add(bed);
    const bedWall = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W, 0.28, 0.08), darkMat), modelName, 'bedwall');
    bedWall.position.set(0, wheelR + H * 0.42 + 0.1, L / 2 - 0.05);
    g.add(bedWall);
    const glass = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.5, 0.08), glassMat), modelName, 'glass');
    glass.position.set(0, wheelR + H * 0.5, -L * 0.02);
    g.add(glass);
  } else {
    // Standard car: low body + cabin + glass.
    const bodyH = H * 0.52;
    const body = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, L), bodyMat), modelName, 'body');
    body.position.y = wheelR + bodyH / 2;
    g.add(body);
    const cabH = H * 0.42;
    const cab = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, cabH, L * 0.48), glassMat), modelName, 'cabin');
    cab.position.set(0, wheelR + bodyH + cabH / 2 - 0.04, L * 0.06);
    g.add(cab);
    if (def.kind === 'police') {
      // Black-and-white patrol livery: white doors + white roof.
      const doorWhite = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, bodyH * 0.62, L * 0.52), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })), modelName, 'doors');
      doorWhite.position.set(0, wheelR + bodyH * 0.42, 0);
      g.add(doorWhite);
      const roofWhite = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.06, L * 0.5), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 })), modelName, 'roof');
      roofWhite.position.set(0, wheelR + bodyH + cabH - 0.02, L * 0.06);
      g.add(roofWhite);
      // Light bar: red + blue.
      const barBase = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3), darkMat), modelName, 'lightbar');
      barBase.position.set(0, wheelR + bodyH + cabH + 0.04, L * 0.06);
      g.add(barBase);
      const barRed = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.32), new THREE.MeshLambertMaterial({ color: 0xff2a1a, emissive: 0x881111 })), modelName, 'lightred');
      barRed.position.set(-0.28, wheelR + bodyH + cabH + 0.04, L * 0.06);
      g.add(barRed);
      const barBlue = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.32), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x112288 })), modelName, 'lightblue');
      barBlue.position.set(0.28, wheelR + bodyH + cabH + 0.04, L * 0.06);
      g.add(barBlue);
    }
    if (modelName === 'gt') {
      // GT extras: rear spoiler + hood scoop, low and wide.
      const spoiler = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.08, 0.35), darkMat), modelName, 'spoiler');
      spoiler.position.set(0, wheelR + bodyH + 0.32, L / 2 - 0.2);
      g.add(spoiler);
      const scoop = tagMesh(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.9), darkMat), modelName, 'scoop');
      scoop.position.set(0, wheelR + bodyH + 0.05, -L * 0.28);
      g.add(scoop);
    }
  }

  // Wheels: 4 cylinders, axis along x.
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelZ = L * 0.32;
  const wheelX = W / 2 - 0.05;
  for (const [wx, wz] of [[-wheelX, -wheelZ], [wheelX, -wheelZ], [-wheelX, wheelZ], [wheelX, wheelZ]]) {
    const wheel = tagMesh(new THREE.Mesh(wheelGeo, darkMat), modelName, 'wheel');
    wheel.position.set(wx, wheelR, wz);
    g.add(wheel);
  }

  // Headlights (front = -z) and taillights (rear = +z).
  const lightGeo = new THREE.BoxGeometry(0.34, 0.14, 0.06);
  for (const hx of [-W / 2 + 0.3, W / 2 - 0.3]) {
    const head = tagMesh(new THREE.Mesh(lightGeo, new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x887722 })), modelName, 'headlight');
    head.position.set(hx, wheelR + H * 0.32, -L / 2 - 0.01);
    g.add(head);
    const tail = tagMesh(new THREE.Mesh(lightGeo, new THREE.MeshLambertMaterial({ color: 0xcc1122, emissive: 0x661111 })), modelName, 'taillight');
    tail.position.set(hx, wheelR + H * 0.32, L / 2 + 0.01);
    g.add(tail);
  }
  return g;
}

// Make one vehicle. The LOGICAL heading lives in _heading and is the only
// thing the heading getter returns. syncMesh adds PI to the mesh rotation
// (the model faces -z) — that +PI must NEVER leak into car.heading.
// (§7 fix #3 item 2: measured 2.845 rad, gate -0.32..-0.24.)
export function makeVehicle(modelName, x = 0, z = 0, heading = 0) {
  const def = MODELS[modelName] || MODELS.sedan;
  const key = MODELS[modelName] ? modelName : 'sedan';
  let _heading = heading;
  const car = {
    id: ++vehicleIdCounter,
    model: key,
    label: def.label,
    kind: def.kind,
    silhouette: def.silhouette,
    length: def.length,
    width: def.width,
    height: def.height,
    position: { x, y: 0, z },
    speed: 0,
    targetSpeed: 0,
    baseTargetSpeed: 0,
    driver: null,
    parked: false,
    staged: false,
    mesh: null,
    get heading() { return _heading; },
    set heading(v) { _heading = v; if (this.mesh) this.mesh.rotation.y = _heading + Math.PI; },
    setPosition(nx, nz, nh) {
      this.position.x = nx;
      this.position.z = nz;
      if (nh !== undefined) _heading = nh;
      this.syncMesh();
    },
    moveForward(dist) {
      const d = headingToDir(_heading);
      this.position.x += d.x * dist;
      this.position.z += d.z * dist;
      this.syncMesh();
    },
    syncMesh() {
      if (!this.mesh) return;
      this.mesh.position.set(this.position.x, this.position.y, this.position.z);
      this.mesh.rotation.y = _heading + Math.PI;
    },
    ensureMesh() {
      if (!this.mesh) {
        this.mesh = buildVehicleMesh(key);
        this.syncMesh();
      }
      return this.mesh;
    },
  };
  car.mesh = buildVehicleMesh(key);
  car.syncMesh();
  return car;
}

// Thin wrappers main.js calls. No bare createCoupe (ambiguous).
export function createGT(x = 0, z = 0, heading = 0) { return makeVehicle('gt', x, z, heading); }
export function createHeroCar(x = 0, z = 0, heading = 0) { return makeVehicle('gt', x, z, heading); }
export function createSolmarGT(x = 0, z = 0, heading = 0) { return makeVehicle('gt', x, z, heading); }
export function createPalmCoupe(x = 0, z = 0, heading = 0) { return makeVehicle('palmCoupe', x, z, heading); }
export function createTealCoupe(x = 0, z = 0, heading = 0) { return makeVehicle('tealCoupe', x, z, heading); }
export function createVehicle(kind, x = 0, z = 0, heading = 0) { return makeVehicle(kind, x, z, heading); }
export function createCar(modelName = 'sedan', x = 0, z = 0, heading = 0) { return makeVehicle(modelName, x, z, heading); }

// Vehicle system: registry for the player's cars + staged cars. Traffic
// and police manage their own fleets; this system owns the hero cars and
// any free-play vehicle the player drives.
export function createVehicleSystem(ctx = {}) {
  const sys = {
    scene: ctx.scene || null,
    world: ctx.world || null,
    rng: ctx.rng || null,
    cars: [],
    add(car) {
      this.cars.push(car);
      if (this.scene && car.mesh) this.scene.add(car.mesh);
      return car;
    },
    remove(car) {
      const i = this.cars.indexOf(car);
      if (i >= 0) this.cars.splice(i, 1);
      if (this.scene && car.mesh) this.scene.remove(car.mesh);
    },
    spawn(modelName, x, z, heading) {
      return this.add(makeVehicle(modelName, x, z, heading));
    },
    getCars() { return this.cars; },
    update(dt) {
      for (const car of this.cars) {
        if (car.speed) {
          car.moveForward(car.speed * dt);
        } else {
          car.syncMesh();
        }
      }
    },
  };
  return sys;
}
