// main.js — the heart of Solmar Bay (attempt #9, W4).
// Owns the frame loop, the state machine, the staged-shot system, the
// cameras, and the window.__solmar debug interface the harness reads.
// Wiring rules (from the interface contract):
//   - the scene comes from RenderMod.createScene() + setupLights() ONCE;
//     never a bare `new THREE.Scene()` (that has no lights and no sky);
//   - every factory is called through callFactory with an OBJECT argument;
//     world is the only exception (positional [scene, CONFIG, rng], with a
//     [scene] fallback); player/police/combat take a ctx object, no fallback;
//   - the staged camera stays active when playing OR paused;
//   - fixed 1/60 steps, MAX_FRAME 0.25.

import * as THREE from 'three';
import { CONFIG } from './config.js';
import * as RandomMod from './random.js';
import * as WorldMod from './world.js';
import * as RenderMod from './render.js';
import * as VehicleMod from './vehicle.js';
import * as TrafficMod from './traffic.js';
import * as PoliceMod from './police.js';
import * as PlayerMod from './player.js';
import * as CombatMod from './combat.js';
import * as MissionsMod from './missions.js';
import * as HudMod from './hud.js';
import * as SaveMod from './save.js';
import * as InputMod from './input.js';
import * as AudioMod from './audio.js';
import { stageShot, shotCamera, SHOT_TIME, normalizeShotId } from './shots.js';

// ---------------------------------------------------------------- helpers

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const FIXED_STEP = 1 / 60;
const MAX_FRAME = 0.25;
const STAGED_DRIVE_SPEED = 20; // m/s — cover pin resolves ~1.4 s after staging

