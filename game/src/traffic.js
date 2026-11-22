// traffic.js — Solmar Bay traffic and pedestrians.
// Fleet: 20 cars (14 moving + 6 parked, parked = LAST 6 of the fleet).
// A shuffled deck of the 13 models cycles before repeat; the first three
// slots are forced to the guaranteed models (pickup / bus / coupe) so the
// fleet always carries a Dune Pickup, a City Bus and a Palm Coupe.
// CONFIG.round11.traffic.maxCars (20) wins over any constructor value.
// Cars never despawn (they wrap along their road) so guarantees survive
// any number of updates. reset() EMPTIES the fleet; update() rebuilds
// when empty. The tour bus is a separate bus, not counted in the fleet.
import * as THREE from '../vendor/three.module.min.js';
import { makeVehicle, MODELS, CAR_MODELS } from './vehicle.js';
import { CONFIG } from './config.js';

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

// Road grid (mirrors world.js / the unit harness stub): 8 vertical + 8
// horizontal lines across the city, plus the z = 272 ring road.
export const ROAD_NETWORK = {
  half: 320,
  lines: [-280, -200, -120, -40, 40, 120, 200, 280],
  zMin: -320,
  zMax: 272,
  width: 14,
};

export const SHOT_COUNTS = { cover: 18, combat: 18, pursuit: 22, sunset: 18 };

// Two paused peds pinned per shot (the geometry harness needs >= 2 paused
// peds on screen in every shot).
export const PINNED_PEDS = {
  cover: [[48.5, -80], [48.5, -95]],
  combat: [[46, -26], [34, -30]],
  pursuit: [[-116, 126], [-124, 128]],
  sunset: [[196, -141], [191, -134]], // first is Dante, nearest to Rico
};

const PED_COLORS = [0xc44b4b, 0x4b7ac4, 0x4bc46a, 0xc4a24b, 0x8a4bc4, 0x4bc4c0, 0xd8d8d8, 0x2a2a2a];

// One pedestrian mesh, ~1.75 m tall, built from primitives. name/kind 'ped'
// on every mesh.
export function buildPedestrianMesh(variant = 0) {
  const g = new THREE.Group();
  g.name = 'ped';
  g.userData.kind = 'ped';
  const shirt = new THREE.MeshLambertMaterial({ color: PED_COLORS[variant % PED_COLORS.length] });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3440 });
  const tag = (mesh, part) => { mesh.name = 'ped:' + part; mesh.userData.kind = 'ped'; return mesh; };
  const torso = tag(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.6, 0.24), shirt), 'torso');
  torso.position.y = 1.05;
  g.add(torso);
  const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), skin), 'head');
  head.position.y = 1.55;
  g.add(head);
  const legL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.18), pants), 'legL');
  legL.position.set(-0.11, 0.38, 0);
  g.add(legL);
  const legR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.75, 0.18), pants), 'legR');
  legR.position.set(0.11, 0.38, 0);
  g.add(legR);
  const armL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.12), shirt), 'armL');
  armL.position.set(-0.28, 1.05, 0);
  g.add(armL);
  const armR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.55, 0.12), shirt), 'armR');
  armR.position.set(0.28, 1.05, 0);
  g.add(armR);
  return g;
}

function trafficConfig() {
  const t = (CONFIG && CONFIG.round11 && CONFIG.round11.traffic) || {};
  return {
    maxCars: t.maxCars || 20,
    guaranteed: t.guaranteed || ['pickup', 'bus', 'coupe'],
  };
}

export class TrafficManager {
  constructor(opts = {}) {
    this._rngObj = (opts.rng && typeof opts.rng === 'object') ? opts.rng : null;
    this._rand = toCallableRng(opts.rng);
    this.scene = opts.scene || null;
    // CONFIG wins: maxCars is 20 even when constructed with 14.
    const cfg = trafficConfig();
    this.maxCars = cfg.maxCars;
    this.guaranteed = cfg.guaranteed;
    this.maxPedestrians = opts.maxPedestrians || 18;
    this.cars = [];
    this.tourBus = null;
    this.peds = [];
    this._guaranteedIndex = 0;
    this._pickupSpawned = false;
    this._built = false;
    this._deck = [];
    this._deckIndex = 0;
    this._world = null;
    this._player = null;
    this._stagedShot = null;
    this._pedVariant = 0;
  }

  // Shuffled deck of all 13 models, with the guaranteed models forced
  // into the first three slots (swap, so every model still appears once
  // before any repeat).
  _newDeck() {
    const deck = CAR_MODELS.slice();
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this._rand() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    for (let slot = 0; slot < this.guaranteed.length; slot++) {
      const want = this.guaranteed[slot];
      const at = deck.indexOf(want);
      if (at >= 0) {
        const tmp = deck[slot];
        deck[slot] = want;
        deck[at] = tmp;
      }
    }
    return deck;
  }

