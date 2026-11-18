// Solmar Bay — bootstrap + game loop (Lane C integration).
// Wires Lane A (world / player / cars / render / input) to Lane B
// (traffic / police / missions / combat / HUD / audio / save) and runs the
// frame loop. One seeded generator is passed through the whole game, so a
// seed reproduces the same city and behaviour.
//
// URL queries: ?seed=<number> (default 1337) and ?shot=<start|play|end>.
// Shot staging arranges the scene deterministically before the first frame
// so headless screenshots capture the intended moment.
//
// No network anywhere: everything is local files, Web Audio synthesis only.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng, clamp01, lerp, smoothstep } from './random.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { createCar, findNearestCar, attachPoliceLightBar, setPoliceLightPhase } from './vehicle.js';
import { createRenderContext, boostCarPaintForCar } from './render.js';
import { input } from './input.js';
import { TrafficManager } from './traffic.js';
import { PoliceSystem } from './police.js';
import { MissionManager } from './missions.js';
import { CombatSystem } from './combat.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { SaveSystem } from './save.js';

const params = new URLSearchParams(window.location.search);
const seedRaw = Number.parseInt(params.get('seed') || '', 10);
const SEED = Number.isFinite(seedRaw) ? seedRaw : 1337;
const SHOT = params.get('shot') || '';
const SHOT_MODE = SHOT === 'start' || SHOT === 'play' || SHOT === 'end';

const canvas = document.getElementById('game-canvas');
const hudEl = document.getElementById('hud');
const overlays = {
  start: document.getElementById('start-screen'),
  pause: document.getElementById('pause-menu'),
  busted: document.getElementById('busted-screen'),
  wasted: document.getElementById('wasted-screen'),
  complete: document.getElementById('mission-complete-screen'),
};
const completeText = document.getElementById('mission-complete-text');
const completeReward = document.getElementById('mission-complete-reward');

// ---------------------------------------------------------------- setup

const rng = createRng(SEED);
const scene = new THREE.Scene();
const renderCtx = createRenderContext(canvas);
const { renderer, camera, sunLight, hemiLight, vehicleFillLight } = renderCtx;
scene.add(sunLight);
scene.add(sunLight.target);
scene.add(hemiLight);
// Round-8: the vehicle fill light (render.js) — one dim shadowless light
// from the sun's opposite side, so sculpted car paint keeps a readable
// edge on its shadow side at dusk.
if (vehicleFillLight) scene.add(vehicleFillLight);

const world = buildWorld(scene, rng);

// Mission locations, pinned to real road intersections / spawn points of
// this city (Lane B's defaults were coordinates of a different map).
// Lane B reads them through world.getLocation / world.locations.
world.locations = {
  mamaLou: { x: 40, y: 0, z: 40, label: "Mama Lou's" },
  marina: { x: 180, y: 0, z: -140, label: 'Marina' },
  northBeach: { x: 0, y: 0, z: 286, label: 'North Beach' },
  hideout: { x: -200, y: 0, z: 200, label: 'Hideout' },
  docks: { x: -280, y: 0, z: 200, label: 'Docks' },
  carLot: { x: -120, y: 0, z: 120, label: 'Car Lot' },
  palmsHotel: { x: 120, y: 0, z: -120, label: 'Palms Hotel' },
  harbour: { x: 200, y: 0, z: 200, label: 'Harbour' },
  lookout: { x: -40, y: 0, z: -120, label: 'Lookout' },
  // Round 8: the stepped-tower plaza — the first stepped tower's
  // position straight from world.js, never a hardcoded guess. When
  // the city has no stepped tower this entry is null and missions
  // fall back to Mama Lou's (see missions.js _location).
  steppedPlaza: world.steppedPlaza || null,
};
world.getLocation = (name) => world.locations[name] || null;

// ---- round-6/7 landmarks -------------------------------------------------
// The Solmar Spire, the Marina Bridge (round 6) and the Solmar Pyramid
// (round 7) — world.landmarks, Lane L / Lane B.
// Each entry carries the VISIT point (x, z — where Rico stands to
// "visit" it: the Spire's base, the Bridge's western abutment, the
// Pyramid's base) and the FOCUS point (focusX/Z/Y — where the L key
// points the camera: the Spire's crown, the Bridge's mid-span, the
// Pyramid's gold cap). Defensive: an older world build returns no
// landmarks, and every caller guards on an empty list.
const landmarkList = (() => {
  const lm = world.landmarks || null;
  const list = [];
  if (lm?.spire) {
    list.push({
      name: 'Solmar Spire',
      x: lm.spire.x, z: lm.spire.z,
      focusX: lm.spire.x, focusZ: lm.spire.z, focusY: lm.spire.height || 95,
    });
  }
  if (lm?.bridge) {
    list.push({
      name: 'Marina Bridge',
      x: lm.bridge.x0, z: lm.bridge.z, // western abutment — reachable on foot
      focusX: (lm.bridge.x0 + lm.bridge.x1) / 2, focusZ: lm.bridge.z, focusY: 8,
    });
  }
  if (lm?.pyramid) {
    list.push({
      name: 'Solmar Pyramid',
      x: lm.pyramid.x, z: lm.pyramid.z,
      focusX: lm.pyramid.x, focusZ: lm.pyramid.z, focusY: lm.pyramid.height || 64,
    });
  }
  return list;
})();

// Nearest landmark to a position ({x, z}) — the entry, or null.
function nearestLandmark(position) {
  if (!landmarkList.length || !position) return null;
  let best = null;
  let bestD = Infinity;
  for (const lm of landmarkList) {
    const d = Math.hypot((position.x || 0) - lm.x, (position.z || 0) - lm.z);
    if (d < bestD) { bestD = d; best = lm; }
  }
  return best;
}

// Name of the nearest landmark within `radius` metres of a position, or
// null — used by the police radio so dispatch names the Spire / Bridge
// when the chase runs past one.
function nearestLandmarkName(position, radius = 60) {
  const lm = nearestLandmark(position);
  if (!lm) return null;
  const d = Math.hypot((position.x || 0) - lm.x, (position.z || 0) - lm.z);
  return d <= radius ? lm.name : null;
}

const player = createPlayer(scene, world, world.spawns.player);

// ---- car factory adapter -----------------------------------------------
// Lane B hands a spec object { position, heading, model, colour, driver };
// Lane A builds a car from (scene, model, colour, x, z, heading) with one
// of five model names. Map Lane B's display names onto Lane A models, then
// keep the display name on car.model so missions (which ask for a
// 'Palm Coupe' by name) can recognise the car.
const spawnedCars = new Set();
function laneAModel(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('coupe')) return 'coupe';
  if (n.includes('pickup')) return 'pickup';
  // Round-4 models: the taxi is its own shape (checker band + roof
  // sign) and the bus is a long 6-wheel body, not a van.
  if (n.includes('taxi')) return 'taxi';
  if (n.includes('bus')) return 'bus';
  if (n.includes('van')) return 'van';
  if (n.includes('sports')) return 'sports';
  // Round-3 models: the food truck is a boxy van, the beach buggy is a
  // low fun car, the limo rides on the sedan.
  if (n.includes('truck')) return 'van';
  if (n.includes('buggy')) return 'sports';
  return 'sedan';
}
function makeCar(spec) {
  const pos = spec.position || { x: 0, z: 0 };
  const car = createCar(
    scene,
    laneAModel(spec.model),
    spec.colour === undefined ? 0xc23a2a : spec.colour,
    pos.x || 0,
    pos.z || 0,
    spec.heading || 0,
  );
  // Keep Lane B's display name: missions match on it, nothing in the
  // driving code reads car.model after construction.
  if (spec.model) car.model = spec.model;
  car.driver = spec.driver || 'ai';
  // Round-8: boost the sculpted paint (envMapIntensity 1.35) so the
  // fenders / glasshouse keep a warm sheen at dusk — see render.js.
  boostCarPaintForCar(car);
  // Police interceptors get a flashing roof light bar (round-2 polish).
  if (car.driver === 'police') attachPoliceLightBar(car);
  spawnedCars.add(car);
  return car;
}
function removeCarMesh(car) {
  if (!car) return;
  if (car.group && car.group.parent) car.group.parent.remove(car.group);
  spawnedCars.delete(car);
}

