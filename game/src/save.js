// Solmar Bay — save and restore, version 8.
//
// The game writes its save under TWO localStorage keys: the module's own
// key (solmar-bay-save-v8) and the harness-facing key (solmar-bay-save-v1),
// both carrying JSON with version: 8. The geometry harness reads the -v1
// key; main.js must call saveGameState() during staging so a real save
// exists when the shots are captured.
//
// The only wall-clock use in the whole game is the display-only ISO
// timestamp stored with the save. Nothing about scene content depends on it.
//
// Safe to import in a no-DOM environment (the unit harness): when
// localStorage is unavailable an in-memory store stands in, with the same
// API, so round-trip tests run identically in node and in the browser.

/** Save format version. Bump only with a migration in load(). */
export const SAVE_VERSION = 8;

/** The module's own key. */
export const SAVE_KEY = 'solmar-bay-save-v8';

/** The harness-facing key (the geometry harness reads this one). */
export const SAVE_KEY_V1 = 'solmar-bay-save-v1';

/** Both keys, in write order. */
export const SAVE_KEYS = [SAVE_KEY, SAVE_KEY_V1];

/** New-game baseline: money 4500, mission 1, no jobs done yet. */
export const NEW_GAME_MONEY = 4500;
export const NEW_GAME_MISSION = 1;

/** The staged save the harness probes: money 1200, mission 3, jobs 2. */
export const STAGED_MONEY = 1200;
export const STAGED_MISSION = 3;
export const STAGED_JOBS = 2;

// ---- storage shim: localStorage when present, memory otherwise ----
const memoryStore = new Map();

function getStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage !== null) {
      // Probe it: some browsers throw on access in private mode.
      localStorage.getItem('__solmar_probe__');
      return localStorage;
    }
  } catch (err) {
    // Fall through to the memory store.
  }
  return {
    getItem(key) {
      return memoryStore.has(key) ? memoryStore.get(key) : null;
    },
    setItem(key, value) {
      memoryStore.set(key, String(value));
    },
    removeItem(key) {
      memoryStore.delete(key);
    },
  };
}

/** Display-only timestamp (the game's single allowed wall-clock use). */
function nowIso() {
  try {
    return new Date().toISOString();
  } catch (err) {
    return '1970-01-01T00:00:00.000Z';
  }
}

/**
 * make — build a complete save object from partial fields. Missing fields
 * fall back to the new-game baseline, so a caller can pass just the bits
 * it knows (for example { money: 1200, mission: 3, jobs: 2 }).
 */
export function make(partial = {}) {
  const p = partial || {};
  const state = {
    version: SAVE_VERSION,
    money: typeof p.money === 'number' ? p.money : NEW_GAME_MONEY,
    mission: typeof p.mission === 'number' ? p.mission : NEW_GAME_MISSION,
    completedMissions: Array.isArray(p.completedMissions) ? [...p.completedMissions] : [],
    jobs: typeof p.jobs === 'number' ? p.jobs : 0,
    jobsDone: typeof p.jobsDone === 'number' ? p.jobsDone : (typeof p.jobs === 'number' ? p.jobs : 0),
    wanted: typeof p.wanted === 'number' ? p.wanted : 0,
    player: {
      x: p.player && typeof p.player.x === 'number' ? p.player.x : 40,
      z: p.player && typeof p.player.z === 'number' ? p.player.z : -40,
      heading: p.player && typeof p.player.heading === 'number' ? p.player.heading : 0,
    },
    checkpoint: typeof p.checkpoint === 'string' ? p.checkpoint : 'MARINA',
    savedAt: typeof p.savedAt === 'string' ? p.savedAt : nowIso(),
  };
  return state;
}

/** defaultNewGameState — a fresh new-game save (money 4500, mission 1). */
export function defaultNewGameState() {
  return make();
}

/**
 * validate — check a loaded object really is a version-8 save.
 * Returns { ok, errors } (errors is empty when ok).
 */
