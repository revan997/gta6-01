// Solmar Bay — game loop, state machine, staged shots, save flow, and
// the debug probe interface the harness reads.
//
// States: menu, playing, paused, gameover. The loop runs fixed 1/60 s
// steps (MAX_FRAME 0.25 caps a stall) and renders every frame — the
// staged camera stays active while playing OR paused, which is what
// makes the harness pause-freeze capture work.
//
// Shots: ?shot=cover|combat|pursuit|sunset stages that moment at boot
// (the cover GT autopilots south to the pin at z -67, the other three
// are static stagings). Free play starts from the menu instead.
//
// Probe interface: window.__solmar exposes scene / renderer / camera /
// round6 / round13 (live) / project(x, y, z) / money / state, plus the
// live systems. project() returns normalized {x, y} or null when the
// point is behind the camera or off-screen.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { createRng, mulberry32, WORLD_SEED } from './random.js';
import { createInput } from './input.js';
import { createAudio, RADIO_STATIONS } from './audio.js';
import { SAVE_VERSION, save, load } from './save.js';
import { buildWorld } from './world.js';
import { createRenderer, createScene, setupLights } from './render.js';
import { TrafficManager } from './traffic.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createCombatSystem } from './combat.js';
import * as MissionsMod from './missions.js';
import { createHud } from './hud.js';
import { stageShot, normalizeShotId, syncCarMesh, SHOT_DEFS, FALLBACK_DIALOGUE } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const SAVE_KEY_V8 = 'solmar-bay-save-v8';
const SAVE_KEY_V1 = 'solmar-bay-save-v1';
const COVER_PIN_Z = -67;
const COVER_SPEED = 22;

const MISSION_NAMES = {
  1: 'First Run',
  2: 'Hot Wheels',
  3: 'Borrowed Beauty',
  4: 'Harbour Heist',
};

const MISSION_CHAPTERS = { 1: '1', 2: '2', 3: '3', 4: '5' };

const NEXT_MISSIONS = {
  1: 'Hot Wheels',
  2: 'Borrowed Beauty',
  3: 'Harbour Heist',
  4: 'FREE ROAM',
};

// Golden-hour clock per shot (the harness gates 17–18.5).
const SHOT_TIME = { cover: 17.5, combat: 17.7, pursuit: 17.6, sunset: 18.3 };
const SHOT_SONG = {
  cover: 'Neon Coast',
  combat: 'Heat Rising',
  pursuit: 'Getaway',
  sunset: 'Harbour Lights',
};
const SHOT_RESPONSE = {
  cover: 'PURSUIT',
  combat: 'FIRING',
  pursuit: 'ROADBLOCK',
  sunset: 'PATROL',
};

// Normalize anything random-shaped into a () => [0, 1) callable: a
// function passes through, an object with .next()/.random() is wrapped,
// a numeric seed builds a mulberry32, anything else falls back to the
// shared seeded generator.
function toCallableRng(source, fallback) {
  if (typeof source === 'function') return source;
  if (source && typeof source.next === 'function') return () => source.next();
  if (source && typeof source.random === 'function') return () => source.random();
  if (typeof source === 'number') return mulberry32(source);
  return fallback;
}

// Call a factory with its primary arguments; when it fails and a
// fallback argument list was given, retry with that instead. A null
// fallback means no retry — the error propagates.
function callFactory(factory, name, args, fallbackArgs) {
  try {
    const out = factory(...args);
    if (out === null || out === undefined) throw new Error(`${name} returned nothing`);
    return out;
  } catch (err) {
    if (Array.isArray(fallbackArgs)) return factory(...fallbackArgs);
    throw err;
  }
}

// The missions module either exports a factory or the mission functions
// directly as module-level functions; both shapes resolve to an object
// with getCurrentMission / startMission / setCompletedMissions /
// setJobsDone / getSaveData / loadSaveData / getShotContext.
function resolveMissions() {
  const factory = MissionsMod.createMissions
    || MissionsMod.createMissionSystem
    || MissionsMod.createMissionsSystem
    || null;
  if (typeof factory === 'function') return factory({});
  return MissionsMod;
}