const traffic = new TrafficManager({ rng, createCar: makeCar, maxCars: 14, maxPedestrians: 18 });
const police = new PoliceSystem({
  rng,
  createCar: makeCar,
  events: {
    onBusted: () => showBusted(),
    onWasted: () => showWasted(),
    onSiren: ({ on }) => {
      if (SHOT_MODE) return; // no audio before a user gesture in shot mode
      if (on) audio.startSiren();
      else audio.stopSiren();
    },
    // Round-3 polish: police radio chatter when the heat rises.
    // Round-4 polish: roadblock toast + wanted-up sting / radio static.
    // Round-6: when the chase runs past a landmark, dispatch names it.
    onWantedChange: ({ wanted, before }) => {
      if (wanted > 0) showMessage(police.radioLineNearLandmark(wanted, nearestLandmarkName(player.position, 60)), 5);
      if (wanted > before) { audio.playWantedUp(); audio.playRadioBlip(); }
    },
    onRoadblock: () => showMessage('Roadblock ahead — they are cutting you off!', 5),
  },
});
const missions = new MissionManager({
  rng,
  locations: world.locations,
  parSeconds: CONFIG.missionPar, // round 3: under-par bonus times
  parBonus: CONFIG.parBonus,
  events: {
    onMissionStart: ({ name, introCard }) => {
      // Round-4 polish: intro card line + mission-start sting.
      showMessage(introCard ? `${name} — ${introCard}` : name, 6);
      audio.playMissionStart();
    },
    onObjective: ({ objective, flavour }) => {
      // Round 6: a flavour line naming the nearest landmark rides along
      // with the objective — never an objective itself, so the mission
      // flow cannot change.
      const hint = missions.getLandmarkHint?.(player.position, landmarkList);
      showMessage((flavour || objective) + (hint ? ' ' + hint : ''));
    },
    onComplete: ({ name, reward }) => {
      showMissionComplete(name, reward);
    },
    onFail: ({ reason }) => {
      showMessage(`${reason} Press R to retry.`, 6);
      if (typeof audio.playMissionFail === 'function') audio.playMissionFail();
    },
  },
});
const audio = new AudioEngine({});
const combat = new CombatSystem({
  rng,
  hooks: {
    audio,
    police,
    traffic,
    onMuzzle: (pos) => flashMuzzle(pos),
    onPlayerDown: () => showWasted(),
  },
});
const hud = new HUD({
  ids: {
    stars: 'wanted-stars',
    healthBar: 'health-fill',
    money: 'money-amount',
    speed: 'speed-value',
    objective: 'objective-text',
    missionName: 'mission-name',
    clock: 'clock-time',
    message: 'message',
    ammo: 'hud-ammo',
    minimap: 'minimap',
  },
});
const save = new SaveSystem();

// ---- game state ---------------------------------------------------------
let state = 'menu'; // menu | playing | paused | busted | wasted | mission-complete
let money = 250;
let totalEarned = 0; // round 3: lifetime cash earned, persisted by save v3
let timeOfDay = 12; // hours 0-24
let playTimeSeconds = 0; // accumulated in update(); persisted by save v2
let timesPlayed = 0; // sessions on this profile; persisted by save v2
let camYaw = player.heading + Math.PI;
let camPitch = 0;
let camFar = false; // round 3: C toggles the chase camera near / far
let camZoom = 1; // round 5: mouse wheel zooms the chase camera (0.8..1.35)
let landmarkFocus = null; // round 6: { x, y, z, name, until } — the L key points the camera at a landmark for a few seconds
let orbitAngle = 0.6;
let messageText = '';
let muzzleTimer = 0;
let impactTimer = 0; // round 3: hit-impact flash lifetime
let lastMouseMoveAt = 0;
let lastSkidAt = 0; // round 3: seconds (performance clock) of the last screech
let lastStepPhase = 0; // round 3: walk-phase step index of the last footstep
let ambientClock = 0; // round 4: absolute seconds for the ambient world updates
let hitStopUntil = 0; // round 4: performance-clock deadline for the hit-stop freeze
let gamesPlayed = 0; // round 4: sessions that finished a mission (save v3)
let lastCombo = 0; // round-4b: combo count last heard (for the sting)
let thisSessionCounted = false; // round 4: gamesPlayed increments once per session

function showMessage(text, seconds) {
  messageText = text || '';
  hud.showMessage(messageText, seconds || 5);
}

function systems() {
  return {
    police,
    traffic,
    combat,
    audio,
    addMoney: (n) => { money += n; totalEarned += n; if (n > 0) audio.playCash(); },
  };
}

// ---- 3D helpers: muzzle flash, pedestrians, officers ---

// Round-9 (Lane B): the mission waypoint BEACON is REMOVED, not moved.
// It was a 160 m tall yellow cylinder (radius 2.2 m, opacity 0.5) with
// a spinning octahedron diamond, rendered with depthTest: false and
// renderOrder 999 — i.e. drawn on top of every building in the city.
// That is the "thin vertical yellow sun streak" in the round-8 shots
// (r8c-pickup-near.png, run1-shot-street.png): a ~2-20 px wide pale
// yellow bar hanging from the top of the frame with a bright diamond
// in it, visible through downtown towers whenever the Marina objective
// was ahead of the camera. It was not a sun sprite, billboard or lens
// flare — the sun sprites are radial, the beam was the only vertical
// depthTest-off object in the scene. No replacement pillar: the
// waypoint is still shown by the HUD objective text and the gold
// diamond on the minimap, and missions stay purely position-based
// (missions.getMarkerPosition), so removing the meshes changes no
// gameplay system. Do not re-add a depthTest-off pillar here.

const muzzle = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 8, 8),
  // Round-5: warm gold, not pale yellow — the muzzle flash is lit by the
  // same low sun as the rest of the sunset scene.
  new THREE.MeshBasicMaterial({ color: 0xffc46b }),
);
muzzle.visible = false;
scene.add(muzzle);

// Round-3 polish: the hit-impact flash — a brief orange burst at the
// point a shot or punch lands (combat.consumeImpact).
const impactMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.32, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xff8c2a, transparent: true, opacity: 0.9 }),
);
impactMesh.visible = false;
scene.add(impactMesh);

// Shot tracer (round-2 polish): a short-lived line from the muzzle to the
// shot's target, faded out over its 0.09 s lifetime (combat.consumeTracer).
const tracerGeo = new THREE.BufferGeometry();
tracerGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0 });
const tracerLine = new THREE.Line(tracerGeo, tracerMat);
tracerLine.visible = false;
tracerLine.frustumCulled = false;
scene.add(tracerLine);
let tracerTimer = 0;

function flashMuzzle(pos) {
  if (!pos) return;
  muzzle.position.set(pos.x, pos.y, pos.z);
  muzzle.scale.setScalar(1.6); // starts big, shrinks as it fades
  muzzle.visible = true;
  muzzleTimer = 0.06;
}

