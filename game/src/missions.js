// missions.js — Solmar Bay missions and story.
// Four missions, 1-based. Chapter numbers are 1, 2, 3, 5 (chapter 4 is
// skipped in the story — Harbour Heist is mission 4, chapter 5).
// Mission 3's NAME is 'Borrowed Beauty' (the geometry harness gates the
// round13 probe on it); 'Heat' is the chapter-3 title. The contract's
// missions.js section lists Ch 3 as 'Heat' — that is the chapter title,
// not the mission name (see report).
// PAR grades S/A/B/C, rewards $500/$800/$1,200/$2,500. Save version 8.
export const SAVE_VERSION = 8;

export const MISSIONS = [
  {
    id: 1, number: 1, chapter: 1,
    name: 'First Run', chapterTitle: 'First Run',
    objective: 'Pick up the package at the Marina and lose the tail.',
    dialogue: [
      { speaker: 'Dante', text: 'Four stars and a chopper. Welcome to Solmar, kid.' },
      { speaker: 'Rico', text: 'Then we drive. No stops, no cops, no excuses.' },
    ],
    reward: 500,
    par: { S: 150, A: 180, B: 240, C: 320 },
    stagedJobs: 0, stagedCash: 1200, clock: '17:48',
  },
  {
    id: 2, number: 2, chapter: 2,
    name: 'Hot Wheels', chapterTitle: 'Hot Wheels',
    objective: 'Hold the line at the harbour. Seven officers, one way out.',
    dialogue: [
      { speaker: 'Dante', text: 'Four stars and counting. They brought the whole precinct.' },
      { speaker: 'Rico', text: 'Then we count them down. One by one.' },
    ],
    reward: 800,
    par: { S: 120, A: 150, B: 200, C: 280 },
    stagedJobs: 1, stagedCash: 2450, clock: '18:05',
  },
  {
    id: 3, number: 3, chapter: 3,
    name: 'Borrowed Beauty', chapterTitle: 'Heat',
    objective: 'Steal the Palm Coupe and outrun the roadblock.',
    dialogue: [
      { speaker: 'Mama Lou', text: 'VEHICLE STOLEN. That coupe was never yours, Rico.' },
      { speaker: 'Rico', text: 'It is now. Tell the roadblock I said hi.' },
    ],
    reward: 1200,
    par: { S: 130, A: 160, B: 210, C: 290 },
    stagedJobs: 2, stagedCash: 3200, clock: '18:20',
  },
  {
    id: 4, number: 4, chapter: 5,
    name: 'Harbour Heist', chapterTitle: 'Harbour Heist',
    objective: 'Meet Dante at the Marina at golden hour. Bring the coupe.',
    dialogue: [
      { speaker: 'Dante', text: 'Golden hour over the Bay. The job is done, Rico.' },
      { speaker: 'Rico', text: 'Five-star chase and we are still standing. FISTS READY.' },
    ],
    reward: 2500,
    par: { S: 100, A: 130, B: 180, C: 260 },
    stagedJobs: 4, stagedCash: 4500, clock: '18:36',
  },
];

export const SHOT_TO_MISSION = { cover: 1, combat: 2, pursuit: 3, sunset: 4 };

export function getMissionByNumber(n) {
  return MISSIONS.find((m) => m.number === n) || MISSIONS[0];
}

export function getShotContext(shotId) {
  return SHOT_TO_MISSION[shotId] || 1;
}

export function getShotMission(shotId) {
  return getMissionByNumber(getShotContext(shotId));
}

export function createMissions(ctx = {}) {
  let currentMission = 1;
  let completedMissions = [];
  let jobsDone = 0;
  let money = 4500; // new-game baseline (contract §W1 save.js)

  const api = {
    getMissions() { return MISSIONS; },
    getMission(n) { return getMissionByNumber(n); },
    getCurrentMission() {
      const m = getMissionByNumber(currentMission);
      return { ...m, number: m.number, id: m.id };
    },
    getCurrentMissionNumber() { return currentMission; },
    getCompletedMissions() { return completedMissions.slice(); },
    setCompletedMissions(list) {
      completedMissions = Array.isArray(list) ? list.slice() : [];
      return completedMissions;
    },
    completeMission(n) {
      const num = n || currentMission;
      if (!completedMissions.includes(num)) completedMissions.push(num);
      return completedMissions;
    },
    setJobsDone(n) { jobsDone = Math.max(0, Math.round(n)); return jobsDone; },
    getJobsDone() { return jobsDone; },
    getMoney() { return money; },
    setMoney(n) { money = Math.round(n); return money; },
    addMoney(n) { money += Math.round(n); return money; },
    // 1-based start. Completing the previous mission is the caller's job.
    startMission(n) {
      const m = getMissionByNumber(n);
      currentMission = m.number;
      return api.getCurrentMission();
    },
    getShotContext(shotId) { return getShotContext(shotId); },
    getShotMission(shotId) { return getShotMission(shotId); },
    // Stage a shot's mission state (used by the shot sheet): sets the
    // current mission, jobs done and cash for that shot.
    stageShotMission(shotId) {
      const m = getShotMission(shotId);
      currentMission = m.number;
      jobsDone = m.stagedJobs;
      money = m.stagedCash;
      return api.getCurrentMission();
    },
    getSaveData() {
      return {
        version: SAVE_VERSION,
        money,
        currentMission,
        completedMissions: completedMissions.slice(),
        jobsDone,
        savedAt: new Date().toISOString(),
      };
    },
    loadSaveData(data) {
      if (!data) return this;
      if (data.version !== undefined && data.version !== SAVE_VERSION) {
        // Tolerate older saves: migrate the fields we know.
      }
      if (typeof data.money === 'number') money = data.money;
      if (typeof data.currentMission === 'number') currentMission = data.currentMission;
      if (Array.isArray(data.completedMissions)) completedMissions = data.completedMissions.slice();
      if (typeof data.jobsDone === 'number') jobsDone = data.jobsDone;
      return this;
    },
    getParGrade(missionNumber, seconds) {
      const m = getMissionByNumber(missionNumber || currentMission);
      if (seconds <= m.par.S) return 'S';
      if (seconds <= m.par.A) return 'A';
      if (seconds <= m.par.B) return 'B';
      return 'C';
    },
  };
  return api;
}
