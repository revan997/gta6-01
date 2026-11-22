// Solmar Bay — main game loop, state machine, cameras, staging, debug probe.
// Fresh build for the round-16 rebuild (attempt #8). Written from the
// interface contract + rebuild spec; no old source read or copied.
import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { createRng, clamp, lerp } from './random.js';
import { buildWorld } from './world.js';
import { createRenderer, createScene, setupLights, getPerfStats, PERF_BUDGETS, resizeRenderer } from './render.js';
import { createVehicleSystem, makeVehicle, createGT, createPalmCoupe, createTealCoupe, createVehicle } from './vehicle.js';
import { createTrafficSystem, TrafficManager } from './traffic.js';
import { createPoliceSystem } from './police.js';
import { createPlayer } from './player.js';
import { createCombatSystem } from './combat.js';
import { createMissions } from './missions.js';
import { createInput, KEYS } from './input.js';
import { createAudio, getSharedAudio, RADIO_STATIONS } from './audio.js';
import { saveGameState, loadGameState, SAVE_VERSION, BASELINE_MONEY, BASELINE_MISSION } from './save.js';
import { createHud } from './hud.js';
import { createShotStaging, SHOT_DEFS } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;
const COVER_FOV = (CONFIG.cover && CONFIG.cover.camera && CONFIG.cover.camera.fov) || 62;
const COVER_PIN_Z = (CONFIG.cover && CONFIG.cover.pinZ) || -67;

// Staged camera poses (contract §6 fix #3.4 / §7 fix #2.6-2.8, task brief).
const CAMERAS = {
  'cover-chase': { pos: [43.5, 3.5, -58], lookAt: [46, -10, -140] },
  combat: { pos: [36.5, 2.0, -13.5], lookAt: [40, 1.2, -22] },
  pursuit: { pos: [-120, 4.5, 110], lookAt: [-120, 1.5, 128] },
  sunset: { pos: [199.0, 2.3, -129.0], lookAt: [190, 1.5, -140] },
};

function callFactory(factory, name, args, secondary) {
  if (typeof factory !== 'function') throw new Error('factory ' + name + ' is not a function');
  try {
    return factory(...args);
  } catch (err) {
    if (secondary) return factory(...secondary);
    throw err;
  }
}

function toCallableRngLocal(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  if (rng && typeof rng.random === 'function') return () => rng.random();
  return Math.random;
}

const game = {
  state: 'menu',
  shotId: null,
  money: BASELINE_MONEY,
  wanted: 0,
  timeOfDay: 17.8,
  jobsDone: 0,
  completedMissions: [],
  dialogueText: '',
  dialogueSpeaker: '',
  objective: '',
  savedAt: '',
  race: { total: 3, position: 1 },
  heroCar: null,
  tealCoupe: null,
  gameTime: 0,
  coverSpeed: 0,
  coverDone: false,
};

let renderer = null;
let scene = null;
let world = null;
let player = null;
let police = null;
let combat = null;
let traffic = null;
let vehicleSystem = null;
let missions = null;
let input = null;
let audio = null;
let hud = null;
let shots = null;
let shotCam = null;
let freeCam = null;
let activeCamera = null;
let keysDown = new Set();
let started = false;

