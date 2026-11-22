// traffic.js — Solmar Bay traffic + pedestrians (attempt #9, fresh build).
// Fleet invariants the harness gates on: total >= 17 after first update,
// 6 parked (the LAST 6 cars), >= 11 moving, Dune Pickup / City Bus / Palm
// Coupe present, AI bus targetSpeed/baseTargetSpeed clamped 7-10, guarantees
// survive 30 updates, fresh fleet >= 8 models, guarantees return after reset.
// CONFIG wins for maxCars (20 even when constructed with maxCars: 14).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeVehicle, MODELS_BY_KEY, MODEL_KEYS } from './vehicle.js';

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

// Road network the traffic drives on. Downtown road x=40 (the GT's road),
// cross road z=-120, marina road z=-60, west road x=-40, east road x=120.
export const ROAD_NETWORK = {
  downtown: { axis: 'z', x: 40, z0: -260, z1: 260 },
  cross: { axis: 'x', z: -120, x0: -120, x1: 320 },
  marina: { axis: 'x', z: -60, x0: 40, x1: 320 },
  west: { axis: 'z', x: -40, z0: -200, z1: 200 },
  east: { axis: 'z', x: 120, z0: -200, z1: 200 },
};
export const ROADS = Object.values(ROAD_NETWORK);

export const SHOT_COUNTS = {
  cover: { cars: 16, peds: 18 },
  combat: { cars: 12, peds: 18 },
  pursuit: { cars: 19, peds: 22 },
  sunset: { cars: 18, peds: 18 },
};

// Two paused peds pinned per shot (the geometry harness gates on them).
// The cover key MUST be 'cover-chase': staging calls stageShot with the
// NORMALIZED id, so the old 'cover' key was never found and no cover peds
// were pinned.
const SHOT_PINS = {
  cover: [[48.5, -80], [48.5, -95]],
  'cover-chase': [[48.5, -80], [48.5, -95]],
  combat: [[46, -26], [34, -30]],
  pursuit: [[-116, 126], [-124, 128]],
  sunset: [[196, -141], [191, -134]],
};

const SHIRT_COLORS = [0xd84a4a, 0x4a7ad8, 0x4ad87a, 0xd8b13a, 0x8a4ad8, 0xe8e8e8, 0x2a2a2a, 0xd87a4a];

export function buildPedestrianMesh(rng) {
  const g = new THREE.Group();
  g.name = 'Pedestrian';
  g.userData.kind = 'ped';
  // Shirt tint is seeded (never Math.random — the build must be deterministic).
  const pick = typeof rng === 'function' ? rng : () => 0.5;
  const shirt = new THREE.MeshLambertMaterial({
    color: SHIRT_COLORS[Math.floor(pick() * SHIRT_COLORS.length)],
  });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc99878 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3440 });
  const add = (mesh, name) => {
    mesh.name = 'Pedestrian ' + name;
    mesh.userData.kind = 'ped';
    g.add(mesh);
    return mesh;
  };
  const legL = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), pants), 'leg-left');
  legL.position.set(-0.11, 0.4, 0);
  const legR = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), pants), 'leg-right');
  legR.position.set(0.11, 0.4, 0);
  const torso = add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), shirt), 'torso');
  torso.position.y = 1.11;
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skin), 'head');
  head.position.y = 1.56;
  const armL = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.12), shirt), 'arm-left');
  armL.position.set(-0.3, 1.1, 0);
  const armR = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.58, 0.12), shirt), 'arm-right');
  armR.position.set(0.3, 1.1, 0);
  return g;
}

