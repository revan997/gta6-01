// Solmar Bay — traffic + pedestrians (W3, attempt #7, fresh build).
// Seeded ambient traffic cars and sidewalk pedestrians, plus the per-shot
// pinned pedestrians the geometry harness gates on. Written fresh for
// this recording from the round-9 interface contract (W3 section +
// fixes 6/7, fix 1.2–1.5) and the rebuild spec. Nothing copied from
// an old repo.
//
// Fleet invariants (harness-gated):
// - CONFIG wins for maxCars (20) even when constructed with maxCars 14.
// - total >= 17 after first update; 6 parked; >= 11 moving.
// - Dune Pickup / City Bus / Palm Coupe always present (guarantees).
// - moving cars driver 'ai', parked cars driver null; parked = LAST 6.
// - AI bus targetSpeed/baseTargetSpeed clamped 7–10.
// - guarantees survive 30 updates; guarantees return after reset().
// - byModel is keyed by the FULL label ('Dune Pickup', not 'pickup').
// - reset() EMPTIES the fleet; update() rebuilds when empty.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { MODELS, makeVehicle } from './vehicle.js';
import { WORLD_SEED, mulberry32 } from './random.js';

// ---- rng normalization -----------------------------------------------------
// Local toCallableRng: accept a function, an object with .next()/.random(),
// a numeric seed, or nothing.
function toCallableRng(r) {
  if (typeof r === 'function') return r;
  if (r && typeof r.next === 'function') return () => r.next();
  if (r && typeof r.random === 'function') return () => r.random();
  if (typeof r === 'number') return mulberry32(r);
  return mulberry32(WORLD_SEED);
}

// ---- road network ----------------------------------------------------------
// Downtown grid the traffic drives on. x = 40 is the hero road;
// z = -120 is the cross road; the rest is the surrounding grid.
export const ROAD_NETWORK = {
  vertical: [40, 60, 80, 100, 120, -20, 0, 20, 140, 160],
  horizontal: [-120, -100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100, 120],
  heroRoadX: 40,
  crossRoadZ: -120,
};

// Per-shot counts (spec §6.7 / contract §1): SHOT_COUNTS includes combat.
export const SHOT_COUNTS = {
  cover: { cars: 16, pedestrians: 18 },
  combat: { cars: 14, pedestrians: 18 },
  pursuit: { cars: 19, pedestrians: 22 },
  sunset: { cars: 18, pedestrians: 18 },
};

// Two paused pedestrians pinned per shot (harness ">=2 staged peds" gates).
// Sunset: Dante at (196,-141) is nearest to Rico at (194.3,-137.7).
export const PINNED_PEDS = {
  cover: [{ x: 48.5, z: -80 }, { x: 48.5, z: -95 }],
  combat: [{ x: 46, z: -26 }, { x: 34, z: -30 }],
  pursuit: [{ x: -116, z: 126 }, { x: -124, z: 128 }],
  sunset: [{ x: 196, z: -141 }, { x: 191, z: -134 }],
};

const PED_COLORS = [0x8a6a4a, 0x4a6a8a, 0x6a4a5a, 0x3a5a3a, 0x7a7a6a, 0x5a4a7a];
const GARAGE_MODELS = ['sedan', 'hatch', 'coupe', 'pickup', 'van', 'taxi', 'suv', 'tealCoupe'];

// ---- pedestrian mesh -------------------------------------------------------
export function buildPedestrianMesh(color) {
  const g = new THREE.Group();
  g.name = 'ped';
  g.userData.kind = 'ped';
  const shirt = new THREE.MeshLambertMaterial({ color: color === undefined ? 0x8a6a4a : color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.24), shirt);
  torso.position.y = 1.05;
  torso.name = 'ped-torso';
  torso.userData.kind = 'ped';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skin);
  head.position.y = 1.52;
  head.name = 'ped-head';
  head.userData.kind = 'ped';
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.72, 0.16), dark);
  legL.position.set(-0.11, 0.36, 0);
  legL.name = 'ped-leg-l';
  legL.userData.kind = 'ped';
  const legR = legL.clone();
  legR.position.x = 0.11;
  legR.name = 'ped-leg-r';
  legR.userData.kind = 'ped';
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), shirt);
  armL.position.set(-0.28, 1.05, 0);
  armL.name = 'ped-arm-l';
  armL.userData.kind = 'ped';
  const armR = armL.clone();
  armR.position.x = 0.28;
  armR.name = 'ped-arm-r';
  armR.userData.kind = 'ped';
  g.add(torso, head, legL, legR, armL, armR);
  return g;
}