function clockString(tod) {
  const totalMin = Math.round(tod * 60);
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function syncPlayerToCar() {
  if (!player || !player.currentCar || !player.currentCar.position) return;
  const c = player.currentCar.position;
  if (player.position) {
    if (typeof player.position.set === 'function') player.position.set(c.x, 0, c.z);
    else { player.position.x = c.x; player.position.y = 0; player.position.z = c.z; }
  }
}

function project(x, y, z) {
  if (!activeCamera) return null;
  activeCamera.updateMatrixWorld(true);
  const v = new THREE.Vector3(x, y, z).project(activeCamera);
  if (v.z > 1 || v.z < -1) return null;
  // FIX #1 (attempt #8): NO 0..1 bounds check — the old projectToScreen
  // returned off-frame points (e.g. decoFinTop at (345,-9)) and the
  // geometry measurer needs them. Callers filter on-screen themselves.
  const nx = (v.x + 1) / 2;
  const ny = (1 - v.y) / 2;
  return { x: nx, y: ny };
}

function perfNumbers() {
  try {
    if (typeof getPerfStats === 'function') {
      const s = getPerfStats(renderer);
      if (s && typeof s === 'object') {
        return {
          calls: s.calls ?? s.drawCalls ?? s.renderCalls ?? 0,
          triangles: s.triangles ?? s.tris ?? 0,
        };
      }
    }
  } catch (e) { /* fall through to renderer.info */ }
  try {
    const info = renderer && renderer.info && renderer.info.render;
    if (info) return { calls: info.calls || 0, triangles: info.triangles || 0 };
  } catch (e) { /* ignore */ }
  return { calls: 0, triangles: 0 };
}

function buildRound13() {
  let heli = null;
  try { heli = police && typeof police.getHeli === 'function' ? police.getHeli() : null; } catch (e) { heli = null; }
  let officers = [];
  try { officers = police && typeof police.getOfficers === 'function' ? police.getOfficers() : []; } catch (e) { officers = []; }
  let cars = [];
  try { cars = police && typeof police.getPoliceCars === 'function' ? police.getPoliceCars() : []; } catch (e) { cars = []; }
  let rb = [];
  try { rb = police && typeof police.getRoadblockCars === 'function' ? police.getRoadblockCars() : []; } catch (e) { rb = []; }
  const mission = missions && typeof missions.getCurrentMission === 'function' ? missions.getCurrentMission() : null;
  const stats = perfNumbers();
  return {
    heli: heli ? { present: heli.present !== false, x: heli.x, y: heli.y, z: heli.z, scale: heli.scale } : { present: false },
    wanted: game.wanted,
    policeCars: cars.length,
    officers: officers.length,
    mission: mission ? mission.name : '',
    dialogue: game.dialogueText || '',
    weapon: game.shotId === 'sunset' ? 'Fists' : 'Pistol',
    objective: game.objective || '',
    renderer: { calls: stats.calls, triangles: stats.triangles },
    saveInfo: { savedAt: game.savedAt || '' },
    state: game.state,
    timeOfDay: game.timeOfDay,
    race: game.race,
    roadblock: rb.length,
    rivals: 2,
    fallenOfficers: officers.filter((o) => !!o.fallen).length,
    muzzleVisible: !!(combat && combat.muzzleVisible === true),
    ricoPistol: !!(combat && combat.ricoPistol),
    roadblockCars: rb.map((c) => ({ x: c.position ? c.position.x : c.x, z: c.position ? c.position.z : c.z })),
  };
}

function buildHudState() {
  const mission = missions && typeof missions.getCurrentMission === 'function' ? missions.getCurrentMission() : null;
  const def = game.shotId ? SHOT_DEFS[game.shotId] : null;
  return {
    state: game.state,
    shotId: game.shotId,
    money: game.money,
    cashText: '$' + Number(game.money || 0).toLocaleString('en-US'),
    missionName: mission ? mission.name : (def ? def.missionName : 'First Run'),
    missionNumber: mission ? mission.number : (def ? def.mission : 1),
    chapterLabel: def ? def.chapterLabel : 'CHAPTER 1',
    jobsText: game.jobsDone + '/8 JOBS DONE',
    clockText: clockString(game.timeOfDay),
    wanted: game.wanted,
    dialogue: game.dialogueText ? { speaker: game.dialogueSpeaker || 'DANTE', text: game.dialogueText } : null,
    radioText: radioName(),
    districtText: districtLine(),
    crewText: 'CREW · DANTE · MAMA LOU · RICO',
    policeText: policeLine(),
    showAirOne: game.shotId === 'cover-chase',
    vehicleText: vehicleLine(),
    raceLine: game.shotId === 'pursuit' ? ('STREET RACE · ' + game.race.position + '/' + game.race.total) : '',
    nextLine: game.shotId === 'sunset' ? 'NEXT: five-star chase' : '',
    saveLine: game.savedAt ? ('✓ SAVED ' + clockString(game.timeOfDay) + ' · CHECKPOINT: MARINA') : '',
    objective: game.objective || '',
    showCrosshair: game.shotId === 'combat' && game.state === 'playing',
    showBanner: game.shotId === 'pursuit',
    bannerText: 'STOLEN VEHICLE',
  };
}

function radioName() {
  try {
    if (audio && typeof audio.getStation === 'function') {
      const st = audio.getStation();
      if (st && st.name) return st.name;
    }
  } catch (e) { /* ignore */ }
  return 'SOLMAR FM 101.5';
}

function districtLine() {
  const p = player && player.position ? player.position : { x: 40, z: -80 };
  const near = (p.x > 60 || p.z < -130) ? 'MARINA' : 'DECO TOWER';
  return 'NEAR ' + near + ' · STANDING: RESPECTED';
}

function policeLine() {
  const stars = '★'.repeat(game.wanted) + '☆'.repeat(Math.max(0, 5 - game.wanted));
  if (game.shotId === 'cover-chase') return stars + ' · AIR ONE · HELICOPTER · OVERHEAD';
  const units = game.shotId === 'pursuit' ? '4 INTERCEPTORS · ROADBLOCK' : (game.shotId === 'combat' ? '7 OFFICERS ON FOOT' : 'PATROL UNITS RESPONDING');
  return stars + ' · ' + units;
}

function vehicleLine() {
  if (game.shotId === 'sunset') return 'FISTS READY';
  if (game.shotId === 'combat') return 'WEAPON · PISTOL';
  return 'GARAGE · SOLMAR GT';
}

function applyLoadedSave(s) {
  if (!s || typeof s !== 'object') return false;
  game.money = typeof s.money === 'number' ? s.money : BASELINE_MONEY;
  const missionNum = s.currentMission ?? s.mission ?? BASELINE_MISSION;
  const completed = Array.isArray(s.completedMissions) ? s.completedMissions : [];
  const jobs = typeof s.jobsDone === 'number' ? s.jobsDone : completed.length;
  game.completedMissions = completed;
  game.jobsDone = jobs;
  try {
    if (missions) {
      if (typeof missions.setCompletedMissions === 'function') missions.setCompletedMissions(completed);
      if (typeof missions.setJobsDone === 'function') missions.setJobsDone(jobs);
      if (typeof missions.startMission === 'function') missions.startMission(missionNum);
    }
  } catch (e) { /* ignore */ }
  game.savedAt = s.savedAt || '';
  return true;
}

function loadSave() {
  try {
    const s = loadGameState();
    if (s && typeof s.money === 'number') return applyLoadedSave(s);
  } catch (e) { /* ignore */ }
  game.money = BASELINE_MONEY;
  game.completedMissions = [];
  game.jobsDone = 0;
  try {
    if (missions) {
      if (typeof missions.setCompletedMissions === 'function') missions.setCompletedMissions([]);
      if (typeof missions.setJobsDone === 'function') missions.setJobsDone(0);
      if (typeof missions.startMission === 'function') missions.startMission(BASELINE_MISSION);
    }
  } catch (e) { /* ignore */ }
  return false;
}

function writeStagedSave() {
  const payload = {
    money: game.money,
    mission: missions && typeof missions.getCurrentMission === 'function' ? missions.getCurrentMission().number : 1,
    jobsDone: game.jobsDone,
    completedMissions: game.completedMissions.slice(),
  };
  try {
    const staged = saveGameState(payload);
    if (staged && staged.savedAt) game.savedAt = staged.savedAt;
    else game.savedAt = new Date().toISOString();
  } catch (e) {
    game.savedAt = new Date().toISOString();
  }
  if (!game.savedAt) game.savedAt = new Date().toISOString();
}

function setPaused(paused) {
  if (paused && game.state === 'playing') {
    game.state = 'paused';
    if (hud && typeof hud.setPaused === 'function') hud.setPaused(true);
  } else if (!paused && game.state === 'paused') {
    game.state = 'playing';
    if (hud && typeof hud.setPaused === 'function') hud.setPaused(false);
  }
}

function onKeyDown(e) {
  if (!e || !e.code) return;
  keysDown.add(e.code);
  if (e.code === 'KeyP') {
    if (game.state === 'playing' || game.state === 'paused') setPaused(game.state === 'playing');
  }
  if (e.code === 'KeyE' && game.state === 'playing' && !game.shotId) toggleEnterCar();
}

function onKeyUp(e) {
  if (e && e.code) keysDown.delete(e.code);
}

function keyDown(code) {
  if (keysDown.has(code)) return true;
  try {
    if (input && typeof input.isDown === 'function' && input.isDown(code)) return true;
    if (input && input.keys && typeof input.keys.has === 'function' && input.keys.has(code)) return true;
    if (input && input.down && typeof input.down.has === 'function' && input.down.has(code)) return true;
  } catch (err) { /* ignore */ }
  return false;
}

function toggleEnterCar() {
  if (!player || !vehicleSystem) return;
  try {
    if (player.currentCar) {
      const c = player.currentCar;
      if (typeof player.exitCar === 'function') player.exitCar();
      else {
        player.currentCar = null;
        if (typeof player.setPosition === 'function') player.setPosition(c.position.x + 2.5, c.position.z + 1, player.heading || 0);
      }
      if (player.mesh) player.mesh.visible = true;
      return;
    }
    const gt = game.heroCar;
    if (gt && player.position) {
      const d = Math.hypot(gt.position.x - player.position.x, gt.position.z - player.position.z);
      if (d < 4 && typeof player.enterCar === 'function') player.enterCar(gt);
    }
  } catch (err) { /* ignore */ }
}

function stageShot(shotId) {
  const def = SHOT_DEFS[shotId];
  if (!def) return false;
  game.shotId = shotId;
  game.timeOfDay = def.timeOfDay;
  game.money = def.money;
  game.jobsDone = def.jobsDone;
  game.completedMissions = def.completed.slice();
  game.wanted = def.wanted;
  game.dialogueText = def.dialogue.text;
  game.dialogueSpeaker = def.dialogue.speaker;
  game.objective = def.objective;
  game.race = def.race || { total: 3, position: 1 };
  game.coverDone = false;
  game.coverSpeed = 0;
  try {
    if (police && typeof police.setWanted === 'function') police.setWanted(def.wanted);
    else if (police) police.wanted = def.wanted;
  } catch (err) { /* ignore */ }
  try {
    if (missions) {
      if (typeof missions.setCompletedMissions === 'function') missions.setCompletedMissions(def.completed.slice());
      if (typeof missions.setJobsDone === 'function') missions.setJobsDone(def.jobsDone);
      if (typeof missions.startMission === 'function') missions.startMission(def.mission);
    }
  } catch (err) { /* ignore */ }
  try { if (shots) shots.stageShot(shotId); } catch (err) { /* staging continues below */ }
  try { if (traffic && typeof traffic.stageShot === 'function') traffic.stageShot(shotId); } catch (err) { /* ignore */ }
  writeStagedSave();
  if (hud && typeof hud.setShot === 'function') hud.setShot(shotId, buildHudState());
  try { if (audio && typeof audio.siren === 'function') audio.siren(def.wanted >= 4); } catch (err) { /* ignore */ }
  return true;
}

function startPlaying(fromShot) {
  if (!fromShot) loadSave();
  game.state = 'playing';
  if (hud && typeof hud.hideStart === 'function') hud.hideStart();
  if (hud && typeof hud.update === 'function') hud.update(buildHudState());
}

function updateCamera() {
  if (!activeCamera || !scene) return;
  if (game.shotId && CAMERAS[game.shotId]) {
    const pose = CAMERAS[game.shotId];
    activeCamera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    activeCamera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
    return;
  }
  // Free-play third-person follow.
  if (player && player.position) {
    const h = player.heading || 0;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const tx = player.position.x - fx * 8;
    const tz = player.position.z - fz * 8;
    const ty = (player.position.y || 0) + 3.4;
    activeCamera.position.set(
      lerp(activeCamera.position.x, tx, 0.12),
      lerp(activeCamera.position.y, ty, 0.12),
      lerp(activeCamera.position.z, tz, 0.12),
    );
    activeCamera.lookAt(player.position.x + fx * 4, (player.position.y || 0) + 1.5, player.position.z + fz * 4);
  }
}

function coverAutopilot(dt) {
  const car = game.heroCar;
  if (!car || !car.position || game.coverDone) return;
  const bend = (CONFIG.round27 && CONFIG.round27.coverBend) || { zStart: -80, zEnd: -70, angleDeg: -17 };
  const pinZ = COVER_PIN_Z;
  const z = car.position.z;
  const t = clamp((z - bend.zStart) / (bend.zEnd - bend.zStart), 0, 1);
  const ease = t * t * (3 - 2 * t);
  const heading = (bend.angleDeg * Math.PI / 180) * ease;
  let target = 0;
  if (z < pinZ) target = clamp((pinZ - z) * 1.5, 1.5, 10);
  game.coverSpeed = lerp(game.coverSpeed, target, Math.min(1, dt * 3));
  if (game.coverSpeed < 0.05 && z >= pinZ - 0.05) {
    game.coverSpeed = 0;
    game.coverDone = true;
    return;
  }
  const nx = car.position.x + Math.sin(heading) * game.coverSpeed * dt;
  const nz = car.position.z + Math.cos(heading) * game.coverSpeed * dt;
  if (typeof car.setPosition === 'function') car.setPosition(nx, nz, heading);
  else { car.position.x = nx; car.position.z = nz; car.heading = heading; }
  if (shots && typeof shots.syncCarMesh === 'function') shots.syncCarMesh(car);
  syncPlayerToCar();
}

function freePlayStep(dt) {
  if (!player || !player.position) return;
  const fwd = (keyDown('KeyW') || keyDown('ArrowUp') ? 1 : 0) - (keyDown('KeyS') || keyDown('ArrowDown') ? 1 : 0);
  const strafe = (keyDown('KeyD') || keyDown('ArrowRight') ? 1 : 0) - (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0);
  if (player.currentCar) {
    const car = player.currentCar;
    const h = car.heading || 0;
    const speed = (car._speed || 0) + fwd * 14 * dt;
    car._speed = clamp(speed * (fwd === 0 ? (1 - dt * 1.5) : 1), -5, 26);
    const nh = h + strafe * dt * 1.4 * Math.min(1, Math.abs(car._speed) / 8) * (car._speed >= 0 ? 1 : -1);
    const nx = car.position.x + Math.sin(nh) * car._speed * dt;
    const nz = car.position.z + Math.cos(nh) * car._speed * dt;
    if (typeof car.setPosition === 'function') car.setPosition(nx, nz, nh);
    if (shots && typeof shots.syncCarMesh === 'function') shots.syncCarMesh(car);
    syncPlayerToCar();
    return;
  }
  const h = player.heading || 0;
  const run = keyDown('ShiftLeft') || keyDown('ShiftRight') ? 7 : 4;
  const mx = (Math.sin(h) * fwd + Math.cos(h) * strafe) * run * dt;
  const mz = (Math.cos(h) * fwd - Math.sin(h) * strafe) * run * dt;
  if (mx !== 0 || mz !== 0) {
    const nx = player.position.x + mx;
    const nz = player.position.z + mz;
    if (typeof player.setPosition === 'function') player.setPosition(nx, nz, h);
    else { player.position.x = nx; player.position.z = nz; }
  }
}

function step(dt) {
  game.gameTime += dt;
  if (game.shotId === 'cover-chase' && game.state === 'playing') coverAutopilot(dt);
  else if (!game.shotId && game.state === 'playing') freePlayStep(dt);
  try { if (traffic && typeof traffic.update === 'function') traffic.update(dt); } catch (err) { /* ignore */ }
  try {
    if (police && typeof police.update === 'function' && player && player.position) police.update(dt, player.position);
  } catch (err) { /* ignore */ }
  try { if (combat && typeof combat.update === 'function') combat.update(dt); } catch (err) { /* ignore */ }
  try {
    if (audio && typeof audio.setSpeed === 'function') audio.setSpeed(game.heroCar && player && player.currentCar ? Math.abs(game.coverSpeed || 0) : 0);
  } catch (err) { /* ignore */ }
  if (!game.shotId) game.timeOfDay = Math.min(18.6, 17.8 + game.gameTime * 0.0002);
}

let lastT = 0;
let acc = 0;
function frame(t) {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
  const now = typeof t === 'number' ? t : 0;
  let dt = lastT ? (now - lastT) / 1000 : STEP;
  lastT = now;
  if (!(dt > 0) || dt > MAX_FRAME) dt = Math.min(Math.max(dt || STEP, 0), MAX_FRAME);
  if (game.state === 'playing') {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) { step(STEP); acc -= STEP; n += 1; }
    if (n >= 5) acc = 0;
  }
  updateCamera();
  try { if (hud && typeof hud.update === 'function') hud.update(buildHudState()); } catch (err) { /* ignore */ }
  try { if (renderer && scene && activeCamera) renderer.render(scene, activeCamera); } catch (err) { /* ignore */ }
}