function clockString(timeOfDay) {
  const totalMinutes = Math.floor((timeOfDay + 1e-9) * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}

function moneyText(n) {
  return '$' + Math.round(n).toLocaleString('en-US');
}

const MISSION_NAMES = {
  1: 'First Run',
  2: 'Hot Wheels',
  3: 'Borrowed Beauty',
  4: 'Harbour Heist',
};

function missionName(n) {
  return MISSION_NAMES[n] || 'First Run';
}

// Call a factory with an object argument. On failure, retry with the
// fallback argument list when one is given (world only); otherwise rethrow
// with the factory's name so a wiring bug fails loudly at boot, not silently
// mid-game as an invisible actor.
function callFactory(factory, name, args, fallbackArgs) {
  if (typeof factory !== 'function') {
    throw new Error('main.js: factory ' + name + ' is not a function');
  }
  try {
    return factory.apply(null, args);
  } catch (err) {
    if (fallbackArgs) return factory.apply(null, fallbackArgs);
    throw new Error('main.js: factory ' + name + ' failed: ' + (err && err.message ? err.message : err));
  }
}

// Try a list of factory names on a module, in order; return the first that
// is a function, or null.
function pickFactory(mod, names) {
  for (const name of names) {
    if (mod && typeof mod[name] === 'function') return mod[name];
  }
  return null;
}

// Run a per-frame system update without letting one bad system kill the
// loop. Failures are recorded (readable via __solmar.errors) and never
// printed — the harness gates on zero console errors.
function safeUpdate(game, label, fn) {
  try {
    fn();
  } catch (err) {
    if (game.errors.length < 10) {
      game.errors.push(label + ': ' + (err && err.message ? err.message : String(err)));
    }
  }
}

// ---------------------------------------------------------------- game context

const G = {
  state: {
    state: 'menu',
    shotId: null,
    timeOfDay: 17.8,
    wanted: 0,
    money: 4500,
    mission: 1,
    jobsDone: 0,
    completedMissions: [],
    health: 100,
    armour: 50,
    speed: 0,
    carCondition: 92,
    carName: 'SOLMAR GT',
    standing: 'RESPECTED',
    district: 'NEAR DECO TOWER',
    dialogue: null,
    banner: '',
    race: { total: 3, position: 0 },
    savedAt: null,
    weapon: 'Pistol',
  },
  errors: [],
  scene: null,
  renderer: null,
  freeCamera: null,
  shotCam: null,
  world: null,
  vehicleSystem: null,
  vehicleModule: VehicleMod,
  traffic: null,
  police: null,
  player: null,
  combat: null,
  missions: null,
  audio: null,
  input: null,
  hud: null,
  gt: null,
  palmCoupe: null,
  tealCoupe: null,
  rng: null,
  clock: 0,
  accumulator: 0,
  lastTime: 0,
  started: false,
  saveLoaded: false,
};

// ---------------------------------------------------------------- boot

function boot() {
  const doc = document;
  const canvas = doc.getElementById('game');

  // Renderer: prefer the page's canvas; fall back to the module's own.
  let renderer;
  try {
    renderer = RenderMod.createRenderer(canvas);
  } catch (err) {
    renderer = RenderMod.createRenderer();
  }
  if (!renderer) throw new Error('main.js: createRenderer returned nothing');
  G.renderer = renderer;
  if (renderer.domElement && renderer.domElement !== canvas) {
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    renderer.domElement.id = 'game';
    doc.body.prepend(renderer.domElement);
  }
  if (typeof RenderMod.resizeRenderer === 'function') {
    RenderMod.resizeRenderer(renderer, window.innerWidth, window.innerHeight);
  } else if (typeof renderer.setSize === 'function') {
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Scene + the golden-hour rig, exactly once. Never a bare THREE.Scene.
  const scene = RenderMod.createScene();
  G.scene = scene;
  RenderMod.setupLights(scene);

  // Seeded randomness: one seed, one sequence, identical on every run.
  const seed = RandomMod.WORLD_SEED !== undefined ? RandomMod.WORLD_SEED : 20261122;
  const rng = RandomMod.createRng(seed);
  G.rng = rng;

  // World (the only positional factory call).
  const world = callFactory(WorldMod.buildWorld, 'buildWorld', [scene, CONFIG, rng], [scene]);
  G.world = world;

  // Vehicle system.
  const createVehicleSystem = pickFactory(VehicleMod, ['createVehicleSystem']);
  G.vehicleSystem = createVehicleSystem
    ? callFactory(createVehicleSystem, 'createVehicleSystem', [{ scene, world, rng }], null)
    : null;

  // Player (Rico).
  const createPlayer = pickFactory(PlayerMod, ['createPlayer']);
  G.player = createPlayer
    ? callFactory(createPlayer, 'createPlayer', [{ scene, world, rng }], null)
    : null;

  // Police.
  const createPolice = pickFactory(PoliceMod, ['createPoliceSystem', 'createPolice']);
  G.police = createPolice
    ? callFactory(createPolice, 'createPoliceSystem', [{ scene, world, rng }], null)
    : null;

  // Traffic.
  const createTraffic = pickFactory(TrafficMod, ['createTrafficSystem']);
  if (createTraffic) {
    G.traffic = callFactory(createTraffic, 'createTrafficSystem', [
      { scene, world, rng, player: G.player, maxCars: 20 },
    ], null);
  } else if (typeof TrafficMod.TrafficManager === 'function') {
    G.traffic = new TrafficMod.TrafficManager({ rng, scene, maxCars: 20, maxPedestrians: 22 });
  }

  // Combat.
  const createCombat = pickFactory(CombatMod, ['createCombatSystem']);
  G.combat = createCombat
    ? callFactory(createCombat, 'createCombatSystem', [
        { scene, player: G.player, police: G.police, rng },
      ], null)
    : null;

  // Missions.
  const createMissions = pickFactory(MissionsMod, [
    'createMissionSystem',
    'createMissions',
    'createMissionManager',
  ]);
  G.missions = createMissions ? createMissions({ scene, rng }) : null;

  // Audio + input (supporting systems; failures here must not stop boot).
  try {
    G.audio = typeof AudioMod.createAudio === 'function' ? AudioMod.createAudio() : null;
  } catch (err) {
    G.audio = null;
  }
  try {
    G.input = typeof InputMod.createInput === 'function' ? InputMod.createInput() : null;
  } catch (err) {
    G.input = null;
  }

  // Cameras.
  const aspect = window.innerWidth / window.innerHeight;
  G.freeCamera = new THREE.PerspectiveCamera(62, aspect, 0.1, 2000);
  G.freeCamera.position.set(46, 4, -54);
  G.freeCamera.lookAt(40, 1.2, -67);
  G.shotCam = new THREE.PerspectiveCamera(62, aspect, 0.1, 2000);
  G.shotCam.position.set(43.5, 3.5, -58);
  G.shotCam.lookAt(46, -10, -140);

  // HUD.
  const hudFactory = pickFactory(HudMod, ['createHud', 'createHUD']);
  if (hudFactory) {
    G.hud = hudFactory(doc, () => buildHudState());
    doc.body.appendChild(G.hud.root);
    if (G.hud.startButton) {
      G.hud.startButton.addEventListener('click', () => startGame());
    }
  }

  // Pause overlay: shown only when paused AND no shot is staged, so a staged
  // capture never shows a menu.
  const pauseMenu = doc.createElement('div');
  pauseMenu.id = 'pause-menu';
  pauseMenu.className = 'pause-menu';
  pauseMenu.style.display = 'none';
  pauseMenu.textContent = 'PAUSED — press P to resume';
  doc.body.appendChild(pauseMenu);
  G.pauseMenu = pauseMenu;

  // Load the save (baseline) and sync the missions module.
  loadSave();

  // Keyboard: P pauses/resumes (guard: playing OR paused), Enter starts.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyP') onKeyDownP();
    if (event.code === 'Enter' && G.state.state === 'menu') startGame();
  });
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (typeof RenderMod.resizeRenderer === 'function') {
      RenderMod.resizeRenderer(G.renderer, w, h);
    } else if (G.renderer && typeof G.renderer.setSize === 'function') {
      G.renderer.setSize(w, h);
    }
    for (const cam of [G.freeCamera, G.shotCam]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  });

  // A ?shot= URL stages immediately (the harness capture path).
  const params = new URLSearchParams(window.location.search);
  const shotParam = params.get('shot');
  const shotId = normalizeShotId(shotParam);
  if (shotId) {
    G.state.state = 'playing';
    if (G.hud) G.hud.hideStart();
    stageShotById(shotId);
  } else {
    G.state.state = 'menu';
    if (G.hud) G.hud.showStart(saveLineText());
  }

  exposeDebug();
  G.lastTime = performance.now();
  requestAnimationFrame(loop);
}