function flashImpact(pos, kind) {
  if (!pos) return;
  // Round-8: a ram spark flashes gold-white (the bumper contact point),
  // while punch/shot hits stay orange — the kind rides on lastImpact.
  impactMesh.material.color.set(kind === 'ram' ? 0xffd94a : 0xff8c2a);
  impactMesh.position.set(pos.x, pos.y, pos.z);
  impactMesh.scale.setScalar(1.8);
  impactMesh.visible = true;
  impactTimer = 0.12;
}

function makePersonMesh(shirtColor) {
  const g = new THREE.Group();
  const matShirt = new THREE.MeshStandardMaterial({ color: shirtColor || 0x888888, roughness: 0.9 });
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
  const matPants = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), matShirt);
  body.position.y = 1.12;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.3), matSkin);
  head.position.y = 1.66;
  head.castShadow = true;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), matPants);
  legL.position.set(-0.14, 0.38, 0);
  const legR = legL.clone();
  legR.position.x = 0.14;
  g.add(body, head, legL, legR);
  return g;
}
const pedMeshes = new Map();
const officerMeshes = new Map();
function syncPersonMeshes(list, meshMap, shirtColor) {
  const seen = new Set();
  for (const person of list) {
    seen.add(person);
    let mesh = meshMap.get(person);
    if (!mesh) {
      mesh = makePersonMesh(person.shirt || shirtColor);
      meshMap.set(person, mesh);
      scene.add(mesh);
    }
    mesh.position.set(person.position.x, person.position.y || 0, person.position.z);
    mesh.rotation.y = person.heading || 0;
    mesh.visible = person.alive !== false;
  }
  for (const [person, mesh] of [...meshMap.entries()]) {
    if (!seen.has(person)) {
      scene.remove(mesh);
      meshMap.delete(person);
    }
  }
}
function clearPersonMeshes(meshMap) {
  for (const mesh of meshMap.values()) scene.remove(mesh);
  meshMap.clear();
}

// ---- overlays / state transitions ---------------------------------------

function showOnly(name) {
  for (const [key, el] of Object.entries(overlays)) {
    if (el) el.classList.toggle('hidden', key !== name);
  }
  const hudOn = name === null || name === 'pause';
  if (hudEl) hudEl.style.display = hudOn ? '' : 'none';
  const crosshair = document.getElementById('crosshair');
  if (crosshair) crosshair.classList.toggle('hidden', !(name === null && player.onFoot));
}

function startPlaying() {
  state = 'playing';
  showOnly(null);
  input.attach(canvas);
  if (!SHOT_MODE) {
    audio.ensureContext();
    audio.startMusic();
    audio.startAmbient(); // round 4: city hum + surf bed
    audio.playSunsetSting?.(); // round 5: golden-hour swell as the game starts
  }
  // Resume a previous session (round-2 polish): the save system was
  // writing on mission complete but never loading. v1 and v2 saves both
  // load; a fresh profile just starts at the defaults.
  if (!startPlaying.loadedSave) {
    startPlaying.loadedSave = true;
    const loaded = save.load();
    if (loaded) {
      money = loaded.money ?? money;
      timeOfDay = loaded.timeOfDay ?? timeOfDay;
      playTimeSeconds = loaded.playTimeSeconds || 0;
      timesPlayed = (loaded.timesPlayed || 0) + 1;
      totalEarned = loaded.totalEarned || 0; // round 3: save v3 field
      gamesPlayed = loaded.gamesPlayed || 0; // round 4: save v3 field
      for (const n of loaded.completedMissions || []) missions.completed.add(n);
      // Round 6: restore the landmarks visited on this profile, so a
      // returning player is not re-credited for the same landmark.
      for (const n of loaded.landmarksVisited || []) player.landmarksVisited.add(n);
      // Round-8 (save v7): restore the chase-camera distance preference
      // (v6 and older saves carry none and load() defaults to 'mid', 1).
      // The input singleton keeps its own copy of the level, so sync it
      // too — otherwise a V press in the menu would leave the two apart.
      if (typeof loaded.chaseDistanceLevel === 'number') {
        player.setChaseDistance(loaded.chaseDistanceLevel);
        if (typeof input.setChaseDistanceLevel === 'function') input.setChaseDistanceLevel(player.chaseDistanceLevel);
      }
      if (loaded.position) {
        player.teleport(loaded.position.x, loaded.position.z, loaded.heading ?? player.heading);
        camYaw = player.heading + Math.PI;
      }
      if (typeof loaded.wanted === 'number') police.setWanted(loaded.wanted);
      // Round 9 (save v8): restore the combat state too — health,
      // armour, reserve ammo and the magazine. The save wrote these
      // fields for rounds, but this load block never read them back,
      // so a reload silently reset the magazine to a full 12 (and
      // health/ammo to their defaults) even when the save held a
      // half-empty mag. Old saves carry mag null, which ?? turns into
      // undefined, so fromSaveData leaves the live load untouched.
      combat.fromSaveData({
        health: loaded.health ?? undefined,
        armour: loaded.armour ?? undefined,
        ammo: loaded.ammo ?? undefined,
        mag: loaded.mag ?? undefined,
      });
    } else {
      timesPlayed = 1;
    }
  }
  if (!missions.current && !missions.getCurrentMissionNumber()) {
    // Resume at the next uncompleted mission, not always mission 1.
    const done = missions.getCompletedMissions();
    const next = done.length ? Math.min(5, Math.max(...done) + 1) : 1;
    missions.startMission(next, world, systems());
  }
}

function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  showOnly('pause');
  input.exitPointerLock();
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
  showOnly(null);
}

function showBusted() {
  if (state === 'busted') return;
  state = 'busted';
  showOnly('busted');
  input.exitPointerLock();
  audio.stopSiren();
}

function showWasted() {
  if (state === 'wasted') return;
  state = 'wasted';
  showOnly('wasted');
  input.exitPointerLock();
  audio.stopSiren();
}

function showMissionComplete(name, reward) {
  state = 'mission-complete';
  if (completeText) completeText.textContent = `${name} — clean work, Rico.`;
  if (completeReward) completeReward.textContent = `+$${reward}`;
  showOnly('complete');
  input.exitPointerLock();
  audio.stopSiren();
  if (!thisSessionCounted) { thisSessionCounted = true; gamesPlayed += 1; } // round 4
  saveProgress(null); // mission done — no current mission to resume
}

// Round-6: one checkpoint save — the same fields, whether the trigger
// is a mission complete or a first landmark visit, so a discovery is
// never lost when the tab closes. `currentMission` is the mission to
// resume (null when a mission just completed).
function saveProgress(currentMission) {
  save.save({
    money,
    completedMissions: missions.getCompletedMissions(),
    currentMission: currentMission ?? null,
    position: player.position,
    heading: player.heading,
    wanted: police.getWantedLevel(),
    health: combat.getHealth(),
    armour: combat.getArmour(),
    ammo: combat.getAmmo(),
    // Round 9 (v8): the live magazine count — WITHOUT this line the
    // v8 save stored mag: null on every save (save() falls back to
    // null when the caller passes neither mag nor combat), so the
    // "magazine persisted" feature never actually persisted anything.
    mag: combat.getMag(),
    timeOfDay,
    playTimeSeconds,
    timesPlayed,
    totalEarned, // round 3: save v3 field
    gamesPlayed, // round 4: save v3 field
    parBonuses: missions.getParBonusesEarned(), // round 5: save v4 field
    landmarksVisited: [...(player.landmarksVisited || [])], // round 6: save v5 field
    chaseDistanceLevel: player.chaseDistanceLevel, // round 8: save v7 field
  });
}

