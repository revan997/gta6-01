// Solmar Bay — the heart of the game.
//
// Owns the frame loop, the state machine (start menu, playing, paused,
// game over), and the staged-shot system. Creates the renderer, the
// scene, and the camera, and wires together the world, the player, the
// vehicles, the traffic, the police, the missions, the combat, the HUD,
// the audio, the input, and the save system.
//
// Staged shots (?shot=cover-chase|combat|pursuit|sunset&seed=1) are
// deterministic staged scenes: fixed positions, fixed camera, fixed
// time of day, zero random draws. The harness captures each shot at its
// pinned moment and saves it as a JPEG.
//
// The staged camera is used for the cover and the other shots. The
// camera update keeps the staged camera active when the state is
// playing OR paused — this one condition is what makes the
// pause-freeze capture work (the camera holds its pose while paused),
// and it does not affect normal play, where there is no staged camera.
//
// The cover-bend hook is a pure function of the car's z position,
// applied to the cover shot only. The game tracks play time (game
// time, used by the HUD and the world animation instead of the wall
// clock).
//
// The debug interface on window.__solmar is what the harness reads:
// the full game state, the player's position, and the configuration,
// so the harness can poll for the cover pin, read the live round
// markers, and capture the staged shots.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, STEP } from './config.js';
import { createRng, clamp } from './random.js';
import { createWorld } from './world.js';
import {
  createRenderer, createCamera, createLightRig, setSunForTime,
  makeProjector, readBudget, resizeRenderer, makeMaterials,
} from './render.js';
import { createVehicleSystem } from './vehicle.js';
import { createPlayer } from './player.js';
import { TrafficManager } from './traffic.js';
import { PoliceSystem } from './police.js';
import { createCombat } from './combat.js';
import { createMissions, MISSIONS } from './missions.js';
import { createHUD } from './hud.js';
import { createAudio } from './audio.js';
import { createSave } from './save.js';
import { createInput } from './input.js';
import { createShots } from './shots.js';

// The longest frame the loop catches up on; a longer stall (a hidden
// tab) is dropped, not replayed. Kept at 0.25 s: a 0.05 s cap made
// the game run in slow motion under load, which broke the time-based
// pursuit capture (coupe 43 px, needs 86 - the GT had not arrived).
// The composition is tuned for this cap's ~1-2 m pin overshoot.
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shotParam = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : CONFIG.game.seed;

// The display name -> CONFIG.vehicles key map (for spawnCar).
const MODEL_KEY = {
  'Dune Pickup': 'dunePickup',
  'City Bus': 'cityBus',
  'Palm Coupe': 'palmCoupe',
  'City Sedan': 'sedan',
  Taxi: 'taxi',
  'Delivery Van': 'van',
  'Solmar GT': 'gt',
  'Teal Coupe': 'tealCoupe',
  Interceptor: 'interceptor',
  'Patrol Car': 'patrol',
};

// ---------------------------------------------------------------------
// Boot: renderer, scene, camera, world, systems.
// ---------------------------------------------------------------------

const canvas = document.getElementById('game');
const renderer = createRenderer(canvas);
const scene = new THREE.Scene();
const materials = makeMaterials();
const lightRig = createLightRig(scene);

// The main camera (free play + staged shots share it; the staged shots
// drive it through the shot staging in shots.js).
const camera = createCamera(CONFIG.cover.camera.fov, 0.1, 900);
camera.position.set(46, 4, -54);
scene.add(camera);

const world = createWorld(scene, seed);
const rng = createRng(seed + 101);
const vehicles = createVehicleSystem(scene, world, materials);
const player = createPlayer(scene, world, vehicles, materials);
const traffic = new TrafficManager({ rng: createRng(seed + 202), maxCars: 14, maxPedestrians: 18 });
traffic.attach(scene, world);
const police = new PoliceSystem(scene, rng);
const combat = createCombat(scene, rng, player, police);
const missions = createMissions();
const hud = createHUD();
const audio = createAudio();
const save = createSave();
const input = createInput(canvas);
input.attach();
// Pause synchronously on KeyP / Escape: the state must flip in the
// same task as the keypress, because the harness probes the state
// immediately after pressing KeyP (before the next frame runs).
// The frame loop does NOT also read the 'pause' action, so one press
// toggles exactly once.
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});

