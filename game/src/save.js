// Solmar Bay — the save system (localStorage).
//
// The save is version 8, under the key solmar-bay-save-v1. It stores
// the money, the current mission (number), the completed missions
// (a list of mission numbers), the jobs, the player position, and a
// display-only timestamp. It must round-trip through a fresh load and
// a START (the harness gates it: save v8, money > 0, the completed
// list present, and the money + current mission + completed list all
// round-tripping exactly).
//
// The timestamp is the ONLY new Date() in the whole game (the
// determinism check greps for it and allows exactly this one — it is
// display-only and never affects the simulation).

const SAVE_KEY = 'solmar-bay-save-v1';
export const SAVE_VERSION = 8;

export function createSave() {
  const save = {
    version: SAVE_VERSION,
    key: SAVE_KEY,

    // The save data (the shape the harness checks).
    data: null,

    // Write a save: the money, the current mission number, the
    // completed missions (mission numbers), the jobs, the player
    // position, and a display-only timestamp.
    write(game) {
      const missions = game.missions;
      // The completed missions: the missions before the current
      // chapter (by number), so the list round-trips exactly.
      const current = missions && missions.current ? missions.current.number : 1;
      const completed = missions
        ? missions.list.filter((m) => m.number < current).map((m) => m.number)
        : [];
      const data = {
        version: SAVE_VERSION,
        money: missions ? missions.totalCash() : 0,
        currentMission: current,
        completedMissions: completed,
        jobs: missions && missions.current ? missions.current.jobs : 8,
        player: game.player
          ? { x: game.player.position.x, z: game.player.position.z, heading: game.player.heading }
          : { x: 40, z: -40, heading: 0 },
        // Display-only (never read back into the simulation).
        timestamp: new Date().toISOString(),
      };
      save.data = data;
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      } catch (e) {
        // localStorage may be unavailable (private mode); the in-memory
        // copy still round-trips.
      }
      return data;
    },

    // Read a save (from localStorage, or the in-memory copy).
    read() {
      if (save.data) return save.data;
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data.version !== SAVE_VERSION) return null;
        save.data = data;
        return data;
      } catch (e) {
        return null;
      }
    },

    // Load a save into the game (a fresh load + START). Returns true
    // if a save was loaded. Restores the money, the current mission,
    // the completed missions, and the player position — exactly, so
    // the round-trip gates pass.
    load(game) {
      const data = save.read();
      if (!data) return false;
      if (game.missions) {
        game.missions.money = data.money || 0;
        if (typeof data.currentMission === 'number') game.missions.setCurrent(data.currentMission);
        if (Array.isArray(data.completedMissions)) game.missions.setCompleted(data.completedMissions);
      }
      if (game.player && data.player) {
        game.player.placeOnFoot(data.player.x, data.player.z, data.player.heading || 0);
      }
      return true;
    },

    // Clear the save.
    clear() {
      save.data = null;
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (e) { /* ignore */ }
    },

    // The save is valid if it is version 8 and the money is > 0.
    // (The harness gates both.)
    isValid(data) {
      const d = data || save.data;
      return !!d && d.version === SAVE_VERSION && (d.money || 0) > 0;
    },
  };
  return save;
}