function resetGame(missionNumber) {
  // Remove every spawned car mesh before the systems drop their lists.
  for (const car of [...traffic.getCars()]) removeCarMesh(car);
  for (const car of [...police.getPoliceCars()]) removeCarMesh(car);
  const staged = player.currentCar;
  if (staged) {
    player.exitCar();
    removeCarMesh(staged);
  }
  clearPersonMeshes(pedMeshes);
  clearPersonMeshes(officerMeshes);
  traffic.reset();
  police.reset();
  combat.reset();
  missions.reset();
  if (player.group) player.group.visible = true;
  player.teleport(world.spawns.player.x, world.spawns.player.z, world.spawns.player.heading);
  player.health = CONFIG.player.maxHealth;
  money = 250;
  timeOfDay = 12;
  messageText = '';
  camYaw = player.heading + Math.PI;
  camPitch = 0;
  state = 'playing';
  showOnly(null);
  const next = missionNumber || 1;
  missions.startMission(next, world, systems());
}

// ---- camera --------------------------------------------------------------

// Sun-follow (round-2 polish): re-centre the tight shadow frustum on the
// camera focus every frame, so shadows stay crisp wherever the player
// goes. The staged end vista keeps its fixed low sun (updateCamera
// returns early for it).
function followSun(fx, fz) {
  const off = CONFIG.lighting.sunOffset;
  sunLight.position.set(fx + off[0], off[1], fz + off[2]);
  sunLight.target.position.set(fx, 0, fz);
  sunLight.target.updateMatrixWorld();
}

function updateCamera(dt) {
  if (state === 'menu') {
    orbitAngle += dt * 0.045;
    const cx = 40;
    const cz = -40;
    camera.position.set(cx + Math.cos(orbitAngle) * 135, 58, cz + Math.sin(orbitAngle) * 135);
    camera.lookAt(cx, 24, cz);
    followSun(cx, cz);
    return;
  }
  if (state === 'mission-complete' && SHOT === 'end') return; // staged vista stays put
  if (state !== 'playing' && state !== 'paused') return;

  // Staged chase framing for the play/seed-1 shot: the camera sits ahead
  // of the sports car looking back down the road, so the car AND the two
  // police cars trailing behind it are in frame at once (a rear chase
  // camera can never show the pursuit).
  if (SHOT === 'play' && SEED !== 2 && state === 'playing' && player.currentCar) {
    const car = player.currentCar;
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    camera.position.set(
      car.position.x + fx * 24,
      (car.position.y || 0) + 6.5,
      car.position.z + fz * 24,
    );
    camera.lookAt(car.position.x - fx * 8, 1.5, car.position.z - fz * 8);
    return;
  }

  const focus = player.onFoot ? player.position : (player.currentCar ? player.currentCar.position : player.position);
  const driving = !player.onFoot;
  // Round 10: when the L key is framing a TALL landmark (the Spire,
  // focusY 95) from close in, pull the chase camera back — at 16 m the
  // 95 m tower fills the 62° FOV and the crown is cropped. Only while
  // the focus window is open and the player is within 40 m of the tower
  // axis; far looks and short landmarks (Bridge / Pyramid focusY <= 64)
  // are untouched, and the look target still blends to the landmark.
  let focusPullBack = 1;
  if (landmarkFocus && landmarkFocus.y >= 90) {
    const dAxis = Math.hypot(focus.x - landmarkFocus.x, focus.z - landmarkFocus.z);
    if (dAxis < 40) {
      // Only pull back when the camera already sits on the FAR side of
      // the player from the tower (camera offset dot player->tower < 0):
      // pulling back from the tower side would push the camera into
      // the tower mesh instead of away from it.
      const tx = landmarkFocus.x - focus.x, tz = landmarkFocus.z - focus.z;
      if (tx * Math.sin(camYaw) + tz * Math.cos(camYaw) < 0) focusPullBack = 1.6;
    }
  }
  // Round 3: C toggles the chase camera near / far.
  // Round-5: mouse wheel zooms the chase camera (each notch ~8%).
  const wheel = input.consumeWheelDelta ? input.consumeWheelDelta() : 0;
  if (wheel) camZoom = Math.max(0.8, Math.min(1.35, camZoom * (1 + wheel * 0.0008)));
  const dist = (driving ? CONFIG.camera.drivingDistance : CONFIG.camera.onFootDistance) * (camFar ? 1.35 : 1) * camZoom * (player.chaseDistanceMul || 1) * focusPullBack;
  const height = (driving ? CONFIG.camera.drivingHeight : CONFIG.camera.onFootHeight) * (player.chaseHeightMul || 1);
  // Round-3 polish: the field of view opens up at speed while the
  // throttle is held, so fast driving feels fast.
  const feel = CONFIG.drivingFeel;
  const speedRatio = driving && player.currentCar
    ? Math.min(1, Math.abs(player.currentCar.speed || 0) / (player.currentCar.topSpeed || 38)) : 0;
  const throttling = typeof input.isDownAny === 'function' && input.isDownAny('KeyW', 'ArrowUp');
  const targetFov = feel.fovBase + (driving && throttling ? feel.fovKick * speedRatio : 0);
  if (Math.abs(camera.fov - targetFov) > 0.05) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  // Ease the chase camera behind the car when the player is not steering it.
  if (driving && player.currentCar && performance.now() - lastMouseMoveAt > 2500) {
    const want = player.currentCar.heading + Math.PI;
    let diff = want - camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    camYaw += diff * Math.min(1, dt * 1.2);
  }
  const px = focus.x + Math.sin(camYaw) * dist;
  const pz = focus.z + Math.cos(camYaw) * dist;
  const py = (focus.y || 0) + height + Math.sin(camPitch) * dist * 0.45;
  camera.position.set(px, py, pz);
  let lookX = focus.x - Math.sin(camYaw) * CONFIG.camera.lookAhead;
  let lookZ = focus.z - Math.cos(camYaw) * CONFIG.camera.lookAhead;
  let lookY = (focus.y || 0) + 1.4;
  // Round 6: the L key points the camera at a landmark — while the
  // focus window is open, the look target blends toward the landmark
  // (ease in/out over 0.5 s, smoothstepped in round 7 so the swing
  // starts and lands softly), then blends back to the player.
  if (landmarkFocus && performance.now() < landmarkFocus.until) {
    const remaining = landmarkFocus.until - performance.now();
    const w = smoothstep(0, 1, clamp01(Math.min((4000 - remaining) / 500, remaining / 500)));
    lookX = lerp(lookX, landmarkFocus.x, w);
    lookZ = lerp(lookZ, landmarkFocus.z, w);
    lookY = lerp(lookY, landmarkFocus.y, w);
  } else if (landmarkFocus) {
    landmarkFocus = null; // focus window expired
  }
  camera.lookAt(lookX, lookY, lookZ);
  followSun(focus.x, focus.z);
}

// ---- combat input ---------------------------------------------------------

function aimPoint() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return {
    x: camera.position.x + dir.x * 50,
    y: camera.position.y + dir.y * 50,
    z: camera.position.z + dir.z * 50,
  };
}

function doPunch() {
  if (state !== 'playing' || !player.onFoot) return;
  player.startPunchWindup?.(); // round 4: punch wind-up lean
  const targets = combat.collectTargets({ traffic, police });
  const hit = combat.punch(player, targets);
  if (hit && hit.killed) showMessage('Target down.');
  // Round 6: a landed punch near a landmark pays a one-off $25
  // showdown bonus per landmark (combat tracks which are claimed).
  if (hit && typeof combat.landmarkBonusAt === 'function') {
    const bonus = combat.landmarkBonusAt(player.position, landmarkList, 30);
    if (bonus) {
      money += bonus.bonus;
      totalEarned += bonus.bonus;
      audio.playCash();
      showMessage(`Showdown at ${bonus.landmark}: +$${bonus.bonus}.`);
    }
  }
}

