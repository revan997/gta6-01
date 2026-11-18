// Solmar Bay — PoliceSystem (Lane B)
// Wanted system (0–5 stars) and police AI: patrol cars and foot officers
// spawn in proportion to the wanted level, chase the player, try to ram the
// player's car or arrest the player on foot, and give up after the player
// stays out of sight for a while, after which the wanted level decays.
// All randomness comes from the seeded generator passed in (an object with
// next()/range()/pick(), or a factory function taking a numeric seed).
// Never uses Math.random.
import { CONFIG } from './config.js';

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
  }

  getWantedLevel() { return this.wanted; }
  isBusted() { return this.busted; }
  isWasted() { return this.wasted; }
  isSirenOn() { return this._sirenOn; }
  getSirenPhase() { return this.sirenPhase; }
  getPoliceCars() { return this.policeCars; }
  getOfficers() { return this.officers; }
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
      stars = starsOrCrime;
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
    return this.wanted;
  }

  clearWanted() {
    this.wanted = 0;
    this.hiddenTimer = 0;
    this.decayTimer = 0;
    this.policeCars = [];
    this.officers = [];
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

  // Round-5 dusk: make the light bar read against the sunset by
  // enlarging its glow sprites once the bar exists (main.js attaches the
  // bar after spawn, so this is checked every update until it lands).
  // Sprite scale is never touched by the flash-phase logic, so the boost
  // persists across phase toggles; emissive levels live in vehicle.js.
  // Stand-in cars have no mesh/bar, so this is a no-op for them.
  _boostLightBar(car) {
    if (!car || car._duskBarBoosted || !car.group || !car.lightBar) return;
    car._duskBarBoosted = true;
    const cfg = CONFIG.round5?.police || {};
    const scale = cfg.lightBarGlowScale ?? 1.35;
    for (const key of ['redGlowSprite', 'blueGlowSprite']) {
      const s = car.lightBar[key];
      if (s && s.scale) {
        s.scale.x *= scale;
        s.scale.y *= scale;
      }
    }
  }

  _spawnCar(player) {
    const pos = this._spawnPositionNear(player, 35, 70);
    const car = this.createCar
      ? this.createCar({ position: pos, heading: 0, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' })
      : makePoliceCar({ position: pos }, this.rng);
    car.kind = 'police-car';
    car.siren = true;
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
      while (this.officers.length > want.officers) this.officers.pop();
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
      }
      // A police car that touches the player on foot busts them.
      if (d < 2.5 && !playerInCar) this._bust(player);
    }

    // --- Foot officers: chase on foot and arrest at close range. ---
    for (const officer of this.officers) {
      if (!officer.alive) continue;
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
  }

  _bust(player) {
    if (this.busted) return;
    this.busted = true;
    this._emit('onBusted', { wanted: this.wanted });
  }

  reset() {
    this.wanted = 0;
    this.busted = false;
    this.wasted = false;
    this.policeCars = [];
    this.officers = [];
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

export default PoliceSystem;
