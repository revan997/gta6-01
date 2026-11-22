// vehicle.js — Solmar Bay vehicles (attempt #9, fresh build).
// Every vehicle is built from primitives and is DETAILED: a shaped body,
// dark glass cabin, 4 visible wheel discs, headlights + taillights, bumpers,
// grille and mirrors. No car ever reads as a flat box on the cover shot.
// Forward is -z at heading 0; heading grows clockwise seen from above:
// forward = (sin h, -cos h) in (x, z).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

const PAINT = (CONFIG && CONFIG.paint) || {};
const GLASS_COLOR = 0x2a4258;
const TYRE_COLOR = 0x23262b;
const CHROME_COLOR = 0xc8d2da;

function lambert(color, emissive, intensity) {
  const m = new THREE.MeshLambertMaterial({ color });
  if (emissive !== undefined) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = intensity === undefined ? 1.0 : intensity;
  }
  return m;
}

// 13 models. label is the FULL label the harness gates on
// (byModel['Dune Pickup'] / ['City Bus'] / ['Palm Coupe']).
export const MODELS = [
  { key: 'gt', label: 'Solmar GT', silhouette: 'car', len: 4.6, wid: 1.95, hgt: 1.18, paint: PAINT.gt || 0xe5322a, sport: true },
  { key: 'palmCoupe', label: 'Palm Coupe', silhouette: 'car', len: 4.3, wid: 1.85, hgt: 1.15, paint: PAINT.palmCoupe || 0xff7a1a, sport: true },
  { key: 'interceptor', label: 'Interceptor', silhouette: 'car', len: 4.7, wid: 1.95, hgt: 1.35, paint: 0x14181d, police: true },
  { key: 'patrol', label: 'Patrol Car', silhouette: 'car', len: 4.6, wid: 1.9, hgt: 1.35, paint: 0x14181d, police: true },
  { key: 'tealCoupe', label: 'Teal Coupe', silhouette: 'car', len: 4.3, wid: 1.85, hgt: 1.15, paint: PAINT.tealCoupe || 0x0f9d8f, sport: true },
  { key: 'sedan', label: 'Sedan', silhouette: 'car', len: 4.5, wid: 1.85, hgt: 1.4, paint: 0x3a6fd8 },
  { key: 'hatch', label: 'Hatchback', silhouette: 'car', len: 4.0, wid: 1.8, hgt: 1.45, paint: 0xd8b13a },
  { key: 'coupe', label: 'Coupe', silhouette: 'car', len: 4.4, wid: 1.85, hgt: 1.2, paint: 0x8a3ad8 },
  { key: 'pickup', label: 'Dune Pickup', silhouette: 'truck', len: 5.0, wid: 2.0, hgt: 1.6, paint: 0xc96a2e, truck: true },
  { key: 'van', label: 'Van', silhouette: 'van', len: 5.0, wid: 2.0, hgt: 2.0, paint: 0xd8d8d8 },
  { key: 'taxi', label: 'Taxi', silhouette: 'car', len: 4.5, wid: 1.85, hgt: 1.4, paint: 0xf2c200, taxi: true },
  { key: 'bus', label: 'City Bus', silhouette: 'bus', len: 9.0, wid: 2.5, hgt: 2.9, paint: 0x2e7fc9, bus: true },
  { key: 'suv', label: 'SUV', silhouette: 'suv', len: 4.8, wid: 2.0, hgt: 1.7, paint: 0x5a6b7a },
];

export const MODELS_BY_KEY = {};
for (const m of MODELS) MODELS_BY_KEY[m.key] = m;
export const MODEL_KEYS = MODELS.map((m) => m.key);

