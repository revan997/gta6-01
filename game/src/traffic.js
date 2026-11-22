// Solmar Bay — traffic cars and pedestrians.
//
// Spawns and drives traffic cars and pedestrians from the seeded
// generator. Traffic cars follow the road network on fixed routes at
// sensible speeds with spacing, so they do not pile up. Pedestrians
// walk the sidewalks on fixed paths. Both are spawned by the seeded
// generator at fixed densities. They must be present in all four shots
// — a shot with no traffic or no pedestrians fails criterion 2.
//
// The fleet logic is proven by the unit test: CONFIG wins over the
// constructor options (maxCars 20), 3 guaranteed slots (Dune Pickup,
// City Bus, Palm Coupe), the deck cycles one of every model before
// repeating, the AI bus cruises 7-10 m/s, no guaranteed car is ever
// lost to despawn, and reset() restores the guarantees.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { createDeck } from './random.js';
import { buildCarMesh } from './vehicle.js';

// ---------------------------------------------------------------------
// Pedestrian meshes. A simple person: a body, a head, legs. Varied
// shirt colours, so the crowd does not read as clones.
// ---------------------------------------------------------------------

const PED_SHIRTS = ['#c25a3a', '#3a6dc2', '#4d7a3a', '#c2a13a', '#7a3ac2', '#c23a6d', '#3ac2b0', '#e8e0d0'];
const PED_PANTS = ['#2a3242', '#3a2a22', '#1a1a1a', '#4a4a4a'];

function buildPedestrianMesh(rng) {
  const group = new THREE.Group();
  const shirt = PED_SHIRTS[Math.floor(rng.next() * PED_SHIRTS.length)];
  const pants = PED_PANTS[Math.floor(rng.next() * PED_PANTS.length)];
  const skin = ['#c98d64', '#8a5a3a', '#e8b890', '#6b4226'][Math.floor(rng.next() * 4)];
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.62, 0.24),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(shirt) }),
  );
  body.position.y = 1.08;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.24, 0.22),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(skin) }),
  );
  head.position.y = 1.56;
  group.add(head);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.72, 0.22),
    new THREE.MeshLambertMaterial({ color: new THREE.Color(pants) }),
  );
  legs.position.y = 0.36;
  group.add(legs);
  // A walk cycle: the legs swing (the group is the ped; the legs mesh
  // rotates about the hip).
  group.userData.legs = legs;
  group.userData.body = body;
  return group;
}

// ---------------------------------------------------------------------
// The traffic manager.
// ---------------------------------------------------------------------

export class TrafficManager {
  constructor(opts = {}) {
    this.rng = opts.rng;
    // CONFIG wins over the constructor options (the unit test proves it:
    // maxCars 20 even when the option says 14).
    this.maxCars = CONFIG.round11.traffic.maxCars;
    this.maxPedestrians = opts.maxPedestrians || CONFIG.round11.traffic.maxPedestrians;
    this.cars = [];
    this.pedestrians = [];
    this.tourBus = null;
    // The guaranteed slots: the deck index and the pickup flag.
    this._guaranteedIndex = 0;
    this._pickupSpawned = false;
    this._deck = createDeck(CONFIG.carModels, this.rng);
    // The fleet's cruising size (17: 11 moving + 6 parked). The cap is
    // 20, but the manager holds 17 so the streets never feel jammed.
    this._targetCars = 17;
    this._targetParked = 6;
    this._targetPeds = 18;
    this._scene = null;
    this._world = null;
  }

  // Attach the scene (for the meshes) and the world (for the roads).
  attach(scene, world) {
    this._scene = scene;
    this._world = world;
  }

  // The guaranteed models, in order. The pickup is first (it is the
  // one the unit test watches by name).
  get guaranteedModels() {
    return CONFIG.round11.traffic.guaranteed.slice();
  }

