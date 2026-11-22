// Solmar Bay — the missions (the four shots).
//
// The game has four missions, one per shot. Each mission is a chapter
// with a name, a time, a wanted level, a cash reward, and a job count.
// The shot sheet (the spec's §6) is the source of truth — the HUD
// reads it, the save file stores it, and the harness checks the HUD
// against it. The needle (the dialogue line the harness greps for)
// is one per shot, and it appears exactly once in the dialogue.

import { CONFIG } from './config.js';

// The four missions, in chapter order. The chapter number, the job
// count, and the cash are the spec's shot sheet (§6) — the HUD must
// show exactly these.
export const MISSIONS = [
  {
    id: 'first-run',
    chapter: 1,
    number: 1,
    index: 0,
    name: 'First Run',
    shot: 'cover-chase',
    time: '17:48',
    timeOfDay: 17.8,
    wanted: 4,
    police: 2,
    heli: true,
    cash: 1200,
    jobs: 8,
    jobsDone: 0,
    needle: 'Four stars and a chopper',
    radio: 'SOLMAR FM 101.5',
    objective: 'Steal the Solmar GT and outrun AIR ONE.',
    start: { x: 40, z: -80, heading: 0 },
  },
  {
    id: 'hot-wheels',
    chapter: 2,
    number: 2,
    index: 1,
    name: 'Hot Wheels',
    shot: 'combat',
    time: '18:05',
    timeOfDay: 18.08,
    wanted: 4,
    officers: 7,
    weapon: 'Pistol',
    cash: 2450,
    jobs: 8,
    jobsDone: 1,
    needle: 'Four stars and counting',
    radio: 'SOLMAR FM 101.5',
    objective: 'Hold the line against seven officers.',
    start: { x: 100, z: -60, heading: Math.PI / 2 },
  },
  {
    id: 'borrowed-beauty',
    chapter: 3,
    number: 3,
    index: 2,
    name: 'Borrowed Beauty',
    shot: 'pursuit',
    time: '18:20',
    timeOfDay: 18.33,
    wanted: 5,
    police: 4,
    cash: 3200,
    jobs: 8,
    jobsDone: 2,
    needle: 'VEHICLE STOLEN',
    radio: 'SOLMAR FM 101.5',
    objective: 'Win the street race and break the roadblock.',
    start: { x: 60, z: -100, heading: 0 },
  },
  {
    id: 'harbour-heist',
    chapter: 5,
    number: 5,
    index: 3,
    name: 'Harbour Heist',
    shot: 'sunset',
    time: '18:36',
    timeOfDay: 18.6,
    wanted: 5,
    police: 2,
    cash: 4500,
    jobs: 8,
    jobsDone: 4,
    needle: 'Golden hour over the Bay',
    radio: 'SOLMAR FM 101.5',
    objective: 'Take the coupe at golden hour and vanish.',
    start: { x: 200, z: -142, heading: Math.PI / 2 },
  },
];

export function createMissions() {
  const missions = {
    list: MISSIONS,
    current: null,
    completed: [],
    money: 0,
    // Start a mission by shot name. Returns the mission.
    start(shotName) {
      const mission = MISSIONS.find((m) => m.shot === shotName) || MISSIONS[0];
      missions.current = mission;
      return mission;
    },
    // Set the current mission by number (chapter). Used by the save
    // restore path.
    setCurrent(number) {
      const mission = MISSIONS.find((m) => m.number === number) || MISSIONS[0];
      missions.current = mission;
      return mission;
    },
    // The current mission (for the save round-trip probe).
    getCurrentMission() {
      return missions.current;
    },
    // The completed missions, as a list of mission numbers (for the
    // save round-trip probe).
    getCompletedMissions() {
      return missions.completed.slice();
    },
    // Set the completed missions (a list of mission numbers).
    setCompleted(numbers) {
      missions.completed = (numbers || []).slice();
      return missions.completed;
    },
    // Complete the current mission: the cash is added, the chapter
    // is recorded, and the save is updated.
    complete() {
      if (!missions.current) return null;
      const done = missions.current;
      missions.money += done.cash;
      if (!missions.completed.includes(done.number)) missions.completed.push(done.number);
      missions.current = null;
      return done;
    },
    // The mission for a chapter number (1, 2, 3, 5).
    byChapter(chapter) {
      return MISSIONS.find((m) => m.chapter === chapter) || null;
    },
    // The total cash earned (for the save and the HUD).
    totalCash() {
      return missions.money;
    },
  };
  return missions;
}