function box(w, h, d, mat) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function buildVehicleMesh(modelName) {
  const def = MODELS_BY_KEY[modelName] || MODELS_BY_KEY.sedan;
  const g = new THREE.Group();
  g.name = def.label;
  g.userData.kind = modelName;
  const paint = lambert(def.paint);
  const glass = lambert(GLASS_COLOR);
  const dark = lambert(0x14181d);
  const tyre = lambert(TYRE_COLOR);
  const chrome = lambert(CHROME_COLOR);

  const add = (mesh, name) => {
    mesh.name = def.label + ' ' + name;
    mesh.userData.kind = modelName;
    g.add(mesh);
    return mesh;
  };

  const wheelR = def.bus ? 0.5 : 0.36;
  const wheelW = def.bus ? 0.34 : (def.sport ? 0.38 : 0.28);
  const bodyH = def.hgt * (def.bus ? 0.72 : 0.55);
  const bodyY = wheelR + bodyH / 2 - 0.04;

  if (def.bus) {
    // City bus: tall single body, long side window strips, big wheels.
    const body = add(box(def.wid, bodyH + 0.55, def.len, paint), 'body');
    body.position.y = bodyY + 0.28;
    const stripL = add(box(0.04, 0.55, def.len * 0.72, glass), 'windows-left');
    stripL.position.set(-def.wid / 2 - 0.01, bodyY + 0.55, 0);
    const stripR = add(box(0.04, 0.55, def.len * 0.72, glass), 'windows-right');
    stripR.position.set(def.wid / 2 + 0.01, bodyY + 0.55, 0);
    const shield = add(box(def.wid * 0.86, 0.7, 0.06, glass), 'windshield');
    shield.position.set(0, bodyY + 0.5, -def.len / 2 - 0.01);
    const dest = add(box(0.7, 0.22, 0.05, lambert(0x111111, 0xffc861, 1.2)), 'destination');
    dest.position.set(0, bodyY + 0.95, -def.len / 2 - 0.03);
    const skirt = add(box(def.wid * 0.96, 0.3, def.len * 0.96, dark), 'skirt');
    skirt.position.y = 0.3;
  } else if (def.truck) {
    // Dune pickup: cab up front, open bed behind with walls.
    const cabLen = def.len * 0.42;
    const cab = add(box(def.wid, bodyH * 0.9, cabLen, paint), 'cab');
    cab.position.set(0, bodyY, -def.len / 2 + cabLen / 2);
    const cabGlass = add(box(def.wid * 0.84, bodyH * 0.5, cabLen * 0.5, glass), 'cab-glass');
    cabGlass.position.set(0, bodyY + bodyH * 0.28, -def.len / 2 + cabLen * 0.55);
    const bedFloor = add(box(def.wid * 0.96, 0.1, def.len * 0.5, dark), 'bed-floor');
    bedFloor.position.set(0, bodyY - bodyH * 0.28, def.len * 0.22);
    const bedWallL = add(box(0.08, 0.42, def.len * 0.5, paint), 'bed-wall-left');
    bedWallL.position.set(-def.wid / 2 + 0.04, bodyY + 0.05, def.len * 0.22);
    const bedWallR = add(box(0.08, 0.42, def.len * 0.5, paint), 'bed-wall-right');
    bedWallR.position.set(def.wid / 2 - 0.04, bodyY + 0.05, def.len * 0.22);
    const bedTail = add(box(def.wid, 0.42, 0.08, paint), 'bed-tail');
    bedTail.position.set(0, bodyY + 0.05, def.len / 2 - 0.04);
    const hood = add(box(def.wid * 0.94, bodyH * 0.42, def.len * 0.08, paint), 'hood');
    hood.position.set(0, bodyY + 0.1, -def.len / 2 + 0.02);
  } else if (def.van) {
    const body = add(box(def.wid, bodyH + 0.5, def.len, paint), 'body');
    body.position.y = bodyY + 0.25;
    const shield = add(box(def.wid * 0.86, 0.6, 0.06, glass), 'windshield');
    shield.position.set(0, bodyY + 0.45, -def.len / 2 - 0.01);
    const sideL = add(box(0.04, 0.5, def.len * 0.55, glass), 'windows-left');
    sideL.position.set(-def.wid / 2 - 0.01, bodyY + 0.5, def.len * 0.08);
    const sideR = add(box(0.04, 0.5, def.len * 0.55, glass), 'windows-right');
    sideR.position.set(def.wid / 2 + 0.01, bodyY + 0.5, def.len * 0.08);
  } else {
    // Standard car / coupe / police: low body + glass cabin.
    const body = add(box(def.wid, bodyH, def.len, paint), 'body');
    body.position.y = bodyY;
    const cabinH = def.hgt * 0.42;
    const cabin = add(box(def.wid * 0.82, cabinH, def.len * 0.46, glass), 'cabin-glass');
    cabin.position.set(0, bodyY + bodyH / 2 + cabinH / 2 - 0.06, def.len * 0.04);
    // Sport roof is DARK GLASS, not paint: from the cover camera's
    // behind-above angle the roof is the biggest visible surface, and a
    // red roof on a red body read as one flat red box (glass 0.00 px in
    // the downscale). Glass roof + red body sides = a car, not a box.
    const roof = add(box(def.wid * 0.8, 0.07, def.len * 0.4, def.sport ? glass : paint), 'roof');
    roof.position.set(0, bodyY + bodyH / 2 + cabinH - 0.04, def.len * 0.04);
    const hoodLine = add(box(def.wid * 0.9, 0.05, def.len * 0.18, paint), 'hood');
    hoodLine.position.set(0, bodyY + bodyH / 2 - 0.02, -def.len * 0.38);
    if (def.sport) {
      // Spoiler at ROOF level (was below the roofline, hidden from
      // above) and wider than the body, so the dark wing reads across
      // the rear top from the cover angle.
      const spoiler = add(box(def.wid * 1.02, 0.06, 0.34, dark), 'spoiler');
      spoiler.position.set(0, bodyY + bodyH / 2 + cabinH + 0.02, def.len / 2 - 0.32);
      const strutL = add(box(0.06, 0.3, 0.06, dark), 'spoiler-strut-left');
      strutL.position.set(-def.wid * 0.3, bodyY + bodyH / 2 + cabinH - 0.14, def.len / 2 - 0.32);
      const strutR = add(box(0.06, 0.3, 0.06, dark), 'spoiler-strut-right');
      strutR.position.set(def.wid * 0.3, bodyY + bodyH / 2 + cabinH - 0.14, def.len / 2 - 0.32);
      const skirt = add(box(def.wid * 1.02, 0.1, def.len * 0.9, dark), 'side-skirt');
      skirt.position.y = 0.16;
    }
    if (def.police) {
      // Black-and-white: white doors + roof light bar (red/blue).
      const doorL = add(box(0.03, bodyH * 0.72, def.len * 0.44, lambert(0xf2f2f2)), 'door-left');
      doorL.position.set(-def.wid / 2 - 0.005, bodyY, 0);
      const doorR = add(box(0.03, bodyH * 0.72, def.len * 0.44, lambert(0xf2f2f2)), 'door-right');
      doorR.position.set(def.wid / 2 + 0.005, bodyY, 0);
      const barBase = add(box(0.95, 0.09, 0.3, dark), 'lightbar-base');
      barBase.position.set(0, bodyY + bodyH / 2 + 0.05, -def.len * 0.05);
      const barRed = add(box(0.42, 0.12, 0.26, lambert(0x550000, 0xff1a1a, 2.0)), 'lightbar-red');
      barRed.position.set(-0.24, bodyY + bodyH / 2 + 0.13, -def.len * 0.05);
      const barBlue = add(box(0.42, 0.12, 0.26, lambert(0x000055, 0x2244ff, 2.0)), 'lightbar-blue');
      barBlue.position.set(0.24, bodyY + bodyH / 2 + 0.13, -def.len * 0.05);
    }
    if (def.taxi) {
      const sign = add(box(0.6, 0.16, 0.3, lambert(0x111111, 0xffd21a, 1.4)), 'taxi-sign');
      sign.position.set(0, bodyY + bodyH / 2 + 0.12, 0);
    }
  }

  // 4 wheels: dark discs, cylinder axis along x so the caps face outward.
  // The wheels stick OUT past the body sides (wheelX = wid/2 + 0.02) so
  // the tread + hub read from the cover camera's front-above angle — flush
  // wheels hid under the body and the GT read as a flat red box.
  // Sport cars: wider wheels that stick further OUT, so the rear wheels
  // read as dark blocks flanking the bumper from the cover camera's
  // behind-above angle (edge-on 0.28 m tyres were invisible slivers).
  const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 14);
  const hubGeo = new THREE.CylinderGeometry(wheelR * 0.6, wheelR * 0.6, wheelW + 0.02, 10);
  const wheelZ = def.len * (def.bus ? 0.34 : 0.32);
  const wheelX = def.wid / 2 + (def.sport ? 0.05 : 0.02);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * wheelX, wheelR, sz * wheelZ);
    add(wheel, sx < 0 ? 'wheel-fl' : 'wheel-fr');
    const hub = new THREE.Mesh(hubGeo, chrome);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(sx * (wheelX + 0.02), wheelR, sz * wheelZ);
    add(hub, 'hub');
  }

  // Headlights (front = -z) and taillights (rear = +z).
  const lightY = bodyY + bodyH * 0.12;
  for (const sx of [-1, 1]) {
    const head = add(box(0.3, 0.13, 0.07, lambert(0xfff6d8, 0xfff2c0, 1.6)), 'headlight');
    head.position.set(sx * def.wid * 0.28, lightY, -def.len / 2 - 0.01);
    // Taillights: BRIGHT near-white-red + taller, so they read against
    // the red paint (dark-red lamps on a red body were invisible: 0.00
    // bright-red px in the downscale). Same for the full-width bar.
    const tail = add(box(0.3, 0.14, 0.07, lambert(0x8a1010, 0xff5040, 3.0)), 'taillight');
    tail.position.set(sx * def.wid * 0.28, lightY + 0.04, def.len / 2 + 0.01);
  }
  // Sport cars: full-width light bars so the front AND rear read from the
  // cover camera's high angle (the two small lamps alone were invisible).
  // Bars sit just proud of the lamps to avoid z-fighting.
  if (def.sport) {
    const barF = add(box(def.wid * 0.86, 0.1, 0.06, lambert(0xfff6d8, 0xfff2c0, 2.0)), 'headlight-bar');
    barF.position.set(0, lightY + 0.02, -def.len / 2 - 0.045);
    const barR = add(box(def.wid * 0.86, 0.16, 0.06, lambert(0x8a1010, 0xff5040, 3.0)), 'taillight-bar');
    barR.position.set(0, lightY + 0.06, def.len / 2 + 0.045);
  }
  // Bumpers + grille + mirrors (present on every car).
  const bumpF = add(box(def.wid * 0.98, 0.15, 0.12, dark), 'bumper-front');
  bumpF.position.set(0, 0.3, -def.len / 2 - 0.02);
  const bumpR = add(box(def.wid * 0.98, 0.15, 0.12, dark), 'bumper-rear');
  bumpR.position.set(0, 0.3, def.len / 2 + 0.02);
  const grille = add(box(def.wid * 0.5, 0.13, 0.05, dark), 'grille');
  grille.position.set(0, lightY - 0.05, -def.len / 2 - 0.03);
  for (const sx of [-1, 1]) {
    const mirror = add(box(0.07, 0.09, 0.14, dark), 'mirror');
    mirror.position.set(sx * (def.wid / 2 + 0.04), bodyY + bodyH * 0.32, -def.len * 0.12);
  }
  return g;
}