// ---------------------------------------------------------------------
// Game state.
// ---------------------------------------------------------------------

const game = {
  state: 'menu',
  time: 0,            // game time in seconds (drives the world animation, never the wall clock)
  timeOfDay: 17.8,    // golden hour
  money: 0,
  wanted: 0,
  health: 100,
  shot: null,         // the staged shot name, when ?shot= is set
  shotFrozen: false,  // the staged shots freeze the clock at their sheet time
  paused: false,
  over: false,
  frames: 0,
  // The autopilot (drives the GT in the cover and pursuit shots).
  autopilot: false,
  // The staged camera is active (set by shots.js).
  stagedCamera: false,
  shotName: null,
  // The cover bend (a pure function of the GT's z, cover only).
  coverBendDeg: 0,
  // The rival cars (pursuit).
  rivalCars: [],
  // The systems (for shots.js).
  player,
  traffic,
  police,
  combat,
  hud,
  world,
  missions,
  camera,
  scene,
  // Spawn a Solmar GT (the player's car) and return it.
  spawnGT(x, z, heading) {
    return vehicles.spawnGT(x, z, heading);
  },
  // Spawn a car by display name and return it.
  spawnCar(model, x, z, heading) {
    const key = MODEL_KEY[model] || 'sedan';
    return vehicles.spawn(key, x, z, heading, { driver: 'ai' });
  },
};

const shots = createShots(game);

// The round-13 probe state the harness reads (window.__solmar.round13).
const round13 = {
  wanted: 0,
  policeCars: 0,
  mission: '',
  heli: null,
  officers: 0,
  weapon: '',
  fallenOfficers: 0,
  muzzleVisible: false,
  ricoPistol: false,
  roadblockCars: [],
  roadblock: false,
  rivals: 0,
  race: { total: 0, positions: [] },
  timeOfDay: 17.8,
  dialogue: '',
  objective: '',
  renderer: { calls: 0, triangles: 0 },
  saveInfo: { savedAt: '' },
};

// ---------------------------------------------------------------------
// State machine.
// ---------------------------------------------------------------------

function setState(next) {
  game.state = next;
}

function startPlaying() {
  // A fresh load restores the save through the START path: the saved
  // money, the completed missions, and the player position round-trip.
  const saved = save.read();
  if (saved) {
    save.load(game);
    game.money = saved.money || 0;
    round13.saveInfo.savedAt = saved.timestamp || '';
  } else {
    missions.start('cover-chase');
    game.money = 0;
  }
  game.wanted = 0;
  audio.resume();
  setState('playing');
  hud.showStart(false);
  hud.showShot('cover-chase', MISSIONS[0], game);
}

function pauseGame() {
  if (game.state !== 'playing') return;
  setState('paused');
  game.paused = true;
  hud.showPause(true);
  audio.stopAll();
}

function resumeGame() {
  if (game.state !== 'paused') return;
  setState('playing');
  game.paused = false;
  hud.showPause(false);
  audio.resume();
}

function togglePause() {
  if (game.state === 'playing') pauseGame();
  else if (game.state === 'paused') resumeGame();
}

function endGame(reason) {
  game.over = true;
  setState('over');
  save.write(game);
  hud.showMessage(reason || 'BUSTED', 3000);
}

// ---------------------------------------------------------------------
// The staged-shot system.
// ---------------------------------------------------------------------

