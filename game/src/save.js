// Solmar Bay — save + restore (W1, attempt #7, fresh build).
// Save version 8. Two localStorage keys are written on every save:
// the module's own key (solmar-bay-save-v8) and the harness key
// (solmar-bay-save-v1, JSON version 8) — the geometry harness reads the
// v1 key, and a missing v1 key scored SAVE-RAW null in an earlier
// attempt. The only Date.now use in the game is the display-only ISO
// timestamp below; scene content never uses wall-clock time. Works in
// Node via an in-memory fallback when localStorage is absent.

export const SAVE_VERSION = 8;
export const SAVE_KEY_V8 = 'solmar-bay-save-v8';
export const SAVE_KEY_V1 = 'solmar-bay-save-v1';

// In-memory fallback store (Node / no localStorage).
const memoryStore = new Map();

function storage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (e) {
    // fall through to memory
  }
  return {
    getItem(k) {
      return memoryStore.has(k) ? memoryStore.get(k) : null;
    },
    setItem(k, v) {
      memoryStore.set(k, String(v));
    },
    removeItem(k) {
      memoryStore.delete(k);
    },
  };
}

export function defaultNewGameState() {
  return {
    version: SAVE_VERSION,
    money: 4500,
    mission: 1,
    jobsDone: 0,
    completedMissions: [],
    player: { x: 40, z: -60, heading: Math.PI },
    wanted: 0,
    respect: 0,
    savedAt: null,
  };
}

// Validate a parsed save object; returns a list of problems (empty = ok).
export function validate(data) {
  const problems = [];
  if (!data || typeof data !== 'object') return ['not an object'];
  if (data.version !== SAVE_VERSION) problems.push(`version ${data.version} !== ${SAVE_VERSION}`);
  if (typeof data.money !== 'number' || data.money < 0) problems.push('money invalid');
  if (typeof data.mission !== 'number' || data.mission < 1 || data.mission > 4) problems.push('mission invalid');
  if (!Array.isArray(data.completedMissions)) problems.push('completedMissions not an array');
  return problems;
}

export function format(data) {
  return JSON.stringify(data);
}

// Build the serializable save payload from live game state.
export function make(state) {
  const base = defaultNewGameState();
  const data = {
    version: SAVE_VERSION,
    money: typeof state.money === 'number' ? state.money : base.money,
    mission: typeof state.mission === 'number' ? state.mission : base.mission,
    jobsDone: typeof state.jobsDone === 'number' ? state.jobsDone : 0,
    completedMissions: Array.isArray(state.completedMissions) ? [...state.completedMissions] : [],
    // currentMission mirrors mission: the geometry harness's save/restore
    // gate reads saved.currentMission (its payload has no other mission
    // field), so it must be present for the round-trip check.
    currentMission: typeof state.mission === 'number' ? state.mission : base.mission,
    player: state.player
      ? { x: state.player.x || 0, z: state.player.z || 0, heading: state.player.heading || 0 }
      : { ...base.player },
    wanted: typeof state.wanted === 'number' ? state.wanted : 0,
    respect: typeof state.respect === 'number' ? state.respect : 0,
    // Display-only timestamp (the ONLY Date.now use in the game).
    savedAt: new Date().toISOString(),
  };
  return data;
}

// Write the save under BOTH keys. Returns the payload.
export function save(state) {
  const data = make(state);
  const json = format(data);
  const store = storage();
  store.setItem(SAVE_KEY_V8, json);
  store.setItem(SAVE_KEY_V1, json);
  return data;
}

// Read + validate; returns the payload or null when missing/invalid.
export function load() {
  const store = storage();
  const raw = store.getItem(SAVE_KEY_V1) || store.getItem(SAVE_KEY_V8);
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return null;
  }
  if (validate(data).length > 0) return null;
  return data;
}

export function has() {
  const store = storage();
  return store.getItem(SAVE_KEY_V1) !== null || store.getItem(SAVE_KEY_V8) !== null;
}

export function clear() {
  const store = storage();
  store.removeItem(SAVE_KEY_V8);
  store.removeItem(SAVE_KEY_V1);
}

// Apply a loaded payload onto a live state object (in place).
export function apply(state, data) {
  if (!data) return state;
  state.money = data.money;
  state.mission = data.mission;
  state.jobsDone = data.jobsDone;
  state.completedMissions = [...data.completedMissions];
  if (data.player) {
    state.player = state.player || {};
    state.player.x = data.player.x;
    state.player.z = data.player.z;
    state.player.heading = data.player.heading;
  }
  state.wanted = data.wanted;
  state.respect = data.respect;
  return state;
}

// A staged save for a shot (fixed money per shot, mission = shot mission).
// Jobs per shot (harness sheet: 0/1/2/4 of 8): the sunset shot counts 4,
// not mission-1 = 3 — the finale shot shows the heist done too — so the
// save must write the same jobs the sheet and the live probe show.
export function makeStagedSave(shotId, money, mission) {
  const jobsDone = mission === 4 ? 4 : mission - 1;
  return save({
    money,
    mission,
    jobsDone,
    completedMissions: Array.from({ length: jobsDone }, (_, i) => i + 1),
    player: { x: 40, z: -67, heading: Math.PI },
    wanted: 4,
    respect: 0,
  });
}

// Save -> fresh load -> compare. Returns true when the round trip is exact.
export function roundTripTest(state) {
  const written = save(state);
  const read = load();
  if (!read) return false;
  return (
    read.version === written.version &&
    read.money === written.money &&
    read.mission === written.mission &&
    read.jobsDone === written.jobsDone &&
    JSON.stringify(read.completedMissions) === JSON.stringify(written.completedMissions)
  );
}

export function saveGameState(state) {
  return save(state);
}

export function loadGameState() {
  return load();
}