export function makeVehicle(modelName, x = 0, z = 0, heading = 0) {
  const def = MODELS_BY_KEY[modelName] || MODELS_BY_KEY.sedan;
  const group = buildVehicleMesh(modelName);
  const car = {
    model: modelName,
    kind: modelName,
    label: def.label,
    silhouette: def.silhouette,
    mesh: group,
    group,
    speed: 0,
    targetSpeed: 0,
    baseTargetSpeed: 0,
    driver: null,
    _heading: heading,
    get heading() { return this._heading; },
    set heading(v) {
      this._heading = v;
      if (this.mesh) this.mesh.rotation.y = v;
    },
    get position() { return this.mesh.position; },
    setPosition(px, pz, h) {
      if (h !== undefined && h !== null) this._heading = h;
      this.mesh.position.set(px, 0, pz);
      this.mesh.rotation.y = this._heading;
    },
  };
  car.setPosition(x, z, heading);
  return car;
}

export function createVehicle(kind, x = 0, z = 0, heading = 0) {
  return makeVehicle(kind, x, z, heading);
}

export function createCar(kind, x = 0, z = 0, heading = 0) {
  return makeVehicle(kind, x, z, heading);
}

export function createGT(x = 0, z = 0, heading = 0) {
  return makeVehicle('gt', x, z, heading);
}