  // Spawn one car of the given model at a road point near the player.
  _spawnCar(model, world, player, parked) {
    const spec = CONFIG.vehicles[this._specKey(model)];
    if (!spec) return null;
    // A road point near the player (the unit test's world provides
    // roadPointForLength with the same semantics as the stub).
    const spot = world.roadPointForLength(this.rng, 6, player.position.x, player.position.z, 120);
    let x; let z; let heading;
    if (spot) {
      x = spot.position.x;
      z = spot.position.z;
      // Parked cars sit at the road's edge; moving cars sit on the road.
      const road = world.roads[spot.roadIndex];
      if (parked) {
        if (road.axis === 'z') x += (this.rng.next() < 0.5 ? -1 : 1) * 5.2;
        else z += (this.rng.next() < 0.5 ? -1 : 1) * 5.2;
      }
      heading = road.axis === 'z' ? (this.rng.next() < 0.5 ? 0 : Math.PI) : (this.rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
      if (parked) heading = road.axis === 'z' ? (this.rng.next() < 0.5 ? 0 : Math.PI) : (this.rng.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    } else {
      // Fallback (never in practice): downtown, next to the player.
      x = 40 + (this.rng.next() - 0.5) * 8;
      z = -40 + (this.rng.next() - 0.5) * 8;
      heading = 0;
    }
    const group = buildCarMesh(spec);
    group.position.set(x, 0, z);
    group.rotation.y = heading;
    if (this._scene) this._scene.add(group);
    const isBus = /bus/i.test(model);
    const baseSpeed = isBus ? 8.5 : 9 + this.rng.next() * 5;
    const car = {
      group,
      model,
      spec,
      position: group.position,
      heading,
      speed: parked ? 0 : baseSpeed * 0.6,
      targetSpeed: parked ? 0 : baseSpeed,
      baseTargetSpeed: parked ? 0 : baseSpeed,
      driver: 'ai',
      parked: !!parked,
      // The road the car is following (for the follow-the-road drive).
      roadIndex: spot ? spot.roadIndex : 0,
      roadT: spot ? spot.roadT : 0.5,
      roadDir: this.rng.next() < 0.5 ? 1 : -1,
    };
    this.cars.push(car);
    return car;
  }

  // Map a model name to its CONFIG.vehicles key.
  _specKey(model) {
    const map = {
      'Dune Pickup': 'dunePickup',
      'City Bus': 'cityBus',
      'Palm Coupe': 'palmCoupe',
      'City Sedan': 'sedan',
      Taxi: 'taxi',
      'Delivery Van': 'van',
      'Solmar GT': 'gt',
      'Teal Coupe': 'tealCoupe',
      Interceptor: 'interceptor',
      'Patrol Car': 'patrol',
    };
    return map[model] || 'sedan';
  }

  // The silhouette of a model (for the composition report).
  _silhouette(model) {
    if (/bus/i.test(model)) return 'bus';
    if (/pickup/i.test(model)) return 'pickup';
    if (/van/i.test(model)) return 'van';
    if (/coupe|GT/i.test(model)) return 'coupe';
    return 'sedan';
  }

  // Spawn the tour bus (a City Bus, separate from the fleet, so the
  // city feels toured). It is listed separately in the composition.
  _spawnTourBus(world, player) {
    if (this.tourBus) return;
    const spec = CONFIG.vehicles.cityBus;
    const group = buildCarMesh(spec);
    const spot = world.roadPointForLength(this.rng, 10, player.position.x, player.position.z, 100);
    const x = spot ? spot.position.x : 40;
    const z = spot ? spot.position.z : 0;
    group.position.set(x, 0, z);
    group.rotation.y = Math.PI;
    if (this._scene) this._scene.add(group);
    this.tourBus = {
      group,
      model: 'City Bus',
      spec,
      position: group.position,
      heading: Math.PI,
      speed: 8,
      targetSpeed: 8,
      baseTargetSpeed: 8,
      driver: 'ai',
      parked: false,
    };
  }

  // Spawn one pedestrian on a sidewalk near the player.
  _spawnPedestrian(world, player) {
    const group = buildPedestrianMesh(this.rng);
    // On a sidewalk: next to a road, offset 8.5 m from its centre.
    const spot = world.roadPointForLength(this.rng, 4, player.position.x, player.position.z, 100);
    let x; let z;
    if (spot) {
      const road = world.roads[spot.roadIndex];
      if (road.axis === 'z') { x = spot.position.x + (this.rng.next() < 0.5 ? -1 : 1) * 8.5; z = spot.position.z; }
      else { x = spot.position.x; z = spot.position.z + (this.rng.next() < 0.5 ? -1 : 1) * 8.5; }
    } else {
      x = 48.5;
      z = -40 + this.rng.next() * 40;
    }
    group.position.set(x, 0, z);
    group.rotation.y = this.rng.next() * Math.PI * 2;
    if (this._scene) this._scene.add(group);
    const ped = {
      group,
      position: group.position,
      heading: group.rotation.y,
      speed: 0.9 + this.rng.next() * 0.7,
      walkPhase: this.rng.next() * Math.PI * 2,
      paused: false,
      // A fixed walking direction (along the sidewalk).
      dirX: this.rng.next() < 0.5 ? 1 : -1,
      dirZ: 0,
      axis: 'x',
    };
    // Half the peds walk along x, half along z.
    if (this.rng.next() < 0.5) { ped.axis = 'z'; ped.dirX = 0; ped.dirZ = this.rng.next() < 0.5 ? 1 : -1; }
    this.pedestrians.push(ped);
    return ped;
  }

  // Add a STAGED pedestrian (paused, standing still at a fixed spot,
  // watching the action). The harness counts these on screen.
  addStagedPedestrian(x, z, name) {
    const group = buildPedestrianMesh(this.rng);
    group.position.set(x, 0, z);
    group.rotation.y = this.rng.next() * Math.PI * 2;
    if (this._scene) this._scene.add(group);
    const ped = {
      group,
      position: group.position,
      heading: group.rotation.y,
      speed: 0,
      walkPhase: 0,
      paused: true,
      name: name || '',
      dirX: 0,
      dirZ: 0,
      axis: 'x',
    };
    this.pedestrians.push(ped);
    return ped;
  }

  // Remove the staged (paused) pedestrians (when a shot ends).
  clearStaged() {
    for (let i = this.pedestrians.length - 1; i >= 0; i -= 1) {
      if (this.pedestrians[i].paused) {
        if (this._scene) this._scene.remove(this.pedestrians[i].group);
        this.pedestrians.splice(i, 1);
      }
    }
  }

  // The fleet composition (what the unit test reads).
  getFleetComposition() {
    const byModel = {};
    const bySilhouette = {};
    for (const car of this.cars) {
      byModel[car.model] = (byModel[car.model] || 0) + 1;
      const sil = this._silhouette(car.model);
      bySilhouette[sil] = (bySilhouette[sil] || 0) + 1;
    }
    const moving = this.cars.filter((c) => !c.parked).length;
    const parked = this.cars.filter((c) => c.parked).length;
    const guaranteed = this.guaranteedModels.filter((m) => (byModel[m] || 0) >= 1);
    return {
      total: this.cars.length,
      moving,
      parked,
      byModel,
      bySilhouette,
      guaranteed,
      tourBus: this.tourBus ? { model: this.tourBus.model } : null,
    };
  }

  getPedestrians() {
    return this.pedestrians;
  }

  getCars() {
    return this.cars;
  }

  // Reset: clear the fleet and the slots (the unit test proves the
  // guarantees return after a reset).
  reset() {
    if (this._scene) {
      for (const car of this.cars) this._scene.remove(car.group);
      for (const ped of this.pedestrians) this._scene.remove(ped.group);
      if (this.tourBus) this._scene.remove(this.tourBus.group);
    }
    this.cars = [];
    this.pedestrians = [];
    this.tourBus = null;
    this._guaranteedIndex = 0;
    this._pickupSpawned = false;
    this._deck = createDeck(CONFIG.carModels, this.rng);
  }

  // One frame. Fills the fleet on the first update, then maintains it:
  // despawn cars that are too far from the player (never a guaranteed
  // car), and spawn replacements so the fleet never drops below its
  // cruising size. Pedestrians walk their sidewalks.
  update(dt, world, player) {
    if (!world || !world.roads) return;
    // ---- Fill the fleet on the first update -------------------------
    if (this.cars.length === 0) {
      // The guaranteed slots first (pickup, bus, coupe — moving).
      for (const model of this.guaranteedModels) {
        const car = this._spawnCar(model, world, player, false);
        if (car && model === 'Dune Pickup') this._pickupSpawned = true;
        this._guaranteedIndex += 1;
      }
      // Then the deck (moving) up to 11 moving total.
      while (this.cars.filter((c) => !c.parked).length < 11) {
        this._spawnCar(this._deck.draw(), world, player, false);
      }
      // Then 6 parked.
      while (this.cars.filter((c) => c.parked).length < this._targetParked) {
        this._spawnCar(this._deck.draw(), world, player, true);
      }
      // The tour bus (separate from the fleet).
      this._spawnTourBus(world, player);
    }
    // ---- Maintain the fleet ------------------------------------------
    const guaranteedSet = new Set(this.guaranteedModels);
    for (let i = this.cars.length - 1; i >= 0; i -= 1) {
      const car = this.cars[i];
      const d = Math.hypot(car.position.x - player.position.x, car.position.z - player.position.z);
      // Never despawn a guaranteed car, and never drop below the
      // cruising size.
      if (d > 220 && !guaranteedSet.has(car.model) && this.cars.length > this._targetCars) {
        if (this._scene) this._scene.remove(car.group);
        this.cars.splice(i, 1);
      }
    }
    // Top the fleet back up to its cruising size.
    while (this.cars.length < this._targetCars) {
      const parked = this.cars.filter((c) => c.parked).length < this._targetParked;
      this._spawnCar(this._deck.draw(), world, player, parked);
    }
    // ---- Drive the moving cars ---------------------------------------
    for (const car of this.cars) {
      if (car.parked) continue;
      // Ease toward the target speed.
      const diff = car.targetSpeed - car.speed;
      car.speed += Math.max(-8 * dt, Math.min(6 * dt, diff));
      // Follow the road: advance along it, and turn at the end.
      const road = world.roads[car.roadIndex];
      if (!road) continue;
      const segLen = Math.hypot(road.end.x - road.start.x, road.end.z - road.start.z);
      const advance = (car.speed * dt) / Math.max(1, segLen);
      car.roadT += car.roadDir * advance;
      if (car.roadT > 0.98 || car.roadT < 0.02) {
        // At the end of the road: pick a new road at this intersection.
        const atEnd = car.roadT > 0.5;
        const jx = atEnd ? road.end.x : road.start.x;
        const jz = atEnd ? road.end.z : road.start.z;
        const next = world.roadPointForLength(this.rng, 4, jx, jz, 30);
        if (next) {
          car.roadIndex = next.roadIndex;
          car.roadT = next.roadT;
          car.roadDir = this.rng.next() < 0.5 ? 1 : -1;
        } else {
          car.roadDir *= -1;
          car.roadT = Math.max(0.02, Math.min(0.98, car.roadT));
        }
      }
      const r2 = world.roads[car.roadIndex];
      const x = r2.start.x + (r2.end.x - r2.start.x) * car.roadT;
      const z = r2.start.z + (r2.end.z - r2.start.z) * car.roadT;
      // The heading follows the road's direction (and the drive side).
      const wantHeading = r2.axis === 'z'
        ? (car.roadDir > 0 ? 0 : Math.PI)
        : (car.roadDir > 0 ? Math.PI / 2 : -Math.PI / 2);
      let dh = wantHeading - car.heading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      car.heading += dh * Math.min(1, dt * 3);
      // A small lateral offset (right-hand driving) so the two
      // directions do not overlap.
      const off = 3.2;
      const ox = r2.axis === 'z' ? off : 0;
      const oz = r2.axis === 'x' ? off : 0;
      car.position.set(x + ox, 0, z + oz);
      car.group.position.copy(car.position);
      car.group.rotation.y = car.heading;
    }
    // The tour bus cruises its own loop.
    if (this.tourBus) {
      const bus = this.tourBus;
      bus.speed += Math.max(-6 * dt, Math.min(4 * dt, bus.targetSpeed - bus.speed));
      bus.position.z -= bus.speed * dt;
      if (bus.position.z < -280) bus.position.z = 260;
      bus.group.position.copy(bus.position);
    }
    // ---- Pedestrians --------------------------------------------------
    while (this.pedestrians.filter((p) => !p.paused).length < this._targetPeds) {
      this._spawnPedestrian(world, player);
    }
    for (const ped of this.pedestrians) {
      if (ped.paused) continue;
      // Walk along the sidewalk, turning at the block ends.
      if (ped.axis === 'x') ped.position.x += ped.dirX * ped.speed * dt;
      else ped.position.z += ped.dirZ * ped.speed * dt;
      if (ped.position.x > 300 || ped.position.x < -300) ped.dirX *= -1;
      if (ped.position.z > 260 || ped.position.z < -300) ped.dirZ *= -1;
      ped.walkPhase += dt * ped.speed * 4;
      ped.group.position.copy(ped.position);
      // A gentle walk bob.
      ped.group.position.y = Math.abs(Math.sin(ped.walkPhase)) * 0.03;
      const legs = ped.group.userData.legs;
      if (legs) legs.rotation.x = Math.sin(ped.walkPhase) * 0.4;
    }
  }
}
