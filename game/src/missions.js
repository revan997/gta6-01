// Solmar Bay — missions + story (W3, attempt #7, fresh build).
// Four missions across the chapters, dialogue, objectives, ratings,
// rewards, and the job list. Written fresh for this recording from the
// round-9 interface contract (W3 section) and the rebuild spec.
// Nothing copied from an old repo.
//
// Mission data lives in CONFIG.missions (W1): number is the 1-based
// mission id (1–4). The story chapters are numbered 1, 2, 3 and 5 —
// 'Harbour Heist' is mission 4 but Chapter 5 in the story, so the
// chapter field is 5 for it. getShotContext maps shots to mission ids:
// cover → 1, combat → 2, pursuit → 3, sunset → 4.

import { CONFIG } from './config.js';

export const SHOT_MISSIONS = {
  cover: 1,
  combat: 2,
  pursuit: 3,
  sunset: 4,
};

const CHAPTER_OF = { 1: 1, 2: 2, 3: 3, 4: 5 };

const PAR_GRADES = ['S', 'A', 'B', 'C'];

export function createMissionsSystem(ctx = {}) {
  const defs = (CONFIG.missions || []).map((m) => ({
    number: m.number,
    chapter: CHAPTER_OF[m.number] || m.number,
    name: m.name,
    chapterTitle: m.chapterTitle || m.name,
    objective: m.objective,
    reward: m.reward,
    dialogue: m.dialogue ? { speaker: m.dialogue.speaker, text: m.dialogue.text } : null,
    par: 'S',
  }));
  // Fallbacks if CONFIG ever lacks the table (keeps the module working).
  if (defs.length === 0) {
    defs.push(
      { number: 1, chapter: 1, name: 'First Run', chapterTitle: 'First Run', objective: 'Pick up the package at the Marina', reward: 500, dialogue: { speaker: 'Dante', text: 'Four stars and a chopper on you, Rico — Marina can wait, lose them first!' }, par: 'S' },
      { number: 2, chapter: 2, name: 'Hot Wheels', chapterTitle: 'Hot Wheels', objective: 'Lose the police, then reach the Hideout', reward: 800, dialogue: { speaker: 'Dante', text: 'Four stars and counting — drop them, Rico!' }, par: 'S' },
      { number: 3, chapter: 3, name: 'Borrowed Beauty', chapterTitle: 'Heat', objective: 'Deliver the Palm Coupe to the Docks', reward: 1200, dialogue: { speaker: 'Rico', text: 'VEHICLE STOLEN — Palm Coupe, pearl white' }, par: 'S' },
      { number: 4, chapter: 5, name: 'Harbour Heist', chapterTitle: 'Harbour Heist', objective: 'Grab the cash at the Harbour', reward: 2500, dialogue: { speaker: 'Mama Lou', text: 'Golden hour over the Bay, Rico. Make it count.' }, par: 'S' },
    );
  }

  let _current = 1;
  let _completed = [];
  let _jobsDone = 0;
  let _started = {};

  function byNumber(n) {
    return defs.find((m) => m.number === n) || null;
  }

  const system = {
    missions: defs,
    get current() { return _current; },
    get completedMissions() { return _completed.slice(); },
    get jobsDone() { return _jobsDone; },

    // getCurrentMission returns {number: id, ...} — the NUMBER is the
    // 1-based mission id (contract §1).
    getCurrentMission() {
      const m = byNumber(_current) || defs[0];
      return {
        number: m.number,
        chapter: m.chapter,
        name: m.name,
        chapterTitle: m.chapterTitle,
        objective: m.objective,
        reward: m.reward,
        dialogue: m.dialogue,
        par: m.par,
      };
    },
    getMission(n) { return byNumber(n); },
    getMissionByChapter(ch) { return defs.find((m) => m.chapter === ch) || null; },

    getCompletedMissions() { return _completed.slice(); },
    setCompletedMissions(list) {
      _completed = (list || []).slice();
      return _completed;
    },
    completeMission(n) {
      const id = n === undefined ? _current : n;
      if (!_completed.includes(id)) _completed.push(id);
      _current = Math.min(id + 1, defs.length);
      return _completed;
    },
    setJobsDone(n) {
      _jobsDone = Math.max(0, Math.min(4, n | 0));
      return _jobsDone;
    },
    // startMission(n) — argument is the 1-based mission number.
    startMission(n) {
      const m = byNumber(n);
      if (!m) return null;
      _current = n;
      _started[n] = true;
      return system.getCurrentMission();
    },
    getDialogue(n) {
      const m = byNumber(n === undefined ? _current : n);
      return m && m.dialogue ? { speaker: m.dialogue.speaker, text: m.dialogue.text } : null;
    },
    getShotContext(shotId) {
      const id = SHOT_MISSIONS[shotId];
      if (id === undefined) return null;
      const m = byNumber(id);
      return m ? { mission: id, number: id, chapter: m.chapter, name: m.name, chapterTitle: m.chapterTitle, objective: m.objective, reward: m.reward } : null;
    },
    getShotDialogue(shotId) {
      const sd = CONFIG.shotDialogue || {};
      return sd[shotId] || system.getDialogue(SHOT_MISSIONS[shotId]);
    },
    getParGrades() { return PAR_GRADES.slice(); },
    rateMission(n, grade) {
      const m = byNumber(n);
      if (m && PAR_GRADES.includes(grade)) m.par = grade;
      return m ? m.par : null;
    },
    getSaveData() {
      return {
        version: 8,
        currentMission: _current,
        completedMissions: _completed.slice(),
        jobsDone: _jobsDone,
      };
    },
    loadSaveData(data) {
      if (!data) return system;
      if (typeof data.currentMission === 'number') _current = data.currentMission;
      if (Array.isArray(data.completedMissions)) _completed = data.completedMissions.slice();
      if (typeof data.jobsDone === 'number') _jobsDone = data.jobsDone;
      return system;
    },
    reset() {
      _current = 1;
      _completed = [];
      _jobsDone = 0;
      _started = {};
      return system;
    },
  };
  return system;
}

export const createMissions = createMissionsSystem;
export default createMissionsSystem;