// ---- traffic system --------------------------------------------------------
export function createTrafficSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const rngFn = toCallableRng(ctx.rng);
  // CONFIG wins for maxCars (contract §1 / fix 1.4).
  const maxCars = (CONFIG.traffic && CONFIG.traffic.maxCars) || 20;
  const maxPedestrians = ctx.maxPedestrians || (CONFIG.traffic && CONFIG.traffic.maxPedestrians) || 22;

  const cars = [];
  const pedestrians = [];
  let tourBus = null;
  let _guaranteedIndex = 0;
  let _pickupSpawned = false;
  let _built = false;
  let _shotId = null;

  function pick(arr) { return arr[Math.floor(rngFn() * arr.length)]; }

  function spawnCar(modelName, x, z, heading, parked) {
    const car = makeVehicle(modelName, x, z, heading);
    if (parked) {
      car.driver = null;
      car.targetSpeed = 0;
      car.baseTargetSpeed = 0;
    } else {
      car.driver = 'ai';
      // AI bus target speed clamped 7–10 (harness gate).
      const sp = modelName === 'bus' ? 7 + rngFn() * 3 : 6 + rngFn() * 8;
      car.targetSpeed = sp;
      car.baseTargetSpeed = sp;
    }
    cars.push(car);
    if (scene) scene.add(car.mesh);
    if (modelName === 'bus' && !parked) tourBus = car;
    return car;
  }

  // Build the full fleet: guarantees first, then seeded variety, then
  // 6 parked cars LAST (parked = LAST 6, harness gate).
  function buildFleet() {
    cars.length = 0;
    tourBus = null;
    const guaranteed = ['pickup', 'bus', 'palmCoupe'];
    const movingCount = maxCars - 6;
    // Guaranteed cars on the hero road / cross road, moving.
    spawnCar('pickup', 40, -60, 0, false);
    spawnCar('bus', 40, 20, 0, false);
    spawnCar('palmCoupe', 60, -100, Math.PI, false);
    _pickupSpawned = true;
    _guaranteedIndex = guaranteed.length;
    // Remaining moving cars: first a fixed run of distinct models
    // (guarantees a fresh fleet of >= 8 models), then seeded fill.
    const distinct = ['sedan', 'hatch', 'coupe', 'van', 'taxi', 'suv', 'tealCoupe'];
    const pool = ['sedan', 'hatch', 'coupe', 'van', 'taxi', 'suv', 'tealCoupe', 'sedan', 'hatch', 'pickup'];
    for (let i = 3; i < movingCount; i++) {
      const model = i - 3 < distinct.length ? distinct[i - 3] : pool[Math.floor(rngFn() * pool.length)];
      const roadX = pick(ROAD_NETWORK.vertical);
      const z = -140 + rngFn() * 260;
      const heading = rngFn() < 0.5 ? 0 : Math.PI;
      spawnCar(model, roadX, z, heading, false);
    }
    // 6 parked cars, LAST in the array.
    const parkedSpots = [
      ['sedan', 60, -40, 0], ['hatch', 60, -20, 0], ['coupe', 80, 60, Math.PI],
      ['van', 100, -60, Math.PI], ['suv', 20, 40, 0], ['tealCoupe', 120, 20, Math.PI],
    ];
    for (const [model, x, z, h] of parkedSpots) spawnCar(model, x, z, h, true);
    _built = true;
    return cars;
  }

  function spawnPedestrian(x, z, paused) {
    const mesh = buildPedestrianMesh(PED_COLORS[pedestrians.length % PED_COLORS.length]);
    mesh.position.set(x, 0, z);
    mesh.rotation.y = rngFn() * Math.PI * 2;
    if (scene) scene.add(mesh);
    const ped = {
      mesh,
      name: 'ped',
      kind: 'ped',
      paused: !!paused,
      get position() { return mesh.position; },
      get x() { return mesh.position.x; },
      get z() { return mesh.position.z; },
      walkSpeed: 0.8 + rngFn() * 0.8,
      heading: rngFn() * Math.PI * 2,
      phase: rngFn() * Math.PI * 2,
    };
    pedestrians.push(ped);
    return ped;
  }

  function buildPedestrians(count) {
    // Remove existing peds from the scene first.
    for (const p of pedestrians) if (scene && p.mesh.parent === scene) scene.remove(p.mesh);
    pedestrians.length = 0;
    const n = count || maxPedestrians;
    for (let i = 0; i < n; i++) {
      const roadX = pick(ROAD_NETWORK.vertical);
      const sidewalkX = roadX + (rngFn() < 0.5 ? 5.5 : -5.5);
      const z = -160 + rngFn() * 300;
      spawnPedestrian(sidewalkX, z, false);
    }
    return pedestrians;
  }

  const system = {
    cars,
    pedestrians,
    get tourBus() { return tourBus; },
    get maxCars() { return maxCars; },
    get maxPedestrians() { return maxPedestrians; },
    // Exposed for the harness reset gate (fix: tm._guaranteedIndex /
    // tm._pickupSpawned must read the live closure values).
    get _guaranteedIndex() { return _guaranteedIndex; },
    get _pickupSpawned() { return _pickupSpawned; },
    ROAD_NETWORK,
    SHOT_COUNTS,
    PINNED_PEDS,

    getPedestrians() { return pedestrians; },
    getCars() { return cars; },

    getFleetComposition() {
      const byModel = {};
      const bySilhouette = {};
      let moving = 0;
      let parked = 0;
      for (const car of cars) {
        // byModel keyed by the FULL label (fix 1.2).
        const label = car.label || (MODELS[car.model] && MODELS[car.model].label) || car.model;
        byModel[label] = (byModel[label] || 0) + 1;
        const sil = car.silhouette || (MODELS[car.model] && MODELS[car.model].silhouette) || 'sedan';
        bySilhouette[sil] = (bySilhouette[sil] || 0) + 1;
        if (car.driver === 'ai') moving++;
        else parked++;
      }
      const guaranteed = ['Dune Pickup', 'City Bus', 'Palm Coupe'].filter((l) => byModel[l]);
      return {
        total: cars.length,
        moving,
        parked,
        byModel,
        bySilhouette,
        guaranteed,
        // The composition snapshot carries model 'City Bus'
        // (the car itself keeps short model 'bus', fix 1.3).
        tourBus: tourBus
          ? { model: 'City Bus', x: tourBus.x, z: tourBus.z, heading: tourBus.heading, driver: tourBus.driver, targetSpeed: tourBus.targetSpeed, baseTargetSpeed: tourBus.baseTargetSpeed }
          : null,
      };
    },

    // reset() EMPTIES the fleet (fix 1.5); update() rebuilds when empty.
    reset() {
      for (const car of cars) if (scene && car.mesh.parent === scene) scene.remove(car.mesh);
      cars.length = 0;
      tourBus = null;
      _guaranteedIndex = 0;
      _pickupSpawned = false;
      _built = false;
      return system;
    },

    update(dt) {
      if (!_built || cars.length === 0) buildFleet();
      if (pedestrians.length === 0) buildPedestrians(maxPedestrians);
      const step = dt === undefined ? 1 / 60 : dt;
      // Move the AI cars along their roads; parked cars never move.
      for (const car of cars) {
        if (car.driver !== 'ai') continue;
        const sp = car.targetSpeed || 8;
        const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
        car.mesh.position.x += fwd.x * sp * step;
        car.mesh.position.z += fwd.z * sp * step;
        // Wrap around the grid so the fleet never empties the map.
        if (car.mesh.position.z > 160) car.mesh.position.z = -180;
        if (car.mesh.position.z < -180) car.mesh.position.z = 160;
      }
      // Walk the un-paused pedestrians.
      for (const ped of pedestrians) {
        if (ped.paused) continue;
        ped.phase += step * 4;
        ped.mesh.position.x += Math.sin(ped.heading) * ped.walkSpeed * step;
        ped.mesh.position.z += Math.cos(ped.heading) * ped.walkSpeed * step;
        if (ped.mesh.position.z > 160 || ped.mesh.position.z < -180) ped.heading += Math.PI;
        // Mid-stride bob.
        ped.mesh.position.y = Math.abs(Math.sin(ped.phase)) * 0.05;
      }
      return system;
    },

    // Stage a shot: pin 2 paused pedestrians at the shot's fixed spots
    // and set the ped count for the shot.
    stageShot(shotId) {
      _shotId = shotId;
      const pins = PINNED_PEDS[shotId] || [];
      const counts = SHOT_COUNTS[shotId] || { pedestrians: maxPedestrians };
      buildPedestrians(counts.pedestrians);
      for (const pin of pins) {
        // Reuse the first two walking peds and pin them at the spots.
        const ped = pedestrians.shift();
        if (!ped) break;
        if (scene && ped.mesh.parent === scene) scene.remove(ped.mesh);
        const pinned = spawnPedestrian(pin.x, pin.z, true);
        pinned.name = 'ped';
        pinned.kind = 'ped';
        void pinned;
      }
      // Keep the pinned peds at the front of the list for the harness.
      const pinnedList = pedestrians.filter((p) => p.paused);
      const rest = pedestrians.filter((p) => !p.paused);
      pedestrians.length = 0;
      pedestrians.push(...pinnedList, ...rest);
      return pedestrians;
    },

    get shotId() { return _shotId; },
  };

  return system;
}

// TrafficManager — class wrapper around createTrafficSystem (contract §1).
export class TrafficManager {
  constructor(opts = {}) {
    this._sys = createTrafficSystem(opts);
    this.cars = this._sys.cars;
    this.pedestrians = this._sys.pedestrians;
  }
  get tourBus() { return this._sys.tourBus; }
  get maxCars() { return this._sys.maxCars; }
  get maxPedestrians() { return this._sys.maxPedestrians; }
  get _guaranteedIndex() { return this._sys._guaranteedIndex; }
  get _pickupSpawned() { return this._sys._pickupSpawned; }
  getFleetComposition() { return this._sys.getFleetComposition(); }
  getPedestrians() { return this._sys.getPedestrians(); }
  getCars() { return this._sys.getCars(); }
  reset() { this._sys.reset(); return this; }
  update(dt) { this._sys.update(dt); return this; }
  stageShot(shotId) { this._sys.stageShot(shotId); return this; }
}

export default createTrafficSystem;
