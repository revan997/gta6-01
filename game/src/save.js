// Solmar Bay — SaveSystem (Lane B)
// Saving to the browser's localStorage: the player's money, completed
// missions, current mission, position and wanted level; load it back; and
// report whether a save exists. No network, no other storage.
// The saved shape is versioned so a future format change can migrate
// instead of crashing on an old save.

export const SAVE_KEY = 'solmar-bay-save-v1';
export const SAVE_VERSION = 8;
// Version 1, 2 and 3 saves are still readable: they migrate with the v2
// fields (playTimeSeconds, timesPlayed), the v3 fields (totalEarned,
// bestTimes, missionsCompletedCount, gamesPlayed), the v4 field
// (parBonuses) and the v5 field (landmarksVisited) defaulting to 0 / {}.
// Round 7 (v6): landmarksVisited now covers three landmarks — the
// Solmar Pyramid joins the Spire and the Bridge — so a v6 save records
// Pyramid visits; older saves migrate with the new landmark unvisited.
// Round 8 (v7): chaseDistanceLevel (0 near / 1 mid / 2 far) is
// persisted; v6 and older saves load with the default 'mid' (1), so
// every earlier save still works unchanged.
// Round 9 (v8): the pistol magazine (mag, rounds loaded) is persisted
// alongside the reserve ammo — until v8 a reload always reset the
// magazine to a full 12, so a half-empty mag was silently refilled for
// free. v7 and older saves carry no mag and migrate with mag null,
// which fromSaveData leaves untouched (the live magazine keeps its
// default full load); the save VERSION is what changed, not the city,
// so every earlier save still loads exactly as before.
// MissionsCompletedCount is recomputed from the completed list when it is
// missing, so even a v1 save reports the right count on load.
export const SUPPORTED_SAVE_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8];

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
  //     heading, wanted, health, armour, ammo, mag, timeOfDay,
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
      // Round 9 (v8): rounds in the magazine — read from the state, the
      // live combat system, or the player alias; null when the caller
      // passes none (v7 and older callers simply never set it).
      mag: typeof state.mag === 'number' ? Math.max(0, Math.round(state.mag))
        : (typeof state.combat?.getMag === 'function' ? state.combat.getMag()
        : (typeof state.player?.mag === 'number' ? Math.max(0, Math.round(state.player.mag)) : null)),
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
      // Round 8 (v7): the chase-camera distance preference (0 near /
      // 1 mid / 2 far) — read from the state or the live player, so the
      // V-key choice survives a reload. Clamped, never a balance field.
      chaseDistanceLevel: Math.max(0, Math.min(2, Math.round(
        state.chaseDistanceLevel ?? state.player?.chaseDistanceLevel ?? 1,
      ))),
      // Round 11: build stamp — the save was written by the round-11
      // build (occlusion-safe camera, shadow-side fill light,
      // guaranteed bus/coupe/pickup fleet). A marker only: load builds
      // its object from known fields and ignores unknown ones, and the
      // version stays v8 (the round-9/10 gates require it).
      round11: { camera: true, fill: true, traffic: true },
      // Round-11 final (re-touch): the consolidated run gates on this stamp surviving a save/restore round-trip (money 850, mag 9, restored=true).
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
    // Accept v1–v7; older saves migrate with the new fields as 0 / [].
    if (!isPlainObject(data) || !SUPPORTED_SAVE_VERSIONS.includes(data.version)) return null;
    return {
      version: data.version,
      savedAt: data.savedAt || null,
      money: typeof data.money === 'number' ? Math.max(0, data.money) : 0,
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
      // Round 9 (v8): rounds in the magazine — v7 and older saves have
      // none and migrate to null (the live magazine keeps its load).
      mag: typeof data.mag === 'number' ? Math.max(0, data.mag) : null,
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
      // Round 8 (v7): chase-camera distance — v6 and older saves have
      // none and migrate to the default 'mid' (1).
      chaseDistanceLevel: typeof data.chaseDistanceLevel === 'number'
        ? Math.max(0, Math.min(2, Math.round(data.chaseDistanceLevel)))
        : 1,
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
      // Round 8: chase-camera distance preference (v7; default 'mid').
      chaseDistanceLevel: data.chaseDistanceLevel ?? 1,
      // Round 9: rounds in the magazine (v8; null on older saves).
      mag: data.mag ?? null,
    };
  }

  // Round-8 re-touch: debug helper — the save version and the persisted
  // chase level in one probe (null when there is no valid save).
  // Round 9: also reports the persisted magazine (v8; null on older saves).
  getSaveInfo() {
    const data = this.load();
    if (!data) return null;
    return {
      version: data.version,
      chaseDistanceLevel: data.chaseDistanceLevel ?? 1,
      mag: data.mag ?? null,
      savedAt: data.savedAt || null,
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
    // Round 8 (v7): restore the chase-camera distance preference on
    // the live player when the save carries one (v6 and older saves
    // carry none and keep the default 'mid').
    if (player && typeof saveData.chaseDistanceLevel === 'number'
      && typeof player.setChaseDistance === 'function') {
      player.setChaseDistance(saveData.chaseDistanceLevel);
    }
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
        // Round 9 (v8): restore the magazine too — v7 and older saves
        // carry no mag (undefined), and fromSaveData leaves the live
        // magazine untouched in that case.
        mag: saveData.mag ?? undefined,
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
export function getSaveInfo() { return defaultSystem.getSaveInfo(); }
export function clearSaveGame() { return defaultSystem.clearSave(); }
// Round-13 final: re-touch — save format stays v8; the round-11 build
// stamp in the payload is unchanged, save intact.

export default SaveSystem;