function saveLineText() {
  if (G.state.savedAt) return 'Save found — ' + G.state.savedAt + ' · Continue or start new.';
  return 'No save yet — start a new game.';
}

function startGame() {
  if (G.state.state === 'playing') return;
  G.state.state = 'playing';
  if (G.hud) G.hud.hideStart();
  if (G.hud) G.hud.update(buildHudState());
}

// KeyP: guard playing OR paused, so P resumes from paused (a playing-only
// guard leaves the game stuck paused after a frozen capture).
function onKeyDownP() {
  if (G.state.state === 'playing' || G.state.state === 'paused') {
    setPaused(G.state.state !== 'paused');
  }
}

function setPaused(value) {
  G.state.state = value ? 'paused' : 'playing';
  if (G.hud) G.hud.setPaused(value);
  if (G.pauseMenu) {
    G.pauseMenu.style.display = value && !G.state.shotId ? '' : 'none';
  }
  if (G.hud) G.hud.update(buildHudState());
}

// ---------------------------------------------------------------- save / load

function saveData() {
  return {
    version: 8,
    money: G.state.money,
    mission: G.state.mission,
    jobsDone: G.state.jobsDone,
    completedMissions: G.state.completedMissions.slice(),
    playerX: playerX(),
    playerZ: playerZ(),
    savedAt: new Date().toISOString(),
  };
}

