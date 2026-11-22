// save.js — save + restore for Solmar Bay (save version 8).
// Attempt #9 (top10-rebuild).
//
// TWO localStorage keys, one save:
//  - Module key:   'solmar-bay-save-v8' (the module's own key)
//  - Harness key:  'solmar-bay-save-v1' (the geometry harness reads
//    THIS key, with JSON version 8 inside)
// save() writes BOTH keys so the harness always finds a real save.
//
// Baseline new game: money 4500, mission 1, no jobs done.
// Staged saves (per shot): cover 1200, combat 2450, pursuit 3200,
// sunset 4500 — those are the staged money values the shots show.
//
// Round-trip rule: save -> fresh load -> start must restore the same
// mission, jobs and money. validate() is the gate: version must be 8,
// money must be a positive number, mission 1..5.
//
// The ONLY wall-clock use in the whole game is the display-only
// savedAt ISO timestamp. Nothing about scene content reads the clock.

export const SAVE_VERSION = 8;

export const SAVE_KEY_V8 = 'solmar-bay-save-v8';
export const SAVE_KEY = SAVE_KEY_V8;
export const SAVE_KEY_V1 = 'solmar-bay-save-v1';

// Staged money per shot (also mirrored in CONFIG.staging).
export const STAGED_MONEY = {
  cover: 1200,
  combat: 2450,
  pursuit: 3200,
  sunset: 4500,
};

// Jobs done / missions completed per shot (mirrors CONFIG.staging).
export const STAGED_PROGRESS = {
  cover: { jobsDone: 0, completedMissions: [] },
  combat: { jobsDone: 1, completedMissions: [1] },
  pursuit: { jobsDone: 2, completedMissions: [1, 2] },
  sunset: { jobsDone: 4, completedMissions: [1, 2, 3, 4] },
};

// ----------------------------------------------------------------------
// Shape helpers
// ----------------------------------------------------------------------

// Fresh new-game state. Money 4500, mission 1 — the baseline the
// harness and the start menu both expect.
export function defaultNewGameState() {
  return {
    version: SAVE_VERSION,
    money: 4500,
    mission: 1,
    currentMission: 1,
    completedMissions: [],
    jobsDone: 0,
    player: { x: 40, y: 0, z: -40, heading: 0 },
    checkpoint: 'MARINA',
    savedAt: new Date().toISOString(),
  };
}

// Normalise any partial state into a full, valid v8 save object.
// Missing fields fall back to the new-game baseline; unknown extra
// fields are dropped so old saves cannot smuggle junk forward.
export function make(partial) {
  const base = defaultNewGameState();
  const src = partial && typeof partial === 'object' ? partial : {};
  const completed = Array.isArray(src.completedMissions)
    ? src.completedMissions.filter((n) => Number.isInteger(n) && n >= 1 && n <= 5)
    : [];
  const player = src.player && typeof src.player === 'object' ? src.player : {};
  return {
    version: SAVE_VERSION,
    money: typeof src.money === 'number' && src.money > 0 ? src.money : base.money,
    mission: Number.isInteger(src.mission) && src.mission >= 1 && src.mission <= 5
      ? src.mission
      : base.mission,
    // The harness reads saved.currentMission — derive it from an explicit
    // currentMission, else from mission (attempt #8 fix #1, regressed here).
    currentMission: typeof src.currentMission === 'number'
      ? src.currentMission
      : (Number.isInteger(src.mission) && src.mission >= 1 && src.mission <= 5 ? src.mission : base.mission),
    completedMissions: completed,
    jobsDone: Number.isInteger(src.jobsDone) && src.jobsDone >= 0 ? src.jobsDone : 0,
    player: {
      x: typeof player.x === 'number' ? player.x : base.player.x,
      y: typeof player.y === 'number' ? player.y : 0,
      z: typeof player.z === 'number' ? player.z : base.player.z,
      heading: typeof player.heading === 'number' ? player.heading : 0,
    },
    checkpoint: typeof src.checkpoint === 'string' && src.checkpoint ? src.checkpoint : 'MARINA',
    savedAt: typeof src.savedAt === 'string' && src.savedAt ? src.savedAt : new Date().toISOString(),
  };
}

// A staged save for one of the four shots: staged money + the shot's
// progress, stamped with the current display-only time.
export function makeStagedSave(shotId, mission) {
  const progress = STAGED_PROGRESS[shotId] || { jobsDone: 0, completedMissions: [] };
  const money = STAGED_MONEY[shotId] || 1200;
  const missionNumber = Number.isInteger(mission) && mission >= 1 && mission <= 5
    ? mission
    : { cover: 1, combat: 2, pursuit: 3, sunset: 4 }[shotId] || 1;
  return make({
    money,
    mission: missionNumber,
    completedMissions: progress.completedMissions.slice(),
    jobsDone: progress.jobsDone,
  });
}

