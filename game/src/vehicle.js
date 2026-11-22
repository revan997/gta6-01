// Solmar Bay — vehicles (W3, attempt #7, fresh build).
// Every vehicle in the game, built from primitives with flat materials.
// Written fresh for this recording from the round-9 interface contract
// (W3 section + fixes 6/7) and the rebuild spec. Nothing here is copied
// from an old repo.
//
// Heading convention (shared with the other W3 modules): a vehicle's
// logical heading h means its forward vector is (sin h, 0, cos h).
// The visual model faces -z, so the mesh rotation is ALWAYS heading + PI.
// The +PI lives ONLY on the mesh — car.heading is the logical heading
// and is never polluted by it (fix 3.2).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

// ---- materials (local, flat Lambert — no textures) -------------------------
function mat(color, emissive, intensity) {
  const m = new THREE.MeshLambertMaterial({ color });
  if (emissive !== undefined) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = intensity === undefined ? 0.9 : intensity;
  }
  return m;
}
const MAT = {
  glass: mat(0x1a2530),
  tyre: mat(0x141414),
  rim: mat(0x9aa0a8),
  chrome: mat(0xc8ccd2),
  headlight: mat(0xfff2c0, 0xffe9a0, 1.0),
  tailRed: mat(0x881111, 0xcc2222, 1.0),
  black: mat(0x111111),
  white: mat(0xf0f0f0),
  lightRed: mat(0xcc1111, 0xff2222, 1.2),
  lightBlue: mat(0x2244ff, 0x3355ff, 1.2),
  taxiYellow: mat(0xe8b820),
  busCream: mat(0xe8e0c8),
  busStripe: mat(0x2456a8),
};

// ---- model catalogue -------------------------------------------------------
// 13 models. `model` is the short name the fleet/harness uses;
// `label` is the full display label (byModel is keyed by label).
// The Palm Coupe IS the fleet's guaranteed 'coupe': its short model is
// 'palmCoupe' and its label is 'Palm Coupe'.
export const MODELS = {
  gt: { label: 'Solmar GT', silhouette: 'coupe', length: 4.4, width: 1.9, height: 1.15, body: 0xc01818, roof: 0x8a0f0f },
  palmCoupe: { label: 'Palm Coupe', silhouette: 'coupe', length: 4.2, width: 1.85, height: 1.25, body: 0xe07820, roof: 0x9a4a10 },
  tealCoupe: { label: 'Teal Coupe', silhouette: 'coupe', length: 4.2, width: 1.85, height: 1.25, body: 0x1a8a8a, roof: 0x0f5555 },
  coupe: { label: 'Coupe', silhouette: 'coupe', length: 4.3, width: 1.85, height: 1.3, body: 0xb8bcc2, roof: 0x6a6e74 },
  interceptor: { label: 'Police Interceptor', silhouette: 'sedan', length: 4.7, width: 1.9, height: 1.45, body: 0x14161a, roof: 0xf0f0f0, police: true },
  patrol: { label: 'Patrol Car', silhouette: 'sedan', length: 4.6, width: 1.88, height: 1.45, body: 0x1a1d22, roof: 0xe8e8e8, police: true },
  sedan: { label: 'Sedan', silhouette: 'sedan', length: 4.5, width: 1.85, height: 1.4, body: 0x4a5a6a, roof: 0x2e3844 },
  hatch: { label: 'Hatchback', silhouette: 'hatchback', length: 4.0, width: 1.8, height: 1.45, body: 0x7a4a5a, roof: 0x4a2a34 },
  pickup: { label: 'Dune Pickup', silhouette: 'pickup', length: 4.8, width: 1.95, height: 1.6, body: 0xc8a83c, roof: 0x8a7420 },
  van: { label: 'Van', silhouette: 'van', length: 4.9, width: 2.0, height: 2.0, body: 0xd8d8d8, roof: 0xa8a8a8 },
  taxi: { label: 'Taxi', silhouette: 'sedan', length: 4.5, width: 1.85, height: 1.42, body: 0xe8b820, roof: 0xe8b820, taxi: true },
  bus: { label: 'City Bus', silhouette: 'bus', length: 9.0, width: 2.5, height: 3.0, body: 0xe8e0c8, roof: 0x2456a8, bus: true },
  suv: { label: 'SUV', silhouette: 'suv', length: 4.6, width: 1.95, height: 1.75, body: 0x2a4a2a, roof: 0x1a2e1a },
};
export const MODEL_NAMES = Object.keys(MODELS);

// ---- mesh construction -----------------------------------------------------
function box(w, h, d, material, x, y, z, name, kind) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.name = name;
  m.userData.kind = kind;
  return m;
}
function wheel(x, z, kind) {
  const w = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12), MAT.tyre);
  w.rotation.z = Math.PI / 2;
  w.position.set(x, 0.34, z);
  w.name = 'wheel';
  w.userData.kind = kind;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 8), MAT.rim);
  hub.rotation.z = Math.PI / 2;
  hub.position.set(x, 0.34, z);
  hub.name = 'hub';
  hub.userData.kind = kind;
  return [w, hub];
}