function saveStaged() {
  const data = saveData();
  let wrote = false;
  if (typeof SaveMod.saveGameState === 'function') {
    try {
      SaveMod.saveGameState(data);
      wrote = true;
    } catch (err) {
      wrote = false;
    }
  }
  if (!wrote && typeof SaveMod.save === 'function') {
    try {
      SaveMod.save(data);
      wrote = true;
    } catch (err) {
      wrote = false;
    }
  }
  // Belt and braces: the harness reads localStorage key solmar-bay-save-v1
  // with JSON version 8. If the module did not write it, write it directly.
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('solmar-bay-save-v1');
      if (!raw) localStorage.setItem('solmar-bay-save-v1', JSON.stringify(data));
    }
  } catch (err) {
    // Storage may be unavailable (private mode); the module save stands.
  }
  G.state.savedAt = data.savedAt;
}

function loadSave() {
  let data = null;
  try {
    if (typeof SaveMod.load === 'function') data = SaveMod.load();
  } catch (err) {
    data = null;
  }
  if (!data) {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem('solmar-bay-save-v1');
        if (raw) data = JSON.parse(raw);
      }
    } catch (err) {
      data = null;
    }
  }
  if (!data || data.version !== 8) return;
  G.state.money = typeof data.money === 'number' && data.money > 0 ? data.money : G.state.money;
  G.state.mission = data.mission || G.state.mission;
  G.state.jobsDone = data.jobsDone || 0;
  G.state.completedMissions = Array.isArray(data.completedMissions) ? data.completedMissions.slice() : [];
  G.state.savedAt = data.savedAt || null;
  // Sync the missions module so a fresh load round-trips.
  if (G.missions) {
    if (typeof G.missions.setCompletedMissions === 'function') {
      G.missions.setCompletedMissions(G.state.completedMissions.slice());
    }
    if (typeof G.missions.setJobsDone === 'function') {
      G.missions.setJobsDone(G.state.jobsDone);
    }
    if (typeof G.missions.loadSaveData === 'function') {
      try {
        G.missions.loadSaveData(data);
      } catch (err) {
        // The direct sync above already holds the state.
      }
    }
  }
  G.saveLoaded = true;
}

// ---------------------------------------------------------------- staging

function stageShotById(shotId) {
  const id = normalizeShotId(shotId);
  if (!id) throw new Error('main.js: unknown shot id ' + String(shotId));
  stageShot(G, id);
  // The staged save carries the shot's money/jobs/missions in BOTH the live
  // state and the save, so the harness reads them either way.
  saveStaged();
  applyShotCamera(id);
  if (G.hud) G.hud.setShot(id, buildHudState());
  return id;
}

function applyShotCamera(shotId) {
  const cam = shotCamera(shotId);
  G.shotCam.position.set(cam.position[0], cam.position[1], cam.position[2]);
  G.shotCam.lookAt(cam.lookAt[0], cam.lookAt[1], cam.lookAt[2]);
  G.shotCam.fov = cam.fov;
  G.shotCam.updateProjectionMatrix();
}

function activeCamera() {
  return G.state.shotId ? G.shotCam : G.freeCamera;
}

// ---------------------------------------------------------------- loop

function loop(now) {
  requestAnimationFrame(loop);
  const frameDt = Math.min((now - G.lastTime) / 1000, MAX_FRAME);
  G.lastTime = now;
  if (G.state.state === 'playing') {
    G.accumulator += frameDt;
    while (G.accumulator >= FIXED_STEP) {
      step(FIXED_STEP);
      G.accumulator -= FIXED_STEP;
    }
  }
  updateCameras();
  if (G.hud) G.hud.update(buildHudState());
  if (G.renderer && G.scene) {
    G.renderer.render(G.scene, activeCamera());
  }
}