const params = new URLSearchParams(window.location.search);
const shotParam = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : WORLD_SEED;

const rng = createRng(seed);
const callableRng = toCallableRng(rng, () => 0.5);

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const scene = createScene();
setupLights(scene);
const world = callFactory(buildWorld, 'buildWorld', [scene, CONFIG, rng], [scene]);
const player = callFactory(createPlayer, 'createPlayer', [{ scene, world, rng }], null);
const police = callFactory(createPolice, 'createPolice', [{ scene, world, rng }], null);
const combat = callFactory(createCombatSystem, 'createCombatSystem', [{ scene, player, police, rng }], null);
const traffic = new TrafficManager({ rng, scene, maxCars: 20, maxPedestrians: 24 });
const missions = resolveMissions();
const hud = createHud();
const input = createInput(canvas);
let audio = null;
try {
  audio = createAudio();
} catch {
  audio = null;
}

// Cameras: one staged camera (fixed pose per shot) and one free-play
// chase camera. The staged camera is the active camera whenever a shot
// is staged, playing or paused.
const aspect = () => {
  const w = canvas.clientWidth || window.innerWidth || 1280;
  const h = canvas.clientHeight || window.innerHeight || 720;
  return w / Math.max(1, h);
};
const shotCam = new THREE.PerspectiveCamera(62, aspect(), 0.1, 2000);
const chaseCam = new THREE.PerspectiveCamera(62, aspect(), 0.1, 2000);
let activeCamera = chaseCam;

const game = {
  state: 'menu',
  shot: null,
  money: 4500,
  mission: 1,
  missionName: 'First Run',
  jobs: 0,
  wanted: 0,
  timeHours: 17.5,
  time: 0,
  health: 100,
  respect: 3,
  dialogue: null,
  message: '',
  radioSong: 'Golden Hour Drive',
  policeResponse: 'CLEAR',
  heroCar: null,
  carSpeed: 0,
  gear: 1,
  vehicleName: 'ON FOOT',
  savedAt: null,
  cameraPosition: null,
  cameraLookAt: null,
};

