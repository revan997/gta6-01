// missions.js — chapters, missions, story dialogue, jobs, rewards.
// Four missions. Chapter 3 is named 'Borrowed Beauty' with chapterTitle
// 'Heat' (contract §7 wording). Rewards $500 / $800 / $1,200 / $2,500.

export const MISSIONS = [
  {
    id: 1,
    number: 1,
    chapter: 1,
    name: 'First Run',
    chapterTitle: 'First Run',
    objective: 'Pick up the package at the Marina and bring it to Dante.',
    location: 'Marina',
    reward: 500,
    par: 'A',
    dialogue: [
      { speaker: 'Dante', text: 'Rico. The package is waiting at the Marina. No detours, no heroes.' },
      { speaker: 'Rico', text: 'On my way. If the cops show up, I was never here.' },
      { speaker: 'Mama Lou', text: 'Drive like the whole city is watching, mijo. Because it is.' },
    ],
  },
  {
    id: 2,
    number: 2,
    chapter: 2,
    name: 'Hot Wheels',
    chapterTitle: 'Hot Wheels',
    objective: 'Steal the Palm Coupe and lose the interceptors on the north road.',
    location: 'Downtown',
    reward: 800,
    par: 'A',
    dialogue: [
      { speaker: 'Dante', text: 'Four stars and a chopper. That coupe better be worth it.' },
      { speaker: 'Rico', text: 'VEHICLE STOLEN — and they still have not caught me.' },
      { speaker: 'Mama Lou', text: 'Four stars and counting, Rico. Keep the pedal down.' },
    ],
  },
  {
    id: 3,
    number: 3,
    chapter: 3,
    name: 'Borrowed Beauty',
    chapterTitle: 'Heat',
    objective: 'Hold the line against the responding officers and walk away clean.',
    location: 'Downtown',
    reward: 1200,
    par: 'S',
    dialogue: [
      { speaker: 'Dante', text: 'Seven of them, Rico. Make every shot count.' },
      { speaker: 'Rico', text: 'Four stars and counting. They picked the wrong street.' },
      { speaker: 'Mama Lou', text: 'Golden hour over the Bay — and you are still standing.' },
    ],
  },
  {
    id: 4,
    number: 4,
    chapter: 5,
    name: 'Harbour Heist',
    chapterTitle: 'Harbour Heist',
    objective: 'Meet Dante at the harbour at golden hour and plan the big one.',
    location: 'Harbour',
    reward: 2500,
    par: 'S',
    dialogue: [
      { speaker: 'Dante', text: 'Golden hour over the Bay. Tomorrow we take the harbour.' },
      { speaker: 'Rico', text: 'Five-star chase waiting for us. I am ready.' },
      { speaker: 'Mama Lou', text: 'One more job, mijo. Then we are free.' },
    ],
  },
];

export const CHAPTERS = MISSIONS.map((m) => ({
  number: m.chapter,
  name: m.name,
  chapterTitle: m.chapterTitle,
}));

// shotId -> mission number (1-based).
export const SHOT_MISSIONS = {
  cover: 1,
  combat: 2,
  pursuit: 3,
  sunset: 4,
};

export const NEXT_MISSIONS = [
  'Hot Wheels',
  'Borrowed Beauty',
  'Harbour Heist',
  'five-star chase',
  'five-star chase',
];

export function createMissions(ctx = {}) {
  let current = 1;
  let completed = [];
  let jobsDone = 0;

  function getMission(n) {
    const m = MISSIONS.find((x) => x.number === n || x.id === n);
    return m || null;
  }

  const system = {
    missions: MISSIONS,
    chapters: CHAPTERS,
    getCurrentMission() {
      const m = getMission(current);
      return m ? { ...m, number: m.number } : null;
    },
    getMission,
    getMissionByNumber(n) { return getMission(n); },
    getCompletedMissions() { return [...completed]; },
    setCompletedMissions(list) {
      completed = Array.isArray(list) ? [...list] : [];
      return completed;
    },
    getJobsDone() { return jobsDone; },
    setJobsDone(n) {
      jobsDone = Math.max(0, Math.min(4, Math.round(n || 0)));
      return jobsDone;
    },
    startMission(n) {
      const m = getMission(n);
      if (!m) return null;
      current = m.number;
      return { ...m, number: m.number };
    },
    completeMission(n) {
      const m = getMission(n);
      if (!m) return false;
      if (!completed.includes(m.number)) completed.push(m.number);
      jobsDone = Math.max(jobsDone, completed.length);
      return true;
    },
    getShotContext(shotId) {
      const n = SHOT_MISSIONS[shotId] || 1;
      const m = getMission(n);
      return m ? { ...m, number: m.number, shot: shotId } : null;
    },
    getDialogue(n) {
      const m = getMission(n);
      return m ? [...m.dialogue] : [];
    },
    getSaveData() {
      return {
        version: 8,
        currentMission: current,
        completedMissions: [...completed],
        jobsDone,
      };
    },
    loadSaveData(data) {
      if (!data) return false;
      if (data.version && data.version !== 8) return false;
      if (typeof data.currentMission === 'number') current = data.currentMission;
      if (Array.isArray(data.completedMissions)) completed = [...data.completedMissions];
      if (typeof data.jobsDone === 'number') jobsDone = data.jobsDone;
      return true;
    },
  };
  return system;
}

export const createMissionSystem = createMissions;