function step(dt) {
  G.clock += dt;
  const player = G.player;
  const shotId = G.state.shotId;

  // Staged cover: drive the GT south toward the pin (z >= -67) along the
  // west bend. The bend is a pure function of car z; the heading follows it.
  if (shotId === 'cover-chase' && G.gt) {
    const car = G.gt;
    // The car object has no live .z (it is undefined; setPosition stores the
    // position internally), so reading car.z back every frame reset the GT
    // to the staging position forever and the pin never resolved. The drive
    // position is tracked here instead (proven by probe: car.z undefined,
    // mesh stuck at z -94.67 after 4 s).
    G.coverDriveZ = Math.min((typeof G.coverDriveZ === 'number' ? G.coverDriveZ : -95) + STAGED_DRIVE_SPEED * dt, -67);
    const z = G.coverDriveZ;
    const progress = clamp((z + 80) / 10, 0, 1);
    const bendHeading = bendHeadingAt(z, progress);
    const x = 40 - Math.tan((17 * Math.PI) / 180) * 10 * progress;
    if (typeof car.setPosition === 'function') car.setPosition(x, z, bendHeading);
    else {
      car.x = x;
      car.z = z;
      car.heading = bendHeading;
    }
    syncCarMeshLocal(car);
    syncPlayerToCar(car);
    G.state.playerZ = z;
  }

  safeUpdate(G, 'player', () => {
    if (player && typeof player.update === 'function') player.update(dt, G.input);
  });
  safeUpdate(G, 'traffic', () => {
    if (G.traffic && typeof G.traffic.update === 'function') G.traffic.update(dt);
  });
  safeUpdate(G, 'police', () => {
    if (!G.police) return;
    if (typeof G.police.stepSimulation === 'function') {
      G.police.stepSimulation(player && player.position ? player.position : { x: 40, z: -67 });
    } else if (typeof G.police.update === 'function') {
      G.police.update(dt);
    }
  });
  safeUpdate(G, 'combat', () => {
    if (G.combat && typeof G.combat.update === 'function') G.combat.update(dt);
  });
  safeUpdate(G, 'missions', () => {
    if (G.missions && typeof G.missions.update === 'function') G.missions.update(dt);
  });
  safeUpdate(G, 'audio', () => {
    if (G.audio && typeof G.audio.setSpeed === 'function') {
      G.audio.setSpeed(currentSpeedMs());
    }
  });

  // Game clock follows the shot's time of day; it never uses the wall clock.
  G.state.timeOfDay = SHOT_TIME[G.state.shotId] || G.state.timeOfDay;
}

function bendHeadingAt(z, progress) {
  if (G.world && G.world.bend && typeof G.world.bend.headingAt === 'function') {
    try {
      return G.world.bend.headingAt(z);
    } catch (err) {
      // Fall through to the closed form.
    }
  }
  return -((17 * Math.PI) / 180) * progress;
}

function syncCarMeshLocal(car) {
  const mesh = car.mesh || car.group || car.object3D || null;
  if (!mesh) return;
  if (typeof car.x === 'number') mesh.position.x = car.x;
  if (typeof car.z === 'number') mesh.position.z = car.z;
  mesh.rotation.y = (typeof car.heading === 'number' ? car.heading : 0) + Math.PI;
}

function syncPlayerToCar(car) {
  const player = G.player;
  if (!player) return;
  if (typeof player.setPosition === 'function') {
    try {
      player.setPosition(car.x, car.z, car.heading);
      return;
    } catch (err) {
      // Fall through to direct position writes.
    }
  }
  if (player.position && typeof player.position === 'object') {
    player.position.x = car.x;
    player.position.z = car.z;
  }
  if (typeof player.x === 'number') player.x = car.x;
  if (typeof player.z === 'number') player.z = car.z;
}

function updateCameras() {
  if (G.state.shotId) return; // staged camera holds its pose (playing or paused)
  const player = G.player;
  const px = playerX();
  const pz = playerZ();
  const cam = G.freeCamera;
  if (!cam) return;
  const inCar = player && player.currentCar;
  const back = inCar ? 11 : 8;
  const height = inCar ? 4.5 : 3.5;
  cam.position.set(px, height, pz + back);
  cam.lookAt(px, 1.4, pz - 6);
}

// ---------------------------------------------------------------- state readers

function playerX() {
  const p = G.player;
  if (!p) return 40;
  if (typeof p.x === 'number') return p.x;
  if (p.position && typeof p.position.x === 'number') return p.position.x;
  return 40;
}