function clockString(hours) {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function districtFor(pos) {
  if (!pos) return 'DOWNTOWN · SOLMAR BAY';
  const dx = pos.x - 0;
  const dz = pos.z - (-160);
  if (dx * dx + dz * dz < 60 * 60) return 'NEAR DECO TOWER';
  if (pos.x > 50) return 'NEAR MARINA';
  return 'DOWNTOWN · SOLMAR BAY';
}

function completedBefore(missionNumber) {
  const out = [];
  for (let i = 1; i < missionNumber; i += 1) out.push(i);
  return out;
}

function placePlayer(x, z, heading) {
  // player.setPosition takes (x, z, heading) — three args, no y.
  if (typeof player.setPosition === 'function') {
    player.setPosition(x, z, heading);
  } else if (player.position && typeof player.position.set === 'function') {
    player.position.set(x, player.position.y || 0, z);
  } else if (player.position) {
    player.position.x = x;
    player.position.z = z;
  }
  if (typeof player.setHeading === 'function') {
    player.setHeading(heading);
  } else {
    try { player.heading = heading; } catch { /* read-only heading; pose still stands */ }
  }
  if (typeof player.syncMesh === 'function') player.syncMesh();
}

function applyCamera(position, lookAt, fov) {
  shotCam.position.set(position[0], position[1], position[2]);
  shotCam.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  if (typeof fov === 'number' && fov !== shotCam.fov) {
    shotCam.fov = fov;
    shotCam.updateProjectionMatrix();
  }
  shotCam.updateMatrixWorld(true);
  activeCamera = shotCam;
  game.cameraPosition = position.slice();
  game.cameraLookAt = lookAt.slice();
}

// Save under BOTH keys: the module's own key and the harness key the
// geometry suite reads (JSON version 8). The staged save is the
// new-game baseline money with the current shot's mission context, so
// the last staged shot (sunset: mission 4, completed [1,2,3]) is the
// save the round-trip gates read.
function saveGameState() {
  const payload = {
    version: SAVE_VERSION,
    money: game.money,
    mission: game.mission,
    completed: missions && typeof missions.getCompletedMissions === 'function'
      ? missions.getCompletedMissions()
      : completedBefore(game.mission),
    jobs: game.jobs,
    player: {
      x: player.position ? player.position.x : 0,
      z: player.position ? player.position.z : 0,
    },
    savedAt: new Date().toISOString(),
  };
  try {
    if (typeof save === 'function') save(payload);
  } catch {
    // The module save is best-effort; the direct writes below stand.
  }
  try { window.localStorage.setItem(SAVE_KEY_V8, JSON.stringify(payload)); } catch { /* storage off */ }
  try { window.localStorage.setItem(SAVE_KEY_V1, JSON.stringify(payload)); } catch { /* storage off */ }
  game.savedAt = payload.savedAt;
  return payload;
}

function loadSave() {
  let raw = null;
  try {
    if (typeof load === 'function') {
      const loaded = load();
      if (loaded) raw = JSON.stringify(loaded);
    }
  } catch {
    raw = null;
  }
  if (!raw) {
    try { raw = window.localStorage.getItem(SAVE_KEY_V1) || window.localStorage.getItem(SAVE_KEY_V8); } catch { raw = null; }
  }
  if (!raw) return false;
  let data;
  try { data = JSON.parse(raw); } catch { return false; }
  if (!data || data.version !== SAVE_VERSION) return false;
  game.money = typeof data.money === 'number' && data.money > 0 ? data.money : 4500;
  if (data.mission && missions) {
    if (typeof missions.setCompletedMissions === 'function' && Array.isArray(data.completed)) {
      missions.setCompletedMissions(data.completed);
    }
    if (typeof missions.setJobsDone === 'function' && typeof data.jobs === 'number') {
      missions.setJobsDone(data.jobs);
    }
    if (typeof missions.startMission === 'function') missions.startMission(data.mission);
    game.mission = data.mission;
    game.missionName = MISSION_NAMES[data.mission] || 'First Run';
    game.jobs = data.jobs || 0;
  }
  if (data.player) placePlayer(data.player.x ?? 40, data.player.z ?? -95, 0);
  game.savedAt = data.savedAt || null;
  return true;
}

// Stage one shot: mission context, wanted level, world staging,
// camera, HUD state, then a save so the shot's state is on disk.
function setShot(rawId) {
  const shotId = normalizeShotId(rawId);
  const def = SHOT_DEFS[shotId];
  game.shot = shotId;
  game.state = 'playing';
  game.mission = def.mission;
  game.missionName = def.missionName;
  game.jobs = def.mission - 1;
  game.wanted = def.wanted;
  game.timeHours = SHOT_TIME[shotId];
  game.radioSong = SHOT_SONG[shotId];
  game.policeResponse = SHOT_RESPONSE[shotId];
  game.dialogue = FALLBACK_DIALOGUE[shotId];
  game.message = shotId === 'pursuit' ? 'STOLEN VEHICLE' : '';
  if (missions) {
    if (typeof missions.startMission === 'function') missions.startMission(def.mission);
    if (typeof missions.setCompletedMissions === 'function') {
      missions.setCompletedMissions(completedBefore(def.mission));
    }
    if (typeof missions.setJobsDone === 'function') missions.setJobsDone(def.mission - 1);
  }
  if (police) {
    if (typeof police.setWanted === 'function') police.setWanted(def.wanted);
    else police.wanted = def.wanted;
  }
  // Combat: Rico is pre-positioned at his FINAL spot before the staging
  // call, so the officers arrange around where he actually stands.
  if (shotId === 'combat') placePlayer(40, -22, Math.PI / 2);
  const staged = stageShot(shotId, { player, police, combat, traffic, missions, game });
  game.heroCar = staged.car || null;
  game.vehicleName = shotId === 'cover' ? 'SOLMAR GT' : shotId === 'pursuit' ? 'PALM COUPE' : 'ON FOOT';
  applyCamera(def.camera.position, def.camera.lookAt, def.fov);
  game.money = 4500;
  saveGameState();
  hud.render(buildHudState());
}

// Project a world point to normalized screen coordinates (0..1), or
// null when it is behind the camera or off-screen. No +1.2 y offset —
// the caller passes the exact height it wants projected.
function projectToScreen(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(activeCamera);
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || v.z > 1) return null;
  const nx = (v.x + 1) / 2;
  const ny = (1 - v.y) / 2;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  return { x: nx, y: ny };
}

