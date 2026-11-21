// Solmar Bay — PoliceSystem (Lane B)
// Round-13B: pursuit interceptors stage 12 m / 22 m behind the player
// (was 18 / 30 m — main.js stagePursuitCars) so the lead car reads ~1.4x
// bigger with its light bar clear; spawn/chase logic is unchanged.
// Wanted system (0–5 stars) and police AI: patrol cars and foot officers
// spawn in proportion to the wanted level, chase the player, try to ram the
// player's car or arrest the player on foot, and give up after the player
// stays out of sight for a while, after which the wanted level decays.
// All randomness comes from the seeded generator passed in (an object with
// next()/range()/pick(), or a factory function taking a numeric seed).
// Never uses Math.random.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeGlowTexture } from './render.js';

// Round-13 (Lane 2): one shared white radial-glow texture for the siren
// halos + the heli's light pool. White so the sprite material colour
// (red / blue / warm white) tints it; created lazily so a headless
// import of this module never touches the DOM.
let _glowTex = null;
function sharedGlowTexture() {
  if (!_glowTex) _glowTex = makeGlowTexture('rgba(255,255,255,0.95)');
  return _glowTex;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function makeSeededRng(seed) {
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

// Heat added per crime type. Stealing, speeding past police, hitting a
// pedestrian and shooting each add one star; killing adds two.
export const CRIME_HEAT = {
  carjack: 1,
  stealCar: 1,
  speeding: 1,
  hitPedestrian: 1,
  shoot: 1,
  shooting: 1,
  kill: 2,
  killPedestrian: 2,
  killPolice: 2,
  assaultPolice: 1,
};

// Round-3 polish: police radio chatter — a dispatch line per wanted
// level, shown by the game loop when the heat rises.
// Round-4b: two lines per level, picked by the seeded rng, so the same
// heat level does not always repeat the same dispatch line.
const RADIO_LINES = {
  1: ['Dispatch: petty theft reported — one unit, respond.',
    'Dispatch: shoplifting at the marina — nearest unit, check it out.'],
  2: ['Dispatch: suspect is fleeing. All units in the area, converge.',
    'Dispatch: two stars — suspect is mobile, cut him off at the bridge.'],
  3: ['Dispatch: three stars. Suspect is armed and mobile — do not let him reach the marina.',
    'Dispatch: three stars — air unit is up, keep eyes on the sedan.'],
  4: ['Dispatch: four stars! Roadblocks up — harbour and docks covered.',
    'Dispatch: four stars — spike strips on the highway, all units hold.'],
  5: ['Dispatch: five stars. Full city response — bring Rico Vega in.',
    'Dispatch: five stars — the whole city is looking for him. Do not lose him.'],
};

// Round-6: dispatch lines that name a landmark — the chase reads as
// happening in a real place, not a generic grid. Used by
// radioLineNearLandmark() when the suspect is close to the Spire or
// the Marina Bridge; the plain radioLine() is the fallback.
const LANDMARK_RADIO = {
  'Solmar Spire': [
    'Dispatch: suspect is under the Spire — seal off Downtown, all units.',
    'Dispatch: eyes on the Spire — the suspect is circling the tower.',
  ],
  // Round 7: the Solmar Pyramid — dispatch names it when the chase runs
  // past the south-west block.
  'Solmar Pyramid': [
    'Dispatch: suspect is at the Pyramid — hold the south-west block, do not let him slip to the beach.',
    'Dispatch: Pyramid unit — the suspect is circling the gold cap, cut him off at the plaza.',
  ],
  'Marina Bridge': [
    'Dispatch: suspect is on the Marina Bridge — block both ends, do not let him cross.',
    'Dispatch: bridge unit — the suspect is over the basin, cut him off at the far side.',
  ],
};

function makePoliceCar(spec, rng) {
  return {
    kind: 'police-car',
    position: { x: spec.position.x, y: spec.position.y || 0, z: spec.position.z },
    heading: spec.heading || 0,
    speed: 0,
    model: 'Solmar Police Interceptor',
    colour: '#1a1a2e',
    driver: 'police',
    siren: true,
    stuckTimer: 0,
    setDriver(driver) { this.driver = driver; },
    update(dt) {
      this.position.x += Math.sin(this.heading) * this.speed * dt;
      this.position.z += Math.cos(this.heading) * this.speed * dt;
    },
  };
}

function makeOfficer(spec, rng) {
  return {
    kind: 'police-officer',
    position: { x: spec.position.x, y: spec.position.y || 0, z: spec.position.z },
    heading: spec.heading || 0,
    speed: 0,
    name: 'Officer',
    alive: true,
    arrestTimer: 0,
    update(dt) {
      this.position.x += Math.sin(this.heading) * this.speed * dt;
      this.position.z += Math.cos(this.heading) * this.speed * dt;
    },
  };
}

export class PoliceSystem {
  constructor(options = {}) {
    this.rng = normaliseRng(options.rng, options.seed ?? 4242);
    this.createCar = options.createCar || null;
    // Optional hard caps on fielded units (the integration lane uses these
    // to stage a screenshot with exactly two pursuit cars and no officers).
    this.maxPoliceCars = options.maxPoliceCars ?? null;
    this.maxOfficers = options.maxOfficers ?? null;
    // Callbacks the game loop may wire up: { onBusted, onWasted, onWantedChange, onSiren }
    // Round 4 adds onRoadblock: fired once per intercept, so the loop can
    // toast "Roadblock ahead!" before the cut-off car arrives.
    this.events = options.events || {};
    this.wanted = 0;
    this.busted = false;
    this.wasted = false;
    this.policeCars = [];
    this.officers = [];
    this.hiddenTimer = 0; // seconds the player has been out of sight
    this.decayTimer = 0;
    this._spawnCooldown = 0;
    this._speedingCooldown = 0; // speeding adds heat at most once per window
    this._sirenOn = false;
    this._interceptAnnounced = false; // round 4: roadblock toast fires once per chase
    this._interceptCar = null; // round 4: the car currently cutting off ahead
    this.sirenPhase = 0; // light-bar flash phase: 0 = red bright, 1 = blue bright
    this._sirenTimer = 0; // seconds since the last phase toggle
    this.helicopter = null; // round-13: the air unit ({ group, rotor, ... }) or null
    this._scene = null; // round-13: captured from a spawned police car's group parent
  }

  getWantedLevel() { return this.wanted; }
  isBusted() { return this.busted; }
  isWasted() { return this.wasted; }
  isSirenOn() { return this._sirenOn; }
  getSirenPhase() { return this.sirenPhase; }
  getPoliceCars() { return this.policeCars; }
  getOfficers() { return this.officers; }
  // Round-11 final: pursuit state in one probe for the consolidated
  // harness — wanted level, active cars, and the nearest pursuit
  // distance to the given position (game-feel: a pursuit that never
  // closes is not pressure). Pass null to skip the distance.
  getPursuitState(playerPos) {
    // Round-11 final (re-touch): the consolidated run gates on this probe (nearestDist is a number) — the pursuit must actually close on the player, not just spawn.
    const cars = this.policeCars || [];
    let nearest = null;
    if (playerPos && typeof playerPos.x === 'number' && typeof playerPos.z === 'number') {
      for (const c of cars) {
        const p = c.position || null;
        if (!p) continue;
        const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
        if (nearest === null || d < nearest) nearest = +d.toFixed(1);
      }
    }
    return { wanted: this.wanted, cars: cars.length, officers: this.officers.length, nearestDist: nearest, helicopter: this.helicopter !== null };
  }
  // Flat list of every police unit (cars + officers) for the minimap.
  getUnits() { return [...this.policeCars, ...this.officers]; }

  // The dispatch line for a wanted level (round 3).
  radioLine(level) {
    const n = Math.max(1, Math.min(5, Math.round(level) || 1));
    const lines = RADIO_LINES[n] || RADIO_LINES[1];
    return this.rng?.pick ? this.rng.pick(lines) : lines[0];
  }

  // Round-6: a dispatch line that names a nearby landmark when the
  // suspect is close to one — the chase reads as happening in a real
  // place. `landmarkName` is 'Solmar Spire' / 'Marina Bridge' (or null);
  // unknown names and null fall back to the plain radioLine(level).
  radioLineNearLandmark(level, landmarkName) {
    const lines = LANDMARK_RADIO[landmarkName];
    if (Array.isArray(lines) && lines.length) {
      return this.rng?.pick ? this.rng.pick(lines) : lines[0];
    }
    return this.radioLine(level);
  }

  // Round 4: the intercept point — where the player will be in `lead`
  // seconds if they keep their current heading and speed. The cut-off car
  // aims here instead of at the player's tail. Player velocity comes
  // from the driven car, or from on-foot speed + heading.
  interceptPoint(player, lead = 2.5) {
    if (!player?.position) return null;
    const car = player.vehicle || player.car || null;
    const speed = Math.abs(car?.speed ?? player.speed ?? 0);
    const heading = car ? (car.heading || 0) : (player.heading || 0);
    return {
      x: player.position.x + Math.sin(heading) * speed * lead,
      y: 0,
      z: player.position.z + Math.cos(heading) * speed * lead,
    };
  }

  // Distance to the nearest police unit, or Infinity when none is out.
  // The game loop scales the siren volume with it (round 3).
  nearestUnitDistance(player) {
    if (!player?.position) return Infinity;
    let best = Infinity;
    for (const unit of this.getUnits()) {
      if (!unit?.position) continue;
      best = Math.min(best, dist2D(unit.position, player.position));
    }
    return best;
  }

  _emit(name, payload) {
    const fn = this.events[name];
    if (typeof fn === 'function') fn(payload);
  }

  // Raise the wanted level by `stars` (clamped to 5). `reason` is a crime
  // key from CRIME_HEAT or a plain star count. Returns the new level.
  addWanted(starsOrCrime, reason) {
    if (this.busted || this.wasted) return this.wanted;
    let stars = 0;
    if (typeof starsOrCrime === 'string') {
      stars = CRIME_HEAT[starsOrCrime] ?? 1;
    } else if (typeof starsOrCrime === 'number') {
      // Round-10: a NaN star count used to poison `wanted` (NaN + n
      // stays NaN, and clamp() passes NaN straight through), leaving
      // the HUD and the busted check reading NaN forever.
      stars = Number.isFinite(starsOrCrime) ? starsOrCrime : 1;
    }
    if (typeof reason === 'string' && CRIME_HEAT[reason] !== undefined && typeof starsOrCrime !== 'number') {
      stars = CRIME_HEAT[reason];
    }
    const before = this.wanted;
    this.wanted = clamp(this.wanted + stars, 0, 5);
    this.hiddenTimer = 0;
    this.decayTimer = 0;
    if (this.wanted !== before) this._emit('onWantedChange', { wanted: this.wanted, before });
    if (this.wanted > 0 && !this._sirenOn) {
      this._sirenOn = true;
      this._emit('onSiren', { on: true });
    }
    return this.wanted;
  }

  // Convenience wrapper: report a crime by name ('carjack', 'speeding',
  // 'hitPedestrian', 'shoot', 'kill', ...). See CRIME_HEAT.
  reportCrime(crime) {
    return this.addWanted(crime);
  }

  setWanted(level) {
    const before = this.wanted;
    this.wanted = clamp(Math.round(level) || 0, 0, 5);
    this.hiddenTimer = 0;
    this.decayTimer = 0;
    if (this.wanted !== before) this._emit('onWantedChange', { wanted: this.wanted, before });
    // Round-13 (Lane 2): setWanted is the harness/probe path for staging
    // heat, and addWanted() is the only place that used to flip the
    // siren on — so a staged wanted-4 left _sirenOn false and every
    // siren halo dark (update() keys halo visibility off _sirenOn).
    // Keep the siren in sync here exactly like addWanted() does.
    if (this.wanted > 0 && !this._sirenOn) {
      this._sirenOn = true;
      this._emit('onSiren', { on: true });
    } else if (this.wanted === 0 && this._sirenOn) {
      this._sirenOn = false;
      this._emit('onSiren', { on: false });
    }
    return this.wanted;
  }

  clearWanted() {
    this.wanted = 0;
    this.hiddenTimer = 0;
    this.decayTimer = 0;
    this.policeCars = [];
    this.officers = [];
    this._removeHelicopter(); // round-13: ground the air unit with the heat
    this._hideHalos(); // round-13: no flashing halos with no pursuit
    if (this._sirenOn) {
      this._sirenOn = false;
      this._emit('onSiren', { on: false });
    }
    this.sirenPhase = 0;
    this._sirenTimer = 0;
    this._emit('onWantedChange', { wanted: 0, before: -1 });
  }

  // Mark the player wasted (health reached zero). Stops the chase.
  markWasted() {
    if (this.wasted) return;
    this.wasted = true;
    this._removeHelicopter(); // round-13: the chase is over
    this._hideHalos();
    this._emit('onWasted', {});
  }

  // How many units the current wanted level should field.
  desiredUnits() {
    if (this.wanted <= 0) return { cars: 0, officers: 0 };
    return {
      cars: Math.min(1 + this.wanted, 6), // 1 star: 2 cars ... 5 stars: 6 cars
      officers: this.wanted >= 2 ? Math.min((this.wanted - 1) * 2, 8) : 0,
    };
  }

  _spawnPositionNear(player, minDist, maxDist) {
    const px = player?.position?.x ?? 0;
    const pz = player?.position?.z ?? 0;
    const angle = this.rng.range(0, Math.PI * 2);
    const r = this.rng.range(minDist, maxDist);
    return { x: px + Math.sin(angle) * r, y: 0, z: pz + Math.cos(angle) * r };
  }

  // Round-8: re-seat a police light bar on the sculpted roofline — see
  // seatPoliceLightBar() below the class. Called from _boostLightBar,
  // which already runs every update until the bar exists — main.js
  // attaches the bar after spawn, so the seat lands the first frame
  // the bar is there.
  // Round-5 dusk: make the light bar read against the sunset by
  // enlarging its glow sprites once the bar exists (main.js attaches the
  // bar after spawn, so this is checked every update until it lands).
  // Sprite scale is never touched by the flash-phase logic, so the boost
  // persists across phase toggles; emissive levels live in vehicle.js.
  // Stand-in cars have no mesh/bar, so this is a no-op for them.
  // Round-13 (Lane 2): the bar glow grows again (2.2x, was 1.35x) and
  // each pursuit car gets a big alternating red/blue HALO above the
  // roof — the thing that makes a chase car visible from a block away.
  // One sprite per car (max 6), 0 tris; its colour flips with the
  // siren phase in update() below.
  _boostLightBar(car) {
    if (!car || car._duskBarBoosted || !car.group || !car.lightBar) return;
    car._duskBarBoosted = true;
    // Round-8: seat the bar on the sculpted (crowned) roofline first —
    // the glow boost below must not run on a bar sunk into the crown.
    seatPoliceLightBar(car);
    const cfg = CONFIG.round5?.police || {};
    const scale = CONFIG.round13?.police?.lightBarGlowScale ?? (cfg.lightBarGlowScale ?? 1.35);
    for (const key of ['redGlowSprite', 'blueGlowSprite']) {
      const s = car.lightBar[key];
      if (s && s.scale) {
        s.scale.x *= scale;
        s.scale.y *= scale;
      }
    }
    if (!car._sirenHalo && car.group && typeof car.group.add === 'function') {
      try {
        const mat = new THREE.SpriteMaterial({
          map: sharedGlowTexture(), transparent: true, depthWrite: false,
          opacity: 0, color: 0xff2222,
        });
        const sprite = new THREE.Sprite(mat);
        const barY = (car.lightBar && typeof car.lightBar.barY === 'number')
          ? car.lightBar.barY : 1.6;
        sprite.position.set(0, barY + 1.1, 0);
        sprite.scale.setScalar(CONFIG.round13?.police?.haloScale ?? 5.5);
        car.group.add(sprite);
        car._sirenHalo = { sprite, mat };
      } catch (_) { /* the halo is cosmetic; a failed attach must never break the chase */ }
    }
  }

  // Round-13 (Lane 2): hide every siren halo (busted / wasted / cleared).
  _hideHalos() {
    for (const car of this.policeCars) {
      if (car._sirenHalo && car._sirenHalo.sprite) car._sirenHalo.sprite.visible = false;
    }
  }

  // Round-13 (Lane 2): the police helicopter — the missing piece in
  // every round-12 chase screenshot. One air unit at wanted >= 3: a
  // dark police-blue heli with spinning main + tail rotors, a
  // searchlight cone and a light pool on the ground below it, orbiting
  // the player. ~10 draw calls / ~125 tris, only while wanted >= 3, so
  // the profile scenario (wanted 0) pays nothing. Built with plain
  // THREE primitives (no vehicle.js dependency — the heli is not a car).
  // The scene is captured from a spawned police car's group parent;
  // without a scene (stand-in tests) the heli simply never spawns.
  _spawnHelicopter(player) {
    if (this.helicopter || !this._scene || !player?.position) return null;
    try {
      const g = new THREE.Group();
      const matBody = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.6, metalness: 0.3 });
      const matWhite = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
      const matGlass = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.2, metalness: 0.6 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.3, 3.4), matBody);
      body.castShadow = true;
      g.add(body);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 1.2), matGlass);
      nose.position.set(0, -0.1, 2.0);
      g.add(nose);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.22, 3.42), matWhite);
      stripe.position.y = 0.15;
      g.add(stripe);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 3.6), matBody);
      tail.position.set(0, 0.25, -3.2);
      g.add(tail);
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.9), matBody);
      fin.position.set(0, 0.7, -4.8);
      g.add(fin);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.06, 0.35), matWhite);
      rotor.position.y = 0.95;
      g.add(rotor);
      // Rotor blur disc: a faint translucent disc at rotor height so the
      // spinning bar reads as a rotor, not a plank.
      const rotorBlur = new THREE.Mesh(
        new THREE.CircleGeometry(3.7, 20),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.10, side: THREE.DoubleSide, depthWrite: false }),
      );
      rotorBlur.rotation.x = -Math.PI / 2;
      rotorBlur.position.y = 0.95;
      g.add(rotorBlur);
      const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.4, 0.3), matWhite);
      tailRotor.position.set(0.32, 0.5, -4.8);
      g.add(tailRotor);
      for (const sx of [-1, 1]) {
        const skid = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 3.0), matWhite);
        skid.position.set(sx * 0.9, -0.85, 0.2);
        g.add(skid);
      }
      // Searchlight: a translucent cone from the belly to the ground
      // (depthTest stays ON — the round-9 harness forbids tall
      // depthTest-off meshes) + a warm pool of light on the ground
      // below the heli. At altitude 38 the heli BODY sits above the
      // chase camera's frame, so the cone + pool are the visible part
      // of the air unit — the cone is wide and bright enough to read
      // across the street. Default cone orientation is apex-up, so at
      // y = -alt/2 the apex sits at the belly and the base on the ground.
      const alt = CONFIG.round13?.police?.heliAltitude ?? 38;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(3.0, alt, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      );
      cone.position.y = -alt / 2;
      g.add(cone);
      const pool = new THREE.Sprite(new THREE.SpriteMaterial({
        map: sharedGlowTexture(), transparent: true, depthWrite: false,
        opacity: 0.45, color: 0xffe9a8,
      }));
      pool.scale.set(14, 14, 1);
      pool.position.y = -alt + 0.6;
      g.add(pool);
      // Spawn directly on the orbit ring, IN FRONT of the player (along
      // the player's heading), so the cone + pool are in the chase
      // camera's frame from the first frame — not hovering overhead and
      // lerping out over seconds (under a slow renderer that lerp never
      // visibly finishes). angle 0 of the orbit is the player's forward.
      const heading = player.heading ?? 0;
      const radius = CONFIG.round13?.police?.heliOrbitRadius ?? 30;
      const angle0 = Math.atan2(Math.cos(heading), Math.sin(heading));
      g.position.set(
        player.position.x + Math.cos(angle0) * radius,
        alt,
        player.position.z + Math.sin(angle0) * radius,
      );
      this._scene.add(g);
      this.helicopter = { group: g, rotor, tailRotor, cone, pool, angle: angle0 };
      return this.helicopter;
    } catch (_) { return null; }
  }

  _updateHelicopter(step, player) {
    const minWanted = CONFIG.round13?.police?.heliMinWanted ?? 3;
    if (this.wanted < minWanted || this.busted || this.wasted) {
      this._removeHelicopter();
      return;
    }
    if (!this.helicopter) this._spawnHelicopter(player);
    const heli = this.helicopter;
    if (!heli || !player?.position) return;
    const alt = CONFIG.round13?.police?.heliAltitude ?? 38;
    const radius = CONFIG.round13?.police?.heliOrbitRadius ?? 30;
    // Slow orbit around the player so the heli is usually in the chase
    // camera's forward view, not parked behind the player.
    heli.angle += step * 0.12;
    const tx = player.position.x + Math.cos(heli.angle) * radius;
    const tz = player.position.z + Math.sin(heli.angle) * radius;
    const gp = heli.group.position;
    gp.x += (tx - gp.x) * Math.min(1, step * 0.8);
    gp.z += (tz - gp.z) * Math.min(1, step * 0.8);
    gp.y += (alt - gp.y) * Math.min(1, step * 0.8);
    // Nose toward the suspect; rotors spin.
    heli.group.rotation.y = Math.atan2(player.position.x - gp.x, player.position.z - gp.z);
    heli.rotor.rotation.y += step * 14;
    heli.tailRotor.rotation.x += step * 20;
  }

  _removeHelicopter() {
    if (!this.helicopter) return;
    try {
      if (this.helicopter.group.parent) this.helicopter.group.parent.remove(this.helicopter.group);
    } catch (_) { /* already gone */ }
    this.helicopter = null;
  }

  // Round-13: the air unit's live state for probes (null when grounded).
  getHelicopter() {
    const h = this.helicopter;
    if (!h) return null;
    return {
      active: true,
      x: +h.group.position.x.toFixed(1),
      z: +h.group.position.z.toFixed(1),
      altitude: +h.group.position.y.toFixed(1),
      rotorAngle: +h.rotor.rotation.y.toFixed(2),
    };
  }

  _spawnCar(player) {
    // Round-13 (Lane 2): pursuit cars spawn closer (28-55 m, was 35-70)
    // so they arrive in the chase camera's frame instead of far away.
    const r13p = CONFIG.round13?.police || {};
    const pos = this._spawnPositionNear(player, r13p.spawnMin ?? 35, r13p.spawnMax ?? 70);
    const car = this.createCar
      ? this.createCar({ position: pos, heading: 0, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' })
      : makePoliceCar({ position: pos }, this.rng);
    car.kind = 'police-car';
    car.siren = true;
    // Round-13 (Lane 2): capture the scene for the helicopter — the
    // car's group hangs off the scene (vehicle.js createCar adds it),
    // so its parent IS the scene. Stand-in cars have no group, and the
    // heli simply stays grounded for them.
    if (!this._scene && car.group && car.group.parent) this._scene = car.group.parent;
    this._boostLightBar(car);
    this.policeCars.push(car);
    return car;
  }

  _spawnOfficer(player) {
    const pos = this._spawnPositionNear(player, 12, 30);
    const officer = makeOfficer({ position: pos }, this.rng);
    this.officers.push(officer);
    return officer;
  }

  // The player counts as "seen" while any police unit is within sight range
  // (closer at low wanted levels, farther as heat rises) or while the
  // player is committing a crime in the open (handled by addWanted resets).
  _playerSeen(player) {
    if (!player?.position) return false;
    const sight = 25 + this.wanted * 12;
    for (const unit of this.getUnits()) {
      if (dist2D(unit.position, player.position) < sight) return true;
    }
    return false;
  }

  // update(dt, world, player, helpers)
  // helpers (optional): { damagePlayer(amount, source), onArrestTick }
  update(dt, world, player, helpers = {}) {
    if (!dt || dt <= 0) return;
    const step = Math.min(dt, 0.05);
    if (this.busted || this.wasted) return;
    if (!player?.position) return;

    // --- Spawn / despawn units to match the wanted level. ---
    this._spawnCooldown -= step;
    if (this._spawnCooldown <= 0) {
      this._spawnCooldown = 0.75;
      // Round 4 fix (found in the audit): dead officers stayed in the
      // list forever, so the spawn loop thought the quota was full and no
      // replacements ever arrived after Rico fought back. Prune them here
      // (their meshes are removed by syncPersonMeshes in the game loop).
      this.officers = this.officers.filter((o) => o.alive !== false);
      const want = this.desiredUnits();
      if (this.maxPoliceCars !== null) want.cars = Math.min(want.cars, this.maxPoliceCars);
      if (this.maxOfficers !== null) want.officers = Math.min(want.officers, this.maxOfficers);
      while (this.policeCars.length < want.cars) this._spawnCar(player);
      while (this.officers.length < want.officers) this._spawnOfficer(player);
      while (this.policeCars.length > want.cars) this.policeCars.pop();
      // Round 28: never pop a STAGED officer. The combat shot fields 7
      // staged officers at wanted 4, where desiredUnits() only allows 6
      // ((wanted-1)*2) — without this exemption the spawn tick would
      // pop the 7th officer within 0.75 s of staging. Normal gameplay
      // never stages an officer (staged is only set by placeOfficersArc
      // in staged shots), so the despawn is unchanged there.
      while (this.officers.length > want.officers) {
        const i = this.officers.findIndex((o) => !o.staged);
        if (i === -1) break;
        this.officers.splice(i, 1);
      }
      // Round 4: at 3+ stars, pick one car as the interceptor. It is
      // re-picked whenever the wanted level drops below 3 or the pick
      // leaves the field, and the roadblock toast fires once per chase.
      if (this.wanted >= 3) {
        if (!this._interceptCar || !this.policeCars.includes(this._interceptCar)) {
          this._interceptCar = this.policeCars.length ? this.policeCars[0] : null;
          if (this._interceptCar && !this._interceptAnnounced) {
            this._interceptAnnounced = true;
            this._emit('onRoadblock', { wanted: this.wanted });
          }
        }
      } else {
        this._interceptCar = null;
        this._interceptAnnounced = false;
      }
    }

    const playerSpeed = Math.abs(player.vehicle?.speed ?? player.speed ?? 0);
    const playerInCar = Boolean(player.inCar && (player.vehicle || player.car));

    // --- Police cars: chase and ram. ---
    for (const car of this.policeCars) {
      // Round-5 dusk: boost the light-bar glow once the bar is attached.
      this._boostLightBar(car);
      // Round-14: a staged car holds its mark for the screenshot
      // (roadblock pair, patrol car, sunset patrol) — it keeps its
      // flashing light bar and halo, but never chases, rams or busts.
      // Staging sets car.staged = true; normal gameplay never does.
      if (car.staged) { car.speed = 0; continue; }
      const d = dist2D(car.position, player.position);
      // Round 4: the interceptor does not chase the tail — it aims at the
      // intercept point ahead of the player and tries to cut them off.
      // Every other car chases the player directly, as before.
      const aim = (car === this._interceptCar && this.wanted >= 3)
        ? (this.interceptPoint(player, 2.5) || player.position)
        : player.position;
      const desiredHeading = Math.atan2(aim.x - car.position.x, aim.z - car.position.z);
      let turn = desiredHeading - car.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      car.heading += clamp(turn, -2.2 * step, 2.2 * step);
      // Ram speed scales with wanted level; faster than the player at 3+ stars.
      const topSpeed = 16 + this.wanted * 3.5;
      const target = d > 4 ? topSpeed : topSpeed * 0.4;
      car.speed += clamp(target - car.speed, -20 * step, 10 * step);
      if (typeof car.update === 'function') car.update(step, world);
      // Ram: contact with the player's car damages / slows the player.
      if (d < 4.5 && playerInCar && typeof helpers.damagePlayer === 'function') {
        helpers.damagePlayer(4 * step * 10, 'police-ram');
        const pv = player.vehicle || player.car;
        if (pv) pv.speed = (pv.speed || 0) * (1 - 0.6 * step);
        // Round-8: ram sparks — record the bumper contact point on the
        // combat system (via the helpers channel main.js wires up), so
        // the game loop flashes it at the impact point. Guarded so a
        // missing recordRamImpact can never break the chase.
        try { helpers.combat?.recordRamImpact?.(car, pv || null); } catch (_) { /* sparks are cosmetic */ }
      }
      // A police car that touches the player on foot busts them.
      if (d < 2.5 && !playerInCar) this._bust(player);
    }

    // --- Foot officers: chase on foot and arrest at close range. ---
    for (const officer of this.officers) {
      if (!officer.alive) continue;
      // Round-14: a staged officer holds its mark for the screenshot
      // (combat arc) — it never closes in or starts an arrest timer.
      // Staging sets officer.staged = true; normal gameplay never does.
      if (officer.staged) { officer.speed = 0; continue; }
      const d = dist2D(officer.position, player.position);
      if (playerInCar) {
        // Officers cannot catch a car: hold position near where they are.
        officer.speed = 0;
        continue;
      }
      const desiredHeading = Math.atan2(player.position.x - officer.position.x, player.position.z - officer.position.z);
      let turn = desiredHeading - officer.heading;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      officer.heading += clamp(turn, -3.5 * step, 3.5 * step);
      // Round 4: officers on foot at 2+ stars are confirmed working —
      // desiredUnits() fields (wanted - 1) * 2 of them (capped at 8) and
      // _spawnOfficer() places them 12–30 m out. They sprint the last
      // stretch (5.2 -> 6.0 m/s inside 12 m) but Rico still outruns them
      // on foot (run 8.0 m/s), so an arrest stays avoidable.
      officer.speed = d > 2 ? (d < 12 ? 6.0 : 5.2) : 0;
      if (typeof officer.update === 'function') officer.update(step, world);
      if (d < 2.2) {
        officer.arrestTimer += step;
        if (typeof helpers.onArrestTick === 'function') helpers.onArrestTick(officer.arrestTimer);
        if (officer.arrestTimer > 1.6) this._bust(player);
      } else {
        officer.arrestTimer = 0;
      }
    }

    // --- Speeding past a police car raises heat (checked here so the game
    // loop does not need a separate speed trap). Cooldown: without it the
    // check fires every frame and the player rockets to 5 stars in a second
    // just for driving past one patrol car. ---
    this._speedingCooldown = Math.max(0, this._speedingCooldown - step);
    if (playerInCar && playerSpeed > 22 && this._speedingCooldown <= 0) {
      for (const car of this.policeCars) {
        if (dist2D(car.position, player.position) < 30) {
          this.addWanted('speeding');
          this._speedingCooldown = 20;
          break;
        }
      }
    }

    // --- Losing the cops: out of sight for a while, then stars decay. ---
    if (this.wanted > 0) {
      if (this._playerSeen(player)) {
        this.hiddenTimer = 0;
        this.decayTimer = 0;
      } else {
        this.hiddenTimer += step;
        const hideFor = 14 - this.wanted; // hotter = longer to lose them
        if (this.hiddenTimer > Math.max(hideFor, 6)) {
          this.decayTimer += step;
          if (this.decayTimer > 6) {
            this.decayTimer = 0;
            this.setWanted(this.wanted - 1);
            if (this.wanted === 0) this.clearWanted();
          }
        }
      }
    }

    if (this.wanted === 0 && this._sirenOn) {
      this._sirenOn = false;
      this._emit('onSiren', { on: false });
    }

    // --- Siren light-bar phase: alternate red/blue every 0.45 s of game
    // time while the siren is on. main.js drives each police car's light
    // bar from getSirenPhase(). Phase resets to 0 when the siren stops. ---
    if (this._sirenOn) {
      this._sirenTimer += step;
      if (this._sirenTimer >= 0.45) {
        this._sirenTimer -= 0.45;
        this.sirenPhase = this.sirenPhase === 0 ? 1 : 0;
      }
    } else {
      this.sirenPhase = 0;
      this._sirenTimer = 0;
    }

    // --- Round-13 (Lane 2): the air unit + the siren halos. ---
    this._updateHelicopter(step, player);
    if (this.policeCars.length) {
      const haloOpacity = CONFIG.round13?.police?.haloOpacity ?? 0.5;
      const haloScale = CONFIG.round13?.police?.haloScale ?? 5.5;
      for (const car of this.policeCars) {
        const halo = car._sirenHalo;
        if (!halo || !halo.sprite) continue;
        halo.sprite.visible = this._sirenOn;
        if (!this._sirenOn) continue;
        // Phase 0: red bright; phase 1: blue bright. The pulse rides
        // the 0.45 s phase timer so the halo breathes with the bar.
        halo.mat.color.setHex(this.sirenPhase === 0 ? 0xff2222 : 0x2244ff);
        const pulse = Math.sin(this._sirenTimer * 14);
        halo.mat.opacity = haloOpacity * (0.85 + 0.15 * pulse);
        halo.sprite.scale.setScalar(haloScale * (1 + 0.06 * pulse));
      }
    }
  }

  _bust(player) {
    if (this.busted) return;
    this.busted = true;
    this._removeHelicopter(); // round-13: the chase is over
    this._hideHalos();
    this._emit('onBusted', { wanted: this.wanted });
  }

  reset() {
    this.wanted = 0;
    this.busted = false;
    this.wasted = false;
    this.policeCars = [];
    this.officers = [];
    this._removeHelicopter(); // round-13: ground the air unit
    this._scene = null;
    this.hiddenTimer = 0;
    this.decayTimer = 0;
    this._sirenOn = false;
    this.sirenPhase = 0;
    this._sirenTimer = 0;
    this._interceptCar = null;
    this._interceptAnnounced = false;
  }
}

export function createPoliceSystem(options = {}) {
  return new PoliceSystem(options);
}

// Round-8: re-seat a police light bar on the sculpted roofline. The
// round-8 car bodies carry a curved roof crown (car.sculpt.roofCrown /
// crownH), so a bar placed at the flat-roof height would sink into the
// crown. This reads the bar's own stored roofY/crownLift (set by
// vehicle.js attachPoliceLightBar) and moves the base, both lamps and
// both glow sprites onto barY. Idempotent and safe on stand-in cars
// (no lightBar meshes) and on cars whose bar predates the crown.
export function seatPoliceLightBar(car) {
  if (!car || !car.lightBar) return false;
  const bar = car.lightBar;
  if (bar.base === undefined && bar.redLamp === undefined) return false;
  // Round-9: prefer the LIVE sculpt roofline (car.sculpt.roofY +
  // crownH) over the bar's stored values — the integrated roof keeps
  // the same crown top, but a bar attached before the roof fix (or by
  // older code) must re-seat on the current roof, not on a stale
  // stored height. Falls back to the bar's own stored barY/roofY when
  // the car carries no sculpt data (stand-ins).
  const liveRoofY = (car.sculpt && typeof car.sculpt.roofY === 'number')
    ? car.sculpt.roofY + (car.sculpt.crownH || 0) : null;
  const barY = liveRoofY !== null ? liveRoofY
    : (typeof bar.barY === 'number'
      ? bar.barY
      : (bar.roofY || 0) + (bar.crownLift || 0));
  const cabinZ = bar.cabinZ ?? 0;
  if (bar.base) bar.base.position.set(0, barY + 0.02, cabinZ);
  if (bar.redLamp) bar.redLamp.position.set(-0.25, barY + 0.1, cabinZ);
  if (bar.blueLamp) bar.blueLamp.position.set(0.25, barY + 0.1, cabinZ);
  if (bar.redGlowSprite) bar.redGlowSprite.position.set(-0.25, barY + 0.14, cabinZ);
  if (bar.blueGlowSprite) bar.blueGlowSprite.position.set(0.25, barY + 0.14, cabinZ);
  bar.seatedOnRoof = true;
  // Round-9 re-touch (new recording): record WHERE the bar was seated,
  // so a probe can verify the bar sits on the live integrated roofline
  // (roofY + crownH) rather than a stale flat-roof height — the seat
  // is re-asserted every frame by _boostLightBar, so a stale seat
  // cannot survive a roof change unnoticed.
  bar.seatedBarY = barY;
  bar.seatedRoofIntegrated = Boolean(car.sculpt && car.sculpt.roofIntegrated);
  bar.seatedRoofSink = (car.sculpt && car.sculpt.roofSink) || 0;
  return true;
}

// Round-13 (Lane 2): visible pursuit — closer spawns, bigger light-bar
// glow + alternating siren halos, and the police helicopter at 3+ stars.

export default PoliceSystem;
// Round-13 final: re-touch — desiredUnits() (5 cars / 6 officers at 4
// stars) is untouched; the budget pass buys the headroom in geometry,
// never by fielding fewer units.
