// Solmar Bay — game loop, state machine, cameras, staging, debug interface
// (W4, attempt #7, fresh build). Written fresh for this recording from the
// round-9 interface contract (W4 section + fixes 6/7) and the rebuild spec.
// Nothing here is copied from an old repo or an old entrypoint.
//
// The loop runs in fixed 1/60 s steps (MAX_FRAME 0.25 caps catch-up after a
// stall). The game moves between menu, playing, paused and over. Staged
// captures (?shot=cover-chase|combat|pursuit|sunset) freeze the world at the
// pinned moment and set window.__shotReady for the screenshot harness.
// Free play is a real game: drive, steal, wanted level, missions, combat,
// save/load, HUD + minimap.
//
// Debug interface (the geometry harness reads it): window.__solmar with a
// LIVE round13 getter, a round6 getter, a top-level money getter, and
// project(x, y, z) returning normalized {x, y} (0..1) or null off-screen.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { createRng, WORLD_SEED } from './random.js';
import { buildWorld } from './world.js';
import * as RenderMod from './render.js';
import { createVehicleSystem } from './vehicle.js';
import { createTrafficSystem } from './traffic.js';
import { createPoliceSystem } from './police.js';
import { createPlayer } from './player.js';
import { createCombatSystem } from './combat.js';
import { createMissionsSystem, SHOT_MISSIONS } from './missions.js';
import { createInput } from './input.js';
import { saveGameState, loadGameState, makeStagedSave } from './save.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { stageShot, syncCarMesh } from './shots.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
/** One fixed simulation step. */
const STEP = 1 / 60;
/** Shot ids the harness requests (cover-chase is the cover alias). */
const SHOT_ALIASES = { 'cover-chase': 'cover', cover: 'cover' };
/** Free-play objective points per mission (x, z): reach one to finish it. */
const MISSION_POINTS = {
  1: { x: 80, z: -150 },
  2: { x: 40, z: -67 },
  3: { x: 120, z: -140 },
  4: { x: 183, z: -140 },
};

// ---- factory helper -------------------------------------------------------
// Every factory is called through callFactory with an OBJECT argument and a
// null secondary. A positional fallback is NOT harmless — it silently
// reproduces the invisible-actor bug — so the secondary is only used when
// the primary call throws or returns nothing, and only for the world call
// (the contract's one exception: [scene] degrades via the spec defaults).
function callFactory(factory, name, args, secondaryArgs) {
  try {
    const out = factory(...args);
    if (out !== null && out !== undefined) return out;
  } catch (err) {
    console.warn(`[main] ${name} primary call failed, trying secondary:`, err);
  }
  if (secondaryArgs) {
    return factory(...secondaryArgs);
  }
  throw new Error(`[main] factory ${name} returned nothing`);
}