function doShoot() {
  if (state !== 'playing') return;
  combat.selectWeapon('pistol');
  const targets = combat.collectTargets({ traffic, police });
  const result = combat.shoot(aimPoint(), player, targets);
  if (result && result.reason === 'no-ammo') showMessage('Out of ammo.');
  else if (result && result.fired) combat.selectWeapon('fists');
}

function tryEnterExitCar() {
  if (state !== 'playing') return;
  if (!player.onFoot) {
    player.exitCar();
    audio.playDoorSlam();
    return;
  }
  const jacked = traffic.jackNearestCar(player, CONFIG.player.enterCarDistance);
  if (jacked) {
    audio.playDoorSlam();
    police.reportCrime('carjack');
    showMessage('Carjacked — the law is coming.');
    return;
  }
  // Parked / staged cars (not traffic) can be entered too.
  const near = findNearestCar([...spawnedCars], player.position, CONFIG.player.enterCarDistance);
  if (near && near.driver !== 'police') {
    player.enterCar(near);
    audio.playDoorSlam();
  }
}

// ---- keyboard / mouse ------------------------------------------------------

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const code = event.code;
  if (code === 'KeyM') {
    audio.toggleMute();
    showMessage(audio.isMuted() ? 'Muted.' : 'Sound on.');
    return;
  }
  if (code === 'KeyP' || code === 'Escape') {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
    return;
  }
  // Round 3: C toggles the chase camera near / far.
  if (code === 'KeyC') {
    if (state === 'playing') {
      camFar = !camFar;
      showMessage(camFar ? 'Camera: far.' : 'Camera: near.');
    }
    return;
  }
  // Round-8: V cycles the chase-camera distance (near -> mid -> far).
  // player.cycleChaseDistance() owns the level; the input singleton
  // keeps its own copy, so sync it after the cycle. This handler is
  // registered before input.attach(), so it runs first — and input.js
  // ALSO cycles its level on V, which would double-step: stop the
  // event here so the input listener never sees this press.
  if (code === 'KeyV') {
    if (state === 'playing') {
      const level = player.cycleChaseDistance();
      if (typeof input.setChaseDistanceLevel === 'function') input.setChaseDistanceLevel(player.chaseDistanceLevel);
      showMessage(`Camera: ${level.name}.`);
      if (typeof hud.showChaseDistanceToast === 'function') hud.showChaseDistanceToast(level.name);
      event.stopImmediatePropagation();
    }
    return;
  }
  // Round 6: L looks at the nearest landmark — the camera swings to
  // frame the nearest landmark for a few seconds.
  // Round 7: NO cycling — L always frames the NEAREST landmark. (An
  // earlier round-7 draft cycled to the next landmark while a focus was
  // active, but that made L unpredictable: walking to the Pyramid and
  // pressing L framed the Bridge instead. Nearest is the contract.)
  if (code === 'KeyL') {
    if (state === 'playing' && landmarkList.length) {
      const nearest = nearestLandmark(player.position);
      if (nearest) {
        landmarkFocus = {
          x: nearest.focusX ?? nearest.x,
          y: nearest.focusY ?? 30,
          z: nearest.focusZ ?? nearest.z,
          name: nearest.name,
          until: performance.now() + 4000,
        };
        hud.showLandmark?.(nearest.name, 4);
        showMessage(`Look: ${nearest.name}.`);
      }
    }
    return;
  }
  if (state !== 'playing') return;
  if (code === 'KeyE') tryEnterExitCar();
  else if (code === 'KeyF') doPunch();
  else if (code === 'KeyR') {
    if (missions.isFailed() || state === 'busted' || state === 'wasted') {
      resetGame(missions.lastFailedMission || missions.getCurrentMissionNumber() || 1);
    }
  }
});
canvas.addEventListener('click', () => {
  if (state !== 'playing') return;
  if (input.pointerLocked) doShoot();
  else input.requestPointerLock(canvas);
});
document.getElementById('start-button')?.addEventListener('click', () => {
  audio.ensureContext();
  audio.playClick(); // round-4b: the START button answers with a click
  input.requestPointerLock(canvas);
  startPlaying();
});
document.getElementById('resume-button')?.addEventListener('click', resumeGame);
document.getElementById('restart-button')?.addEventListener('click', () => resetGame(1));

// Round-4b: the menu shows the saved profile's progress (if any), so a
// returning player sees what they have earned before pressing START.
{
  const el = document.getElementById('save-stats');
  const summary = el ? save.getSummary() : null;
  if (el && summary) {
    const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
    el.textContent = 'Profile: ' + plural(summary.missionsCompleted, 'mission') + ' done'
      + ' · $' + summary.totalEarned.toLocaleString() + ' earned'
      + ' · ' + plural(summary.gamesPlayed, 'game') + ' finished'
      // Round 6: the landmarks this profile has visited, when any.
      + (summary.landmarksVisited ? ' · ' + plural(summary.landmarksVisited, 'landmark') + ' visited' : '');
  }
}
document.getElementById('busted-retry-button')?.addEventListener('click', () => {
  resetGame(missions.lastFailedMission || missions.getCurrentMissionNumber() || 1);
});
document.getElementById('wasted-retry-button')?.addEventListener('click', () => {
  resetGame(missions.lastFailedMission || missions.getCurrentMissionNumber() || 1);
});
document.getElementById('mission-continue-button')?.addEventListener('click', () => {
  const next = (missions.lastCompletedMission || 1) + 1;
  state = 'playing';
  showOnly(null);
  if (next <= 5) missions.startMission(next, world, systems());
});

// ---- the frame update, in the specified order ------------------------------

