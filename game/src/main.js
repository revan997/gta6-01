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
import { createRng } from './random.js';
import { buildWorld } from './world.js';
import { createPlayer } from './player.js';
import { createCar, findNearestCar, attachPoliceLightBar, setPoliceLightPhase } from './vehicle.js';
import { createRenderContext } from './render.js';
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
const { renderer, camera, sunLight, hemiLight } = renderCtx;
scene.add(sunLight);
scene.add(sunLight.target);
scene.add(hemiLight);

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
};
world.getLocation = (name) => world.locations[name] || null;

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
  if (n.includes('van') || n.includes('bus')) return 'van';
  if (n.includes('sports')) return 'sports';
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
  },
});
const missions = new MissionManager({
  rng,
  locations: world.locations,
  events: {
    onMissionStart: ({ name }) => {
      // The briefing is long; the HUD already shows the objective, so the
      // toast stays short and never covers the middle of the screen.
      showMessage(name);
    },
    onObjective: ({ objective }) => showMessage(objective),
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
let timeOfDay = 12; // hours 0-24
let playTimeSeconds = 0; // accumulated in update(); persisted by save v2
let timesPlayed = 0; // sessions on this profile; persisted by save v2
let camYaw = player.heading + Math.PI;
let camPitch = 0;
let orbitAngle = 0.6;
let messageText = '';
let muzzleTimer = 0;
let lastMouseMoveAt = 0;

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
    addMoney: (n) => { money += n; },
  };
}

// ---- 3D helpers: mission beacon, muzzle flash, pedestrians, officers ---

const beacon = new THREE.Group();
const beaconBeam = new THREE.Mesh(
  // 160 m tall: a downtown sightline to the marina clears ~46 m rooftops
  // only above ~90 m, so a shorter pillar is invisible from the street.
  // depthTest off: the marker is a waypoint, meant to be seen through
  // the buildings between the player and the objective.
  new THREE.CylinderGeometry(2.2, 2.2, 160, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd94a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, depthTest: false }),
);
beaconBeam.position.y = 80;
beaconBeam.renderOrder = 999;
const beaconDiamond = new THREE.Mesh(
  new THREE.OctahedronGeometry(2.2),
  new THREE.MeshBasicMaterial({ color: 0xffd94a, depthTest: false }),
);
beaconDiamond.renderOrder = 999;
beaconDiamond.position.y = 12;
beacon.add(beaconBeam);
beacon.add(beaconDiamond);
beacon.visible = false;
scene.add(beacon);

const muzzle = new THREE.Mesh(
  new THREE.SphereGeometry(0.28, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffe98a }),
);
muzzle.visible = false;
scene.add(muzzle);

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
      for (const n of loaded.completedMissions || []) missions.completed.add(n);
      if (loaded.position) {
        player.teleport(loaded.position.x, loaded.position.z, loaded.heading ?? player.heading);
        camYaw = player.heading + Math.PI;
      }
      if (typeof loaded.wanted === 'number') police.setWanted(loaded.wanted);
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
  save.save({
    money,
    completedMissions: missions.getCompletedMissions(),
    currentMission: null,
    position: player.position,
    heading: player.heading,
    wanted: police.getWantedLevel(),
    health: combat.getHealth(),
    armour: combat.getArmour(),
    ammo: combat.getAmmo(),
    timeOfDay,
    playTimeSeconds,
    timesPlayed,
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
  const dist = driving ? CONFIG.camera.drivingDistance : CONFIG.camera.onFootDistance;
  const height = driving ? CONFIG.camera.drivingHeight : CONFIG.camera.onFootHeight;
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
  const lookX = focus.x - Math.sin(camYaw) * CONFIG.camera.lookAhead;
  const lookZ = focus.z - Math.cos(camYaw) * CONFIG.camera.lookAhead;
  camera.lookAt(lookX, (focus.y || 0) + 1.4, lookZ);
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
  const targets = combat.collectTargets({ traffic, police });
  const hit = combat.punch(player, targets);
  if (hit && hit.killed) showMessage('Target down.');
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
  input.requestPointerLock(canvas);
  startPlaying();
});
document.getElementById('resume-button')?.addEventListener('click', resumeGame);
document.getElementById('restart-button')?.addEventListener('click', () => resetGame(1));
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

  // 3. traffic.
  traffic.update(dt, world, player);
  syncPersonMeshes(traffic.getPedestrians(), pedMeshes);

  // 4. police. (In a staged shot the police never damage the player:
  // a ram during the settle/wait would waste the staged run.)
  police.update(dt, world, player, {
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
    tracerTimer = tracer.timer;
    tracerLine.visible = true;
  }
  if (tracerTimer > 0) {
    tracerTimer -= dt;
    tracerMat.opacity = Math.max(0, tracerTimer / 0.09);
    if (tracerTimer <= 0) tracerLine.visible = false;
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
  if (marker) {
    beacon.visible = true;
    beacon.position.set(marker.x, 0, marker.z);
    beaconDiamond.rotation.y += dt * 1.5;
    beaconDiamond.position.y = 12 + Math.sin(performance.now() / 350) * 0.8;
  } else {
    beacon.visible = false;
  }
  hud.update({
    dt,
    health: combat.getHealth(),
    maxHealth: combat.getMaxHealth(),
    armour: combat.getArmour(),
    money,
    wanted: police.getWantedLevel(),
    speed: speedMs,
    objective: missions.getCurrentObjectiveText() || 'Explore Solmar Bay.',
    missionName: missions.getCurrentMission() ? missions.getCurrentMission().name : '',
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
    // On foot in a busy downtown street, mission marker visible.
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
  renderer.toneMappingExposure = 1.25;
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
  beacon,
  get marker() { return missions.getMarkerPosition(world); },
};