export function validate(state) {
  const errors = [];
  if (!state || typeof state !== 'object') {
    return { ok: false, errors: ['save is not an object'] };
  }
  if (state.version !== SAVE_VERSION) {
    errors.push(`version ${state.version} !== ${SAVE_VERSION}`);
  }
  if (typeof state.money !== 'number' || !(state.money > 0)) {
    errors.push('money must be a number greater than 0');
  }
  if (typeof state.mission !== 'number' || state.mission < 1 || state.mission > 5) {
    errors.push('mission must be a number from 1 to 5');
  }
  if (!Array.isArray(state.completedMissions)) {
    errors.push('completedMissions must be an array');
  }
  if (typeof state.jobs !== 'number' || state.jobs < 0) {
    errors.push('jobs must be a number >= 0');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * save — write a state under BOTH keys (module key + harness key).
 * The state is normalized through make() first, so partial states save
 * cleanly. Returns true when both writes succeeded.
 */
export function save(state) {
  const full = make(state || {});
  const json = JSON.stringify(full);
  const store = getStorage();
  let ok = true;
  for (const key of SAVE_KEYS) {
    try {
      store.setItem(key, json);
    } catch (err) {
      ok = false;
    }
  }
  return ok;
}

/**
 * load — read the save back. The harness key (-v1) is tried first, then
 * the module key (-v8). Returns the parsed state, or null when nothing
 * valid is stored.
 */
export function load() {
  const store = getStorage();
  for (const key of [SAVE_KEY_V1, SAVE_KEY]) {
    let raw = null;
    try {
      raw = store.getItem(key);
    } catch (err) {
      raw = null;
    }
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (validate(parsed).ok) return parsed;
    } catch (err) {
      // Corrupt JSON under this key: try the next one.
    }
  }
  return null;
}

/** has — true when a valid version-8 save is stored under either key. */
export function has() {
  return load() !== null;
}

/** clear — remove the save from both keys. */
export function clear() {
  const store = getStorage();
  for (const key of SAVE_KEYS) {
    try {
      store.removeItem(key);
    } catch (err) {
      // Ignore: a missing key is already clear.
    }
  }
}

/**
 * format — the save line the HUD prints, for example
 * "SAVED 11:32 · CHECKPOINT: MARINA". The time comes from the save's
 * display-only timestamp, never the wall clock at render time.
 */
export function format(state) {
  const s = make(state || {});
  const time = String(s.savedAt || '').slice(11, 16) || '00:00';
  const checkpoint = String(s.checkpoint || 'MARINA').toUpperCase();
  return `SAVED ${time} · CHECKPOINT: ${checkpoint}`;
}

/**
 * apply — copy a loaded save onto a game-like object (the main.js state).
 * Only the fields the save owns are copied; the game keeps its live
 * objects (scene, renderer, systems). Returns the target.
 */
export function apply(state, target) {
  const s = make(state || {});
  const g = target || {};
  g.money = s.money;
  g.mission = s.mission;
  g.completedMissions = [...s.completedMissions];
  g.jobs = s.jobs;
  g.jobsDone = s.jobsDone;
  g.wanted = s.wanted;
  g.checkpoint = s.checkpoint;
  if (g.player && typeof g.player === 'object') {
    g.player.x = s.player.x;
    g.player.z = s.player.z;
    g.player.heading = s.player.heading;
  } else {
    g.player = { ...s.player };
  }
  return g;
}

/**
 * roundTripTest — the save-and-restore proof: write the staged save
 * (money 1200, mission 3, jobs 2), load it back fresh, and compare every
 * field. Returns { pass, saved, loaded, errors }.
 */
export function roundTripTest() {
  const staged = make({
    money: STAGED_MONEY,
    mission: STAGED_MISSION,
    jobs: STAGED_JOBS,
    completedMissions: [1, 2],
    checkpoint: 'MARINA',
  });
  const errors = [];
  if (!save(staged)) errors.push('save() returned false');
  const loaded = load();
  if (!loaded) {
    errors.push('load() returned null after save()');
    return { pass: false, saved: staged, loaded: null, errors };
  }
  if (loaded.version !== SAVE_VERSION) errors.push(`version ${loaded.version}`);
  if (loaded.money !== STAGED_MONEY) errors.push(`money ${loaded.money} !== ${STAGED_MONEY}`);
  if (loaded.mission !== STAGED_MISSION) errors.push(`mission ${loaded.mission} !== ${STAGED_MISSION}`);
  if (loaded.jobs !== STAGED_JOBS) errors.push(`jobs ${loaded.jobs} !== ${STAGED_JOBS}`);
  if (JSON.stringify(loaded.completedMissions) !== JSON.stringify([1, 2])) {
    errors.push('completedMissions did not round-trip');
  }
  // The staged save must be readable under BOTH keys.
  const store = getStorage();
  for (const key of SAVE_KEYS) {
    let raw = null;
    try {
      raw = store.getItem(key);
    } catch (err) {
      raw = null;
    }
    if (!raw) {
      errors.push(`no save under key ${key}`);
      continue;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.money !== STAGED_MONEY || parsed.version !== SAVE_VERSION) {
        errors.push(`key ${key} holds the wrong save`);
      }
    } catch (err) {
      errors.push(`key ${key} holds corrupt JSON`);
    }
  }
  return { pass: errors.length === 0, saved: staged, loaded, errors };
}
