// game/src/save.js — Save and restore (attempt #8, round-16 rebuild).
//
// Save version 8. Saves money (greater than 0), completed missions, jobs,
// player position, and a display-only timestamp. Restores exactly through
// a fresh load and start: a save followed by a fresh load and a start
// must round-trip (same mission, same jobs, same money).
//
// TWO keys, both written on every save:
//   - the module's own key:   'solmar-bay-save-v8'
//   - the harness key:        'solmar-bay-save-v1'  (JSON version 8)
// The geometry harness reads the v1 key, so the game MUST write its save
// under localStorage key 'solmar-bay-save-v1' with JSON `version: 8`.
// saveGameState() MUST be called during staging so a real save exists
// when the shots are captured.
//
// Storage: localStorage when available; an in-memory fallback when it is
// not (Node tests, private mode, or a blocked store). The fallback keeps
// the same API, so the round-trip test passes in both environments.
// The only use of the current time is a display-only ISO timestamp
// (savedAt) — never for scene content.

export const SAVE_VERSION = 8;

export const SAVE_KEY_V8 = 'solmar-bay-save-v8';
export const SAVE_KEY_V1 = 'solmar-bay-save-v1';

// Backwards-compatible aliases (the module key is the v8 key).
export const MODULE_KEY = SAVE_KEY_V8;
export const HARNESS_KEY = SAVE_KEY_V1;

// Baseline new game: money 4500, mission 1. Staged save: money 1200.
export const BASELINE_MONEY = 4500;
export const BASELINE_MISSION = 1;
export const STAGED_MONEY = 1200;

// ---------------------------------------------------------------------
// Storage shim: localStorage when it exists and works, an in-memory Map
// otherwise. The shim is created once per module load and shared by
// save/load/has/clear, so a save in one call is visible to the next.
function createStorage() {
  const memory = new Map();
  let local = null;
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      // Probe it: some browsers expose localStorage but throw on use.
      const probeKey = '__solmar_save_probe__';
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      local = localStorage;
    }
  } catch (err) {
    local = null;
  }
  return {
    get(key) {
      if (local) {
        try {
          return local.getItem(key);
        } catch (err) {
          return memory.has(key) ? memory.get(key) : null;
        }
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    set(key, value) {
      if (local) {
        try {
          local.setItem(key, value);
          return;
        } catch (err) {
          // Fall through to memory on quota / access errors.
        }
      }
      memory.set(key, value);
    },
    remove(key) {
      if (local) {
        try {
          local.removeItem(key);
        } catch (err) {
          // Ignore; memory copy is removed below regardless.
        }
      }
      memory.delete(key);
    },
    // Test hook: which backend is live ('local' or 'memory').
    get backend() {
      return local ? 'local' : 'memory';
    },
  };
}

const storage = createStorage();

// ---------------------------------------------------------------------
// defaultNewGameState — the baseline new game: money 4500, mission 1,
// no jobs done, no completed missions, Rico at the downtown start spot.
export function defaultNewGameState() {
  return {
    version: SAVE_VERSION,
    money: BASELINE_MONEY,
    mission: BASELINE_MISSION,
    currentMission: BASELINE_MISSION,
    jobsDone: 0,
    completedMissions: [],
    player: { x: 40, z: -80, heading: 0, inCar: false, car: null },
    wanted: 0,
    respect: 0,
    checkpoint: 'MARINA',
    savedAt: null,
  };
}

// make — build a save record from a live game state object. Accepts a
// partial state and fills the rest from the baseline, so callers never
// have to pass every field.
export function make(partial) {
  const base = defaultNewGameState();
  const src = partial || {};
  const state = {
    version: SAVE_VERSION,
    money: typeof src.money === 'number' ? src.money : base.money,
    mission: typeof src.mission === 'number' ? src.mission : base.mission,
    // FIX #1 (attempt #8): the harness reads saved.currentMission — the
    // old make() wrote only `mission`, so the round-trip gate failed.
    // Derive it from an explicit currentMission, else from mission.
    currentMission: typeof src.currentMission === 'number'
      ? src.currentMission
      : (typeof src.mission === 'number' ? src.mission : base.mission),
    jobsDone: typeof src.jobsDone === 'number' ? src.jobsDone : base.jobsDone,
    completedMissions: Array.isArray(src.completedMissions)
      ? src.completedMissions.slice()
      : base.completedMissions,
    player: {
      x: src.player && typeof src.player.x === 'number' ? src.player.x : base.player.x,
      z: src.player && typeof src.player.z === 'number' ? src.player.z : base.player.z,
      heading: src.player && typeof src.player.heading === 'number' ? src.player.heading : 0,
      inCar: !!(src.player && src.player.inCar),
      car: src.player && src.player.car ? src.player.car : null,
    },
    wanted: typeof src.wanted === 'number' ? src.wanted : 0,
    respect: typeof src.respect === 'number' ? src.respect : 0,
    checkpoint: typeof src.checkpoint === 'string' ? src.checkpoint : base.checkpoint,
    // Display-only ISO timestamp. The ONLY Date.now use in the game.
    savedAt: typeof src.savedAt === 'string' ? src.savedAt : new Date().toISOString(),
  };
  return state;
}

// validate — true only for a well-formed version-8 save: correct
// version, money greater than 0, a 1-based mission number, jobs done
// within 0-4, and completed missions as an array of 1-based numbers.
export function validate(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.version !== SAVE_VERSION) return false;
  if (typeof data.money !== 'number' || data.money <= 0) return false;
  if (typeof data.mission !== 'number' || data.mission < 1 || data.mission > 4) return false;
  if (typeof data.jobsDone !== 'number' || data.jobsDone < 0 || data.jobsDone > 4) return false;
  if (!Array.isArray(data.completedMissions)) return false;
  for (let i = 0; i < data.completedMissions.length; i += 1) {
    const m = data.completedMissions[i];
    if (typeof m !== 'number' || m < 1 || m > 4) return false;
  }
  return true;
}