function update(dt) {
  // Round-3 polish: the living world — clouds drift and traffic lights
  // cycle in every state (the menu backdrop included).
  if (typeof world.updateClouds === 'function') world.updateClouds(dt);
  if (typeof world.updateTrafficLights === 'function') world.updateTrafficLights(dt);
  // Round-4 polish: the living water and sky — shoreline foam, bobbing
  // buoys and moored boats, cruising boats, bird flocks. Same every
  // state, so the menu backdrop breathes too.
  ambientClock += dt;
  if (typeof world.updateAmbient === 'function') world.updateAmbient(ambientClock);

  // 1. input — mouse look while playing with pointer lock.
  if (state === 'playing') {
    const { dx, dy } = input.consumeMouseDelta();
    if (dx !== 0 || dy !== 0) {
      camYaw -= dx * 0.0032;
      camPitch = Math.max(-0.55, Math.min(0.55, camPitch - dy * 0.0022));
      lastMouseMoveAt = performance.now();
    }
    // One-shot keys (round-2 polish): H honks the horn while driving.
    for (const code of input.consumePressed()) {
      if (code === 'KeyH' && player.currentCar) audio.playHorn();
    }
  } else {
    input.consumeMouseDelta();
    input.consumePressed(); // drain so menu keypresses never fire in-game
  }

  if (state === 'menu') {
    // A living backdrop behind the title: traffic cruises downtown.
    traffic.update(dt, world, player);
    syncPersonMeshes(traffic.getPedestrians(), pedMeshes);
    updateCamera(dt);
    return;
  }
  if (state !== 'playing') {
    updateCamera(dt);
    return;
  }

  // Clock advances slowly (a full day in ~14 minutes of play).
  timeOfDay = (timeOfDay + dt * 0.024) % 24;
  playTimeSeconds += dt; // persisted by save v2

  // 2. player or driven car.
  if (player.onFoot) {
    player.update(dt, input, world, camYaw);
  } else if (player.currentCar) {
    // Staged chase shot: hold the car at speed (no throttle input in a
    // headless shot, so drag would otherwise bleed it to a crawl).
    if (SHOT === 'play' && SEED !== 2) player.currentCar.speed = 26;
    player.currentCar.update(dt, world, undefined, input);
  }

  // Round-3 polish: a tyre screech on a hard handbrake skid (throttled),
  // and a footstep thud each time Rico's walk cycle crosses a step.
  if (player.currentCar?.skidding) {
    const nowS = performance.now() / 1000;
    if (nowS - lastSkidAt > (CONFIG.drivingFeel?.screechCooldown ?? 0.9)) {
      lastSkidAt = nowS;
      audio.playSkid();
    }
  }
  if (player.onFoot && player.speed > 0.5) {
    const stepPhase = Math.floor(player.walkPhase / Math.PI);
    if (stepPhase !== lastStepPhase) {
      lastStepPhase = stepPhase;
      audio.playStep();
    }
  }

  // 3. traffic.
  traffic.update(dt, world, player);
  syncPersonMeshes(traffic.getPedestrians(), pedMeshes);

  // 4. police. (In a staged shot the police never damage the player:
  // a ram during the settle/wait would waste the staged run.)
  police.update(dt, world, player, {
    // Round-8: combat rides along so the police ram branch can record
    // the bumper contact point for the spark flash (recordRamImpact).
    combat,
    damagePlayer: (amount, source) => {
      if (SHOT_MODE) return;
      combat.damagePlayer(amount, source);
      player.health = combat.getHealth();
    },
  });
  syncPersonMeshes(police.getOfficers(), officerMeshes, '#1a2a4a');

  // Police light bars (round-2 polish): flash every police car's roof
  // bar on the siren phase.
  for (const pc of police.getPoliceCars()) {
    setPoliceLightPhase(pc, police.getSirenPhase());
  }

  // 5. missions.
  missions.update(dt, world, player, systems());

  // Round 6: landmark visits — the first time Rico reaches a landmark,
  // mark it visited (gold HUD label + chime + saved to the profile).
  // The checkpoint save runs here so the discovery survives a closed
  // tab: the next session restores it in startPlaying().
  if (landmarkList.length && typeof player.checkLandmark === 'function') {
    const visited = player.checkLandmark(landmarkList, 25);
    if (visited) {
      const progress = `${player.landmarksVisited.size}/${landmarkList.length}`;
      hud.showLandmark?.(visited, 5, progress);
      if (typeof audio.playLandmark === 'function') audio.playLandmark(visited);
      showMessage(`Landmark visited: ${visited} (${progress}).`);
      saveProgress(missions.getCurrentMissionNumber?.() ?? null);
    }
  }

  // 6. combat (cooldowns) + health mirror.
  combat.update(dt);
  player.health = combat.getHealth();
  if (muzzleTimer > 0) {
    muzzleTimer -= dt;
    muzzle.scale.setScalar(Math.max(0.4, 1.6 * (muzzleTimer / 0.06)));
    if (muzzleTimer <= 0) muzzle.visible = false;
  }
  // Shot tracer (round-2 polish): draw the line from the muzzle to the
  // shot's target and fade it over its 0.09 s lifetime.
  const tracer = combat.consumeTracer();
  if (tracer) {
    const pos = tracerGeo.attributes.position;
    pos.setXYZ(0, tracer.from.x, tracer.from.y, tracer.from.z);
    pos.setXYZ(1, tracer.to.x, tracer.to.y, tracer.to.z);
    pos.needsUpdate = true;
    // Round-5: the tracer carries its sunset tint from combat.js.
    if (tracer.color) tracerMat.color.set(tracer.color);
    tracerTimer = tracer.timer;
    tracerLine.visible = true;
  }
  if (tracerTimer > 0) {
    tracerTimer -= dt;
    tracerMat.opacity = Math.max(0, tracerTimer / 0.09);
    if (tracerTimer <= 0) tracerLine.visible = false;
  }
  // Round-3 polish: the hit-impact flash at the point a shot or punch lands.
  const impact = combat.consumeImpact();
  if (impact) flashImpact(impact.position, impact.kind);
  if (impactTimer > 0) {
    impactTimer -= dt;
    impactMesh.scale.setScalar(Math.max(0.3, 1.8 * (impactTimer / 0.12)));
    if (impactTimer <= 0) impactMesh.visible = false;
  }

  // Busted / wasted can be raised by police or combat during the update.
  if (police.isBusted()) { showBusted(); return; }
  if (combat.isPlayerDown() || player.health <= 0) { showWasted(); return; }
  if (state !== 'playing') return; // a mission-complete event changed state

  // 7. HUD.
  const crosshair = document.getElementById('crosshair');
  if (crosshair) crosshair.classList.toggle('hidden', !player.onFoot);
  const car = player.currentCar;
  const speedMs = car ? Math.abs(car.speed || 0) : Math.abs(player.speed || 0);
  const marker = missions.getMarkerPosition(world);
  // Round-9: no 3D waypoint beacon any more (see the note above the
  // muzzle flash) — the marker position still feeds the HUD objective
  // text, the minimap diamond and the __solmar probe below.
  // Round-3 polish: the mission name carries the par-time countdown, and
  // the HUD shows which district Rico is standing in.
  const mission = missions.getCurrentMission();
  const parLeft = missions.getParRemaining();
  const parText = parLeft === null ? ''
    : ` · PAR ${Math.floor(parLeft / 60)}:${String(Math.floor(parLeft % 60)).padStart(2, '0')}`;
  hud.update({
    dt,
    health: combat.getHealth(),
    maxHealth: combat.getMaxHealth(),
    armour: combat.getArmour(),
    money,
    wanted: police.getWantedLevel(),
    speed: speedMs,
    objective: missions.getCurrentObjectiveText() || 'Explore Solmar Bay.',
    missionName: mission ? mission.name + parText : '',
    missionProgress: missions.getMissionProgress(), // round 4
    parRemaining: missions.getParRemaining(), // round 4
    hitCount: combat.hitCount, // round 4
    hitKilled: combat.lastHit?.killed ?? false, // round 4
    combo: combat.getCombo(), // round-4b: the combo label follows this
    policeOfficers: police.getOfficers(), // round 4
    district: world.districtAt(player.position.x, player.position.z) || '',
    // Round 8: near a stepped tower the district label reads
    // "Stepped Quarter" (hud.js names it from this flag).
    steppedQuarter: (world.steppedTowers || []).some((t) => Math.hypot(
      player.position.x - t.x, player.position.z - t.z,
    ) <= (CONFIG.round8?.steppedQuarterRadius ?? 45)),
    timeOfDay,
    message: messageText || undefined,
    ammo: combat.getAmmo(),
    mag: combat.getMag(),
    police: police.getUnits(),
    traffic: traffic.getCars(),
    pedestrians: traffic.getPedestrians(),
    marker: marker ? { x: marker.x, z: marker.z } : null,
    player,
    world,
  });

  // 8. audio.
  if (car) {
    if (!audio.engineOn) audio.startEngine();
    audio.setEngineSpeed(Math.abs(car.speed || 0), true);
  } else {
    audio.stopEngine();
  }
  // Round-3 polish: the siren swells as the nearest police unit closes in.
  if (police.isSirenOn()) {
    const d = police.nearestUnitDistance(player);
    audio.setSirenVolume(1 - Math.min(1, d / 120));
  }
  // Round-4 polish: ambient bed follows Rico (surf near the beach/marina).
  audio.setAmbient(player.position, world.districtAt(player.position.x, player.position.z) || '');
  // Round-4b: the combo sting rises in pitch as the combo grows.
  const comboNow = combat.getCombo();
  if (comboNow > lastCombo && comboNow >= 2) audio.playCombo(comboNow);
  lastCombo = comboNow;

  updateCamera(dt);
}

