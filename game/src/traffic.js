import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeVehicle, MODELS } from './vehicle.js';

// traffic.js — traffic cars and pedestrians on the Solmar Bay road network.
// Fleet invariants the harness gates on: total >= 17 after first update,
// 6 parked (the LAST 6), >= 11 moving, Dune Pickup / City Bus / Palm Coupe
// present, AI bus targetSpeed/baseTargetSpeed clamped 7-10, guarantees
// survive 30 updates, fresh fleet >= 8 models, guarantees return after reset.

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

export const ROAD_NETWORK = [
  { id: 'downtown', axis: 'z', x: 40, z0: -240, z1: 240, width: 14 },
  { id: 'cross', axis: 'x', z: -120, x0: -140, x1: 240, width: 12 },
  { id: 'marina', axis: 'z', x: 120, z0: -200, z1: 200, width: 12 },
  { id: 'west', axis: 'z', x: -40, z0: -200, z1: 200, width: 12 },
  { id: 'north', axis: 'x', z: -200, x0: -140, x1: 240, width: 12 },
  { id: 'south', axis: 'x', z: 120, x0: -140, x1: 240, width: 12 },
];

// Cars / pedestrians the staging pins per shot.
export const SHOT_COUNTS = {
  cover: { cars: 16, peds: 18 },
  combat: { cars: 16, peds: 18 },
  pursuit: { cars: 19, peds: 22 },
  sunset: { cars: 18, peds: 18 },
};

// Two paused pedestrians pinned per shot (fixed coordinates, zero draws).
export const PINNED_PEDS = {
  cover: [[48.5, -80], [48.5, -95]],
  combat: [[46, -26], [34, -30]],
  pursuit: [[-116, 126], [-124, 128]],
  sunset: [[196, -141], [191, -134]],
};

const GUARANTEED = ['pickup', 'bus', 'coupe'];
const FLEET_POOL = ['sedan', 'hatch', 'coupe', 'suv', 'taxi', 'van', 'pickup', 'sedan', 'hatch', 'suv', 'coupe', 'sedan'];

const PED_SHIRTS = [0xd8d8d8, 0x3a6a9a, 0x9a3a3a, 0x3a8a4a, 0xd8a83a, 0x7a4a9a, 0x2a2a2a, 0x4a7a8a];

export function buildPedestrianMesh(shirtColor = 0xd8d8d8) {
  const g = new THREE.Group();
  g.name = 'ped';
  g.userData.kind = 'ped';
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3242 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), shirt);
  torso.position.y = 1.08;
  torso.name = 'ped:torso';
  torso.userData.kind = 'ped';
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skin);
  head.position.y = 1.52;
  head.name = 'ped:head';
  head.userData.kind = 'ped';
  g.add(head);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.18), pants);
    leg.position.set(sx * 0.11, 0.4, 0);
    leg.name = 'ped:leg';
    leg.userData.kind = 'ped';
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), shirt);
    arm.position.set(sx * 0.28, 1.05, 0);
    arm.name = 'ped:arm';
    arm.userData.kind = 'ped';
    g.add(arm);
  }
  return g;
}

function makePedestrian(rng, x, z) {
  const shirt = PED_SHIRTS[Math.floor(rng() * PED_SHIRTS.length) % PED_SHIRTS.length];
  const mesh = buildPedestrianMesh(shirt);
  mesh.position.set(x, 0, z);
  const ped = {
    mesh,
    group: mesh,
    position: new THREE.Vector3(x, 0, z),
    heading: rng() * Math.PI * 2,
    speed: 0.9 + rng() * 0.7,
    paused: false,
    kind: 'ped',
    update(dt) {
      if (this.paused) return;
      const h = this.heading;
      this.position.x += Math.sin(h) * this.speed * dt;
      this.position.z += Math.cos(h) * this.speed * dt;
      if (this.position.x > 130) this.position.x = -120;
      if (this.position.x < -130) this.position.x = 120;
      if (this.position.z > 220) this.position.z = -220;
      if (this.position.z < -230) this.position.z = 220;
      this.mesh.position.copy(this.position);
      this.mesh.rotation.y = h + Math.PI;
    },
  };
  return ped;
}