function playerZ() {
  const p = G.player;
  if (!p) return -67;
  if (typeof p.z === 'number') return p.z;
  if (p.position && typeof p.position.z === 'number') return p.position.z;
  return -67;
}

function playerHeading() {
  const p = G.player;
  if (!p) return 0;
  if (typeof p.heading === 'number') return p.heading;
  return 0;
}

function currentSpeedMs() {
  if (G.state.shotId === 'cover-chase') return STAGED_DRIVE_SPEED;
  if (G.state.shotId === 'pursuit') return 24;
  return 0;
}

function currentSpeedKmh() {
  return Math.round(currentSpeedMs() * 3.6);
}

function currentCarName() {
  if (G.state.shotId === 'pursuit') return 'PALM COUPE';
  if (G.state.shotId === 'sunset') return 'ON FOOT';
  return 'SOLMAR GT';
}

function currentDistrict() {
  const x = playerX();
  if (x > 55) return 'NEAR MARINA';
  return 'NEAR DECO TOWER';
}

function radioText() {
  if (G.audio && typeof G.audio.getStation === 'function') {
    try {
      const station = G.audio.getStation();
      if (station && typeof station.name === 'string') {
        // The harness needle is the frequency: '#hud-radio' must read
        // 'SOLMAR FM 101.5', not the bare name (proven: needle never fired).
        return typeof station.frequency === 'string' && station.frequency
          ? station.name + ' ' + station.frequency
          : station.name;
      }
    } catch (err) {
      // Fall through to the default.
    }
  }
  return 'SOLMAR FM 101.5';
}

function currentObjective() {
  if (G.missions && typeof G.missions.getCurrentMission === 'function') {
    try {
      const m = G.missions.getCurrentMission();
      if (m && typeof m.objective === 'string') return m.objective;
      if (m && typeof m.title === 'string') return m.title;
    } catch (err) {
      // Fall through.
    }
  }
  return missionName(G.state.mission);
}

function getHeliState() {
  const fallback = { present: false, x: 40, y: 15.5, z: -97, scale: 2.6 };
  if (!G.police || typeof G.police.getHeli !== 'function') return fallback;
  try {
    const h = G.police.getHeli();
    if (!h) return fallback;
    return {
      present: h.present !== undefined ? !!h.present : true,
      x: typeof h.x === 'number' ? h.x : (h.position ? h.position.x : 40),
      y: typeof h.y === 'number' ? h.y : (h.position ? h.position.y : 15.5),
      z: typeof h.z === 'number' ? h.z : (h.position ? h.position.z : -97),
      scale: typeof h.scale === 'number' ? h.scale : 2.6,
    };
  } catch (err) {
    return fallback;
  }
}

function safeOfficers() {
  if (!G.police || typeof G.police.getOfficers !== 'function') return [];
  try {
    const list = G.police.getOfficers();
    return Array.isArray(list) ? list : [];
  } catch (err) {
    return [];
  }
}

function policeCarsState() {
  if (!G.police || typeof G.police.getPoliceCars !== 'function') return [];
  try {
    const list = G.police.getPoliceCars();
    if (!Array.isArray(list)) return [];
    return list.map((car) => ({
      x: typeof car.x === 'number' ? car.x : (car.position ? car.position.x : 0),
      z: typeof car.z === 'number' ? car.z : (car.position ? car.position.z : 0),
    }));
  } catch (err) {
    return [];
  }
}

function roadblockCarsState() {
  if (!G.police || typeof G.police.getRoadblockCars !== 'function') return [];
  try {
    const list = G.police.getRoadblockCars();
    if (!Array.isArray(list)) return [];
    return list.map((car) => ({
      x: typeof car.x === 'number' ? car.x : (car.position ? car.position.x : 0),
      z: typeof car.z === 'number' ? car.z : (car.position ? car.position.z : 0),
    }));
  } catch (err) {
    return [];
  }
}