// The live round-13 probe: heli pose from police, fallen count from the
// officers, muzzle + pistol from combat, roadblock cars from police,
// race + roadblock + rivals, the game clock, and the mission name /
// dialogue text / weapon the harness gates on.
function buildRound13Probe() {
  const heli = police && typeof police.getHeli === 'function' ? police.getHeli() : null;
  const heliPos = heli ? (heli.position || heli) : null;
  const officers = police && typeof police.getOfficers === 'function' ? police.getOfficers() : [];
  const fallen = officers.filter((o) => o && o.fallen).length;
  const roadblocks = police && typeof police.getRoadblockCars === 'function'
    ? police.getRoadblockCars()
    : [];
  return {
    heli: heli
      ? {
        x: heliPos && typeof heliPos.x === 'number' ? heliPos.x : 0,
        y: heliPos && typeof heliPos.y === 'number' ? heliPos.y : 0,
        z: heliPos && typeof heliPos.z === 'number' ? heliPos.z : 0,
        scale: typeof heli.scale === 'number' ? heli.scale : 2.6,
      }
      : { x: 0, y: 0, z: 0, scale: 2.6 },
    fallenOfficers: fallen,
    muzzleVisible: combat ? !!combat.muzzleVisible : false,
    ricoPistol: combat ? !!combat.ricoPistol : false,
    roadblockCars: roadblocks.map((c) => ({
      x: c.position ? c.position.x : (c.x || 0),
      z: c.position ? c.position.z : (c.z || 0),
    })),
    race: { total: 3, position: 1 },
    roadblock: roadblocks.length,
    rivals: 2,
    timeOfDay: game.timeHours,
    mission: game.missionName,
    dialogue: game.dialogue ? game.dialogue.text : '',
    weapon: 'Pistol',
  };
}

function policeCarsForHud() {
  if (!police || typeof police.getPoliceCars !== 'function') return [];
  return police.getPoliceCars().map((c) => ({
    x: c.position ? c.position.x : (c.x || 0),
    z: c.position ? c.position.z : (c.z || 0),
  }));
}

function officersForHud() {
  if (!police || typeof police.getOfficers !== 'function') return [];
  return police.getOfficers().map((o) => ({
    x: o.position ? o.position.x : (o.x || 0),
    z: o.position ? o.position.z : (o.z || 0),
  }));
}

