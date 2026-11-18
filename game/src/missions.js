// Solmar Bay — Missions (Lane B)
// Five-mission story chain for Rico Vega, driver for fixer Mama Lou,
// with crew members Dante and Priya. Each mission has a briefing, a
// sequence of objectives with map markers, success and failure conditions,
// and a cash reward. All randomness comes from the seeded generator passed
// in (an object with next()/range()/pick(), or a factory taking a seed).
// Never uses Math.random.
//
// Mission flow (update(dt, world, player, systems)):
//   systems may carry { police, traffic, combat, audio, addMoney } — the
//   game loop passes whatever it has; every mission also works with the
//   player position alone, so the chain is testable standalone.
// Objective completion is position-based (reach the marker) except where
// noted (tailing, escape timers). Markers are plain { x, y, z } positions
// taken from the world description when it offers named locations.

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function dist2D(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// Round-5: mission randomness is seeded from the readable mission name
// (via random.js seedFromString) instead of a magic number, so the same
// name always yields the same stream.
import { seedFromString } from './random.js';

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

// Named places in Solmar Bay. The world may override any of these through
// world.locations / world.getLocation(name); otherwise these defaults are
// used so the missions are playable on the fallback map.
const DEFAULT_LOCATIONS = {
  mamaLou: { x: 0, y: 0, z: 0, label: "Mama Lou's" },
  marina: { x: 120, y: 0, z: -40, label: 'Marina' },
  northBeach: { x: -90, y: 0, z: -110, label: 'North Beach' },
  hideout: { x: -60, y: 0, z: 90, label: 'Hideout' },
  docks: { x: 150, y: 0, z: 80, label: 'Docks' },
  carLot: { x: -130, y: 0, z: 30, label: 'Car Lot' },
  palmsHotel: { x: 60, y: 0, z: -120, label: 'Palms Hotel' },
  harbour: { x: 170, y: 0, z: 120, label: 'Harbour' },
  lookout: { x: -40, y: 0, z: -140, label: 'Lookout' },
};

const MISSION_DEFS = [
  {
    number: 1,
    id: 'first-run',
    name: 'First Run',
    briefing: "Mama Lou: 'Rico, first job. Pick up the package at the Marina and bring it to North Beach. Keep it clean — and keep it quick.' Dante rides along to show you the ropes. The sun's going down over the Bay — golden hour, Rico. Make it count.",
    reward: 500,
    objectives: [
      { id: 'pickup', text: 'Pick up the package at the Marina', location: 'marina', radius: 8 },
      { id: 'deliver', text: 'Deliver the package to North Beach', location: 'northBeach', radius: 8 },
    ],
    // Ends with one star of police heat.
    onComplete: (ctx) => { ctx.police?.addWanted?.(1); },
    failText: 'The package was lost.',
    // Round 4: intro card + per-objective flavour toasts, shown by the
    // game loop from the onMissionStart / onObjective payloads.
    introCard: "Mama Lou's first test. Don't scratch the paint — or her patience.",
    objectiveFlavour: [
      "Dante: 'Marina, berth 12. Grab it and don't look back.'",
      "Dante: 'North Beach, by the palms. Quick feet, Rico — and press L on the way, the Spire fills the frame now.'",
      // Round-11 final (re-touch): the line now names the real behaviour — the L look frames the whole Spire (lookFrac 0.45) instead of cropping its base, verified on the settled screenshot.
    ],
  },
  {
    number: 2,
    id: 'hot-wheels',
    name: 'Hot Wheels',
    briefing: "Dante: 'The cops made the drop, Rico! Two stars and climbing. Lose them and get to the Hideout — do NOT bring them to Mama Lou's door.'",
    reward: 800,
    startWanted: 2,
    objectives: [
      { id: 'escape', text: 'Lose the police, then reach the Hideout', location: 'hideout', radius: 10, needsClear: true },
    ],
    failText: 'Busted — the cops took you in.',
    introCard: 'Two stars and a whole city watching. Lose them, Rico. Lose them all.',
    objectiveFlavour: [
      "Dante: 'Break line of sight — alleys, not avenues. Then vanish.'",
    ],
  },
  {
    number: 3,
    id: 'borrowed-beauty',
    name: 'Borrowed Beauty',
    briefing: "Priya: 'A Palm Coupe, pearl white, parked at the Car Lot. The owner owes Mama Lou. Take it — quietly — and bring it to the Docks. No scratches, Rico.'",
    reward: 1200,
    objectives: [
      { id: 'steal', text: 'Steal the pearl-white Palm Coupe at the Car Lot', location: 'carLot', radius: 8, needsCar: 'Palm Coupe' },
      { id: 'deliver', text: 'Deliver the Palm Coupe to the Docks', location: 'docks', radius: 8, needsCar: 'Palm Coupe' },
    ],
    failText: 'The Palm Coupe was wrecked or lost.',
    introCard: 'Pearl white, one owner, one debt. Mama Lou collects what she is owed.',
    objectiveFlavour: [
      "Priya: 'Pearl white, Car Lot, back row. Quiet hands, Rico.'",
      "Priya: 'Docks, pier 3. And Rico — not one scratch.'",
    ],
  },
  {
    number: 4,
    id: 'long-tail',
    name: 'Long Tail',
    briefing: "Mama Lou: 'A courier leaves the Palms Hotel at dusk. Follow him, Rico — find where he sleeps. But if he spots you, the whole thing is blown. Stay back. Stay patient.'",
    reward: 1500,
    objectives: [
      { id: 'tail', text: 'Tail the courier from the Palms Hotel — do not get spotted', location: 'palmsHotel', radius: 6, tail: true, duration: 60 },
      { id: 'report', text: 'The courier stopped at the Lookout — report at the Stepped Quarter plaza', location: 'steppedPlaza', radius: 8 },
    ],
    failText: 'Spotted — the courier burned the route.',
    introCard: 'One courier. One route. One mistake and the whole thing is blown.',
    objectiveFlavour: [
      "Mama Lou: 'Stay back. Stay patient. A shadow does not hurry.'",
      "Mama Lou: 'The Lookout, was it? Good. Meet Priya at the Stepped Quarter plaza and tell her everything.'",
    ],
  },
  {
    number: 5,
    id: 'harbour-heist',
    name: 'Harbour Heist',
    briefing: "Mama Lou: 'The big one. The Harbour vault boat lands at midnight. Grab the cash, then run — four stars, the whole city. Get to the Hideout alive and we are all rich.' Priya drives the getaway boat plan; Dante watches the road.",
    reward: 5000,
    objectives: [
      { id: 'grab', text: 'Grab the cash at the Harbour', location: 'harbour', radius: 8 },
      { id: 'escape', text: 'Escape the four-star chase — reach the Hideout', location: 'hideout', radius: 10, needsClear: true },
    ],
    startWantedOnGrab: 4,
    failText: 'The heist failed — busted or wasted at the Harbour.',
    introCard: 'Midnight. Four stars. One boat full of money. This is the big one, Rico.',
    objectiveFlavour: [
      "Dante: 'Vault boat lands at midnight. Grab and run — do NOT stop to count.'",
      "Priya: 'Whole city on you now. Hideout. GO.'",
    ],
  },
];

export class MissionManager {
  constructor(options = {}) {
    this.rng = normaliseRng(options.rng, options.seed ?? seedFromString('solmar-bay-missions'));
    this.events = options.events || {}; // { onMissionStart, onObjective, onComplete, onFail }
    this.locations = { ...DEFAULT_LOCATIONS, ...(options.locations || {}) };
    // Round-3 polish: par times (seconds per mission) and the under-par
    // bonus. main.js passes CONFIG.missionPar / CONFIG.parBonus; the
    // defaults keep the chain playable standalone.
    this.parSeconds = options.parSeconds || { 1: 150, 2: 180, 3: 210, 4: 240, 5: 300 };
    this.parBonus = options.parBonus ?? 100;
    this.completed = new Set(options.completed || []);
    this.current = null; // active mission runtime state
    this.lastReward = 0;
    this.lastCompletedMission = null;
    this.lastFailedMission = null;
    // Round 4: best clear time per mission (seconds), persisted by save v3.
    this.bestTimes = { ...(options.bestTimes || {}) };
    // Round 5: under-par bonuses earned, persisted by save v4.
    this.parBonusesEarned = 0;
  }

  _emit(name, payload) {
    const fn = this.events[name];
    if (typeof fn === 'function') fn(payload);
  }

  _location(world, name) {
    // Round 8: the stepped-tower plaza is a REAL position from
    // world.js (world.steppedPlaza, or world.locations.steppedPlaza
    // wired by main.js) — never a hardcoded guess. When this city
    // has no stepped tower (an older world build, or standalone),
    // the rendezvous falls back to Mama Lou's.
    if (name === 'steppedPlaza') {
      const plaza = (world && world.steppedPlaza)
        || (world && world.locations && world.locations.steppedPlaza)
        || (this.locations && this.locations.steppedPlaza);
      if (plaza) return plaza;
      return this._location(world, 'mamaLou');
    }
    if (world) {
      if (typeof world.getLocation === 'function') {
        const found = world.getLocation(name);
        if (found) return found;
      }
      if (world.locations && world.locations[name]) return world.locations[name];
      if (world.markers && world.markers[name]) return world.markers[name];
    }
    return this.locations[name] || { x: 0, y: 0, z: 0, label: name };
  }

  listMissions() {
    return MISSION_DEFS.map((m) => ({
      number: m.number, id: m.id, name: m.name,
      briefing: m.briefing, reward: m.reward, completed: this.completed.has(m.number),
    }));
  }

  getMissionDef(number) {
    // Round-10: coerce the number (a '3' from a URL query or a save
    // used to miss the strict === match and return null).
    return MISSION_DEFS.find((m) => m.number === Number(number)) || null;
  }

  getCurrentMission() {
    return this.current ? this.getMissionDef(this.current.number) : null;
  }

  getCurrentMissionNumber() {
    return this.current ? this.current.number : null;
  }

  // Start mission `number` (1–5). Returns the briefing, or null if the
  // number is invalid or a mission is already running.
  startMission(number, world, systems = {}) {
    const def = this.getMissionDef(number);
    if (!def) return null;
    if (this.current) return null;
    this.current = {
      number: def.number,
      objectiveIndex: 0,
      startedAt: 0,
      elapsed: 0,
      tailTimer: 0,
      tailSpotted: false,
      failed: false,
      complete: false,
      rewardEarned: 0,
      failReason: null,
    };
    this.lastReward = 0;
    this.lastFailedMission = null;
    // Round-8 fix: a mission that STARTS on a tail objective (Mission 4)
    // never ran _startTail — it only fired when ADVANCING into one — so
    // update() read this.current.tailFrom as undefined and crashed on
    // the first frame. Seed the tail route up front when the first
    // objective tails. _location() falls back to the default places
    // when world is undefined, so a save-restore start is safe too.
    if (def.objectives[0] && def.objectives[0].tail) this._startTail(world);
    if (def.startWanted && systems.police) systems.police.addWanted?.(def.startWanted);
    // Round 4: the intro card rides the start payload, and the first
    // objective's flavour toast rides with it, so the game loop can show
    // both without a new event type.
    this._emit('onMissionStart', {
      number: def.number, name: def.name, briefing: def.briefing,
      introCard: def.introCard || '',
      flavour: (def.objectiveFlavour || [])[0] || '',
    });
    return { number: def.number, name: def.name, briefing: def.briefing, reward: def.reward };
  }

  // Abort the active mission without reward.
  abandonMission(reason = 'Mission abandoned.') {
    if (!this.current) return false;
    const def = this.getMissionDef(this.current.number);
    this.current.failed = true;
    this.current.failReason = reason;
    this.lastFailedMission = def?.number ?? null;
    this._emit('onFail', { number: def?.number, name: def?.name, reason });
    this.current = null;
    return true;
  }

  getCurrentObjective() {
    if (!this.current) return null;
    const def = this.getMissionDef(this.current.number);
    const obj = def.objectives[this.current.objectiveIndex];
    if (!obj) return null;
    return obj.text;
  }

  getCurrentObjectiveText() {
    const text = this.getCurrentObjective();
    if (!text || !this.current) return text;
    const def = this.getMissionDef(this.current.number);
    const total = def ? def.objectives.length : 0;
    return (this.current.objectiveIndex + 1) + '/' + total + ' · ' + text;
  }

  // Round 4: flavour accessors — the intro card line for a mission and
  // the toast line for one of its objectives ('' when there is none).
  getIntroCard(number) {
    const def = this.getMissionDef(number);
    return def?.introCard || '';
  }
  getObjectiveFlavour(number, objectiveIndex) {
    const def = this.getMissionDef(number);
    return def?.objectiveFlavour?.[objectiveIndex] || '';
  }
  // Round 4: best clear times, { missionNumber: seconds } (a copy).
  getBestTimes() { return { ...this.bestTimes }; }
  // Round 5: under-par bonuses earned this profile (save v4).
  getParBonusesEarned() { return this.parBonusesEarned; }
  getBestTime(number) {
    const t = this.bestTimes[number];
    return typeof t === 'number' ? t : null;
  }

  // Progress accessor for the HUD: { number, objectiveIndex, objectiveCount }
  // — all null when no mission is active. objectiveIndex is 0-based.
  getMissionProgress() {
    if (!this.current) return { number: null, objectiveIndex: null, objectiveCount: null };
    const def = this.getMissionDef(this.current.number);
    return {
      number: this.current.number,
      objectiveIndex: this.current.objectiveIndex,
      objectiveCount: def ? def.objectives.length : null,
    };
  }

  // Round-9: true while any mission is running (a one-line read the HUD
  // / menu can use without digging into getMissionProgress() nulls).
  isMissionActive() { return this.current !== null; }

  // Round-9: the courier's progress along the hotel -> lookout route
  // during a tailing objective (0..1), or null when no tail is running.
  // The HUD can turn it into a "tailing…" bar; the value is read-only
  // here, so it can never change the mission flow.
  getTailProgress() {
    if (!this.current) return null;
    const def = this.getMissionDef(this.current.number);
    const obj = def?.objectives?.[this.current.objectiveIndex];
    if (!obj?.tail) return null;
    return clamp(this.current.tailProgress || 0, 0, 1);
  }

  // Round-9: the cash still on the table — the summed reward of every
  // mission not yet completed (par bonuses excluded). The menu / HUD can
  // show "up to $X left to earn" without re-listing the chain.
  getRemainingReward() {
    let total = 0;
    for (const def of MISSION_DEFS) {
      if (!this.completed.has(def.number)) total += def.reward || 0;
    }
    return total;
  }

  // Marker position { x, y, z, label } for the current objective, or null.
  getMarkerPosition(world) {
    if (!this.current) return null;
    const def = this.getMissionDef(this.current.number);
    const obj = def.objectives[this.current.objectiveIndex];
    if (!obj) return null;
    if (obj.tail && this.current.tailTarget) return { ...this.current.tailTarget, label: 'Courier' };
    const loc = this._location(world, obj.location);
    return { x: loc.x, y: loc.y || 0, z: loc.z, label: loc.label || obj.location };
  }

  isComplete() { return this.lastCompletedMission !== null && !this.current; }
  isMissionComplete() { return this.lastCompletedMission !== null; }
  isFailed() { return this.lastFailedMission !== null; }
  getRewardEarned() { return this.lastReward; }
  getCompletedMissions() { return [...this.completed].sort((a, b) => a - b); }
  hasCompleted(number) { return this.completed.has(number); }

  // Round-4b: one-object summary for the HUD / menu stats line.
  getSummary() {
    const prog = this.getMissionProgress();
    return {
      number: prog.number,
      name: this.current ? (this.getMissionDef(this.current.number)?.name ?? null) : null,
      objectiveIndex: prog.objectiveIndex,
      objectiveCount: prog.objectiveCount,
      parRemaining: this.getParRemaining(),
      bestTime: prog.number ? this.getBestTime(prog.number) : null,
      completedCount: this.completed.size,
    };
  }

  // Round-6: a hint naming the nearest landmark (the Spire or the
  // Marina Bridge) for the HUD — a flavour line, never an objective, so
  // it cannot change the mission flow. `landmarks` is an array of
  // { name, x, z }; `position` is the player's position. Returns null
  // when there is no landmark to name.
  getLandmarkHint(position, landmarks) {
    if (!position || !Array.isArray(landmarks) || !landmarks.length) return null;
    let best = null;
    let bestD = Infinity;
    for (const lm of landmarks) {
      if (!lm || typeof lm.x !== 'number' || typeof lm.z !== 'number') continue;
      const d = Math.hypot((position.x || 0) - lm.x, (position.z || 0) - lm.z);
      if (d < bestD) { bestD = d; best = lm; }
    }
    if (!best) return null;
    const dist = Math.round(bestD);
    if (best.name === 'Solmar Spire') return `The Solmar Spire towers over Downtown, ${dist} m away — worth a look.`;
    if (best.name === 'Marina Bridge') return `The Marina Bridge arches over the basin, ${dist} m away.`;
    if (best.name === 'Solmar Pyramid') return `The Solmar Pyramid's gold cap glints over the south-west block, ${dist} m away.`;
    return `${best.name || 'A landmark'} is ${dist} m away.`;
  }

  // Round-3 polish: seconds left on the current mission's par time, or
  // null when no mission is active or it has no par. The HUD shows it.
  getParRemaining() {
    if (!this.current) return null;
    const par = this.parSeconds[this.current.number];
    if (!par) return null;
    return Math.max(0, par - this.current.elapsed);
  }
  getParSeconds() {
    return this.current ? (this.parSeconds[this.current.number] ?? null) : null;
  }

  _advance(world, systems) {
    const def = this.getMissionDef(this.current.number);
    this.current.objectiveIndex += 1;
    this.current.tailTimer = 0;
    if (this.current.objectiveIndex >= def.objectives.length) {
      this._complete(world, systems);
    } else {
      const next = def.objectives[this.current.objectiveIndex];
      this._emit('onObjective', {
        number: def.number, objective: next.text,
        flavour: this.getObjectiveFlavour(def.number, this.current.objectiveIndex),
      });
      // Entering the tail objective spawns the courier near the hotel.
      if (next.tail) this._startTail(world);
    }
  }

  _startTail(world) {
    const hotel = this._location(world, 'palmsHotel');
    // The courier drives a slow loop from the hotel toward the lookout.
    const lookout = this._location(world, 'lookout');
    this.current.tailTarget = { x: hotel.x, y: 0, z: hotel.z };
    this.current.tailFrom = { ...this.current.tailTarget };
    this.current.tailTo = { x: lookout.x, y: 0, z: lookout.z };
    this.current.tailProgress = 0;
  }

  _complete(world, systems) {
    const def = this.getMissionDef(this.current.number);
    this.completed.add(def.number);
    this.lastReward = def.reward;
    this.lastCompletedMission = def.number;
    // Round 4: best clear time — a faster run overwrites the old best.
    const elapsed = this.current.elapsed;
    const prevBest = this.bestTimes[def.number];
    const isBest = typeof prevBest !== 'number' || elapsed < prevBest;
    if (isBest) this.bestTimes[def.number] = Math.round(elapsed * 10) / 10;
    if (typeof systems.addMoney === 'function') systems.addMoney(def.reward);
    // Round-3 polish: finish under par and the bonus lands with the reward.
    const par = this.parSeconds[def.number];
    const underPar = Boolean(par && this.current.elapsed <= par);
    let parBonus = 0;
    if (underPar) {
      parBonus = this.parBonus;
      this.lastReward += parBonus;
      this.parBonusesEarned += 1; // round 5: counted for save v4
      if (typeof systems.addMoney === 'function') systems.addMoney(parBonus);
    }
    if (typeof def.onComplete === 'function') {
      def.onComplete({ police: systems.police, traffic: systems.traffic, world });
    }
    this._emit('onComplete', { number: def.number, name: def.name, reward: this.lastReward, parBonus, bestTime: this.bestTimes[def.number], isBestTime: isBest });
    if (systems.audio?.playMissionComplete) systems.audio.playMissionComplete();
    this.current = null;
  }

  _fail(systems, reason) {
    const def = this.getMissionDef(this.current.number);
    this.lastFailedMission = def.number;
    this.current.failed = true;
    this.current.failReason = reason;
    this._emit('onFail', { number: def.number, name: def.name, reason });
    this.current = null;
  }

  // update(dt, world, player, systems)
  update(dt, world, player, systems = {}) {
    if (!dt || dt <= 0 || !this.current) return;
    const step = Math.min(dt, 0.05);
    this.current.elapsed += step;
    const def = this.getMissionDef(this.current.number);
    const obj = def.objectives[this.current.objectiveIndex];
    if (!obj) return;
    if (!player?.position) return;

    // Failure: busted or wasted ends any mission.
    if (systems.police?.isBusted?.()) return this._fail(systems, 'Busted by the police.');
    if (systems.police?.isWasted?.() || (typeof player.health === 'number' && player.health <= 0)) {
      return this._fail(systems, 'Wasted — Rico went down.');
    }

    const marker = this.getMarkerPosition(world);
    const playerPos = player.position;

    // --- Tailing objective: follow the courier, stay out of his sight. ---
    if (obj.tail) {
      // Round-8 fix (belt and braces): if the tail route was never
      // seeded (e.g. a mission restored mid-tail), initialise it from
      // the objective's route instead of crashing on undefined tailFrom.
      if (!this.current.tailFrom || !this.current.tailTo) this._startTail(world);
      // Move the courier slowly along hotel -> lookout.
      this.current.tailProgress = clamp((this.current.tailProgress || 0) + (step * 6) / 200, 0, 1);
      const from = this.current.tailFrom;
      const to = this.current.tailTo;
      const p = this.current.tailProgress;
      this.current.tailTarget = {
        x: from.x + (to.x - from.x) * p,
        y: 0,
        z: from.z + (to.z - from.z) * p,
      };
      const d = dist2D(playerPos, this.current.tailTarget);
      // Spotted: closer than 12m while roughly in front of the courier,
      // or closer than 6m at all. (Courier faces along his route.)
      const courierHeading = Math.atan2(to.x - from.x, to.z - from.z);
      const dx = playerPos.x - this.current.tailTarget.x;
      const dz = playerPos.z - this.current.tailTarget.z;
      const inFront = Math.sin(courierHeading) * dx + Math.cos(courierHeading) * dz;
      if ((d < 12 && inFront > 0) || d < 6) {
        this.current.tailSpotted = true;
        return this._fail(systems, def.failText);
      }
      // Lost him: too far away for too long.
      if (d > 70) {
        this.current.tailTimer += step;
        if (this.current.tailTimer > 8) return this._fail(systems, 'Lost the courier.');
      } else {
        this.current.tailTimer = 0;
      }
      this.current.tailElapsed = (this.current.tailElapsed || 0) + step;
      if (this.current.tailElapsed >= (obj.duration || 60) || this.current.tailProgress >= 1) {
        this._advance(world, systems);
      }
      return;
    }

    // --- Escape objectives: the marker only counts once heat is gone. ---
    if (obj.needsClear && systems.police) {
      if (systems.police.getWantedLevel?.() > 0) {
        // Still hot: wait it out (the police system decays the stars once
        // the player stays out of sight). No marker progress yet.
        return;
      }
    }

    // --- Steal / deliver a specific car. ---
    if (obj.needsCar) {
      const car = player.vehicle || player.car || null;
      const inRightCar = Boolean(player.inCar && car && car.model === obj.needsCar);
      if (!inRightCar) {
        // Must be in the right car before the marker counts.
        if (obj.id === 'steal') {
          // Standing at the lot in the right car means the steal happened.
          if (marker && dist2D(playerPos, marker) <= (obj.radius || 8) && player.inCar && car?.model === obj.needsCar) {
            this._advance(world, systems);
          }
        }
        return;
      }
    }

    // --- Harbour heist: grabbing the cash spikes the heat to four stars. ---
    if (marker && dist2D(playerPos, marker) <= (obj.radius || 8)) {
      if (def.startWantedOnGrab && obj.id === 'grab' && systems.police) {
        systems.police.setWanted?.(def.startWantedOnGrab);
      }
      this._advance(world, systems);
    }
  }

  // ---- persistence helpers (the SaveSystem stores these) ----

  toSaveData() {
    return {
      completed: [...this.completed],
      currentMission: this.current ? this.current.number : null,
      lastReward: this.lastReward,
      bestTimes: { ...this.bestTimes },
    };
  }

  fromSaveData(data = {}) {
    this.completed = new Set(data.completed || []);
    this.lastReward = data.lastReward || 0;
    // Round 4: best times restore migrate-safe — old saves simply have
    // none, and the field defaults to an empty map.
    this.bestTimes = { ...(data.bestTimes || {}) };
    this.current = null;
    return data.currentMission || null; // caller re-starts it via startMission
  }

  reset() {
    this.completed = new Set();
    this.current = null;
    this.lastReward = 0;
    this.lastCompletedMission = null;
    this.lastFailedMission = null;
    this.bestTimes = {};
  }
}

export function createMissionManager(options = {}) {
  return new MissionManager(options);
}

export { MISSION_DEFS, DEFAULT_LOCATIONS };
export default MissionManager;