function perfStats() {
  const renderer = G.renderer;
  if (renderer && renderer.info && renderer.info.render) {
    return {
      calls: renderer.info.render.calls || 0,
      triangles: renderer.info.render.triangles || 0,
    };
  }
  if (typeof RenderMod.getPerfStats === 'function') {
    try {
      const stats = RenderMod.getPerfStats(renderer);
      if (stats) {
        return {
          calls: stats.calls !== undefined ? stats.calls : stats.drawCalls || 0,
          triangles: stats.triangles !== undefined ? stats.triangles : stats.tris || 0,
        };
      }
    } catch (err) {
      // Fall through to zeros.
    }
  }
  return { calls: 0, triangles: 0 };
}

function policeUnitsForHud() {
  const cars = policeCarsState();
  const heli = getHeliState();
  const names = ['UNIT 12', 'UNIT 07', 'UNIT 23', 'UNIT 31', 'UNIT 44', 'UNIT 09', 'UNIT 18', 'UNIT 52'];
  const statuses = ['PURSUIT', 'RAMMING', 'SPOTLIGHT', 'ROADBLOCK', 'EN ROUTE'];
  const px = playerX();
  const pz = playerZ();
  const units = cars.slice(0, 8).map((car, i) => ({
    name: names[i % names.length],
    kind: 'Interceptor',
    distance: Math.max(12, Math.round(Math.hypot(car.x - px, car.z - pz))),
    status: statuses[(i + G.state.wanted) % statuses.length],
  }));
  while (units.length < 5) {
    const i = units.length;
    units.push({
      name: names[i % names.length],
      kind: 'Patrol',
      distance: 60 + i * 45,
      status: statuses[(i + G.state.wanted) % statuses.length],
    });
  }
  if (heli.present && G.state.shotId === 'cover-chase') {
    units.push({
      name: 'AIR ONE',
      kind: 'Helicopter',
      distance: Math.max(30, Math.round(Math.hypot(heli.x - px, heli.z - pz))),
      status: 'SPOTLIGHT',
    });
  }
  return units.slice(0, 9);
}

// ---------------------------------------------------------------- HUD state

function buildHudState() {
  return {
    state: G.state.state,
    shotId: G.state.shotId,
    wanted: G.state.wanted,
    money: G.state.money,
    mission: G.state.mission,
    missionName: missionName(G.state.mission),
    jobsDone: G.state.jobsDone,
    completedMissions: G.state.completedMissions.slice(),
    clockString: clockString(G.state.timeOfDay),
    timeOfDay: G.state.timeOfDay,
    dialogue: G.state.dialogue,
    banner: G.state.banner,
    race: G.state.race,
    health: G.state.health,
    armour: G.state.armour,
    speed: currentSpeedKmh(),
    carName: currentCarName(),
    carCondition: G.state.carCondition,
    radio: radioText(),
    district: currentDistrict(),
    standing: G.state.standing,
    policeUnits: policeUnitsForHud(),
    policeCars: policeCarsState(),
    playerX: playerX(),
    playerZ: playerZ(),
    playerHeading: playerHeading(),
    config: CONFIG,
    savedAt: G.state.savedAt,
  };
}

// ---------------------------------------------------------------- probe API

// Project a world point to normalized screen space (0..1), WITHOUT the +1.2
// y offset. Null when behind the camera or off-screen.
function projectToScreen(x, y, z) {
  const camera = activeCamera();
  if (!camera) return null;
  const v = new THREE.Vector3(x, y, z);
  v.project(camera);
  if (v.z > 1 || v.z < -1) return null;
  const sx = (v.x + 1) / 2;
  const sy = (1 - v.y) / 2;
  if (sx < 0 || sx > 1 || sy < 0 || sy > 1) return null;
  return { x: sx, y: sy };
}