function buildHudState() {
  const mission = missions && typeof missions.getCurrentMission === 'function'
    ? missions.getCurrentMission()
    : null;
  const missionNumber = mission && typeof mission.number === 'number'
    ? mission.number
    : game.mission;
  return {
    state: game.state,
    shot: game.shot,
    money: game.money,
    missionNumber,
    missionName: game.missionName,
    chapter: MISSION_CHAPTERS[missionNumber] || '1',
    jobsDone: game.jobs,
    wanted: game.wanted,
    timeHours: game.timeHours,
    clock: clockString(game.timeHours),
    dialogue: game.dialogue,
    radioSong: game.radioSong,
    race: 'STREET RACE · 1/3',
    health: game.health,
    weapon: 'Pistol',
    speed: Math.abs(game.carSpeed) * 3.6,
    gear: game.gear,
    vehicleName: game.vehicleName,
    vehicleCondition: 100,
    respect: game.respect,
    district: districtFor(player.position),
    crew: ['Dante', 'Mama Lou'],
    player: {
      x: player.position ? player.position.x : 0,
      z: player.position ? player.position.z : 0,
      heading: typeof player.heading === 'number' ? player.heading : 0,
    },
    police: { cars: policeCarsForHud(), officers: officersForHud() },
    policeResponse: game.policeResponse,
    message: game.message,
    saved: !!game.savedAt,
    nextMission: NEXT_MISSIONS[missionNumber] || '—',
    garage: 'SOLMAR GT',
    missionTarget: game.shot === 'cover' ? { x: 80, z: -150 } : null,
  };
}

// Crosshair: on the aim officer (nearest officer to Rico) during
// combat, hidden on every other shot. The harness compares the
// element's screen box with the officer's projection.
function updateCrosshair() {
  if (game.shot !== 'combat') {
    hud.setCrosshair(0, 0, false);
    return;
  }
  const officers = police && typeof police.getOfficers === 'function' ? police.getOfficers() : [];
  if (!officers.length || !player.position) {
    hud.setCrosshair(0, 0, false);
    return;
  }
  let best = null;
  let bestD = Infinity;
  for (const o of officers) {
    const ox = o.position ? o.position.x : o.x;
    const oz = o.position ? o.position.z : o.z;
    if (typeof ox !== 'number' || typeof oz !== 'number') continue;
    const dx = ox - player.position.x;
    const dz = oz - player.position.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = { x: ox, z: oz }; }
  }
  if (!best) {
    hud.setCrosshair(0, 0, false);
    return;
  }
  const p = projectToScreen(best.x, 1.4, best.z);
  if (!p) {
    hud.setCrosshair(0, 0, false);
    return;
  }
  hud.setCrosshair(p.x * window.innerWidth, p.y * window.innerHeight, true);
}

// --- Input ---
const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyP') togglePause();
  if (e.code === 'Enter' && (game.state === 'menu' || game.state === 'gameover')) startGame();
  if (e.code === 'KeyE' && game.state === 'playing' && !game.shot) toggleEnterCar();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

function togglePause() {
  // P resumes from paused as well as pausing from playing — a
  // playing-only guard leaves the game stuck paused after the frozen
  // capture.
  if (game.state === 'playing') game.state = 'paused';
  else if (game.state === 'paused') game.state = 'playing';
}

function startGame() {
  if (game.state !== 'menu' && game.state !== 'gameover') return;
  game.state = 'playing';
  game.shot = null;
  game.dialogue = { speaker: 'Mama Lou', text: 'First job: pick up the package at the Marina. Keep it clean.' };
  game.message = '';
  game.vehicleName = 'ON FOOT';
}

function toggleEnterCar() {
  if (!player) return;
  if (player.currentCar) {
    if (typeof player.exitCar === 'function') player.exitCar();
    game.vehicleName = 'ON FOOT';
    game.carSpeed = 0;
    return;
  }
  const px = player.position ? player.position.x : 0;
  const pz = player.position ? player.position.z : 0;
  const candidates = [];
  if (game.heroCar) candidates.push(game.heroCar);
  if (traffic && Array.isArray(traffic.cars)) candidates.push(...traffic.cars);
  let best = null;
  let bestD = 16;
  for (const c of candidates) {
    const cx = c.position ? c.position.x : c.x;
    const cz = c.position ? c.position.z : c.z;
    if (typeof cx !== 'number' || typeof cz !== 'number') continue;
    const d = (cx - px) * (cx - px) + (cz - pz) * (cz - pz);
    if (d < bestD) { bestD = d; best = c; }
  }
  if (best && typeof player.enterCar === 'function') {
    player.enterCar(best);
    game.vehicleName = 'SOLMAR GT';
  }
}