  _nextModel() {
    if (this._deckIndex >= this._deck.length) {
      this._deck = this._newDeck();
      this._deckIndex = 0;
    }
    return this._deck[this._deckIndex++];
  }

  // Pick a road point near (nx, nz). Prefer the world's own
  // roadPointForLength (same semantics as the unit harness stub); fall
  // back to the local road grid.
  _roadPoint(world, nx, nz) {
    if (world && typeof world.roadPointForLength === 'function') {
      const pt = world.roadPointForLength(this._rngObj || this._rand, 0, nx, nz, 160);
      if (pt && pt.position) return { x: pt.position.x, z: pt.position.z };
    }
    const lines = ROAD_NETWORK.lines;
    const vertical = this._rand() < 0.5;
    const line = lines[Math.floor(this._rand() * lines.length)];
    const along = ROAD_NETWORK.zMin + this._rand() * (ROAD_NETWORK.zMax - ROAD_NETWORK.zMin);
    return vertical ? { x: line, z: along } : { x: along, z: line };
  }

  _spawnCar(world, player, index, parked) {
    const model = this._nextModel();
    const px = player && player.position ? player.position.x : 40;
    const pz = player && player.position ? player.position.z : 40;
    let pt = null;
    for (let attempt = 0; attempt < 4 && !pt; attempt++) {
      pt = this._roadPoint(world, px, pz);
    }
    if (!pt) pt = { x: 40, z: -40 + index * 8 };
    // Heading along the nearest road axis.
    const nearVertical = Math.abs(pt.x - 40) < Math.abs(pt.z + 40);
    const heading = nearVertical ? (this._rand() < 0.5 ? 0 : Math.PI) : (this._rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const car = makeVehicle(model, pt.x, pt.z, heading);
    car.parked = parked;
    car.staged = false;
    if (parked) {
      car.driver = null;
      car.speed = 0;
      car.targetSpeed = 0;
      car.baseTargetSpeed = 0;
    } else {
      car.driver = 'ai';
      // Bus AI speed clamped to 7-10 (unit gate).
      const speed = model === 'bus' ? 7 + this._rand() * 3 : 8 + this._rand() * 6;
      car.targetSpeed = speed;
      car.baseTargetSpeed = speed;
      car.speed = speed;
    }
    if (this.scene && car.mesh) this.scene.add(car.mesh);
    return car;
  }

  buildFleet(world, player) {
    this._world = world || this._world;
    this._player = player || this._player;
    this._deck = this._newDeck();
    this._deckIndex = 0;
    this.cars = [];
    this._guaranteedIndex = 0;
    this._pickupSpawned = false;
    const total = this.maxCars;
    const parkedCount = 6;
    for (let i = 0; i < total; i++) {
      const parked = i >= total - parkedCount; // parked = LAST 6 of fleet
      const car = this._spawnCar(world, player, i, parked);
      this.cars.push(car);
      // Track guaranteed fills in spawn order (first three slots).
      if (i < this.guaranteed.length) {
        this._guaranteedIndex = i + 1;
        if (car.model === 'pickup') this._pickupSpawned = true;
      }
    }
    // Tour bus: separate from the fleet, drives its own loop.
    const busPt = this._roadPoint(world, player && player.position ? player.position.x : 40, player && player.position ? player.position.z : 40);
    const tour = makeVehicle('bus', busPt ? busPt.x : -120, busPt ? busPt.z : -120, Math.PI / 2);
    tour.driver = 'ai';
    tour.targetSpeed = 9;
    tour.baseTargetSpeed = 9;
    tour.speed = 9;
    if (this.scene && tour.mesh) this.scene.add(tour.mesh);
    this.tourBus = tour;
    this._built = true;
    return this.cars;
  }

  update(dt, world, player) {
    if (world) this._world = world;
    if (player) this._player = player;
    if (this.cars.length === 0) {
      this.buildFleet(this._world, this._player);
    }
    const step = dt || 0.016;
    for (const car of this.cars) {
      if (car.parked || !car.speed) { car.syncMesh(); continue; }
      car.moveForward(car.speed * step);
      // Wrap along the road instead of despawning: guarantees survive.
      if (car.position.z > ROAD_NETWORK.zMax + 10) car.position.z = ROAD_NETWORK.zMin;
      if (car.position.z < ROAD_NETWORK.zMin - 10) car.position.z = ROAD_NETWORK.zMax;
      if (car.position.x > ROAD_NETWORK.half + 10) car.position.x = -ROAD_NETWORK.half;
      if (car.position.x < -ROAD_NETWORK.half - 10) car.position.x = ROAD_NETWORK.half;
      car.syncMesh();
    }
    if (this.tourBus) {
      this.tourBus.moveForward(this.tourBus.speed * step);
      if (this.tourBus.position.x > ROAD_NETWORK.half + 10) this.tourBus.position.x = -ROAD_NETWORK.half;
      if (this.tourBus.position.x < -ROAD_NETWORK.half - 10) this.tourBus.position.x = ROAD_NETWORK.half;
      if (this.tourBus.position.z > ROAD_NETWORK.zMax + 10) this.tourBus.position.z = ROAD_NETWORK.zMin;
      if (this.tourBus.position.z < ROAD_NETWORK.zMin - 10) this.tourBus.position.z = ROAD_NETWORK.zMax;
      this.tourBus.syncMesh();
    }
    // Pedestrians walk; paused (staged) peds stay put.
    for (const ped of this.peds) {
      if (ped.paused) { if (ped.mesh) { ped.mesh.position.set(ped.position.x, 0, ped.position.z); } continue; }
      const d = ped._dir || { x: 0, z: 1 };
      ped.position.x += d.x * ped.speed * step;
      ped.position.z += d.z * ped.speed * step;
      if (ped.position.z > 270 || ped.position.z < -310 || ped.position.x > 310 || ped.position.x < -310) {
        ped._dir = { x: -d.x, z: -d.z };
      }
      if (ped.mesh) {
        ped.mesh.position.set(ped.position.x, 0, ped.position.z);
        ped.mesh.rotation.y = Math.atan2(d.x, d.z);
      }
    }
    return this;
  }

  reset() {
    if (this.scene) {
      for (const car of this.cars) if (car.mesh) this.scene.remove(car.mesh);
      if (this.tourBus && this.tourBus.mesh) this.scene.remove(this.tourBus.mesh);
    }
    this.cars.length = 0;
    this.tourBus = null;
    this._guaranteedIndex = 0;
    this._pickupSpawned = false;
    this._built = false;
    this._deck = [];
    this._deckIndex = 0;
    return this;
  }

  getCars() { return this.cars; }

  getFleetComposition() {
    const byModel = {};
    const bySilhouette = {};
    for (const car of this.cars) {
      // (§7 fix #1 item 1) key by the FULL label, never the short key.
      const label = car.label || (MODELS[car.model] && MODELS[car.model].label) || car.model;
      byModel[label] = (byModel[label] || 0) + 1;
      const sil = car.silhouette || 'car';
      bySilhouette[sil] = (bySilhouette[sil] || 0) + 1;
    }
    const guaranteed = {
      'Dune Pickup': byModel['Dune Pickup'] || 0,
      'City Bus': byModel['City Bus'] || 0,
      'Palm Coupe': byModel['Palm Coupe'] || 0,
    };
    return {
      total: this.cars.length,
      moving: this.cars.filter((c) => !c.parked).length,
      parked: this.cars.filter((c) => c.parked).length,
      byModel,
      bySilhouette,
      guaranteed,
      // (§7 fix #1 item 2) composition tourBus carries model 'City Bus';
      // the car itself keeps the short 'bus'.
      tourBus: this.tourBus ? { ...this.tourBus, model: 'City Bus' } : null,
    };
  }

  // Spawn (or top up) the ambient walking peds.
  _ensurePeds(count) {
    while (this.peds.length < count) {
      const idx = this.peds.length;
      const variant = this._pedVariant++;
      const x = -280 + this._rand() * 560;
      const z = -300 + this._rand() * 560;
      const ped = {
        id: idx,
        name: 'ped',
        kind: 'ped',
        position: { x, y: 0, z },
        heading: this._rand() * Math.PI * 2,
        paused: false,
        speed: 1.0 + this._rand() * 0.6,
        _dir: { x: this._rand() < 0.5 ? -1 : 1, z: 0 },
        mesh: null,
      };
      if (this.scene) {
        ped.mesh = buildPedestrianMesh(variant);
        ped.mesh.position.set(x, 0, z);
        this.scene.add(ped.mesh);
      }
      this.peds.push(ped);
    }
    return this.peds;
  }

  getPedestrians() { return this.peds; }

  // Stage a shot: pin two paused peds at the shot's coordinates.
  stageShot(shotId, anchor) {
    this._stagedShot = shotId;
    const want = SHOT_COUNTS[shotId] || 18;
    this._ensurePeds(Math.max(this.maxPedestrians, want));
    const pins = PINNED_PEDS[shotId] || PINNED_PEDS.cover;
    for (let i = 0; i < pins.length; i++) {
      const ped = this.peds[i];
      if (!ped) continue;
      ped.position.x = pins[i][0];
      ped.position.z = pins[i][1];
      ped.position.y = 0;
      ped.paused = true;
      if (ped.mesh) {
        ped.mesh.position.set(ped.position.x, 0, ped.position.z);
        ped.mesh.rotation.y = 0;
      }
    }
    return this.peds;
  }
}

export function createTrafficSystem(ctx = {}) {
  return new TrafficManager(ctx);
}