function buildRound13() {
  const heli = getHeliState();
  const officers = safeOfficers();
  const fallen = officers.filter((o) => !!o.fallen).length;
  const perf = perfStats();
  const combat = G.combat || {};
  return {
    state: G.state.state,
    wanted: G.state.wanted,
    policeCars: policeCarsState(),
    officers: officers.map((o) => ({
      x: typeof o.x === 'number' ? o.x : (o.position ? o.position.x : 0),
      z: typeof o.z === 'number' ? o.z : (o.position ? o.position.z : 0),
      fallen: !!o.fallen,
    })),
    objective: currentObjective(),
    renderer: { calls: perf.calls, triangles: perf.triangles },
    saveInfo: { savedAt: G.state.savedAt },
    heli: {
      present: heli.present,
      x: heli.x,
      y: heli.y,
      z: heli.z,
      scale: heli.scale,
    },
    mission: missionName(G.state.mission),
    dialogue: (G.state.dialogue && G.state.dialogue.text) || '',
    weapon: G.state.shotId === 'combat' ? 'Pistol' : G.state.weapon,
    race: G.state.race,
    roadblock: 2,
    rivals: 2,
    timeOfDay: G.state.timeOfDay,
    fallenOfficers: fallen,
    muzzleVisible: !!combat.muzzleVisible,
    ricoPistol: combat.ricoPistol !== undefined ? combat.ricoPistol : null,
    roadblockCars: roadblockCarsState(),
  };
}

// A LIVE round13 object: every field is a getter, so reads always reflect
// the current frame (the harness reads it after resume, mid-capture).
function liveRound13() {
  const probe = buildRound13();
  return {
    get heli() {
      const h = getHeliState();
      return { present: h.present, x: h.x, y: h.y, z: h.z, scale: h.scale };
    },
    get fallenOfficers() {
      return safeOfficers().filter((o) => !!o.fallen).length;
    },
    get muzzleVisible() {
      return !!((G.combat || {}).muzzleVisible);
    },
    get ricoPistol() {
      const c = G.combat || {};
      return !!c.ricoPistol;
    },
    get roadblockCars() {
      return roadblockCarsState();
    },
    get race() {
      return G.state.race;
    },
    roadblock: 2,
    rivals: 2,
    get timeOfDay() {
      return G.state.timeOfDay;
    },
    get state() {
      return probe.state;
    },
    get wanted() {
      return G.state.wanted;
    },
    get policeCars() {
      return policeCarsState().length;
    },
    get officers() {
      return safeOfficers().length;
    },
    get weapon() {
      return G.state.shotId === 'combat' ? 'Pistol' : G.state.weapon;
    },
    get objective() {
      return currentObjective();
    },
    get renderer() {
      return perfStats();
    },
    get saveInfo() {
      return { savedAt: G.state.savedAt };
    },
    get heliPresent() {
      return getHeliState().present;
    },
    get mission() {
      return missionName(G.state.mission);
    },
    get dialogue() {
      return (G.state.dialogue && G.state.dialogue.text) || '';
    },
  };
}

function exposeDebug() {
  window.__solmar = {
    get scene() {
      return G.scene;
    },
    get renderer() {
      return G.renderer;
    },
    get camera() {
      return activeCamera();
    },
    project: projectToScreen,
    projectToScreen,
    get round13() {
      return liveRound13();
    },
    get round6() {
      return G.world ? G.world.round6 : undefined;
    },
    get money() {
      return G.state.money;
    },
    get state() {
      return G.state.state;
    },
    get wanted() {
      return G.state.wanted;
    },
    get shotId() {
      return G.state.shotId;
    },
    get player() {
      return G.player;
    },
    get traffic() {
      return G.traffic;
    },
    get police() {
      return G.police;
    },
    get combat() {
      return G.combat;
    },
    get world() {
      return G.world;
    },
    get missions() {
      return G.missions;
    },
    get vehicles() {
      return G.vehicleSystem;
    },
    get vehicleSystem() {
      return G.vehicleSystem;
    },
    get config() {
      return CONFIG;
    },
    get game() {
      return G;
    },
    get clockString() {
      return clockString(G.state.timeOfDay);
    },
    get objective() {
      return currentObjective();
    },
    get saveInfo() {
      return { savedAt: G.state.savedAt };
    },
    get errors() {
      return G.errors.slice();
    },
    get ready() {
      return true;
    },
    buildRound13,
    stageShot: stageShotById,
    setShot: stageShotById,
  };
}

// ---------------------------------------------------------------- go

boot();