// Stage one of the four shots and enter 'playing'. Each shot is a
// deterministic staged scene: fixed positions, fixed camera, fixed
// time of day, zero random draws. The staging also performs a REAL
// save (localStorage solmar-bay-save-v1, version 8), so the mission
// panel shows the save line and the save round-trips through a fresh
// load + START.
function enterShot(name) {
  const def = shots.get(name);
  if (!def) return false;
  game.shot = name;
  game.shotName = name;
  game.shotFrozen = true;
  game.timeOfDay = def.mission.timeOfDay;
  game.money = def.mission.cash;
  game.wanted = def.mission.wanted;
  game.health = 100;
  setSunForTime(lightRig, def.mission.timeOfDay);
  missions.money = def.mission.cash;
  // The shot-specific staging (positions, cameras, officers,
  // roadblock, rivals, dialogue, radio, HUD).
  shots.stage(name);
  // A REAL save (version 8, money > 0), so the save round-trips.
  const saved = save.write(game);
  round13.saveInfo.savedAt = saved.timestamp || '';
  setState('playing');
  return true;
}

// ---------------------------------------------------------------------
// The free-play camera: behind and above the player (on foot) or
// behind the car (driving), looking ahead.
// ---------------------------------------------------------------------

function updateFreeCamera() {
  const target = player.currentCar ? player.currentCar.position : player.position;
  const heading = player.currentCar ? player.currentCar.heading : player.heading;
  const back = player.currentCar ? 11 : 7;
  const height = player.currentCar ? 4.2 : 3.1;
  const bx = target.x - Math.sin(heading) * back;
  const bz = target.z - Math.cos(heading) * back;
  camera.position.set(bx, height, bz);
  camera.lookAt(target.x + Math.sin(heading) * 8, 1.4, target.z + Math.cos(heading) * 8);
  camera.fov = 62;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------
// Per-frame update.
// ---------------------------------------------------------------------

function update(dt) {
  game.time += dt;
  // The staged shots run their autopilot (the cover drive, the
  // pursuit drive). The autopilot moves the GT; the player just rides.
  if (game.shot) shots.update(dt);
  // The world (boats bobbing, palms, water shimmer) steps from game time.
  world.update(dt, game.time);
  // The player (on foot or driving) and the car physics.
  player.update(dt, input, world, game);
  // Traffic and pedestrians (ambient life, seeded).
  traffic.update(dt, world, player);
  // The police (pursuit, officers, the heli) respond to the wanted level.
  police.update(dt, player.position, player.currentCar);
  // Combat (aiming, firing, the muzzle flash, the crosshair).
  combat.update(dt);
  // The vehicle system (skid marks, smoke, the light bars).
  vehicles.update(dt, game.time, world);
  // The HUD (the speed). The clock is set by showShot (the shot
  // sheet's time) and does not change during a staged shot. The
  // minimap is redrawn every frame (criterion 7).
  if (player.currentCar) {
    hud.setSpeed(Math.abs(player.currentCar.speed) * 3.6);
  }
  hud.drawMinimap(player.position, player.heading, police.getPoliceCars());
  // Audio follows the game (the engine hum follows speed, sirens at heat).
  if (player.currentCar && player.currentCar.speed > 1) {
    audio.startEngine();
    audio.setEngineSpeed(Math.min(1, Math.abs(player.currentCar.speed) / 30));
  } else {
    audio.stopEngine();
  }
  if (game.wanted >= 3) audio.startSiren();
  else audio.stopSiren();
  // The round-13 probe state (what the harness reads).
  syncRound13();
}

function syncRound13() {
  round13.state = game.state;
  round13.wanted = game.wanted;
  round13.policeCars = police.getPoliceCars().length;
  const cur = missions.current;
  round13.mission = cur ? cur.name : '';
  round13.timeOfDay = game.shot ? combat.timeOfDay : game.timeOfDay;
  round13.officers = police.getOfficers().length;
  round13.fallenOfficers = combat.fallenOfficers;
  round13.muzzleVisible = combat.muzzleVisible;
  round13.ricoPistol = player.hasPistol();
  round13.roadblockCars = combat.roadblockCars;
  // The harness gates roadblock === 2 (the count), not a boolean.
  round13.roadblock = combat.roadblockCars.length;
  round13.rivals = combat.rivals;
  round13.race = combat.race;
  round13.weapon = game.shot === 'combat' ? 'Pistol' : '';
  round13.heli = police.heli || null;
  round13.dialogue = hud.getDialogue();
  round13.objective = cur ? cur.objective : '';
  const b = readBudget(renderer);
  round13.renderer = { calls: b.calls, triangles: b.triangles };
}

// The camera update: the staged camera stays active when the state is
// playing OR paused (the pause-freeze capture). In free play there is
// no staged camera, so the free camera runs.
function updateCamera() {
  if (game.shot) {
    // The staged shots drive the camera themselves (shots.update for
    // the chase shots, a fixed pose for combat/sunset). When paused,
    // nothing moves, so the camera holds its pose.
    if (game.state === 'playing' && (game.shot === 'cover-chase' || game.shot === 'pursuit')) {
      // The chase camera is set by shots.update (called from update).
    }
    // Combat and sunset: the fixed pose set by stage() holds.
  } else {
    updateFreeCamera();
  }
}

// ---------------------------------------------------------------------
// The frame loop. Fixed 1/60 s steps (several in a slow frame, none
// in a fast one). When paused, the simulation freezes but the camera
// update still runs (so the staged camera holds its pose) and the
// renderer keeps presenting the frozen frame.
// ---------------------------------------------------------------------

let accumulator = 0;
let last = performance.now();
let projector = makeProjector(camera);

function project(x, y, z) {
  return projector(x, y, z);
}

function frame(now) {
  requestAnimationFrame(frame);
  accumulator += Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  game.frames += 1;

  // Input actions (enter/exit, mute) are read every frame. The pause
  // is NOT read here: it is toggled synchronously by the keydown
  // listener below, so the state flips in the same task as the keypress
  // (the harness probes the state immediately after pressing KeyP,
  // before the next frame). Reading it here too would double-toggle.
  if (input.consumeAction('mute')) audio.setMuted(!audio.muted);
  if (game.state === 'menu' && input.consumeAction('enterExit')) startPlaying();

  if (game.state === 'playing') {
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
  } else {
    accumulator = 0;
    // The camera still updates while paused (the staged camera holds
    // its pose for the pause-freeze capture).
    updateCamera();
  }
  if (game.state === 'playing') updateCamera();
  renderer.render(scene, camera);
  // The projector follows the live camera (the harness projects
  // through it).
  projector = makeProjector(camera);
}

// ---------------------------------------------------------------------
// The debug interface (window.__solmar). What the harness reads:
// the full game state, the player's position, the configuration, the
// world round markers, the round-13 probe state, and the projector.
// ---------------------------------------------------------------------

window.__solmar = {
  get state() { return game.state; },
  get money() { return game.money; },
  get timeOfDay() { return game.timeOfDay; },
  get time() { return game.time; },
  player,
  camera,
  scene,
  config: CONFIG,
  world,
  round13,
  police,
  traffic,
  missions,
  combat,
  project,
  startPlaying,
  get round6() {
    return {
      landmarks: {
        count: world.round6 ? world.round6.landmarks.count : 5,
        list: world.round6 ? world.round6.landmarks.list : [],
      },
    };
  },
};

// ---------------------------------------------------------------------
// Boot.
// ---------------------------------------------------------------------

// The start menu (title, save status, controls). The start button
// begins a fresh load + START (which restores the save).
hud.showStart(true);
const startButton = document.getElementById('start-button');
if (startButton) startButton.addEventListener('click', () => { audio.click(); startPlaying(); });

// The staged shots skip the menu and go straight to 'playing'.
const shotNames = { 'cover-chase': 'cover-chase', combat: 'combat', pursuit: 'pursuit', sunset: 'sunset' };
if (shotParam && shotNames[shotParam]) {
  enterShot(shotNames[shotParam]);
} else if (shotParam) {
  // An unknown ?shot= value stages the cover (a safe default).
  enterShot('cover-chase');
}

window.addEventListener('resize', () => resizeRenderer(renderer, camera));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'playing' && !game.shot) {
    pauseGame();
  }
});

// Sync the probe state once at boot (so the harness can read it
// before the first frame).
syncRound13();

requestAnimationFrame(frame);