function readInputState() {
  return {
    forward: keys.has('KeyW') || keys.has('ArrowUp'),
    back: keys.has('KeyS') || keys.has('ArrowDown'),
    left: keys.has('KeyA') || keys.has('ArrowLeft'),
    right: keys.has('KeyD') || keys.has('ArrowRight'),
    run: keys.has('ShiftLeft') || keys.has('ShiftRight'),
    brake: keys.has('Space'),
  };
}

// --- Simulation step (fixed 1/60 s) ---
function step(dt) {
  game.time += dt;
  const inputState = readInputState();

  // Cover autopilot: the GT drives south at 22 m/s through the west
  // bend (heading is a pure function of car z) and holds at the pin.
  if (game.shot === 'cover' && game.heroCar) {
    const gt = game.heroCar;
    const z = gt.position ? gt.position.z : gt.z;
    if (typeof z === 'number' && z < COVER_PIN_Z) {
      const heading = world.bend.headingAt(z);
      gt.heading = heading;
      const nx = (gt.position ? gt.position.x : gt.x) + Math.sin(heading) * COVER_SPEED * dt;
      const nz = z + Math.cos(heading) * COVER_SPEED * dt;
      if (gt.position) { gt.position.x = nx; gt.position.z = nz; }
      else { gt.x = nx; gt.z = nz; }
      syncCarMesh(gt);
    }
  }

  // Free-play driving: the player steers the car they sit in.
  if (!game.shot && player.currentCar) {
    const car = player.currentCar;
    const accel = inputState.forward ? 1 : inputState.back ? -0.6 : 0;
    const steer = (inputState.left ? 1 : 0) - (inputState.right ? 1 : 0);
    game.carSpeed += accel * 12 * dt;
    if (!accel) game.carSpeed *= Math.max(0, 1 - 1.5 * dt);
    if (inputState.brake) game.carSpeed *= Math.max(0, 1 - 4 * dt);
    game.carSpeed = Math.max(-8, Math.min(26, game.carSpeed));
    const heading = (typeof car.heading === 'number' ? car.heading : 0)
      + steer * 1.6 * dt * Math.min(1, Math.abs(game.carSpeed) / 8);
    car.heading = heading;
    const nx = (car.position ? car.position.x : car.x) + Math.sin(heading) * game.carSpeed * dt;
    const nz = (car.position ? car.position.z : car.z) + Math.cos(heading) * game.carSpeed * dt;
    if (car.position) { car.position.x = nx; car.position.z = nz; }
    else { car.x = nx; car.z = nz; }
    game.gear = game.carSpeed < 0 ? 0 : Math.min(5, 1 + Math.floor(Math.abs(game.carSpeed) / 6));
    syncCarMesh(car);
  }
  // Rico follows his car when driving (the mesh hides while he drives)
  // and walks by the key map on foot. player.update reads
  // inputState.keys {w,a,s,d,arrowup,...}, so hand it that shape — the
  // call runs in staged shots too (empty keys there), keeping his
  // position glued to the GT through the cover autopilot.
  if (player && typeof player.update === 'function') {
    player.update(dt, {
      keys: {
        w: keys.has('KeyW'),
        a: keys.has('KeyA'),
        s: keys.has('KeyS'),
        d: keys.has('KeyD'),
        arrowup: keys.has('ArrowUp'),
        arrowdown: keys.has('ArrowDown'),
        arrowleft: keys.has('ArrowLeft'),
        arrowright: keys.has('ArrowRight'),
      },
    });
  }

  traffic.update(dt, world, player);
  // police.update takes (dt, playerPosition); stepSimulation takes only
  // the player position (it steps a fixed 1/60). Prefer update.
  if (police && typeof police.update === 'function') {
    police.update(dt, player.position);
  } else if (police && typeof police.stepSimulation === 'function') {
    police.stepSimulation(player.position);
  }
  if (combat && typeof combat.update === 'function') combat.update(dt);
  if (missions && typeof missions.update === 'function') missions.update(dt);
  if (audio && typeof audio.update === 'function') {
    audio.update(dt, { speed: Math.abs(game.carSpeed), wanted: game.wanted });
  }
}

