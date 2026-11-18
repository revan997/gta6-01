// Solmar Bay — SaveSystem (Lane B)
// Saving to the browser's localStorage: the player's money, completed
// missions, current mission, position and wanted level; load it back; and
// report whether a save exists. No network, no other storage.
// The saved shape is versioned so a future format change can migrate
// instead of crashing on an old save.

export const SAVE_KEY = 'solmar-bay-save-v1';
export const SAVE_VERSION = 6;
// Version 1, 2 and 3 saves are still readable: they migrate with the v2
// fields (playTimeSeconds, timesPlayed), the v3 fields (totalEarned,
// bestTimes, missionsCompletedCount, gamesPlayed), the v4 field
// (parBonuses) and the v5 field (landmarksVisited) defaulting to 0 / {}.
// Round 7 (v6): landmarksVisited now covers three landmarks — the
// Solmar Pyramid joins the Spire and the Bridge — so a v6 save records
// Pyramid visits; older saves migrate with the new landmark unvisited.
// MissionsCompletedCount is recomputed from the completed list when it is
// missing, so even a v1 save reports the right count on load.
export const SUPPORTED_SAVE_VERSIONS = [1, 2, 3, 4, 5, 6];

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export class SaveSystem {
  constructor(options = {}) {
    this.key = options.key || SAVE_KEY;
    this.storage = options.storage || null; // injected storage (tests); else localStorage
  }

  _store() {
    if (this.storage) return this.storage;
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (_) {
      return null;
    }
    return null;
  }

  hasSave() {
    const store = this._store();
    if (!store) return false;
    try {
      const raw = store.getItem(this.key);
      if (!raw) return false;
      const data = safeParse(raw);
      return isPlainObject(data) && SUPPORTED_SAVE_VERSIONS.includes(data.version);
    } catch (_) {
      return false;
    }
  }

  // save(state): state is the game state object. Only the documented
  // fields are persisted; anything else is ignored.
  //   { money, completedMissions, currentMission, position: {x,y,z},
  //     heading, wanted, health, armour, ammo, timeOfDay,
  //     playTimeSeconds, timesPlayed, totalEarned,
  //     bestTimes, gamesPlayed, landmarksVisited }
  // Round 4: bestTimes ({ missionNumber: seconds }) comes from
  // missions.getBestTimes(); missionsCompletedCount is derived from the
  // completed list; gamesPlayed counts sessions that finished at least
  // one mission (the game loop increments it — see main.js).
  save(state = {}) {
    const store = this._store();
    if (!store) return false;
    const pos = state.position || state.player?.position || null;
    const completedList = Array.isArray(state.completedMissions)
      ? [...state.completedMissions]
      : (state.missions?.getCompletedMissions?.() || []);
    const bestTimes = isPlainObject(state.bestTimes)
      ? { ...state.bestTimes }
      : (state.missions?.getBestTimes?.() || {});
    const data = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      money: Math.round(state.money ?? state.player?.money ?? 0),
      completedMissions: completedList,
      missionsCompletedCount: completedList.length,
      currentMission: state.currentMission ?? state.missions?.getCurrentMissionNumber?.() ?? null,
      position: pos ? { x: pos.x || 0, y: pos.y || 0, z: pos.z || 0 } : null,
      heading: state.heading ?? state.player?.heading ?? 0,
      wanted: Math.max(0, Math.min(5, Math.round(state.wanted ?? 0))),
      health: state.health ?? state.player?.health ?? null,
      armour: state.armour ?? null,
      ammo: state.ammo ?? null,
      timeOfDay: state.timeOfDay ?? null,
      playTimeSeconds: Math.max(0, Math.round(state.playTimeSeconds ?? state.player?.playTimeSeconds ?? 0)),
      timesPlayed: Math.max(0, Math.round(state.timesPlayed ?? 0)),
      gamesPlayed: Math.max(0, Math.round(state.gamesPlayed ?? 0)),
      // Round 3: lifetime cash earned across all missions on this profile.
      totalEarned: Math.max(0, Math.round(state.totalEarned ?? 0)),
      // Round 5: under-par bonuses earned (each worth CONFIG.parBonus).
      parBonuses: Math.max(0, Math.round(state.parBonuses ?? 0)),
      // Round 6: landmarks Rico has visited (names — 'Solmar Spire',
      // 'Marina Bridge'). Stored as an array; a Set from the player is
      // accepted and converted, so the caller can pass either shape.
      landmarksVisited: Array.isArray(state.landmarksVisited)
        ? [...state.landmarksVisited]
        : (state.landmarksVisited instanceof Set ? [...state.landmarksVisited] : []),
      // Round 4: best clear time per mission (seconds, one decimal).
      bestTimes,
    };
    try {
      store.setItem(this.key, JSON.stringify(data));
      return true;
    } catch (_) {
      return false;
    }
  }

  // load(): returns the saved state object, or null when there is no
  // valid save.
  load() {
    const store = this._store();
    if (!store) return null;
    let raw = null;
    try {
      raw = store.getItem(this.key);
    } catch (_) {
      return null;
    }
    if (!raw) return null;
    const data = safeParse(raw);
    // Accept v1–v5; older saves migrate with the new fields as 0 / [].
    if (!isPlainObject(data) || !SUPPORTED_SAVE_VERSIONS.includes(data.version)) return null;
    return {
      version: data.version,
      savedAt: data.savedAt || null,
      money: typeof data.money === 'number' ? data.money : 0,
      completedMissions: Array.isArray(data.completedMissions) ? data.completedMissions : [],
      // Round 4: derived on save, but older saves predate it — recompute
      // from the completed list when the stored count is missing.
      missionsCompletedCount: typeof data.missionsCompletedCount === 'number'
        ? Math.max(0, data.missionsCompletedCount)
        : (Array.isArray(data.completedMissions) ? data.completedMissions.length : 0),
      currentMission: typeof data.currentMission === 'number' ? data.currentMission : null,
      position: isPlainObject(data.position)
        ? { x: data.position.x || 0, y: data.position.y || 0, z: data.position.z || 0 }
        : null,
      heading: typeof data.heading === 'number' ? data.heading : 0,
      wanted: typeof data.wanted === 'number' ? Math.max(0, Math.min(5, data.wanted)) : 0,
      health: typeof data.health === 'number' ? data.health : null,
      armour: typeof data.armour === 'number' ? data.armour : null,
      ammo: typeof data.ammo === 'number' ? data.ammo : null,
      timeOfDay: typeof data.timeOfDay === 'number' ? data.timeOfDay : null,
      playTimeSeconds: typeof data.playTimeSeconds === 'number' ? Math.max(0, data.playTimeSeconds) : 0,
      timesPlayed: typeof data.timesPlayed === 'number' ? Math.max(0, data.timesPlayed) : 0,
      gamesPlayed: typeof data.gamesPlayed === 'number' ? Math.max(0, data.gamesPlayed) : 0,
      totalEarned: typeof data.totalEarned === 'number' ? Math.max(0, data.totalEarned) : 0,
      // Round 5: par bonuses are new in v4 — older saves simply have none.
      parBonuses: typeof data.parBonuses === 'number' ? Math.max(0, data.parBonuses) : 0,
      // Round 6: landmark visits are new in v5 — older saves simply
      // have none; the list is always an array of landmark names.
      landmarksVisited: Array.isArray(data.landmarksVisited) ? [...data.landmarksVisited] : [],
      // Round 4: best times are new in v3 — v1/v2 saves simply have none.
      bestTimes: isPlainObject(data.bestTimes) ? { ...data.bestTimes } : {},
    };
  }

  // Round-4b: one-object profile summary for the menu stats line.
  // Returns null when there is no valid save.
  getSummary() {
    const data = this.load();
    if (!data) return null;
    return {
      money: data.money,
      missionsCompleted: data.missionsCompletedCount,
      gamesPlayed: data.gamesPlayed,
      totalEarned: data.totalEarned,
      parBonuses: data.parBonuses, // round 5: under-par bonuses earned
      bestTimesCount: Object.keys(data.bestTimes || {}).length,
      // Round 6: landmarks visited on this profile.
      landmarksVisited: (data.landmarksVisited || []).length,
    };
  }

  clearSave() {
    const store = this._store();
    if (!store) return false;
    try {
      store.removeItem(this.key);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Convenience: apply a loaded save onto live game objects.
  // systems: { missions, police, combat, setMoney } — each optional.
  applyToGame(saveData, player, systems = {}) {
    if (!saveData) return false;
    if (player && saveData.position) {
      // player.position is the live THREE.Vector3 shared with the mesh:
      // move it in place, never replace the object (replacing it would
      // detach the mesh from the position the game reads).
      if (player.position && typeof player.position.set === 'function') {
        player.position.set(saveData.position.x || 0, saveData.position.y || 0, saveData.position.z || 0);
      } else {
        player.position = { ...saveData.position };
      }
      if (typeof saveData.heading === 'number') player.heading = saveData.heading;
    }
    if (typeof systems.setMoney === 'function') systems.setMoney(saveData.money);
    if (systems.missions?.fromSaveData) {
      const toStart = systems.missions.fromSaveData({
        completed: saveData.completedMissions,
        currentMission: saveData.currentMission,
        lastReward: 0,
        bestTimes: saveData.bestTimes || {},
      });
      if (toStart && systems.missions.startMission) {
        systems.missions.startMission(toStart);
      }
    }
    if (systems.police?.setWanted) systems.police.setWanted(saveData.wanted || 0);
    if (systems.combat?.fromSaveData) {
      systems.combat.fromSaveData({
        health: saveData.health ?? undefined,
        armour: saveData.armour ?? undefined,
        ammo: saveData.ammo ?? undefined,
      });
    }
    return true;
  }
}

export function createSaveSystem(options = {}) {
  return new SaveSystem(options);
}

// Module-level helpers sharing the default key.
const defaultSystem = new SaveSystem();
export function saveGame(state) { return defaultSystem.save(state); }
export function loadGame() { return defaultSystem.load(); }
export function hasSaveGame() { return defaultSystem.hasSave(); }
export function clearSaveGame() { return defaultSystem.clearSave(); }

export default SaveSystem;