// Build the visual mesh for one model. Returns a THREE.Group whose
// name/userData.kind are the model, and EVERY child mesh carries the
// same name + userData.kind. The model faces -z (front at -z).
export function buildVehicleMesh(modelName) {
  const spec = MODELS[modelName] || MODELS.sedan;
  const kind = modelName;
  const g = new THREE.Group();
  g.name = spec.label;
  g.userData.kind = kind;
  const L = spec.length;
  const W = spec.width;
  const H = spec.height;
  const bodyMat = mat(spec.body);
  const roofMat = mat(spec.roof);

  if (spec.bus) {
    // City bus: long box body, windshield band, side stripe, big wheels.
    g.add(box(W, H * 0.62, L, bodyMat, 0, H * 0.55, 0, 'bus-body', kind));
    g.add(box(W * 0.98, H * 0.3, L * 0.96, roofMat, 0, H * 0.98, 0, 'bus-roof', kind));
    g.add(box(W * 0.9, 0.5, 0.06, MAT.glass, 0, H * 0.72, -L / 2 + 0.03, 'bus-windshield', kind));
    g.add(box(W * 1.01, 0.35, L * 0.9, MAT.busStripe, 0, H * 0.42, 0, 'bus-stripe', kind));
    for (const [wx, wz] of [[-W / 2, -L / 2 + 1.4], [W / 2, -L / 2 + 1.4], [-W / 2, L / 2 - 1.4], [W / 2, L / 2 - 1.4]]) {
      for (const part of wheel(wx, wz, kind)) g.add(part);
    }
    g.add(box(0.7, 0.25, 0.1, MAT.headlight, -W / 4, 0.5, -L / 2 - 0.02, 'bus-headlight-l', kind));
    g.add(box(0.7, 0.25, 0.1, MAT.headlight, W / 4, 0.5, -L / 2 - 0.02, 'bus-headlight-r', kind));
    return g;
  }

  // Standard car: lower body, cabin, glass, wheels, lights.
  const bodyH = H * 0.52;
  g.add(box(W, bodyH, L, bodyMat, 0, bodyH / 2 + 0.12, 0, 'body', kind));
  const cabL = L * (spec.taxi || modelName === 'hatch' ? 0.55 : 0.48);
  const cabH = H * 0.42;
  const cabZ = modelName === 'pickup' ? -L * 0.18 : L * 0.05;
  if (modelName === 'pickup') {
    // Pickup: cab forward, open bed behind.
    g.add(box(W * 0.92, cabH + 0.25, L * 0.32, roofMat, 0, bodyH + 0.12 + (cabH + 0.25) / 2, -L * 0.22, 'cab', kind));
    g.add(box(W * 0.86, 0.1, L * 0.42, MAT.black, 0, bodyH + 0.14, L * 0.22, 'bed', kind));
    g.add(box(W * 0.9, 0.5, 0.06, MAT.glass, 0, bodyH + 0.35, -L * 0.38, 'windshield', kind));
  } else {
    g.add(box(W * 0.88, cabH, cabL, roofMat, 0, bodyH + 0.12 + cabH / 2, cabZ, 'cabin', kind));
    g.add(box(W * 0.8, cabH * 0.7, 0.06, MAT.glass, 0, bodyH + 0.12 + cabH * 0.55, cabZ - cabL / 2 - 0.01, 'windshield', kind));
    g.add(box(W * 0.8, cabH * 0.6, 0.06, MAT.glass, 0, bodyH + 0.12 + cabH * 0.5, cabZ + cabL / 2 + 0.01, 'rear-glass', kind));
  }
  const wheelZ = L / 2 - 0.95;
  for (const [wx, wz] of [[-W / 2, -wheelZ], [W / 2, -wheelZ], [-W / 2, wheelZ], [W / 2, wheelZ]]) {
    for (const part of wheel(wx, wz, kind)) g.add(part);
  }
  // Headlights (front, -z) and taillights (rear, +z).
  g.add(box(0.42, 0.16, 0.08, MAT.headlight, -W * 0.3, 0.55, -L / 2 - 0.02, 'headlight-l', kind));
  g.add(box(0.42, 0.16, 0.08, MAT.headlight, W * 0.3, 0.55, -L / 2 - 0.02, 'headlight-r', kind));
  g.add(box(0.42, 0.16, 0.08, MAT.tailRed, -W * 0.3, 0.55, L / 2 + 0.02, 'taillight-l', kind));
  g.add(box(0.42, 0.16, 0.08, MAT.tailRed, W * 0.3, 0.55, L / 2 + 0.02, 'taillight-r', kind));

  if (spec.police) {
    // Black-and-white doors + roof light bar (red/blue).
    g.add(box(W * 1.01, bodyH * 0.55, L * 0.42, MAT.white, 0, bodyH * 0.55, L * 0.05, 'door-white', kind));
    g.add(box(0.5, 0.14, 0.3, MAT.lightRed, -0.3, bodyH + 0.12 + cabH + 0.08, cabZ, 'lightbar-red', kind));
    g.add(box(0.5, 0.14, 0.3, MAT.lightBlue, 0.3, bodyH + 0.12 + cabH + 0.08, cabZ, 'lightbar-blue', kind));
  }
  if (modelName === 'gt') {
    // Hero car: low spoiler + hood scoop.
    g.add(box(W * 0.9, 0.08, 0.5, MAT.black, 0, H * 0.92, L / 2 - 0.15, 'spoiler', kind));
    g.add(box(0.5, 0.1, 0.7, MAT.black, 0, bodyH + 0.16, -L * 0.28, 'hood-scoop', kind));
  }
  if (spec.taxi) {
    g.add(box(0.7, 0.16, 0.4, MAT.taxiYellow, 0, bodyH + 0.12 + cabH + 0.08, cabZ, 'taxi-sign', kind));
  }
  return g;
}