// ---- shot staging (deterministic, before the first frame) ------------------

function stageStart() {
  state = 'menu';
  showOnly('start');
  player.teleport(world.spawns.downtown.x, world.spawns.downtown.z, world.spawns.downtown.heading);
  orbitAngle = 0.6;
  timeOfDay = 12;
}

function stagePlay() {
  state = 'playing';
  showOnly(null);
  input.attach(canvas);
  if (SEED === 2) {
    // On foot in a busy downtown street (round 9: the 3D waypoint
    // beacon was removed — the objective is shown on the HUD/minimap).
    player.teleport(120, -40, 2.6);
    camYaw = player.heading + Math.PI;
    timeOfDay = 15;
  } else {
    // Driving a sports car through downtown at speed, three stars,
    // two police cars in pursuit, traffic around.
    const car = createCar(scene, 'sports', 0xd7263d, 40, -80, 0);
    spawnedCars.add(car);
    car.speed = 26;
    player.teleport(40, -80, 0);
    player.enterCar(car);
    camYaw = car.heading + Math.PI;
    timeOfDay = 12.5;
    police.maxPoliceCars = 2;
    police.maxOfficers = 0;
    police.addWanted(3);
    // Two pursuit cars on the same road behind the player, so the chase
    // reads immediately instead of spawning somewhere behind a building.
    // Close behind (18 m / 30 m): the staged front camera looks back
    // down the road at the player, so the pursuit is in frame.
    const pc1 = makeCar({ position: { x: 40, y: 0, z: -98 }, heading: 0, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
    const pc2 = makeCar({ position: { x: 40, y: 0, z: -110 }, heading: 0, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
    for (const pc of [pc1, pc2]) {
      pc.kind = 'police-car';
      pc.siren = true;
      pc.speed = 24;
    }
    police.policeCars = [pc1, pc2];
  }
  missions.startMission(1, world, systems());
  // Settle the scene: spawn traffic, let the chase form, fill the HUD.
  for (let i = 0; i < 24; i++) update(1 / 60);
  // The settle drive trips the speeding-heat rule once (26 m/s past a
  // patrol car); pin the wanted level back to the staged three stars.
  // The speeding cooldown is still running, so it holds for the shot.
  if (SEED !== 2) police.setWanted(3);
}

function stageEnd() {
  state = 'mission-complete';
  timeOfDay = 18.6;
  // Sunset: low warm sun, orange sky and haze. The sky dome is repainted
  // with the sunset palette (round-2 polish); the scene background stays
  // as a fallback colour behind it.
  world.sky.setPalette(CONFIG.colors.sunsetTop, CONFIG.colors.sunsetHorizon);
  scene.background = new THREE.Color(CONFIG.colors.sunsetHorizon);
  scene.fog = new THREE.Fog(CONFIG.colors.sunsetFog, 200, 850);
  sunLight.color.set(0xffb36b);
  sunLight.intensity = 2.4;
  sunLight.position.set(-260, 70, 260);
  hemiLight.intensity = 0.85;
  // Round 7: the mission-complete vista uses the round-7 exposure
  // (1.28) so the burnt-sienna sky stays luminous at the end screen.
  renderer.toneMappingExposure = CONFIG.round7?.exposure ?? 1.25;
  // Player on the camera side of the parked car, facing the water.
  // Both stand ON the x=200 road: the marina shore blocks hold buildings
  // (the previous spot put them behind one).
  player.teleport(203, -131, Math.PI / 2);
  const car = createCar(scene, 'coupe', 0x2e86c1, 198, -130, 0);
  spawnedCars.add(car);
  // Staged vista: camera on the shore road south of the subjects,
  // looking north-east down the road to the marina — subjects in the
  // near foreground right of centre (clear of the overlay text), water,
  // piers and sunset sky beyond them.
  camera.position.set(180, 3.5, -105);
  camera.lookAt(192, 2, -145);
  if (completeText) completeText.textContent = 'First Run — clean work, Rico.';
  if (completeReward) completeReward.textContent = '+$500';
  showOnly('complete');
  // Let the vista show through the overlay in this staged shot.
  if (overlays.complete) overlays.complete.style.background = 'rgba(8, 50, 24, 0.42)';
  missions.startMission(1, world, systems());
  missions.completed.add(1);
}

// ---- boot ------------------------------------------------------------------

if (SHOT === 'start') stageStart();
else if (SHOT === 'play') stagePlay();
else if (SHOT === 'end') stageEnd();
else {
  state = 'menu';
  showOnly('start');
}

// Fixed-ish timestep: accumulate real time, step the simulation at 60 Hz.
let lastNow = performance.now();
let accumulator = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  // Round-4 polish: hit-stop freeze — consume the combat timer once, then
  // hold rendering (no stepping) until the deadline passes.
  const hs = combat.consumeHitStop?.() || 0;
  if (hs > 0) hitStopUntil = Math.max(hitStopUntil, performance.now() + hs * 1000);
  if (now < hitStopUntil && state === 'playing') {
    lastNow = now; accumulator = 0; renderer.render(scene, camera); return;
  }
  const frameDt = Math.min((now - lastNow) / 1000, 0.1);
  lastNow = now;
  accumulator += frameDt;
  let steps = 0;
  while (accumulator >= STEP && steps < 4) {
    update(STEP);
    accumulator -= STEP;
    steps += 1;
  }
  if (steps === 4) accumulator = 0;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// Handle for headless checks: state, systems and the scene.
window.__solmar = {
  get state() { return state; },
  get money() { return money; },
  get timeOfDay() { return timeOfDay; },
  player,
  police,
  traffic,
  missions,
  combat,
  world,
  scene,
  camera,
  // Round-9: the mission beacon was removed (it rendered as the yellow
  // sun-streak artifact); the marker position is still exposed below.
  // Round-4 probes: the living world — bird flocks, buoys, the foam strip.
  get birds() { return world.birds || []; },
  get buoys() { return world.buoys || []; },
  get water() { return world.water || null; },
  get marker() { return missions.getMarkerPosition(world); },
  // Round-5 probes: the dramatic sunset sky + geometry windows.
  get round5() {
    const r5 = CONFIG.round5 || {};
    return {
      sky: {
        top: '#' + CONFIG.colors.skyTop.toString(16).padStart(6, '0'),
        horizon: '#' + CONFIG.colors.skyHorizon.toString(16).padStart(6, '0'),
        fog: scene.fog ? '#' + scene.fog.color.getHexString() : null,
        background: scene.background ? '#' + scene.background.getHexString() : null,
        exposure: renderer.toneMappingExposure,
        sun: r5.sun || null,
      },
      windows: world.round5 || null,
    };
  },
  // Round-6 probes: the warm sunset sky, sculpted cars, the Solmar
  // Spire and the Marina Bridge — the three gaps round 6 exists to close.
  // Round 7 warmed the zenith again (0x40203a -> 0x4a2a20), so the
  // `warm` flag now checks the round-7 burnt-sienna zenith.
  get round6() {
    const r6 = CONFIG.round6 || {};
    const cars = typeof traffic.getCars === 'function' ? traffic.getCars() : [];
    return {
      sky: {
        top: '#' + CONFIG.colors.skyTop.toString(16).padStart(6, '0'),
        horizon: '#' + CONFIG.colors.skyHorizon.toString(16).padStart(6, '0'),
        fog: scene.fog ? '#' + scene.fog.color.getHexString() : null,
        sun: r6.sun || null,
        warm: !!(r6.sky && r6.sky.top === 0x4a2a20),
      },
      landmarks: world.landmarks || null,
      landmarkList: landmarkList.map((lm) => ({ name: lm.name, x: lm.x, z: lm.z })),
      visited: [...(player.landmarksVisited || [])],
      cars: cars.map((c) => ({ model: c.model || c.kind || null, sculpt: c.sculpt || null })),
    };
  },
  // Round-7 probes: the luminous Spire, the burnt-sienna zenith, the
  // Solmar Pyramid and the red pickup — the three gaps round 7 exists
  // to close. `spireLuminous` is a runtime check of the tower's actual
  // material (unlit MeshBasicMaterial), not a config claim.
  get round7() {
    const r7 = CONFIG.round7 || {};
    const r6 = CONFIG.round6 || {};
    const cars = typeof traffic.getCars === 'function' ? traffic.getCars() : [];
    const pickup = cars.find((c) => String(c.model || '').toLowerCase().includes('pickup'));
    return {
      sky: {
        top: '#' + CONFIG.colors.skyTop.toString(16).padStart(6, '0'),
        horizon: '#' + CONFIG.colors.skyHorizon.toString(16).padStart(6, '0'),
        fog: scene.fog ? '#' + scene.fog.color.getHexString() : null,
        sun: r6.sun || null,
        zenith: CONFIG.colors.skyTop,
        // The mids paintSky() actually renders (R5.sky.mids), not the
        // round6 mirror — the 0.30 stop must be warm sienna, not mauve.
        mids: (CONFIG.round5 && CONFIG.round5.sky && CONFIG.round5.sky.mids) || null,
        warm: CONFIG.colors.skyTop === 0x4a2a20,
      },
      spireLuminous: !!(world.round7 && world.round7.spireLuminous),
      landmarks: world.landmarks || null,
      landmarkList: landmarkList.map((lm) => ({ name: lm.name, x: lm.x, z: lm.z })),
      pyramid: (world.landmarks && world.landmarks.pyramid) || null,
      round7world: world.round7 || null,
      visited: [...(player.landmarksVisited || [])],
      pickupSculpt: pickup ? (pickup.sculpt || null) : null,
      cars: cars.map((c) => ({ model: c.model || c.kind || null, sculpt: c.sculpt || null })),
    };
  },
  // Round-8 probes: skyline diversity — the stepped-tower archetype,
  // the new roofline types, and the stepped-tower positions, read
  // straight off the world object (runtime counts, not config claims).
  get round8() {
    return {
      ...(world.round8 || null),
      round4b: world.round4b || null,
      steppedTowers: (world.steppedTowers || []).map((t) => ({
        x: t.x, z: t.z, height: t.height, w: t.w, d: t.d, tiers: t.tiers,
      })),
      steppedPlaza: world.steppedPlaza || null,
    };
  },
  // Round-9 probes: the four fixes, all read off the live scene (not
  // config claims) — integrated roofs fleet-wide, luminous Spire glass
  // (shell + core + halos), the eye-level sky gradient, and the removed
  // waypoint beacon (no beacon handle, no tall depthTest-off mesh).
  get round9() {
    let shell = null;
    let core = false;
    let haloShells = 0;
    let depthOffTall = 0;
    let skyTex = null;
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const h = o.geometry && o.geometry.parameters ? (o.geometry.parameters.height || 0) : 0;
      if (Math.abs(h - 95) < 0.01) {
        if (o.material.transparent && o.material.map && o.material.blending !== THREE.AdditiveBlending) {
          shell = { opacity: o.material.opacity, map: true };
        } else if (!o.material.transparent && o.material.map) {
          core = true;
        } else if (o.material.transparent && o.material.blending === THREE.AdditiveBlending) {
          haloShells += 1;
        }
      }
      if (o.material.depthTest === false && h >= 20) depthOffTall += 1;
      if (o.material.map && o.material.map.image && o.geometry && o.geometry.parameters
        && (o.geometry.parameters.radius || 0) === 900) {
        skyTex = { w: o.material.map.image.width, h: o.material.map.image.height };
      }
    });
    let roofReport = null;
    try { roofReport = (typeof traffic.getSculptedCarsReport === 'function') ? traffic.getSculptedCarsReport() : null; } catch (_) { roofReport = null; }
    return {
      beaconHandle: 'removed',
      depthOffTall,
      spire: { shell, core, haloShells },
      sky: {
        top: '#' + CONFIG.colors.skyTop.toString(16).padStart(6, '0'),
        horizon: '#' + CONFIG.colors.skyHorizon.toString(16).padStart(6, '0'),
        mids: (CONFIG.round5 && CONFIG.round5.sky && CONFIG.round5.sky.mids) || null,
        skyTex,
      },
      roofs: roofReport ? roofReport.totals : null,
      roofsPerModel: roofReport ? roofReport.perModel : null,
    };
  },
  // Round-10 probes: the three lanes, all read off the live scene.
  // spireFalloff — the camera's distance to the Spire axis + the LIVE
  // shell/core/halo values at that distance (Lane A: at >= 60 m they
  // equal the round-9 constants; closer they dim, shell opacity stays
  // 0.72). skyEyeBand — the painted sky canvas's luminance spread over
  // the 0.40 -> 0.47 stops, the eye-level band (Lane B: round-9
  // palette 49.8, round-10 palette ~109). facades — world.round10
  // counts (Lane C). All three are runtime reads, not config claims.
  get round10() {
    const spireCfg = (CONFIG.round9 && CONFIG.round9.spire) || {};
    const axisX = 80, axisZ = -80, topY = 95;
    const cp = camera.position;
    const cy = Math.min(Math.max(cp.y, 0), topY);
    const camD = Math.hypot(cp.x - axisX, cp.z - axisZ, cp.y - cy);
    let shell = null;
    let core = null;
    const halos = [];
    let skyEyeBand = null;
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const h = o.geometry && o.geometry.parameters ? (o.geometry.parameters.height || 0) : 0;
      if (Math.abs(h - 95) < 0.01) {
        if (o.material.transparent && o.material.map && o.material.blending !== THREE.AdditiveBlending) {
          shell = { opacity: +o.material.opacity.toFixed(3), color: +o.material.color.r.toFixed(3) };
        } else if (!o.material.transparent && o.material.map) {
          core = { color: +o.material.color.r.toFixed(3) };
        } else if (o.material.transparent && o.material.blending === THREE.AdditiveBlending) {
          halos.push(+o.material.opacity.toFixed(3));
        }
      }
      if (!skyEyeBand && o.material.map && o.material.map.image
        && o.geometry && o.geometry.parameters && (o.geometry.parameters.radius || 0) === 900) {
        try {
          const canvas = o.material.map.image;
          const ctx = canvas.getContext('2d');
          // Eye-level band: canvas rows for stops 0.40..0.47
          // (512 rows * stop). Luminance max-min across the band.
          const lums = [];
          for (let y = Math.floor(0.40 * 512); y <= Math.floor(0.47 * 512); y++) {
            const d = ctx.getImageData(32, y, 1, 1).data;
            lums.push(0.299 * d[0] + 0.587 * d[1] + 0.114 * d[2]);
          }
          skyEyeBand = { spread: +(Math.max(...lums) - Math.min(...lums)).toFixed(1), samples: lums.length };
        } catch (_) { skyEyeBand = { error: 'unreadable' }; }
      }
    });
    return {
      spireFalloff: {
        camD: +camD.toFixed(1),
        falloffNear: spireCfg.falloffNear ?? null,
        falloffFar: spireCfg.falloffFar ?? null,
        shell, core, halos: halos.sort((a, b) => a - b),
      },
      skyEyeBand,
      sky: {
        mids: (CONFIG.round5 && CONFIG.round5.sky && CONFIG.round5.sky.mids) || null,
      },
      facades: world.round10 || null,
      round5windows: world.round5 || null,
    };
  },
};