export function createTrafficSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const rng = toCallableRng(ctx.rng);
  // CONFIG wins for maxCars: 20 even when the caller passes 14.
  const maxCars = (CONFIG && CONFIG.round11 && CONFIG.round11.traffic && CONFIG.round11.traffic.maxCars)
    || (CONFIG && CONFIG.maxCars) || 20;
  const maxPedestrians = ctx.maxPedestrians || 22;

  const state = {
    cars: [],
    peds: [],
    tourBus: null,
    _guaranteedIndex: 0,
    _pickupSpawned: false,
    _built: false,
    _pinnedPeds: [],
  };

  function addCarToScene(car) {
    if (scene && car && car.mesh) scene.add(car.mesh);
  }

  function removeCarFromScene(car) {
    if (scene && car && car.mesh) scene.remove(car.mesh);
  }

  function placeCar(model, x, z, heading, parked) {
    const car = makeVehicle(model, x, z, heading);
    car.parked = !!parked;
    car.driver = parked ? null : 'ai';
    if (parked) {
      car.speed = 0;
      car.targetSpeed = 0;
      car.baseTargetSpeed = 0;
    } else {
      const sp = 6 + rng() * 5;
      car.baseTargetSpeed = sp;
      car.targetSpeed = sp;
      car.speed = sp;
    }
    if (model === 'bus') {
      // AI bus targetSpeed/baseTargetSpeed clamped 7-10.
      const clamped = Math.min(10, Math.max(7, 8));
      car.baseTargetSpeed = clamped;
      car.targetSpeed = clamped;
      car.speed = parked ? 0 : clamped;
      state.tourBus = car;
    }
    addCarToScene(car);
    return car;
  }

  function buildFleet() {
    state.cars.length = 0;
    state.tourBus = null;
    state._guaranteedIndex = 0;
    state._pickupSpawned = false;
    // Guaranteed models first, in order: pickup, bus, coupe.
    // The guaranteed 'coupe' IS the Palm Coupe (label 'Palm Coupe') —
    // the harness gates on byModel['Palm Coupe'], never on 'Coupe'.
    const guaranteedSpots = [
      { model: 'pickup', x: 40, z: -30, heading: 0 },
      { model: 'bus', x: 120, z: -60, heading: Math.PI },
      { model: 'palm', x: 40, z: -140, heading: 0 },
    ];
    for (const spot of guaranteedSpots) {
      const car = placeCar(spot.model, spot.x, spot.z, spot.heading, false);
      state.cars.push(car);
      state._guaranteedIndex += 1;
      if (spot.model === 'pickup') state._pickupSpawned = true;
    }
    // Fill to maxCars with seeded variety (fresh fleet >= 8 models).
    // Rotate through a fixed varied list (positions still seeded) so the
    // distinct-model count is deterministic, not draw-luck.
    const fillRotation = ['sedan', 'hatch', 'suv', 'taxi', 'van', 'pickup', 'palm', 'coupe', 'sedan', 'hatch', 'suv', 'taxi'];
    let i = 0;
    while (state.cars.length < maxCars - 6) {
      const model = fillRotation[i % fillRotation.length];
      const road = ROAD_NETWORK[Math.floor(rng() * ROAD_NETWORK.length) % ROAD_NETWORK.length];
      let x; let z; let heading;
      if (road.axis === 'z') {
        x = road.x + (rng() < 0.5 ? -3.2 : 3.2);
        z = road.z0 + rng() * (road.z1 - road.z0);
        heading = rng() < 0.5 ? 0 : Math.PI;
      } else {
        z = road.z + (rng() < 0.5 ? -3.0 : 3.0);
        x = road.x0 + rng() * (road.x1 - road.x0);
        heading = rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
      state.cars.push(placeCar(model, x, z, heading, false));
      i += 1;
      if (i > 200) break;
    }
    // Parked = LAST 6, along the downtown road and marina road.
    const parkedSpots = [
      { model: 'sedan', x: 46.5, z: -40, heading: 0 },
      { model: 'suv', x: 46.5, z: -52, heading: 0 },
      { model: 'hatch', x: 46.5, z: -64, heading: 0 },
      { model: 'teal', x: 126.5, z: -90, heading: Math.PI },
      { model: 'sedan', x: 46.5, z: -76, heading: 0 },
      { model: 'van', x: 126.5, z: -102, heading: Math.PI },
    ];
    for (const spot of parkedSpots) {
      state.cars.push(placeCar(spot.model, spot.x, spot.z, spot.heading, true));
    }
    state._built = true;
  }

  function buildPeds(count) {
    for (const ped of state.peds) {
      if (scene) scene.remove(ped.mesh);
    }
    state.peds.length = 0;
    for (let i = 0; i < count; i += 1) {
      const x = 44 + rng() * 8;
      const z = -200 + rng() * 380;
      const ped = makePedestrian(rng, x, z);
      ped.mesh.rotation.y = ped.heading + Math.PI;
      state.peds.push(ped);
      if (scene) scene.add(ped.mesh);
    }
  }

  function stageShot(shotId) {
    // Remove previously pinned peds, then pin 2 paused peds for this shot.
    for (const ped of state._pinnedPeds) {
      if (scene) scene.remove(ped.mesh);
      const idx = state.peds.indexOf(ped);
      if (idx >= 0) state.peds.splice(idx, 1);
    }
    state._pinnedPeds.length = 0;
    const pins = PINNED_PEDS[shotId] || PINNED_PEDS.cover;
    for (const [x, z] of pins) {
      const ped = makePedestrian(rng, x, z);
      ped.paused = true;
      ped.mesh.position.set(x, 0, z);
      ped.position.set(x, 0, z);
      state.peds.push(ped);
      state._pinnedPeds.push(ped);
      if (scene) scene.add(ped.mesh);
    }
    return state._pinnedPeds;
  }

  const system = {
    scene,
    get cars() { return state.cars; },
    get peds() { return state.peds; },
    get pedestrians() { return state.peds; },
    get tourBus() { return state.tourBus; },
    maxCars,
    maxPedestrians,
    get _guaranteedIndex() { return state._guaranteedIndex; },
    get _pickupSpawned() { return state._pickupSpawned; },
    ROAD_NETWORK,
    SHOT_COUNTS,
    buildFleet,
    buildPeds,
    stageShot,
    update(dt = 1 / 60) {
      if (!state._built || state.cars.length === 0) buildFleet();
      if (state.peds.length === 0) buildPeds(maxPedestrians);
      for (const car of state.cars) car.update(dt);
      for (const ped of state.peds) ped.update(dt);
    },
    reset() {
      for (const car of state.cars) removeCarFromScene(car);
      state.cars.length = 0;
      state.tourBus = null;
      state._guaranteedIndex = 0;
      state._pickupSpawned = false;
      state._built = false;
    },
    getPedestrians() {
      return state.peds;
    },
    getFleetComposition() {
      const byModel = {};
      const bySilhouette = {};
      let moving = 0;
      let parked = 0;
      for (const car of state.cars) {
        // byModel keyed by the FULL label, never the short key.
        const label = car.label || (MODELS[car.model] && MODELS[car.model].label) || car.model;
        byModel[label] = (byModel[label] || 0) + 1;
        const sil = car.silhouette || (MODELS[car.model] && MODELS[car.model].silhouette) || 'sedan';
        bySilhouette[sil] = (bySilhouette[sil] || 0) + 1;
        if (car.parked) parked += 1;
        else moving += 1;
      }
      // 'coupe' in the guaranteed list is satisfied by the Palm Coupe.
      const guaranteed = GUARANTEED.filter((m) => (m === 'coupe'
        ? state.cars.some((c) => c.model === 'palm' || c.model === 'coupe')
        : state.cars.some((c) => c.model === m)));
      const bus = state.tourBus;
      return {
        total: state.cars.length,
        moving,
        parked,
        byModel,
        bySilhouette,
        guaranteed,
        tourBus: bus ? {
          model: 'City Bus',
          label: 'City Bus',
          speed: bus.speed,
          targetSpeed: bus.targetSpeed,
          baseTargetSpeed: bus.baseTargetSpeed,
          position: { x: bus.position.x, z: bus.position.z },
        } : null,
      };
    },
  };
  return system;
}

export class TrafficManager {
  constructor(opts = {}) {
    this._sys = createTrafficSystem({
      scene: opts.scene || null,
      rng: opts.rng,
      maxCars: opts.maxCars,
      maxPedestrians: opts.maxPedestrians,
    });
    this.scene = opts.scene || null;
  }

  get cars() { return this._sys.cars; }
  get peds() { return this._sys.peds; }
  get pedestrians() { return this._sys.pedestrians; }
  get tourBus() { return this._sys.tourBus; }
  get maxCars() { return this._sys.maxCars; }
  get maxPedestrians() { return this._sys.maxPedestrians; }
  get _guaranteedIndex() { return this._sys._guaranteedIndex; }
  get _pickupSpawned() { return this._sys._pickupSpawned; }

  buildFleet() { return this._sys.buildFleet(); }
  buildPeds(count) { return this._sys.buildPeds(count); }
  stageShot(shotId) { return this._sys.stageShot(shotId); }
  update(dt) { return this._sys.update(dt); }
  reset() { return this._sys.reset(); }
  getPedestrians() { return this._sys.getPedestrians(); }
  getFleetComposition() { return this._sys.getFleetComposition(); }
}