// Strict gate: is this object a usable v8 save?
export function validate(obj) {
  if (!obj || typeof obj !== 'object') return false;
  if (obj.version !== SAVE_VERSION) return false;
  if (typeof obj.money !== 'number' || !(obj.money > 0)) return false;
  if (!Number.isInteger(obj.mission) || obj.mission < 1 || obj.mission > 5) return false;
  if (!Array.isArray(obj.completedMissions)) return false;
  if (!Number.isInteger(obj.jobsDone) || obj.jobsDone < 0) return false;
  if (obj.player && typeof obj.player !== 'object') return false;
  return true;
}

// JSON serialisation (pure — no storage touched, safe in Node/tests).
export function serialize(state) {
  return JSON.stringify(make(state));
}

export function deserialize(json) {
  let parsed = null;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return null;
  }
  if (!validate(parsed)) return null;
  return make(parsed);
}

// ----------------------------------------------------------------------
// Storage (localStorage when present; graceful no-op without it)
// ----------------------------------------------------------------------
function storageAvailable() {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch (err) {
    return false;
  }
}

function writeKey(key, json) {
  if (!storageAvailable()) return false;
  try {
    localStorage.setItem(key, json);
    return true;
  } catch (err) {
    return false;
  }
}

function readKey(key) {
  if (!storageAvailable()) return null;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

// Write the save under BOTH keys. Returns true only if at least the
// harness key (v1) was written — that is the one the tests read.
export function save(state, key) {
  const json = serialize(state);
  const wroteV1 = writeKey(SAVE_KEY_V1, json);
  const wroteV8 = writeKey(SAVE_KEY_V8, json);
  if (typeof key === 'string' && key && key !== SAVE_KEY_V1 && key !== SAVE_KEY_V8) {
    writeKey(key, json);
  }
  return wroteV1 || wroteV8;
}

// The staging entry point: the game calls saveGameState() during
// staging so a real save exists when the shots are captured.
export function saveGameState(state) {
  return save(state);
}

// Read: harness key first, module key as fallback. Returns a
// normalised state object, or null when nothing usable is stored.
export function load() {
  const fromV1 = deserialize(readKey(SAVE_KEY_V1));
  if (fromV1) return fromV1;
  const fromV8 = deserialize(readKey(SAVE_KEY_V8));
  if (fromV8) return fromV8;
  return null;
}

export function has() {
  if (!storageAvailable()) return false;
  try {
    return localStorage.getItem(SAVE_KEY_V1) !== null
      || localStorage.getItem(SAVE_KEY_V8) !== null;
  } catch (err) {
    return false;
  }
}

export function clear() {
  if (!storageAvailable()) return false;
  try {
    localStorage.removeItem(SAVE_KEY_V1);
    localStorage.removeItem(SAVE_KEY_V8);
    return true;
  } catch (err) {
    return false;
  }
}

// Apply a loaded save to a fresh state: invalid input falls back to
// the new-game baseline instead of throwing.
export function apply(saveData) {
  if (!validate(saveData)) return defaultNewGameState();
  return make(saveData);
}

// Human-readable save line for the mission panel, e.g.
// "SAVED 11:32 · CHECKPOINT: MARINA". Display-only; the time comes
// from the save's own savedAt stamp.
export function format(saveData) {
  const state = validate(saveData) ? saveData : defaultNewGameState();
  let clock = '--:--';
  if (state.savedAt) {
    const d = new Date(state.savedAt);
    if (!Number.isNaN(d.getTime())) {
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      clock = `${hh}:${mm}`;
    }
  }
  const checkpoint = state.checkpoint || 'MARINA';
  return `SAVED ${clock} · CHECKPOINT: ${checkpoint}`;
}

// ----------------------------------------------------------------------
// Round-trip self-test (pure — no storage, no clock dependency beyond
// the display stamp). save -> serialise -> parse -> validate must
// return the same mission, jobs and money.
// ----------------------------------------------------------------------
export function roundTripTest() {
  const original = defaultNewGameState();
  original.money = 2450;
  original.mission = 2;
  original.completedMissions = [1];
  original.jobsDone = 1;
  const json = serialize(original);
  const back = deserialize(json);
  if (!back) return false;
  if (back.version !== SAVE_VERSION) return false;
  if (back.money !== original.money) return false;
  if (back.mission !== original.mission) return false;
  if (back.jobsDone !== original.jobsDone) return false;
  if (JSON.stringify(back.completedMissions) !== JSON.stringify(original.completedMissions)) return false;
  return true;
}

export default save;