// ---- the car object --------------------------------------------------------
// makeVehicle(modelName, x, z, heading) — positional, per contract.
// The returned car keeps its LOGICAL heading in _heading; the mesh
// rotation is heading + PI and never leaks back into car.heading.
export function makeVehicle(modelName, x, z, heading) {
  const spec = MODELS[modelName] || MODELS.sedan;
  const mesh = buildVehicleMesh(modelName);
  let _heading = heading === undefined ? 0 : heading;
  mesh.position.set(x || 0, 0, z || 0);
  mesh.rotation.y = _heading + Math.PI;
  const car = {
    model: modelName,
    kind: modelName,
    label: spec.label,
    silhouette: spec.silhouette,
    mesh,
    driver: null,
    targetSpeed: 0,
    baseTargetSpeed: 0,
    speed: 0,
    get position() { return mesh.position; },
    get x() { return mesh.position.x; },
    get z() { return mesh.position.z; },
    get heading() { return _heading; },
    set heading(h) {
      _heading = h;
      mesh.rotation.y = h + Math.PI;
    },
    setPosition(nx, nz, nh) {
      mesh.position.x = nx;
      mesh.position.z = nz;
      if (nh !== undefined) {
        _heading = nh;
        mesh.rotation.y = nh + Math.PI;
      }
      return car;
    },
    setSpeed(v) { car.speed = v; return car; },
  };
  return car;
}

// ---- factories (thin wrappers around makeVehicle) --------------------------
export function createGT(x, z, heading) { return makeVehicle('gt', x, z, heading); }
export function createHeroCar(x, z, heading) { return makeVehicle('gt', x, z, heading); }
export function createSolmarGT(x, z, heading) { return makeVehicle('gt', x, z, heading); }
export function createPalmCoupe(x, z, heading) { return makeVehicle('palmCoupe', x, z, heading); }
export function createTealCoupe(x, z, heading) { return makeVehicle('tealCoupe', x, z, heading); }
export function createVehicle(kind, x, z, heading) { return makeVehicle(kind, x, z, heading); }
export function createCar(kind, x, z, heading) { return makeVehicle(kind, x, z, heading); }

// ---- vehicle system --------------------------------------------------------
// createVehicleSystem(ctx) — ctx is an object {scene, world, rng, ...}.
// The system owns the free-play fleet of ambient cars (traffic.js owns
// the moving traffic; this system is the factory + registry main.js uses
// for the hero car and staged cars).
export function createVehicleSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const cars = [];
  function add(car) {
    cars.push(car);
    if (scene && car.mesh && !car.mesh.parent) scene.add(car.mesh);
    return car;
  }
  function spawn(modelName, x, z, heading) {
    return add(makeVehicle(modelName, x, z, heading));
  }
  const system = {
    cars,
    scene,
    makeVehicle,
    buildVehicleMesh,
    createGT,
    createHeroCar,
    createSolmarGT,
    createPalmCoupe,
    createTealCoupe,
    createVehicle,
    createCar,
    spawn,
    add,
    getCar(i) { return cars[i] || null; },
    findByModel(modelName) { return cars.filter((c) => c.model === modelName); },
    remove(car) {
      const i = cars.indexOf(car);
      if (i >= 0) cars.splice(i, 1);
      if (scene && car.mesh && car.mesh.parent === scene) scene.remove(car.mesh);
      return car;
    },
    clear() {
      while (cars.length) system.remove(cars[0]);
    },
  };
  return system;
}

export default createVehicleSystem;