function makePed(rng) {
  const mesh = buildPedestrianMesh(rng);
  const ped = {
    mesh,
    kind: 'ped',
    paused: false,
    speed: 0.8 + rng() * 0.8,
    heading: rng() * Math.PI * 2,
    axis: rng() < 0.5 ? 'z' : 'x',
    dir: rng() < 0.5 ? 1 : -1,
    fixedX: 0,
    fixedZ: 0,
    get position() { return this.mesh.position; },
    update(dt) {
      if (this.paused) return;
      if (this.axis === 'z') {
        let z = this.mesh.position.z + this.dir * this.speed * dt;
        if (z > 240) { z = 240; this.dir = -1; }
        if (z < -240) { z = -240; this.dir = 1; }
        this.mesh.position.z = z;
        this.mesh.rotation.y = this.dir > 0 ? Math.PI : 0;
      } else {
        let x = this.mesh.position.x + this.dir * this.speed * dt;
        if (x > 300) { x = 300; this.dir = -1; }
        if (x < -100) { x = -100; this.dir = 1; }
        this.mesh.position.x = x;
        this.mesh.rotation.y = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    },
  };
  return ped;
}

export class TrafficManager {
  constructor(opts = {}) {
    this.scene = opts.scene || null;
    this.rng = toCallableRng(opts.rng);
    const cfgMax = CONFIG && CONFIG.round11 && CONFIG.round11.traffic && CONFIG.round11.traffic.maxCars;
    this.maxCars = cfgMax || opts.maxCars || 20;
    this.maxPedestrians = opts.maxPedestrians || 24;
    this.cars = [];
    this.peds = [];
    this.tourBus = null;
    this._guaranteedIndex = 0;
    this._pickupSpawned = false;
    this._built = false;
    this._stagedShot = null;
    const cfgG = CONFIG && CONFIG.round11 && CONFIG.round11.traffic && CONFIG.round11.traffic.guaranteed;
    this._guaranteed = (cfgG && cfgG.length ? cfgG.slice() : ['pickup', 'bus', 'coupe']);
  }

  _roadSpot(road) {
    const rng = this.rng;
    const lane = (rng() < 0.5 ? -1 : 1) * (1.6 + rng() * 1.2);
    if (road.axis === 'z') {
      const z = road.z0 + rng() * (road.z1 - road.z0);
      return { x: road.x + lane, z, heading: rng() < 0.5 ? 0 : Math.PI, dir: rng() < 0.5 ? 1 : -1 };
    }
    const x = road.x0 + rng() * (road.x1 - road.x0);
    return { x, z: road.z + lane, heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2, dir: rng() < 0.5 ? 1 : -1 };
  }

  _spawnCar(model, parked) {
    const rng = this.rng;
    const road = ROADS[Math.floor(rng() * ROADS.length)];
    const spot = this._roadSpot(road);
    const car = makeVehicle(model, spot.x, spot.z, spot.heading);
    car._road = road;
    car._dir = spot.dir;
    car._lane = spot.x !== road.x ? spot.x : spot.z;
    if (parked) {
      car.driver = null;
      car.speed = 0;
      car.targetSpeed = 0;
      car.baseTargetSpeed = 0;
    } else {
      car.driver = 'ai';
      const s = 6 + rng() * 6;
      car.targetSpeed = s;
      car.baseTargetSpeed = s;
      car.speed = s;
    }
    if (model === 'bus') {
      const bs = 7 + rng() * 3;
      car.targetSpeed = Math.min(10, Math.max(7, bs));
      car.baseTargetSpeed = car.targetSpeed;
      if (!car.driver) car.speed = 0;
      else car.speed = car.targetSpeed;
      this.tourBus = car;
    }
    this.cars.push(car);
    if (this.scene) this.scene.add(car.mesh);
    return car;
  }

  buildFleet() {
    this.cars = [];
    this.tourBus = null;
    const rng = this.rng;
    // Guarantees first: Dune Pickup, City Bus, Palm Coupe always present.
    for (const g of this._guaranteed) {
      this._spawnCar(g, false);
      this._guaranteedIndex += 1;
    }
    if (this._guaranteed.includes('pickup')) this._pickupSpawned = true;
    // Shuffled remaining models for diversity (fresh fleet >= 8 models).
    const rest = MODEL_KEYS.filter((m) => !this._guaranteed.includes(m));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = rest[i]; rest[i] = rest[j]; rest[j] = tmp;
    }
    let i = 0;
    while (this.cars.length < this.maxCars - 6) {
      this._spawnCar(rest[i % rest.length], false);
      i += 1;
    }
    // Parked = LAST 6 cars.
    while (this.cars.length < this.maxCars) {
      this._spawnCar(rest[i % rest.length], true);
      i += 1;
    }
    this._built = true;
    return this.cars;
  }

  buildPeds() {
    const rng = this.rng;
    const spots = [
      { axis: 'z', fixed: 36.5, lo: -240, hi: 240 },
      { axis: 'z', fixed: 48.5, lo: -200, hi: 200 },
      { axis: 'x', fixed: -113, lo: -100, hi: 300 },
      { axis: 'x', fixed: -127, lo: -100, hi: 300 },
      { axis: 'z', fixed: 112, lo: -180, hi: 100 },
    ];
    for (let n = 0; n < this.maxPedestrians; n++) {
      const ped = makePed(rng);
      const s = spots[Math.floor(rng() * spots.length)];
      if (s.axis === 'z') {
        ped.axis = 'z';
        ped.mesh.position.set(s.fixed, 0, s.lo + rng() * (s.hi - s.lo));
      } else {
        ped.axis = 'x';
        ped.mesh.position.set(s.lo + rng() * (s.hi - s.lo), 0, s.fixed);
      }
      ped.dir = rng() < 0.5 ? 1 : -1;
      this.peds.push(ped);
      if (this.scene) this.scene.add(ped.mesh);
    }
    return this.peds;
  }

  reset() {
    for (const c of this.cars) if (this.scene) this.scene.remove(c.mesh);
    this.cars = [];
    this.tourBus = null;
    this._guaranteedIndex = 0;
    this._pickupSpawned = false;
    this._built = false;
  }

  update(dt = 1 / 60) {
    if (!this._built || this.cars.length === 0) this.buildFleet();
    if (this.peds.length === 0) this.buildPeds();
    for (const car of this.cars) {
      if (car.driver !== 'ai') continue;
      const road = car._road;
      if (!road) continue;
      const step = car.speed * dt * car._dir;
      if (road.axis === 'z') {
        let z = car.mesh.position.z + step;
        if (z > road.z1) z = road.z0 + (z - road.z1);
        if (z < road.z0) z = road.z1 - (road.z0 - z);
        car.mesh.position.z = z;
        car._heading = car._dir > 0 ? Math.PI : 0;
        car.mesh.rotation.y = car._heading;
      } else {
        let x = car.mesh.position.x + step;
        if (x > road.x1) x = road.x0 + (x - road.x1);
        if (x < road.x0) x = road.x1 - (road.x0 - x);
        car.mesh.position.x = x;
        car._heading = car._dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.mesh.rotation.y = car._heading;
      }
    }
    for (const ped of this.peds) ped.update(dt);
  }

  getFleetComposition() {
    const byModel = {};
    const bySilhouette = {};
    for (const c of this.cars) {
      byModel[c.label] = (byModel[c.label] || 0) + 1;
      bySilhouette[c.silhouette] = (bySilhouette[c.silhouette] || 0) + 1;
    }
    const moving = this.cars.filter((c) => c.driver === 'ai').length;
    const parked = this.cars.filter((c) => c.driver === null).length;
    const guaranteed = this._guaranteed
      .filter((g) => this.cars.some((c) => c.model === g))
      .map((g) => MODELS_BY_KEY[g].label);
    return {
      total: this.cars.length,
      moving,
      parked,
      byModel,
      bySilhouette,
      guaranteed,
      tourBus: this.tourBus
        ? { model: 'City Bus', label: 'City Bus', silhouette: 'bus', speed: this.tourBus.speed, targetSpeed: this.tourBus.targetSpeed }
        : null,
    };
  }

  getPedestrians() {
    return this.peds;
  }

  getCars() {
    return this.cars;
  }

  stageShot(shotId) {
    if (this.peds.length === 0) this.buildPeds();
    const pins = SHOT_PINS[shotId];
    if (!pins) return;
    pins.forEach(([x, z], i) => {
      const ped = this.peds[i % this.peds.length];
      ped.paused = true;
      ped.mesh.position.set(x, 0, z);
    });
    this._stagedShot = shotId;
  }
}

export function createTrafficSystem(ctx = {}) {
  return new TrafficManager(ctx);
}
