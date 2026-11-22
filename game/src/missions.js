// missions.js — Solmar Bay missions, chapters, story, dialogue
// (attempt #9, fresh build).
// Four missions across chapters 1, 2, 3 and 5. Mission ids are 1-based;
// getCurrentMission returns {number: id, ...} where number is the id.

export const MISSIONS = [
  {
    id: 1,
    number: 1,
    chapter: 1,
    chapterTitle: 'First Run',
    name: 'First Run',
    title: 'First Run',
    objective: 'Pick up the package at the Marina',
    reward: 500,
    par: { s: 95, a: 80, b: 60, c: 40 },
    location: 'MARINA',
    dialogue: [
      { speaker: 'Dante', text: 'Rico, the package is at the Marina. No noise, no heat. Just drive.' },
      { speaker: 'Rico', text: 'Easy. In and out before anyone notices.' },
      { speaker: 'Mama Lou', text: 'Careful, baby. The Marina is crawling with patrols tonight.' },
    ],
  },
  {
    id: 2,
    number: 2,
    chapter: 2,
    chapterTitle: 'Hot Wheels',
    name: 'Hot Wheels',
    title: 'Hot Wheels',
    objective: 'Steal the Palm Coupe and lose the heat',
    reward: 800,
    par: { s: 95, a: 80, b: 60, c: 40 },
    location: 'DOWNTOWN',
    dialogue: [
      { speaker: 'Dante', text: 'Four stars and counting. That coupe is ours — take it and run.' },
      { speaker: 'Rico', text: 'Four stars and a chopper. This is going to be loud.' },
      { speaker: 'Mama Lou', text: 'Lose them on the bridge road. Do not bring them home.' },
    ],
  },
  {
    id: 3,
    number: 3,
    chapter: 3,
    chapterTitle: 'Heat',
    name: 'Borrowed Beauty',
    title: 'Borrowed Beauty',
    objective: 'Borrow the beauty from the Deco garage',
    reward: 1200,
    par: { s: 95, a: 80, b: 60, c: 40 },
    location: 'DECO TOWER',
    dialogue: [
      { speaker: 'Dante', text: 'VEHICLE STOLEN — that is the headline. The beauty is ours now.' },
      { speaker: 'Rico', text: 'Borrowed. I will bring her back with a full tank.' },
      { speaker: 'Mama Lou', text: 'The Deco garage has two guards and no cameras. Go.' },
    ],
  },
  {
    id: 4,
    number: 4,
    chapter: 5,
    chapterTitle: 'Harbour Heist',
    name: 'Harbour Heist',
    title: 'Harbour Heist',
    objective: 'Hit the harbour vault at golden hour',
    reward: 2500,
    par: { s: 95, a: 80, b: 60, c: 40 },
    location: 'HARBOUR',
    dialogue: [
      { speaker: 'Dante', text: 'Golden hour over the Bay. The vault opens at sunset — be there.' },
      { speaker: 'Rico', text: 'Harbour Heist. Biggest job of my life.' },
      { speaker: 'Mama Lou', text: 'Come home rich, baby. Or do not come home at all.' },
    ],
  },
];

export const SHOT_MISSIONS = { cover: 1, combat: 2, pursuit: 3, sunset: 4 };

export function getShotContext(shotId) {
  const id = SHOT_MISSIONS[shotId] || 1;
  const m = MISSIONS.find((x) => x.id === id) || MISSIONS[0];
  return {
    shot: shotId,
    mission: m.id,
    number: m.id,
    chapter: m.chapter,
    chapterTitle: m.chapterTitle,
    name: m.name,
    title: m.title,
    objective: m.objective,
    reward: m.reward,
    location: m.location,
  };
}

export function createMissionSystem(ctx = {}) {
  const sys = {
    _current: 1,
    _completed: [],
    _jobsDone: 0,

    getMission(n) {
      return MISSIONS.find((m) => m.id === n || m.number === n) || null;
    },

    getCurrentMission() {
      const m = sys.getMission(sys._current) || MISSIONS[0];
      return { number: m.id, id: m.id, chapter: m.chapter, chapterTitle: m.chapterTitle, name: m.name, title: m.title, objective: m.objective, reward: m.reward, location: m.location, dialogue: m.dialogue, par: m.par };
    },

    getCompletedMissions() {
      return sys._completed.slice();
    },

    setCompletedMissions(list) {
      sys._completed = Array.isArray(list) ? list.map((n) => Math.floor(n)) : [];
      return sys._completed;
    },

    getJobsDone() { return sys._jobsDone; },

    setJobsDone(n) {
      sys._jobsDone = Math.max(0, Math.min(4, Math.floor(n)));
      return sys._jobsDone;
    },

    startMission(n) {
      const m = sys.getMission(n);
      if (!m) return null;
      sys._current = m.id;
      return sys.getCurrentMission();
    },

    completeMission(n) {
      const m = sys.getMission(n || sys._current);
      if (!m) return 0;
      if (!sys._completed.includes(m.id)) sys._completed.push(m.id);
      sys._jobsDone = Math.max(sys._jobsDone, Math.min(4, sys._completed.length));
      return m.reward;
    },

    getDialogue(n) {
      const m = sys.getMission(n || sys._current);
      return m ? m.dialogue.slice() : [];
    },

    getShotContext(shotId) {
      return getShotContext(shotId);
    },

    getSaveData() {
      return { version: 8, currentMission: sys._current, completedMissions: sys._completed.slice(), jobsDone: sys._jobsDone };
    },

    loadSaveData(data) {
      if (!data || typeof data !== 'object') return false;
      if (data.currentMission) sys._current = Math.floor(data.currentMission);
      // The top-level save (save.js) carries the mission as `mission`, not
      // `currentMission` — without this fallback a fresh load reset the
      // current mission 4 -> 1 (proven by the harness RESTORED probe).
      else if (data.mission) sys._current = Math.floor(data.mission);
      if (Array.isArray(data.completedMissions)) sys._completed = data.completedMissions.map((n) => Math.floor(n));
      if (typeof data.jobsDone === 'number') sys._jobsDone = Math.floor(data.jobsDone);
      if (Array.isArray(data.jobs)) sys._jobsDone = Math.max(sys._jobsDone, data.jobs.length);
      return true;
    },
  };
  return sys;
}

export const createMissions = createMissionSystem;