// format — the save line shown in the mission panel, e.g.
// "SAVED 11:32 · CHECKPOINT: MARINA". The clock part comes from the
// savedAt timestamp's UTC hours/minutes (display only).
export function format(data) {
  const state = data || defaultNewGameState();
  let clock = '--:--';
  if (typeof state.savedAt === 'string' && state.savedAt.length >= 16) {
    clock = state.savedAt.slice(11, 16);
  }
  const checkpoint = (state.checkpoint || 'MARINA').toUpperCase();
  return 'SAVED ' + clock + ' · CHECKPOINT: ' + checkpoint;
}

// save — serialize the state and write it under BOTH keys (the module
// key and the harness key). Returns the written record.
export function save(state) {
  const record = make(state);
  const json = JSON.stringify(record);
  storage.set(SAVE_KEY_V8, json);
  storage.set(SAVE_KEY_V1, json);
  return record;
}

// load — read the save back. The harness key is tried first, then the
// module key. Returns the parsed record, or null when nothing valid is
// stored. A stored record with a wrong version is treated as absent
// (never migrated silently — a version mismatch is a real error).
export function load() {
  const raw = storage.get(SAVE_KEY_V1) || storage.get(SAVE_KEY_V8);
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (!validate(parsed)) return null;
  return parsed;
}

// has — true when a valid version-8 save exists under either key.
export function has() {
  return load() !== null;
}

// clear — remove the save from both keys.
export function clear() {
  storage.remove(SAVE_KEY_V8);
  storage.remove(SAVE_KEY_V1);
}

// apply — apply a loaded save record onto a live game state object.
// Copies money, mission, jobs, completed missions, wanted, respect,
// checkpoint, and the player position. Returns the target object.
export function apply(target, record) {
  const src = record || load();
  if (!src || !validate(src)) return target;
  target.money = src.money;
  target.mission = src.mission;
  if (typeof src.currentMission === 'number') target.currentMission = src.currentMission;
  else target.currentMission = src.mission;
  target.jobsDone = src.jobsDone;
  target.completedMissions = src.completedMissions.slice();
  target.wanted = src.wanted;
  target.respect = src.respect;
  target.checkpoint = src.checkpoint;
  if (target.player && src.player) {
    target.player.x = src.player.x;
    target.player.z = src.player.z;
    target.player.heading = src.player.heading;
    target.player.inCar = src.player.inCar;
    target.player.car = src.player.car;
  }
  return target;
}

// roundTripTest — save a state, reload it fresh, and confirm the same
// mission, the same jobs, and the same money come back. Returns an
// object { pass, saved, loaded, reason } so the caller can report the
// failure precisely instead of a bare boolean.
export function roundTripTest(state) {
  const probe = state || {
    money: 2450,
    mission: 2,
    jobsDone: 1,
    completedMissions: [1],
    player: { x: 40, z: -22, heading: Math.PI / 2, inCar: false, car: null },
    wanted: 4,
    respect: 10,
    checkpoint: 'MARINA',
  };
  const saved = save(probe);
  const loaded = load();
  if (!loaded) {
    return { pass: false, saved, loaded: null, reason: 'load returned null after save' };
  }
  if (loaded.mission !== saved.mission) {
    return { pass: false, saved, loaded, reason: 'mission mismatch' };
  }
  if (loaded.jobsDone !== saved.jobsDone) {
    return { pass: false, saved, loaded, reason: 'jobsDone mismatch' };
  }
  if (loaded.money !== saved.money) {
    return { pass: false, saved, loaded, reason: 'money mismatch' };
  }
  if (JSON.stringify(loaded.completedMissions) !== JSON.stringify(saved.completedMissions)) {
    return { pass: false, saved, loaded, reason: 'completedMissions mismatch' };
  }
  return { pass: true, saved, loaded, reason: 'ok' };
}

// saveGameState — the staging entry point main.js calls during shot
// staging, so a real save exists when the shots are captured. Builds a
// record from the live state and writes it under both keys.
export function saveGameState(liveState) {
  return save(liveState || defaultNewGameState());
}

// loadGameState — the fresh-load entry point: read the stored save, or
// fall back to the baseline new game when nothing valid is stored.
export function loadGameState() {
  const loaded = load();
  if (loaded) return loaded;
  return defaultNewGameState();
}