function init() {
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const shotParam = params.get('shot');
  const seedParam = params.get('seed');
  const seed = seedParam ? (parseInt(seedParam, 10) || 20261122) : 20261122;
  const rng = createRng(seed);

  renderer = createRenderer();
  try {
    const w = typeof window !== 'undefined' ? window.innerWidth || 1280 : 1280;
    const h = typeof window !== 'undefined' ? window.innerHeight || 720 : 720;
    if (typeof renderer.setSize === 'function') renderer.setSize(w, h);
  } catch (err) { /* ignore */ }
  const container = (typeof document !== 'undefined' && document.getElementById('game-container')) || null;
  if (renderer.domElement) {
    if (container) container.appendChild(renderer.domElement);
    else if (typeof document !== 'undefined') document.body.appendChild(renderer.domElement);
  }

  scene = createScene();
  setupLights(scene);

  shotCam = new THREE.PerspectiveCamera(COVER_FOV, 1280 / 720, 0.1, 2000);
  freeCam = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 2000);
  activeCamera = shotCam;

  world = callFactory(buildWorld, 'buildWorld', [scene, CONFIG, rng], [scene]);
  vehicleSystem = createVehicleSystem({ scene, world, rng });
  player = callFactory(createPlayer, 'createPlayer', [{ scene, world, rng }], null);
  police = callFactory(createPoliceSystem, 'createPoliceSystem', [{ scene, world, rng }], null);
  combat = callFactory(createCombatSystem, 'createCombatSystem', [{ scene, player, police, rng }], null);
  traffic = new TrafficManager({ rng, scene, maxCars: 20, maxPedestrians: 24 });
  missions = createMissions({});
  try { input = createInput(); } catch (err) { input = null; }
  try { audio = createAudio(); } catch (err) { audio = null; }
  hud = createHud();
  shots = createShotStaging({ scene, world, player, police, combat, traffic, vehicle: vehicleSystem, missions, hud, game });

  if (player && player.mesh && player.mesh.parent !== scene) scene.add(player.mesh);
  try { if (traffic && typeof traffic.update === 'function') { traffic.update(STEP); traffic.update(STEP); } } catch (err) { /* ignore */ }

  const solmar = {
    get state() { return game.state; },
    get money() { return game.money; },
    get timeOfDay() { return game.timeOfDay; },
    player,
    police,
    traffic,
    combat,
    missions,
    world,
    config: CONFIG,
    scene,
    renderer,
    get camera() { return activeCamera; },
    get round6() { return world && world.round6; },
    project,
    get round13() { return buildRound13(); },
    input,
    audio,
    game,
    start: () => startPlaying(false),
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    stageShot,
  };
  if (typeof window !== 'undefined') window.__solmar = solmar;

  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', () => {
      try {
        if (typeof resizeRenderer === 'function') resizeRenderer(renderer, window.innerWidth, window.innerHeight);
        else if (renderer && typeof renderer.setSize === 'function') renderer.setSize(window.innerWidth, window.innerHeight);
        shotCam.aspect = window.innerWidth / window.innerHeight;
        shotCam.updateProjectionMatrix();
        freeCam.aspect = window.innerWidth / window.innerHeight;
        freeCam.updateProjectionMatrix();
      } catch (err) { /* ignore */ }
    });
    const startBtn = document.getElementById('start-button');
    if (startBtn) startBtn.addEventListener('click', () => startPlaying(false));
  }

  const SHOT_IDS = ['cover-chase', 'combat', 'pursuit', 'sunset'];
  const validShot = shotParam && SHOT_IDS.includes(shotParam) ? shotParam : null;
  if (validShot) {
    stageShot(validShot);
    game.state = 'playing';
    if (hud && typeof hud.hideStart === 'function') hud.hideStart();
  } else {
    game.state = 'menu';
    if (hud && typeof hud.showStart === 'function') hud.showStart();
    // Free-play hero car parked near the start for E-to-enter.
    try {
      const gt = createGT(40, -80, 0);
      game.heroCar = gt;
      if (gt && gt.mesh) scene.add(gt.mesh);
      if (player && typeof player.setPosition === 'function') player.setPosition(42, -78, 0);
    } catch (err) { /* ignore */ }
  }
  if (hud && typeof hud.update === 'function') hud.update(buildHudState());
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(frame);
}

export function startGame() {
  if (started) return;
  started = true;
  try {
    init();
  } catch (err) {
    if (typeof window !== 'undefined') {
      window.__solmar = { state: 'error', error: String(err && err.message ? err.message : err) };
    }
  }
}

if (typeof document !== 'undefined') startGame();