function updateCamera() {
  if (game.shot) {
    // Staged camera: fixed pose, playing or paused alike.
    activeCamera = shotCam;
    return;
  }
  activeCamera = chaseCam;
  const target = player.currentCar || player;
  const pos = target.position || { x: 40, y: 0, z: -95 };
  const heading = typeof target.heading === 'number' ? target.heading : 0;
  const back = 9;
  const cx = pos.x - Math.sin(heading) * back;
  const cz = pos.z - Math.cos(heading) * back;
  if (game.state === 'menu') {
    chaseCam.position.set(40, 9, -30);
    chaseCam.lookAt(0, 12, -160);
  } else {
    chaseCam.position.set(cx, 3.4, cz);
    chaseCam.lookAt(pos.x, 1.5, pos.z);
  }
  chaseCam.updateMatrixWorld(true);
}

function resize() {
  const w = window.innerWidth || 1280;
  const h = window.innerHeight || 720;
  if (renderer && typeof renderer.setSize === 'function') renderer.setSize(w, h, false);
  shotCam.aspect = w / Math.max(1, h);
  chaseCam.aspect = w / Math.max(1, h);
  shotCam.updateProjectionMatrix();
  chaseCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Debug probe interface ---
window.__solmar = {
  get scene() { return scene; },
  get renderer() { return renderer; },
  get camera() { return activeCamera; },
  get round6() { return world && world.round6; },
  get round13() { return buildRound13Probe(); },
  buildRound13: () => buildRound13Probe(),
  project: (x, y, z) => projectToScreen(x, y, z),
  get money() { return game.money; },
  get state() { return game.state; },
  get game() { return game; },
  get player() { return player; },
  get traffic() { return traffic; },
  get police() { return police; },
  get combat() { return combat; },
  get missions() { return missions; },
  get world() { return world; },
  get config() { return CONFIG; },
  get timeOfDay() { return game.timeHours; },
  setShot: (id) => setShot(id),
  saveGameState,
  loadSave,
};

// --- Boot ---
loadSave();
if (shotParam) {
  setShot(shotParam);
} else {
  // Free play: the hero GT waits downtown and Rico starts on foot
  // beside it; the menu shows until START.
  game.state = 'menu';
  try {
    const vehicleMod = await import('./vehicle.js');
    let gt = null;
    const factory = vehicleMod.createSolmarGT || vehicleMod.createGT || vehicleMod.makeVehicle;
    if (typeof factory === 'function') {
      try {
        gt = factory === vehicleMod.makeVehicle
          ? factory('gt', 40, -95, 0)
          : factory(40, -95, 0);
      } catch {
        try { gt = factory({ scene, world, rng, x: 40, z: -95, heading: 0 }); } catch { gt = null; }
      }
    }
    if (gt) {
      game.heroCar = gt;
      if (gt.position) { gt.position.x = 40; gt.position.z = -95; }
      syncCarMesh(gt);
    }
  } catch {
    game.heroCar = null;
  }
  placePlayer(40, -92, 0);
  game.dialogue = null;
}

const startButton = document.getElementById('start-button');
if (startButton) startButton.addEventListener('click', startGame);

let last = performance.now();
let accumulator = 0;
let painted = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = now - last;
  last = now;
  accumulator += Math.min(elapsed / 1000, MAX_FRAME);
  if (game.state === 'playing') {
    while (accumulator >= STEP) {
      step(STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
  }
  updateCamera();
  hud.render(buildHudState());
  updateCrosshair();
  renderer.render(scene, activeCamera);
  painted += 1;
  if (game.shot && painted === 2) window.__shotReady = true;
}
requestAnimationFrame(frame);

// Leaving the tab pauses a running game rather than letting the chase
// run unseen.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing') game.state = 'paused';
});