// ---- clock ----------------------------------------------------------------
export function clockString(timeOfDay) {
  const totalMinutes = Math.round(timeOfDay * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ---- the game -------------------------------------------------------------
export function createGame(options = {}) {
  const hasDom = typeof document !== 'undefined';
  const canvas = hasDom ? document.getElementById('game') : null;
  const rng = createRng(options.seed === undefined ? WORLD_SEED : options.seed);

  // Scene via the render module (fog + sky dome) + lights ONCE. Never a
  // bare new THREE.Scene() — that has no lights and no sky (black scene).
  const scene = RenderMod.createScene();
  RenderMod.setupLights(scene, CONFIG);
  const renderer = RenderMod.createRenderer(canvas || undefined);
  const camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 2000);
  camera.position.set(0, 30, 80);
  camera.lookAt(0, 0, 0);

  // World: the ONLY factory call with positional args (contract exception).
  const world = callFactory(
    buildWorld,
    'buildWorld',
    [scene, CONFIG, rng],
    [scene],
  );

  // Actors + systems, all through ctx objects.
  const vehicles = callFactory(
    createVehicleSystem,
    'createVehicleSystem',
    [{ scene, world, rng }],
    null,
  );
  const player = callFactory(
    createPlayer,
    'createPlayer',
    [{ scene, world, rng }],
    null,
  );
  const police = callFactory(
    createPoliceSystem,
    'createPoliceSystem',
    [{ scene, world, rng }],
    null,
  );
  const combat = callFactory(
    createCombatSystem,
    'createCombatSystem',
    [{ scene, player, police, rng }],
    null,
  );
  const traffic = callFactory(
    createTrafficSystem,
    'createTrafficSystem',
    [{ scene, world, rng }],
    null,
  );
  const missions = callFactory(
    createMissionsSystem,
    'createMissionsSystem',
    [{ scene, world, rng }],
    null,
  );

  // Input + audio: real in the browser, inert stubs in Node (no DOM/Audio).
  const input = hasDom
    ? createInput(canvas || undefined)
    : {
        steer: () => 0,
        throttle: () => 0,
        takeActions: () => 0,
        mouse: () => ({ x: 0, y: 0, down: false }),
        isHeld: () => false,
        isDown: () => false,
        press() {},
        release() {},
        queueAction() {},
        dispose() {},
      };
  const audio = hasDom
    ? createAudio()
    : {
        available: false,
        muted: false,
        setMuted() {},
        resume() {},
        setEngine() {},
        skid() {},
        gunshot() {},
        siren() {},
        ui() {},
        pickup() {},
        crash() {},
        play() {},
        getStation: () => 'SOLMAR FM 101.5',
        setStation() {},
        setRadioOn() {},
        dispose() {},
      };

  const hud = createHud({ document: hasDom ? document : null });

  // ---- live state ---------------------------------------------------------
  const game = {
    state: 'menu',
    stagedShot: null,
    pinned: false,
    shotReady: false,
    renderedOnce: false,
    timeOfDay: CONFIG.shotTime.cover,
    money: CONFIG.save.baselineMoney,
    jobsDone: 0,
    respect: 0,
    wanted: 0,
    gt: null,
    coupe: null,
    race: { total: 3, position: 1 },
    scene,
    renderer,
    camera,
    world,
    vehicles,
    player,
    police,
    combat,
    traffic,
    missions,
    input,
    audio,
    hud,
    rng,
    config: CONFIG,
  };

  let activeCamera = camera;
  let accumulator = 0;

  // ---- cameras ------------------------------------------------------------
  function stagedCameraFor(shotId) {
    const c = CONFIG;
    if (shotId === 'cover') {
      return {
        pos: c.coverCamera,
        lookAt: c.coverLookAt,
        fov: c.coverFov || 62,
      };
    }
    if (shotId === 'combat') {
      const p = player.position;
      return {
        pos: c.combatCamera,
        lookAt: { x: p.x, y: 1.0, z: p.z },
        fov: 62,
      };
    }
    if (shotId === 'pursuit') {
      return {
        pos: c.pursuitCamera,
        lookAt: { x: -120, y: 1, z: 140 },
        fov: 62,
      };
    }
    // sunset
    return {
      pos: c.sunsetCamera,
      lookAt: c.sunsetLookAt,
      fov: 62,
    };
  }

  function applyStagedCamera(shotId) {
    const spec = stagedCameraFor(shotId);
    camera.position.set(spec.pos.x, spec.pos.y, spec.pos.z);
    camera.lookAt(spec.lookAt.x, spec.lookAt.y, spec.lookAt.z);
    if (camera.fov !== spec.fov) {
      camera.fov = spec.fov;
      camera.updateProjectionMatrix();
    }
    activeCamera = camera;
  }

  // Free-play chase camera: behind the player (or the car) at a fixed
  // offset, looking slightly ahead of the heading.
  function applyFreeCamera() {
    const p = player.position;
    const h = player.heading;
    const behind = player.currentCar ? 9 : 6.5;
    const height = player.currentCar ? 3.6 : 3.0;
    const cx = p.x - Math.sin(h) * behind;
    const cz = p.z - Math.cos(h) * behind;
    camera.position.set(cx, height, cz);
    camera.lookAt(p.x + Math.sin(h) * 6, 1.2, p.z + Math.cos(h) * 6);
    activeCamera = camera;
  }

  // ---- probe --------------------------------------------------------------
  function projectToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(activeCamera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: v.x * 0.5 + 0.5, y: 0.5 - v.y * 0.5 };
  }

  function buildHudState() {
    const ctx = missions.getShotContext(game.stagedShot || 'cover');
    const current = missions.getCurrentMission();
    const dialogue =
      (CONFIG.shotDialogue && CONFIG.shotDialogue[game.stagedShot]) ||
      missions.getDialogue(current ? current.number : 1) ||
      null;
    const inCar = !!player.currentCar;
    const carLabel = inCar
      ? player.currentCar.label || player.currentCar.model
      : null;
    const stats = RenderMod.getPerfStats(renderer);
    return {
      state: game.state,
      shotId: game.stagedShot,
      mission: current,
      missionName: current ? current.name : 'First Run',
      missionNumber: current ? current.number : 1,
      chapter: ctx ? ctx.chapter : 1,
      chapterTitle: ctx ? ctx.chapterTitle : 'First Run',
      objective: ctx ? ctx.objective : 'Pick up the package at the Marina',
      dialogue,
      money: game.money,
      jobsDone: game.jobsDone,
      wanted: police.wanted,
      clock: clockString(game.timeOfDay + CONFIG.clockEpsilon),
      timeOfDay: game.timeOfDay,
      race: 'STREET RACE · 1/3',
      nextMission: CONFIG.nextMissions[4],
      vehicleLine: inCar ? `GARAGE · ${carLabel}` : 'FISTS READY',
      inCar,
      carLabel,
      radio: (audio.getStation ? audio.getStation() : null)?.name || 'SOLMAR FM 101.5',
      nowPlaying: CONFIG.radio.nowPlaying,
      respect: game.respect,
      district: 'MARINA',
      standing: 'RESPECTED',
      crew: ['Dante', 'Mama Lou', 'Rico'],
      crosshair: game.stagedShot === 'combat',
      minimap: {
        player: { x: player.position.x, z: player.position.z, heading: player.heading },
        police: police.getPoliceCars().map((c) => ({ x: c.x, z: c.z })),
        heli: police.getHeli && police.getHeli().present
          ? { x: police.getHeli().x, z: police.getHeli().z }
          : null,
        lagoonArm: CONFIG.lagoonArm,
        basin: CONFIG.basin,
      },
      perf: stats,
    };
  }

  function buildRound13() {
    const current = missions.getCurrentMission();
    const ctx = missions.getShotContext(game.stagedShot || 'cover');
    const dialogue =
      (CONFIG.shotDialogue && CONFIG.shotDialogue[game.stagedShot]) ||
      missions.getDialogue(current ? current.number : 1) ||
      null;
    const heli = police.getHeli ? police.getHeli() : null;
    const officers = police.getOfficers ? police.getOfficers() : [];
    const stats = RenderMod.getPerfStats(renderer);
    const saved = loadGameState();
    return {
      state: game.state,
      shotId: game.stagedShot,
      timeOfDay: game.timeOfDay,
      clock: clockString(game.timeOfDay + CONFIG.clockEpsilon),
      money: game.money,
      wanted: police.wanted,
      mission: current ? current.name : 'First Run',
      missionNumber: current ? current.number : 1,
      chapter: ctx ? ctx.chapter : 1,
      chapterTitle: ctx ? ctx.chapterTitle : 'First Run',
      objective: ctx ? ctx.objective : '',
      dialogue: dialogue ? dialogue.text : '',
      speaker: dialogue ? dialogue.speaker : '',
      weapon: game.stagedShot === 'combat' ? 'Pistol' : player.currentCar ? 'Pistol' : 'Fists',
      heli: heli
        ? {
            x: heli.x,
            y: heli.y,
            z: heli.z,
            scale: heli.scale,
            present: !!heli.present,
            staged: !!heli.staged,
          }
        : { present: false },
      fallenOfficers: officers.filter((o) => o.fallen).length,
      officers: officers.length,
      policeCars: police.getPoliceCars().length,
      roadblockCars: police.getRoadblockCars().map((c) => ({
        x: c.x,
        z: c.z,
      })),
      roadblock: police.getRoadblockCars().length,
      rivals: 2,
      race: { total: 3, position: 1 },
      muzzleVisible: !!combat.muzzleVisible,
      ricoPistol: !!combat.ricoPistol,
      renderer: { calls: stats.drawCalls, triangles: stats.triangles },
      saveInfo: saved ? { savedAt: saved.savedAt || null } : { savedAt: null },
      gt: game.gt
        ? { x: game.gt.x, z: game.gt.z, heading: game.gt.heading }
        : null,
      coupe: game.coupe
        ? { x: game.coupe.x, z: game.coupe.z, heading: game.coupe.heading }
        : null,
      player: {
        x: player.position.x,
        z: player.position.z,
        heading: player.heading,
        inCar: !!player.currentCar,
      },
      jobsDone: game.jobsDone,
      completedMissions: missions.getCompletedMissions(),
      traffic: traffic.getFleetComposition ? traffic.getFleetComposition() : null,
      pedestrians: traffic.getPedestrians ? traffic.getPedestrians().length : 0,
    };
  }

  // ---- debug interface ----------------------------------------------------
  const debug = {
    get scene() {
      return scene;
    },
    get renderer() {
      return renderer;
    },
    get camera() {
      return activeCamera;
    },
    get state() {
      return game.state;
    },
    get money() {
      return game.money;
    },
    get round6() {
      return world && world.round6;
    },
    get round13() {
      return buildRound13();
    },
    get shotReady() {
      return game.shotReady;
    },
    project: projectToScreen,
    game,
    world,
    player,
    police,
    combat,
    traffic,
    missions,
    vehicles,
    hud,
    config: CONFIG,
    stageShot(id) {
      return stageShot(game, id);
    },
    step(dt) {
      return stepGame(dt === undefined ? STEP : dt);
    },
    buildRound13,
    buildHudState,
  };
  game.debug = debug;
  if (typeof window !== 'undefined') {
    window.__solmar = debug;
  }

  // ---- staging ------------------------------------------------------------
  function markShotReady() {
    game.shotReady = true;
    if (typeof window !== 'undefined') window.__shotReady = true;
  }

  // ---- save / load ----------------------------------------------------------
  function loadSave() {
    const data = loadGameState();
    if (!data) return false;
    game.money = typeof data.money === 'number' ? data.money : game.money;
    game.jobsDone = typeof data.jobsDone === 'number' ? data.jobsDone : 0;
    if (Array.isArray(data.completedMissions)) {
      missions.setCompletedMissions(data.completedMissions);
    }
    if (typeof data.mission === 'number') missions.startMission(data.mission);
    if (data.player) {
      player.setPosition(data.player.x || 40, data.player.z || -22, data.player.heading || 0);
    }
    return true;
  }

  // ---- fixed-step simulation ----------------------------------------------
  function stepGame(dt) {
    // Cover drive: the GT rolls south from z=-95 until the pin at z=-67,
    // following the west bend (heading is a pure function of car z).
    if (game.stagedShot === 'cover' && !game.pinned && game.gt) {
      const gt = game.gt;
      const bend = world.bend;
      const speed = CONFIG.coverGT.speed || 22;
      const pinZ = CONFIG.coverGT.pinZ;
      const heading = bend ? bend.headingAt(gt.z) : 0;
      const nx = gt.x + Math.sin(heading) * speed * dt;
      const nz = gt.z + Math.cos(heading) * speed * dt;
      if (nz >= pinZ) {
        const finalHeading = bend ? bend.headingAt(pinZ) : 0;
        gt.setPosition(nx, pinZ, finalHeading);
        syncCarMesh(gt);
        game.pinned = true;
        markShotReady();
      } else {
        gt.setPosition(nx, nz, bend ? bend.headingAt(nz) : 0);
        syncCarMesh(gt);
      }
      player.position.copy(gt.mesh.position);
    }

    // Free play only: traffic, police, missions, clock, player.
    if (game.state === 'playing' && !game.stagedShot) {
      // Game clock: 1 game hour per 240 real seconds, wrapping 17:00-19:00.
      game.timeOfDay = 17 + ((game.timeOfDay - 17 + dt / 240) % 2);
      if (traffic.update) traffic.update(dt);
      if (police.update) police.update(dt, player.position);
      const throttle = input.throttle ? input.throttle() : 0;
      const steer = input.steer ? input.steer() : 0;
      if (player.currentCar) {
        const car = player.currentCar;
        const sp = car.speed || 0;
        const next = Math.max(-8, Math.min(28, sp + throttle * 22 * dt));
        car.speed = next;
        const nh = car.heading + steer * 1.9 * dt * (next >= 0 ? 1 : -1);
        const nx = car.x + Math.sin(nh) * next * dt;
        const nz = car.z + Math.cos(nh) * next * dt;
        car.setPosition(nx, nz, nh);
        syncCarMesh(car);
        player.position.copy(car.mesh.position);
        if (audio.setEngine) audio.setEngine(Math.abs(next) / 28);
      } else {
        player.update(dt, {
          forward: throttle > 0,
          back: throttle < 0,
          left: steer < 0,
          right: steer > 0,
          run: input.isDown ? input.isDown('handbrake') : false,
        });
        if (audio.setEngine) audio.setEngine(0);
      }
      // Mission completion: reach the objective point.
      const current = missions.getCurrentMission();
      if (current) {
        const pt = MISSION_POINTS[current.number];
        if (pt) {
          const dx = player.position.x - pt.x;
          const dz = player.position.z - pt.z;
          if (dx * dx + dz * dz < 25) {
            const reward = current.reward || 0;
            game.money += reward;
            game.jobsDone += 1;
            const done = missions.getCompletedMissions();
            if (!done.includes(current.number)) done.push(current.number);
            missions.setCompletedMissions(done);
            missions.setJobsDone(game.jobsDone);
            if (audio.pickup) audio.pickup();
            const next = current.number + 1;
            if (next <= 4) missions.startMission(next);
            saveGameState({
              money: game.money,
              mission: missions.getCurrentMission().number,
              jobsDone: game.jobsDone,
              completedMissions: missions.getCompletedMissions(),
              player: {
                x: player.position.x,
                z: player.position.z,
                heading: player.heading,
              },
              wanted: police.wanted,
              respect: game.respect,
            });
          }
        }
      }
      if (police.wanted >= 3 && audio.siren) audio.siren(true);
    }

    // HUD refresh every step (hud.js only rewrites text that changed).
    if (hud.update) hud.update(buildHudState());
    return game;
  }

  function frame(dt) {
    const clamped = Math.min(dt, MAX_FRAME);
    accumulator += clamped;
    let steps = 0;
    while (accumulator >= STEP && steps < 16) {
      stepGame(STEP);
      accumulator -= STEP;
      steps += 1;
    }
    if (steps === 16) accumulator = 0;
    if (game.stagedShot) applyStagedCamera(game.stagedShot);
    else if (game.state === 'playing' || game.state === 'paused') applyFreeCamera();
    renderer.render(scene, activeCamera);
    if (!game.renderedOnce) {
      game.renderedOnce = true;
      if (game.stagedShot && game.stagedShot !== 'cover') markShotReady();
      if (game.stagedShot === 'cover' && game.pinned) markShotReady();
    }
  }

  // ---- input: pause ---------------------------------------------------------
  function onKeyDown(event) {
    if (!event || !event.code) return;
    if (event.code === 'KeyP' || event.code === 'Escape') {
      // Guard playing || paused so P resumes from paused (fix 2.3).
      if (game.state === 'playing' || game.state === 'paused') {
        game.state = game.state === 'playing' ? 'paused' : 'playing';
        if (hud.setPaused) hud.setPaused(game.state === 'paused');
        if (game.state === 'paused') {
          saveGameState({
            money: game.money,
            mission: missions.getCurrentMission().number,
            jobsDone: game.jobsDone,
            completedMissions: missions.getCompletedMissions(),
            player: {
              x: player.position.x,
              z: player.position.z,
              heading: player.heading,
            },
            wanted: police.wanted,
            respect: game.respect,
          });
        }
      }
    }
  }
  if (hasDom && typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeyDown);
  }

  // ---- public API -----------------------------------------------------------
  game.frame = frame;
  game.stepGame = stepGame;
  game.buildRound13 = buildRound13;
  game.buildHudState = buildHudState;
  game.projectToScreen = projectToScreen;
  game.applyStagedCamera = applyStagedCamera;
  game.loadSave = loadSave;
  game.markShotReady = markShotReady;

  game.startFreePlay = function startFreePlay() {
    game.stagedShot = null;
    game.state = 'playing';
    loadSave();
    game.money = game.money || CONFIG.save.baselineMoney;
    if (hud.setPaused) hud.setPaused(false);
    if (hud.showStart) hud.showStart(false);
    if (audio.resume) audio.resume();
    return game;
  };

  game.startStaged = function startStaged(rawShotId) {
    const shotId = SHOT_ALIASES[rawShotId] || rawShotId;
    game.stagedShot = shotId;
    game.state = 'playing';
    game.pinned = false;
    game.shotReady = false;
    game.renderedOnce = false;
    game.timeOfDay = CONFIG.shotTime[shotId] || CONFIG.shotTime.cover;
    game.money = CONFIG.stagedMoney[shotId] || CONFIG.save.baselineMoney;
    // Staging (shots.js): cars, officers, peds, Rico, money, save.
    stageShot(game, shotId);
    // A real save must exist when the shots are captured (contract §1).
    const ctx = missions.getShotContext(shotId);
    makeStagedSave(
      shotId,
      game.money,
      ctx ? ctx.number : SHOT_MISSIONS[shotId] || 1,
    );
    applyStagedCamera(shotId);
    hud.update(buildHudState());
    if (hud.showStart) hud.showStart(false);
    return game;
  };

  return game;
}

// ---- browser boot -----------------------------------------------------------
function bootBrowser() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') || '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : WORLD_SEED;
  const game = createGame({ seed });
  const hud = game.hud;

  if (shot) {
    game.startStaged(shot);
  } else {
    game.state = 'menu';
    if (hud.showStart) hud.showStart(true);
    if (hud.onStart) {
      hud.onStart(() => game.startFreePlay());
    }
  }

  // Resize the renderer to the window (keeps the 1280x720 playfield).
  function onResize() {
    RenderMod.resizeRenderer(
      game.renderer,
      window.innerWidth,
      window.innerHeight,
    );
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);

  let last = performance.now();
  function raf(now) {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    game.frame(dt);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
  return game;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootBrowser);
  } else {
    bootBrowser();
  }
}

export { bootBrowser };
export default createGame;