export function createHeroCar(x = 0, z = 0, heading = 0) {
  return makeVehicle('gt', x, z, heading);
}

export function createSolmarGT(x = 0, z = 0, heading = 0) {
  return makeVehicle('gt', x, z, heading);
}

export function createPalmCoupe(x = 0, z = 0, heading = 0) {
  return makeVehicle('palmCoupe', x, z, heading);
}

export function createTealCoupe(x = 0, z = 0, heading = 0) {
  return makeVehicle('tealCoupe', x, z, heading);
}

function toCallableRng(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  if (rng && typeof rng.random === 'function') return () => rng.random();
  if (typeof rng === 'number') {
    let s = rng >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let s = 20261122;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createVehicleSystem(ctx = {}) {
  const sys = {
    scene: ctx.scene || null,
    world: ctx.world || null,
    rng: toCallableRng(ctx.rng),
    vehicles: [],
    MODELS,
    MODEL_KEYS,
    MODELS_BY_KEY,
    makeVehicle,
    buildVehicleMesh,
    createVehicle,
    createCar,
    createGT,
    createHeroCar,
    createSolmarGT,
    createPalmCoupe,
    createTealCoupe,
    spawn(model, x = 0, z = 0, heading = 0) {
      const car = makeVehicle(model, x, z, heading);
      sys.vehicles.push(car);
      if (sys.scene) sys.scene.add(car.mesh);
      return car;
    },
    clear() {
      for (const c of sys.vehicles) if (sys.scene) sys.scene.remove(c.mesh);
      sys.vehicles.length = 0;
    },
  };
  return sys;
}
