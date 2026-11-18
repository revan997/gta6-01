// Solmar Bay — TrafficManager (Lane B)
// Spawns and updates AI traffic cars and pedestrians on the road network
// described by the world object. All randomness comes from the seeded
// generator passed in (an object with next()/range()/pick(), or a factory
// function taking a numeric seed and returning such a generator).
// Never uses Math.random. Works purely through the Lane A contract:
//   world  — roads / spawn points / nearest-road queries
//   car    — { position, heading, speed, model, colour, setDriver, update }
//   player — { position, heading, health, inCar, vehicle }
// Round 3: cars stop at red traffic lights (world.trafficLights).
import { CONFIG } from './config.js';

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function makeSeededRng(seed) {
  // mulberry32 — deterministic fallback when the caller passes no generator.
  let s = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

function normaliseRng(rng, seed) {
  if (rng && typeof rng.range === 'function' && typeof rng.next === 'function') return rng;
  if (typeof rng === 'function') {
    const g = rng(seed);
    if (g && typeof g.range === 'function') return g;
  }
  return makeSeededRng(seed);
}

const CAR_MODELS = [
  { model: 'Solmar Sedan', colour: '#c0392b' },
  { model: 'Solmar Sedan', colour: '#2e86c1' },
  { model: 'Solmar Sedan', colour: '#f1c40f' },
  { model: 'Solmar Sedan', colour: '#ecf0f1' },
  { model: 'Bay Taxi', colour: '#f39c12' },
  { model: 'Bay Taxi', colour: '#f39c12' },
  { model: 'Harbour Van', colour: '#7f8c8d' },
  { model: 'Harbour Van', colour: '#ffffff' },
  { model: 'Palm Coupe', colour: '#8e44ad' },
  { model: 'Palm Coupe', colour: '#16a085' },
  { model: 'Dune Pickup', colour: '#a04000' },
  { model: 'City Bus', colour: '#2471a3' },
  // Round-3 additions: a beach buggy, a food truck and a long limo.
  { model: 'Beach Buggy', colour: '#f1c40f' },
  { model: 'Food Truck', colour: '#e67e22' },
  { model: 'Solmar Limo', colour: '#1a1a1a' },
];

const PED_SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1'];

// Zebra-crossing centres (must match the crossings world.js paints at
// downtown intersections). Pedestrians cross here in round 4.
const ZEBRA_X = [-120, -40, 40, 120];
const ZEBRA_Z = [-120, -40, 40];

// Round-6 sightseeing tour: a bus loops past the two new landmarks —
// the Solmar Spire downtown (80, -80) and the Marina Bridge over the
// basin (x 150–330 at z -240, per CONFIG.round6.landmarks) — then back
// through the marina promenade and Downtown Plaza. The bus dwells a few
// seconds at each stop so the landmarks read as destinations, not
// drive-bys. Waypoints are world coordinates, not road points: the tour
// is a fixed route, independent of the road network.
export const TOUR_STOPS = [
  { x: 80, z: -80, label: 'Solmar Spire' },
  { x: 160, z: -240, label: 'Marina Bridge (west end)' },
  { x: 320, z: -240, label: 'Marina Bridge (east end)' },
  { x: 240, z: -80, label: 'Marina Promenade' },
  { x: 0, z: 0, label: 'Downtown Plaza' },
  // Round 7: the Solmar Pyramid joins the loop last, so the tour bus
  // drives past all three landmarks before returning to the Spire.
  { x: -80, z: 80, label: 'Solmar Pyramid' },
];
const TOUR_SPEED = 9; // m/s, a slow sightseeing cruise
const TOUR_DWELL = 3; // seconds paused at each stop

// A traffic car is a plain data object shaped like the Lane A car contract:
// { position, heading, speed, model, colour, driver, update(dt, world) }.
// If the world supplies a car factory (world.createCar / options.createCar)
// it is used; otherwise this lightweight stand-in is used so the systems
// layer stays testable without the 3D layer.
function makeTrafficCar(spec, rng) {
  return {
    kind: 'traffic-car',
    position: { x: spec.position.x, y: spec.position.y || 0, z: spec.position.z },
    heading: spec.heading || 0,
    speed: spec.speed || 0,
    targetSpeed: spec.targetSpeed || rng.range(8, 14),
    model: spec.model,
    colour: spec.colour,
    driver: spec.driver || 'ai',
    roadIndex: spec.roadIndex ?? 0,
    roadT: spec.roadT ?? 0,
    roadDirection: spec.roadDirection ?? 1,
    laneOffset: spec.laneOffset ?? 0,
    stopped: false,
    stopTimer: 0,
    setDriver(driver) { this.driver = driver; },
    update(dt) {
      // Simple cruise: ease toward target speed unless stopped.
      const target = this.stopped ? 0 : this.targetSpeed;
      this.speed += clamp(target - this.speed, -12 * dt, 6 * dt);
      this.position.x += Math.sin(this.heading) * this.speed * dt;
      this.position.z += Math.cos(this.heading) * this.speed * dt;
    },
  };
}

function makePedestrian(spec, rng) {
  return {
    kind: 'pedestrian',
    position: { x: spec.position.x, y: spec.position.y || 0, z: spec.position.z },
    heading: spec.heading || 0,
    speed: rng.range(1.0, 1.8),
    walkPhase: rng.range(0, Math.PI * 2),
    shirt: spec.shirt,
    roadIndex: spec.roadIndex ?? 0,
    roadT: spec.roadT ?? 0,
    roadDirection: spec.roadDirection ?? 1,
    side: spec.side ?? 1,
    paused: false,
    pauseTimer: 0,
    alive: true,
    // Round-4 zebra crossing state: `cross` is null while walking the
    // sidewalk, { from, to, p } while crossing the road; `wantCross` is
    // set while waiting at the curb and consumed when the wait ends.
    cross: null,
    wantCross: false,
    update(dt) {
      if (!this.alive) return;
      if (this.paused) {
        this.pauseTimer -= dt;
        if (this.pauseTimer <= 0) this.paused = false;
        return;
      }
      this.walkPhase += dt * this.speed * 4;
      this.position.x += Math.sin(this.heading) * this.speed * dt;
      this.position.z += Math.cos(this.heading) * this.speed * dt;
    },
  };
}

export class TrafficManager {
  constructor(options = {}) {
    this.rng = normaliseRng(options.rng, options.seed ?? 1337);
    this.createCar = options.createCar || null; // Lane A car factory, if supplied
    this.maxCars = options.maxCars ?? 14;
    this.maxPedestrians = options.maxPedestrians ?? 18;
    this.spawnRadius = options.spawnRadius ?? 120; // spawn ahead within this
    this.despawnRadius = options.despawnRadius ?? 180;
    this.cars = [];
    this.pedestrians = [];
    this._spawnCooldown = 0;
    this._parkedSpawned = false; // parked cars are placed once, on first update()
    this._time = 0; // round 4: accumulated seconds, drives the speed wobble
    this.tourBus = null; // round 6: sightseeing bus on the TOUR_STOPS loop
    this._tourSpawned = false; // the tour bus is placed once, on first update()
  }

  // True when (x, z) is at a zebra crossing (downtown intersections).
  // A pedestrian walks on the sidewalk, ~8.5 m off the centreline, so
  // "at the crossing" means: on one approach road (within 12 m of its
  // centreline) AND within 5 m of the intersection along that road.
  // A plain 2D box around the centre never fires — the sidewalk offset
  // alone is already 8.5 m.
  _nearZebra(x, z) {
    for (const ix of ZEBRA_X) {
      for (const iz of ZEBRA_Z) {
        if (Math.abs(x - ix) < 12 && Math.abs(z - iz) < 5) return true;
        if (Math.abs(z - iz) < 12 && Math.abs(x - ix) < 5) return true;
      }
    }
    return false;
  }

  // ---- world queries (duck-typed, with safe fallbacks) ----

  _roads(world) {
    if (!world) return [];
    if (typeof world.getRoads === 'function') return world.getRoads() || [];
    if (Array.isArray(world.roads)) return world.roads;
    return [];
  }

  _roadPoints(road) {
    if (!road) return [];
    if (Array.isArray(road.points)) return road.points;
    if (Array.isArray(road.path)) return road.path;
    if (Array.isArray(road)) return road;
    // Lane A roads are segments: { start: {x,z}, end: {x,z}, width, axis }.
    if (road.start && road.end) return [road.start, road.end];
    return [];
  }

  // True length of a road polyline in metres (Lane A segments are long;
  // the old "(points-1) * 20" guess made cars teleport along them).
  _roadLength(road) {
    const pts = this._roadPoints(road);
    let len = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      len += Math.hypot((pts[i + 1].x - pts[i].x) || 0, (pts[i + 1].z - pts[i].z) || 0);
    }
    return Math.max(len, 1);
  }

  _pointOnRoad(world, road, t) {
    const pts = this._roadPoints(road);
    if (pts.length === 0) return { x: 0, y: 0, z: 0 };
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y || 0, z: pts[0].z };
    const clamped = clamp(t, 0, 1);
    const segFloat = clamped * (pts.length - 1);
    const i = Math.min(Math.floor(segFloat), pts.length - 2);
    const f = segFloat - i;
    const a = pts[i];
    const b = pts[i + 1];
    return {
      x: a.x + (b.x - a.x) * f,
      y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * f,
      z: a.z + (b.z - a.z) * f,
    };
  }

  _roadHeading(road, t) {
    const pts = this._roadPoints(road);
    if (pts.length < 2) return 0;
    const a = this._pointOnRoad(null, road, clamp(t - 0.01, 0, 1));
    const b = this._pointOnRoad(null, road, clamp(t + 0.01, 0, 1));
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  // Pick a road point near (but not on top of) the player, biased ahead of
  // the player's heading so traffic appears where the player is going.
  _pickSpawnPoint(world, player, aheadBias) {
    const roads = this._roads(world);
    const rng = this.rng;
    const px = player?.position?.x ?? 0;
    const pz = player?.position?.z ?? 0;
    const heading = player?.heading ?? 0;
    if (typeof world?.getRandomRoadPoint === 'function') {
      const p = world.getRandomRoadPoint(rng);
      if (p) return { position: p, roadIndex: 0, roadT: 0.5 };
    }
    if (roads.length === 0) {
      // Fallback grid: no world roads supplied, spawn on a ring around player.
      const angle = rng.range(0, Math.PI * 2);
      const r = rng.range(40, this.spawnRadius);
      return {
        position: { x: px + Math.sin(angle) * r, y: 0, z: pz + Math.cos(angle) * r },
        roadIndex: 0, roadT: 0.5,
      };
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      const roadIndex = Math.floor(rng.next() * roads.length);
      const road = roads[roadIndex];
      const t = rng.next();
      const pos = this._pointOnRoad(world, road, t);
      const d = dist2D(pos, { x: px, z: pz });
      // Ahead bias: prefer points roughly in front of the player.
      let ahead = 0;
      if (aheadBias) {
        const dx = pos.x - px;
        const dz = pos.z - pz;
        ahead = (Math.sin(heading) * dx + Math.cos(heading) * dz) / Math.max(d, 0.001);
      }
      if (d > 25 && d < this.spawnRadius && (!aheadBias || ahead > -0.3 || attempt > 8)) {
        return { position: pos, roadIndex, roadT: t };
      }
    }
    const roadIndex = Math.floor(rng.next() * roads.length);
    return {
      position: this._pointOnRoad(world, roads[roadIndex], rng.next()),
      roadIndex, roadT: 0.5,
    };
  }

  // Round-8: tag a real sculpted car for the sculpt report — the
  // traffic cars and the tour bus already come from the Lane A factory
  // (createCar), so they carry car.sculpt; this just folds their
  // fender / arch-liner / glasshouse counts into the running totals
  // getSculptedCarsReport() reads. Stand-in cars have no sculpt and
  // are skipped, so the totals only ever count real sculpted bodies.
  _tagSculpted(car) {
    if (!car || !car.sculpt) return;
    const sc = car.sculpt;
    this._sculptTotals = this._sculptTotals || { cars: 0, fenders: 0, archLiners: 0, glasshouse: 0, roofCrowns: 0, roofIntegrated: 0 };
    this._sculptTotals.cars += 1;
    this._sculptTotals.fenders += sc.fenders || 0;
    this._sculptTotals.archLiners += sc.archLiners || 0;
    this._sculptTotals.glasshouse += sc.glasshouse || 0;
    if (sc.roofCrown) this._sculptTotals.roofCrowns += 1;
    // Round-9: count cars whose crown is integrated into the body
    // (sunk into a body deck with fillets), not just crowned.
    if (sc.roofIntegrated) this._sculptTotals.roofIntegrated += 1;
  }

  // Round-5 dusk: traffic cars run their headlights — brighter headlight
  // glow sprites + stronger headlight emissive on real 3D cars. Applied
  // once per car (guarded by _duskHeadlightsApplied); stand-in cars have
  // no mesh so this is a no-op for them. Reads CONFIG.round5 when it
  // exists, otherwise uses hardcoded dusk values.
  _applyDuskHeadlights(car) {
    if (!car || car._duskHeadlightsApplied || !car.group) return;
    car._duskHeadlightsApplied = true;
    const cfg = CONFIG.round5?.traffic || {};
    const glowOpacity = cfg.headlightGlowOpacity ?? 0.95;
    const glowScale = cfg.headlightGlowScale ?? 1.8;
    const emissive = cfg.headlightEmissive ?? 1.8;
    if (car.headMat) car.headMat.emissiveIntensity = emissive;
    if (Array.isArray(car.headGlows)) {
      for (const g of car.headGlows) { if (g) g.opacity = glowOpacity; }
    }
    if (Array.isArray(car.headGlowSprites)) {
      for (const s of car.headGlowSprites) {
        if (s && s.scale && typeof s.scale.setScalar === 'function') s.scale.setScalar(glowScale);
      }
    }
  }

  // ---- round-6 sightseeing tour bus ----
  // Spawned once, at the Solmar Spire stop, dwelling there before setting
  // off. Kept OUT of this.cars on purpose: the AI update loop only drives
  // driver 'ai' cars and the despawn filter would eat a car on a fixed
  // route, so the tour bus lives on this.tourBus and is moved by
  // _updateTourBus below. It is a real sculpted bus (Lane A factory when
  // available, so it carries car.sculpt) with driver 'tour'.
  _spawnTourBus(world) {
    const first = TOUR_STOPS[0];
    const next = TOUR_STOPS[1];
    const heading = Math.atan2(next.x - first.x, next.z - first.z);
    let bus;
    if (this.createCar) {
      bus = this.createCar({
        position: { x: first.x, y: 0, z: first.z }, heading,
        model: 'City Bus', colour: '#2471a3', driver: 'tour',
        roadIndex: 0, roadT: 0, roadDirection: 1,
      });
    } else {
      bus = makeTrafficCar({
        position: { x: first.x, y: 0, z: first.z }, heading,
        model: 'City Bus', colour: '#2471a3', driver: 'tour',
        targetSpeed: TOUR_SPEED,
      }, this.rng);
    }
    bus.driver = 'tour';
    bus.speed = 0;
    bus.targetSpeed = TOUR_SPEED;
    bus._tourIndex = 1; // next stop to drive to
    bus._tourPause = TOUR_DWELL; // dwell at the Spire before departing
    bus.tourStop = first.label;
    this._applyDuskHeadlights(bus);
    this._tagSculpted(bus); // round-8: the tour bus counts in the sculpt report
    this.tourBus = bus;
    return bus;
  }

  // One step of the tour loop: dwell at a stop, then drive straight to
  // the next stop at TOUR_SPEED and dwell there. The bus is steered by
  // position (like other real 3D cars in the AI loop), so car.update is
  // never called on it — that would move it a second time per frame.
  _updateTourBus(step) {
    const bus = this.tourBus;
    if (!bus) return;
    if (bus._tourPause > 0) {
      bus._tourPause -= step;
      bus.speed = 0;
      return;
    }
    const stop = TOUR_STOPS[bus._tourIndex % TOUR_STOPS.length];
    const dx = stop.x - bus.position.x;
    const dz = stop.z - bus.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) {
      bus._tourIndex = (bus._tourIndex + 1) % TOUR_STOPS.length;
      bus._tourPause = TOUR_DWELL;
      bus.tourStop = stop.label;
      bus.speed = 0;
      return;
    }
    bus.heading = Math.atan2(dx, dz);
    bus.speed = TOUR_SPEED;
    bus.position.x += Math.sin(bus.heading) * TOUR_SPEED * step;
    bus.position.z += Math.cos(bus.heading) * TOUR_SPEED * step;
    if (bus.group) bus.group.rotation.y = bus.heading;
  }

  _spawnCar(world, player) {
    const pick = this._pickSpawnPoint(world, player, true);
    const roads = this._roads(world);
    const road = roads[pick.roadIndex];
    const spec = this.rng.pick(CAR_MODELS);
    const direction = this.rng.next() < 0.5 ? 1 : -1;
    const baseHeading = road ? this._roadHeading(road, pick.roadT) : this.rng.range(0, Math.PI * 2);
    const heading = direction > 0 ? baseHeading : baseHeading + Math.PI;
    const laneOffset = (road?.width ? road.width * 0.25 : 2) * (direction > 0 ? 1 : -1);
    const position = {
      x: pick.position.x + Math.cos(heading) * laneOffset,
      y: pick.position.y || 0,
      z: pick.position.z - Math.sin(heading) * laneOffset,
    };
    let car;
    if (this.createCar) {
      car = this.createCar({
        position, heading, model: spec.model, colour: spec.colour,
        driver: 'ai', roadIndex: pick.roadIndex, roadT: pick.roadT, roadDirection: direction,
      });
    } else {
      car = makeTrafficCar({
        position, heading, model: spec.model, colour: spec.colour,
        roadIndex: pick.roadIndex, roadT: pick.roadT, roadDirection: direction,
        // Round-4b: cruise speeds cluster around 11 m/s (bell curve)
        // instead of spreading uniformly — traffic feels less robotic.
        targetSpeed: Math.max(6, Math.min(16, 11 + (this.rng.gaussian ? this.rng.gaussian() : 0) * 2)),
      }, this.rng);
    }
    // Real 3D cars (Lane A factory) also need a cruise speed: the road
    // follower below steers them by position, and uses targetSpeed as the
    // speed it reports. The stand-in sets this itself.
    if (car.targetSpeed === undefined) car.targetSpeed = Math.max(6, Math.min(16, 11 + (this.rng.gaussian ? this.rng.gaussian() : 0) * 2));
    // Round-4: each car cruises a little differently — a baseline speed
    // and a phase for the gentle speed breathing applied in update().
    car.baseTargetSpeed = car.targetSpeed;
    car.speedPhase = this.rng.range(0, Math.PI * 2);
    // Round-5 dusk: headlights on for moving traffic.
    this._applyDuskHeadlights(car);
    this._tagSculpted(car); // round-8: fold the sculpt counts into the report totals
    car.roadIndex = pick.roadIndex;
    car.roadT = pick.roadT;
    car.roadDirection = direction;
    car.laneOffset = laneOffset;
    this.cars.push(car);
    return car;
  }

  // ---- parked cars (visual polish): 6 decorative cars at road edges near
  // downtown, placed once on the first update() call. They are real cars
  // (Lane A factory when available) with driver 'parked' and speed 0: the
  // update loop never AI-drives them (it skips non-'ai' drivers), the
  // despawn filter keeps them, and jackNearestCar can target them (it only
  // skips driver 'player').
  _spawnParkedCars(world, player) {
    const downtown = world && world.spawns && world.spawns.downtown;
    const anchor = downtown || (player && player.position
      ? { x: player.position.x, z: player.position.z, heading: player.heading || 0 }
      : { x: 0, z: 0, heading: 0 });
    const anchorPlayer = { position: { x: anchor.x, z: anchor.z }, heading: anchor.heading || 0 };
    for (let i = 0; i < 6; i++) {
      const pick = this._pickSpawnPoint(world, anchorPlayer, false);
      const roads = this._roads(world);
      const road = roads[pick.roadIndex];
      const baseHeading = road ? this._roadHeading(road, pick.roadT) : this.rng.range(0, Math.PI * 2);
      const direction = this.rng.next() < 0.5 ? 1 : -1;
      const heading = direction > 0 ? baseHeading : baseHeading + Math.PI;
      const side = this.rng.next() < 0.5 ? 1 : -1;
      // Lane offset at the road edge: centreline half-width minus a car
      // half-width, so the car hugs the edge instead of the centreline.
      const edgeOffset = (road?.width ? road.width * 0.5 - 1.2 : 2.5) * side;
      const position = {
        x: pick.position.x + Math.cos(baseHeading) * edgeOffset,
        y: pick.position.y || 0,
        z: pick.position.z - Math.sin(baseHeading) * edgeOffset,
      };
      const spec = this.rng.pick(CAR_MODELS);
      // Round-4: parked cars get a wider colour palette (not just the
      // traffic-model colours) and a slight parking angle, so the kerb
      // reads as a lived-in street instead of a repeating row.
      const parkedColour = this.rng.pick(
        CONFIG.round4?.traffic?.parkedPalette || [spec.colour],
      );
      let car;
      if (this.createCar) {
        car = this.createCar({
          position, heading: heading + this.rng.range(-0.06, 0.06),
          model: spec.model, colour: parkedColour,
          driver: 'parked', roadIndex: pick.roadIndex, roadT: pick.roadT,
          roadDirection: direction,
        });
      } else {
        car = makeTrafficCar({
          position, heading, model: spec.model, colour: parkedColour,
          driver: 'parked', roadIndex: pick.roadIndex, roadT: pick.roadT,
          roadDirection: direction, targetSpeed: 0,
        }, this.rng);
      }
      car.driver = 'parked';
      car.speed = 0;
      car.targetSpeed = 0;
      this._tagSculpted(car); // round-8: parked cars are sculpted too
      car.roadIndex = pick.roadIndex;
      car.roadT = pick.roadT;
      car.roadDirection = direction;
      car.laneOffset = edgeOffset;
      this.cars.push(car);
    }
  }

  _spawnPedestrian(world, player) {
    const pick = this._pickSpawnPoint(world, player, false);
    const roads = this._roads(world);
    const road = roads[pick.roadIndex];
    const side = this.rng.next() < 0.5 ? 1 : -1;
    const sidewalk = (road?.width ? road.width * 0.5 + 1.5 : 4) * side;
    const baseHeading = road ? this._roadHeading(road, pick.roadT) : this.rng.range(0, Math.PI * 2);
    const heading = this.rng.next() < 0.5 ? baseHeading : baseHeading + Math.PI;
    const position = {
      x: pick.position.x + Math.cos(baseHeading) * sidewalk,
      y: pick.position.y || 0,
      z: pick.position.z - Math.sin(baseHeading) * sidewalk,
    };
    const ped = makePedestrian({
      position, heading, shirt: this.rng.pick(PED_SHIRTS),
      roadIndex: pick.roadIndex, roadT: pick.roadT, roadDirection: side, side,
    }, this.rng);
    this.pedestrians.push(ped);
    return ped;
  }

  // ---- main update: update(dt, world, player) ----

  update(dt, world, player) {
    if (!dt || dt <= 0) return;
    const step = Math.min(dt, 0.05); // clamp huge frame gaps
    this._time = (this._time || 0) + step; // round 4: speed-wobble clock
    const px = player?.position?.x ?? 0;
    const pz = player?.position?.z ?? 0;
    const playerPos = { x: px, z: pz };

    // Parked cars: placed once, on the first update() call.
    if (!this._parkedSpawned) {
      this._parkedSpawned = true;
      this._spawnParkedCars(world, player);
    }

    // Round-6 tour bus: placed once, on the first update() call, then
    // driven around the landmark loop every frame below.
    if (!this._tourSpawned) {
      this._tourSpawned = true;
      this._spawnTourBus(world);
    }
    this._updateTourBus(step);

    // Maintain population.
    this._spawnCooldown -= step;
    if (this._spawnCooldown <= 0) {
      this._spawnCooldown = 0.5;
      while (this.cars.length < this.maxCars) this._spawnCar(world, player);
      while (this.pedestrians.length < this.maxPedestrians) this._spawnPedestrian(world, player);
    }

    // --- Cars: follow their road, simple avoidance, despawn far away. ---
    const roads = this._roads(world);
    for (const car of this.cars) {
      if (car.driver && car.driver !== 'ai') continue; // player-driven now
      // Round-5 dusk: catch any AI car that missed the spawn-time
      // headlight pass (e.g. a car created before this lane landed).
      this._applyDuskHeadlights(car);
      // Round-4: cruise speed breathes gently around the car's own
      // baseline, so traffic does not move in lockstep.
      if (car.baseTargetSpeed !== undefined) {
        const wobble = CONFIG.round4?.traffic?.speedWobble ?? 0.08;
        car.targetSpeed = car.baseTargetSpeed
          * (1 + wobble * Math.sin(this._time * 0.6 + (car.speedPhase || 0)));
      }
      // Advance along the road polyline so cars follow bends.
      const road = roads[car.roadIndex];
      if (road) {
        const approxLen = this._roadLength(road);
        car.roadT = (car.roadT ?? 0.5) + ((car.speed || 0) * step * (car.roadDirection || 1)) / Math.max(approxLen, 1);
        if (car.roadT > 1 || car.roadT < 0) {
          // Reached the end of a road: hop to another road near this point.
          const next = this._pickSpawnPoint(world, { position: car.position, heading: car.heading }, false);
          car.roadIndex = next.roadIndex;
          car.roadT = clamp(next.roadT, 0.05, 0.95);
          car.position.x = next.position.x;
          car.position.z = next.position.z;
          car.heading = this._roadHeading(roads[car.roadIndex], car.roadT);
          if ((car.roadDirection || 1) < 0) car.heading += Math.PI;
        } else {
          const onRoad = this._pointOnRoad(world, road, car.roadT);
          const heading = this._roadHeading(road, car.roadT) + ((car.roadDirection || 1) < 0 ? Math.PI : 0);
          car.heading = heading;
          car.position.x = onRoad.x + Math.cos(heading) * (car.laneOffset || 0);
          car.position.z = onRoad.z - Math.sin(heading) * (car.laneOffset || 0);
        }
      }
      // Avoidance: stop if another car / the player is close ahead.
      car.stopped = false;
      const aheadX = car.position.x + Math.sin(car.heading) * 7;
      const aheadZ = car.position.z + Math.cos(car.heading) * 7;
      // Round-3 polish: stop at a red traffic light ahead. The light sits
      // on the intersection corner, so a car on either approach road
      // passes within ~10 m of it; the light cycles, so the wait is short.
      if (world && Array.isArray(world.trafficLights)) {
        const stopD = CONFIG.trafficLights?.stopDistance ?? 14;
        for (const light of world.trafficLights) {
          if (light.state !== 'red') continue;
          const dx = light.x - car.position.x;
          const dz = light.z - car.position.z;
          const along = Math.sin(car.heading) * dx + Math.cos(car.heading) * dz;
          const side = Math.abs(Math.cos(car.heading) * dx - Math.sin(car.heading) * dz);
          if (along > 0 && along < stopD && side < 12) { car.stopped = true; break; }
        }
      }
      for (const other of this.cars) {
        if (other === car || other.driver === 'player') continue;
        const d = dist2D({ x: aheadX, z: aheadZ }, other.position);
        if (d < 5) { car.stopped = true; break; }
      }
      if (!car.stopped && player) {
        const pv = player.vehicle || player.car || null;
        const target = pv && pv.position ? pv : player;
        const d = dist2D({ x: aheadX, z: aheadZ }, target.position);
        if (d < 5) car.stopped = true;
      }
      // Real 3D cars (Lane A factory) are steered by position above, so
      // their own arcade update must NOT run: it would move them a second
      // time per frame and bleed their speed to zero (no throttle input).
      // Just report the cruise speed and keep the mesh facing its heading.
      if (car.group && car.kind !== 'traffic-car') {
        car.speed = car.stopped ? 0 : (car.targetSpeed || 0);
        car.group.rotation.y = car.heading;
      } else if (typeof car.update === 'function') {
        car.update(step, world);
      }
      // Keep speed in sync for the stand-in car (Lane A cars manage it).
      if (car.kind === 'traffic-car') {
        const target = car.stopped ? 0 : car.targetSpeed;
        car.speed += clamp(target - car.speed, -12 * step, 6 * step);
      }
    }

    // --- Pedestrians: stroll along the sidewalk, pause sometimes, and
    // cross at zebra crossings (round 4): wait at the curb, then walk
    // across to the far sidewalk and carry on on the other side. ---
    for (const ped of this.pedestrians) {
      if (!ped.alive) continue;
      if (!ped.paused && this.rng.next() < step * 0.02) {
        ped.paused = true;
        ped.pauseTimer = this.rng.range(1, 4);
      }
      const road = roads[ped.roadIndex];
      if (ped.cross) {
        // Mid-crossing: walk straight across the road at fixed roadT.
        if (!road) {
          ped.cross = null;
        } else {
          const width = (road.width || 14) + 3;
          ped.cross.p += step * (ped.speed || 1.2) / width;
          const onRoad = this._pointOnRoad(world, road, ped.roadT);
          const baseHeading = this._roadHeading(road, ped.roadT);
          const s = clamp(ped.cross.p, 0, 1);
          const off = ped.cross.from + (ped.cross.to - ped.cross.from) * s;
          ped.position.x = onRoad.x + Math.cos(baseHeading) * off;
          ped.position.z = onRoad.z - Math.sin(baseHeading) * off;
          const dirSign = ped.cross.to > ped.cross.from ? 1 : -1;
          ped.heading = Math.atan2(Math.cos(baseHeading) * dirSign, -Math.sin(baseHeading) * dirSign);
          if (ped.cross.p >= 1) {
            ped.side = -(ped.side || 1);
            ped.cross = null;
          }
        }
      } else if (ped.paused) {
        // Standing still — a random pause, or waiting at the curb. The
        // curb wait is consumed by the branch below once ped.update
        // clears `paused`, so the pedestrian steps out only after the
        // wait actually ends.
      } else if (ped.wantCross) {
        // The curb wait just ended: step out onto the zebra crossing.
        const halfW = (road?.width || 14) / 2 + 1.5;
        ped.cross = { from: halfW * (ped.side || 1), to: -halfW * (ped.side || 1), p: 0 };
        ped.wantCross = false;
      } else if (road) {
        const approxLen = this._roadLength(road);
        ped.roadT = (ped.roadT ?? 0.5) + ((ped.speed || 1.2) * step * (ped.roadDirection || 1)) / Math.max(approxLen, 1);
        if (ped.roadT > 1 || ped.roadT < 0) {
          ped.roadDirection = -(ped.roadDirection || 1);
          ped.roadT = clamp(ped.roadT, 0.02, 0.98);
          ped.heading += Math.PI;
        } else {
          const onRoad = this._pointOnRoad(world, road, ped.roadT);
          const baseHeading = this._roadHeading(road, ped.roadT);
          const sidewalk = ((road.width || 8) * 0.5 + 1.5) * (ped.side || 1);
          ped.position.x = onRoad.x + Math.cos(baseHeading) * sidewalk;
          ped.position.z = onRoad.z - Math.sin(baseHeading) * sidewalk;
          ped.heading = baseHeading + ((ped.roadDirection || 1) > 0 ? 0 : Math.PI);
        }
        // Zebra decision: near a crossing, sometimes wait at the curb.
        if (!ped.cross && this._nearZebra(ped.position.x, ped.position.z)
          && this.rng.next() < step * (CONFIG.round4?.traffic?.pedCrossChance ?? 0.15)) {
          ped.paused = true;
          ped.pauseTimer = this.rng.range(0.6, 1.8);
          ped.wantCross = true;
        }
      }
      if (typeof ped.update === 'function') ped.update(step, world);
    }

    // --- Despawn anything far from the player; the spawn loop refills. ---
    this.cars = this.cars.filter((car) => {
      if (car.driver === 'player') return true; // never despawn the player's car
      if (car.driver === 'parked') return true; // never despawn parked cars
      return dist2D(car.position, playerPos) < this.despawnRadius;
    });
    this.pedestrians = this.pedestrians.filter((ped) => {
      if (!ped.alive) return false;
      return dist2D(ped.position, playerPos) < this.despawnRadius;
    });
  }

  // ---- carjacking ----

  nearestCar(player, maxDistance = 6) {
    if (!player?.position) return null;
    let best = null;
    let bestD = maxDistance;
    for (const car of this.cars) {
      if (car.driver === 'player') continue;
      const d = dist2D(car.position, player.position);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  // Steal (jack) the nearest traffic car: the player gets in, the AI driver
  // is removed, and the car is returned (null when nothing is in reach).
  // Returns { car, jacked: true } or null.
  jackNearestCar(player, maxDistance = 6) {
    const car = this.nearestCar(player, maxDistance);
    if (!car || !player) return null;
    car.setDriver?.('player');
    car.driver = 'player';
    car.stopped = false;
    car.speed = 0;
    if (typeof player.enterCar === 'function') {
      player.enterCar(car);
    } else {
      player.vehicle = car;
      player.car = car;
      player.inCar = true;
    }
    // Remove it from the AI list so traffic no longer drives it.
    this.cars = this.cars.filter((c) => c !== car);
    return { car, jacked: true };
  }

  getCars() { return this.cars; }
  getParkedCars() { return this.cars.filter((c) => c.driver === 'parked'); }
  getPedestrians() { return this.pedestrians.filter((p) => p.alive); }

  // Round-6: the sightseeing bus (null until the first update() spawns it).
  getTourBus() { return this.tourBus; }

  // Round-6: where the tour bus is on its loop — the stop it last
  // reached, the next stop, and whether it is dwelling there now.
  // Returns null until the first update() spawns the bus.
  getTourStatus() {
    const bus = this.tourBus;
    if (!bus) return null;
    const next = TOUR_STOPS[bus._tourIndex % TOUR_STOPS.length];
    return {
      atStop: bus.tourStop || null,
      nextStop: next.label,
      dwelling: (bus._tourPause || 0) > 0,
      position: { x: bus.position.x, z: bus.position.z },
    };
  }

  // Round-6: every car in the scene that carries round-6 sculpt data
  // (car.sculpt from vehicle.js) — the AI traffic cars plus the tour
  // bus when it is a real 3D car. Stand-in cars have no sculpt and are
  // left out, so callers can trust that every returned car is sculpted.
  getSculptedCars() {
    const list = this.cars.filter((c) => c && c.sculpt);
    if (this.tourBus && this.tourBus.sculpt) list.push(this.tourBus);
    return list;
  }

  // Round-8: the sculpt report — the same sculpted cars as
  // getSculptedCars(), plus the round-8 counts the test harness probes:
  // fender flares, arch liners and glasshouse panels per car and in
  // total, and how many cars carry a curved roof crown. The per-car
  // entries carry the raw car.sculpt object, so a probe can check any
  // single model (e.g. the bus must have 6 fenders / 6 arch liners).
  // Totals are recomputed from the live list every call (not just the
  // spawn-time _sculptTotals), so despawned cars drop out of the count.
  // Round-8 re-touch: the totals summary now covers EVERY sculpt
  // feature (hood / windshield / hub caps / angled panels too), so the
  // harness can assert the whole fleet in one probe.
  getSculptedCarsReport() {
    const cars = this.getSculptedCars();
    const totals = {
      cars: cars.length, fenders: 0, archLiners: 0, glasshouse: 0, roofCrowns: 0,
      hood: 0, windshield: 0, hubCaps: 0, angled: 0, roofIntegrated: 0, roofFillets: 0,
      roofDecks: 0,
    };
    const perModel = {};
    for (const car of cars) {
      const sc = car.sculpt || {};
      totals.fenders += sc.fenders || 0;
      totals.archLiners += sc.archLiners || 0;
      totals.glasshouse += sc.glasshouse || 0;
      if (sc.roofCrown) totals.roofCrowns += 1;
      // Round-9: integrated roofs (crown sunk into a body deck) and
      // their side fillets, so the harness can assert the roof fix
      // fleet-wide instead of trusting the crown flag alone.
      if (sc.roofIntegrated) totals.roofIntegrated += 1;
      // Round-9 re-touch (new recording): count the body decks the
      // crowns rise through, so the report proves the integration is
      // structural (deck + fillets + sink), not just a flag.
      if (sc.roofDeck) totals.roofDecks += 1;
      totals.roofFillets += sc.roofFillets || 0;
      if (sc.hood) totals.hood += 1;
      if (sc.windshield) totals.windshield += 1;
      totals.hubCaps += sc.hubCaps || 0;
      totals.angled += sc.angled || 0;
      const key = car.model || 'unknown';
      perModel[key] = {
        fenders: sc.fenders || 0,
        archLiners: sc.archLiners || 0,
        glasshouse: sc.glasshouse || 0,
        roofCrown: Boolean(sc.roofCrown),
        roofIntegrated: Boolean(sc.roofIntegrated),
        // Round-9 re-touch (new recording): how far the crown base is
        // sunk below the deck top, and how many side fillets hug it —
        // the two numbers that prove the rim is buried, not perched.
        roofSink: sc.roofSink || 0,
        roofFillets: sc.roofFillets || 0,
        roofDeck: Boolean(sc.roofDeck),
        crownH: sc.crownH || 0,
        angled: sc.angled || 0,
      };
    }
    return {
      cars: cars.map((c) => ({ model: c.model, sculpt: c.sculpt || null })),
      totals,
      perModel,
    };
  }

  // Remove a pedestrian (hit / shot). Returns true when one was removed.
  removePedestrian(ped) {
    const before = this.pedestrians.length;
    this.pedestrians = this.pedestrians.filter((p) => p !== ped);
    return this.pedestrians.length < before;
  }

  reset() {
    this.cars = [];
    this.pedestrians = [];
    this._spawnCooldown = 0;
    this._parkedSpawned = false;
    this._time = 0;
    this.tourBus = null;
    this._tourSpawned = false;
    this._sculptTotals = null; // round-8: sculpt totals rebuild on respawn
  }
}

export function createTrafficManager(options = {}) {
  return new TrafficManager(options);
}

export default TrafficManager;
