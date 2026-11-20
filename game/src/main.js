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
import { createCar, findNearestCar, attachPoliceLightBar, setPoliceLightPhase, attachHeroDetail } from './vehicle.js';
import { createRenderContext, boostCarPaintForCar, framingDistanceForHeight, makeGlowTexture, makeSignTexture } from './render.js';
import { input } from './input.js';
import { TrafficManager } from './traffic.js';
import { PoliceSystem, attachRoadblockLightPools } from './police.js';
import { MissionManager } from './missions.js';
import { CombatSystem } from './combat.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { SaveSystem } from './save.js';

const params = new URLSearchParams(window.location.search);
const seedRaw = Number.parseInt(params.get('seed') || '', 10);
const SEED = Number.isFinite(seedRaw) ? seedRaw : 1337;
const SHOT = params.get('shot') || '';
// Round-13 (Lane 3): the four new staged shots join the legacy three.
// SHOT_MODE silences pre-gesture audio and police damage in staged shots.
const SHOT_MODE = SHOT === 'start' || SHOT === 'play' || SHOT === 'end'
  || SHOT === 'cover-chase' || SHOT === 'combat' || SHOT === 'pursuit' || SHOT === 'sunset';

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
const { renderer, camera, sunLight, hemiLight, vehicleFillLight, fillLight } = renderCtx;
scene.add(sunLight);
scene.add(sunLight.target);
scene.add(hemiLight);
// Round-11 (Lane B, fill light): the warm bounce directional from
// render.js — shadowless, so it needs no follow; its target stays at
// the scene origin and its direction is constant. Lifts the
// shadow-side facades the low sun never reaches.
if (fillLight) {
  scene.add(fillLight);
  scene.add(fillLight.target);
}
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
    onComplete: ({ number, name, reward }) => {
      // Round 17: mission rewards are REAL guns, not toasts — Mama
      // Lou gifts the SMG for finishing mission 1 (First Run) and
      // the shotgun for finishing mission 3 (Borrowed Beauty). Both
      // are earned in normal play before chapter 5, never cheats.
      const r17w = CONFIG.round17?.weapons || {};
      if (number === (r17w.smgUnlockMission ?? 1) && combat.unlockWeapon('smg')) {
        showMessage('Mama Lou: the SMG is yours, Rico. Make it count.');
      }
      if (number === (r17w.shotgunUnlockMission ?? 3) && combat.unlockWeapon('shotgun')) {
        showMessage('Mama Lou: take the shotgun. The Harbour job needs it.');
      }
      // Round 18: the RIFLE is Mama Lou's reward for finishing mission
      // 4 (Long Tail) — the long-range precision gun, earned in normal
      // play before chapter 5, never a cheat. Same hook as the SMG /
      // shotgun above; unlockWeapon returns false on a re-unlock, so
      // the toast only ever fires once.
      const r18w = CONFIG.round18?.weapons || {};
      if (number === (r18w.rifleUnlockMission ?? 4) && combat.unlockWeapon('rifle')) {
        showMessage('Mama Lou: the rifle is yours, Rico. Long Tail pays long-range.');
      }
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

// Round-13 (Lane 3, screenshot director): deterministic staging state.
// shotCam — the staged camera for this shot: null (normal chase), or
// { mode: 'front', side } (ahead of the driven car, looking back at the
// chase — the player car AND the pursuit stay in frame; a rear chase
// camera can never show the pursuit) or { mode: 'fixed', pos, look } (a
// locked vista camera, e.g. the sunset story moment). shotHoldSpeed pins
// the staged car's speed (no throttle input headless, so drag would
// bleed it to a crawl). shotDialogue is the staged dialogue line,
// re-asserted every frame through hud.update so no mission/police toast
// can overwrite it mid-shot. shotRadio is the staged radio identity
// (the game has no real radio station yet — Lane 1's renderRadio reads
// this when present). shotSunOffset overrides the follow-sun offset for
// a shot (high noon sun for the pursuit); null keeps the default low
// golden-hour sun. shotHeli is the fallback police helicopter (built
// only when Lane 2 has not provided one — see buildShotHeli).
let shotCam = null;
let shotHoldSpeed = 0;
let shotDialogue = null;
let shotRadio = null;
let shotSunOffset = null;
let shotHeli = null;
// Round 18: the cover shopfront placement (stageCoverShopfront) —
// null until the cover shot stages it; the probe reads the placed
// window / sign / trim points off it.
let coverShopfront = null;
// Round 21: the Art Deco block (stageCoverDeco) + the east-tower
// shopfront (stageCoverEast) — staging-only probe points, same
// pattern as coverShopfront above.
let coverDeco = null;
let coverEast = null;
// Round 14 staging state (only ever set by stage*()): the pursuit
// roadblock pair + race rivals (repositioned every frame relative to
// the player car), and the combat shot's frozen muzzle flash + aim
// target (re-asserted every frame while the shot is staged).
let shotRoadblock = [];
let shotRivals = [];
// Round 20: staged cover traffic (stageCoverTraffic) — { car, dx, dz,
// heading, key } offsets from the player car, re-asserted every frame
// like the pursuit roadblock, so the two cars hold their framing at
// any capture moment while the GT drives on.
let shotTraffic = [];
// Round 15: staged pedestrians that TRACK the player car (cover +
// pursuit) — { ped, dx, dz } offsets from the car, re-asserted every
// frame in the update loop. The car drives on during the HUD
// convergence wait, so fixed world spots drift far up-frame and the
// peds shrink to dots; tracked peds hold their framing at any capture
// moment. Only the two driving shots use it (fixed cameras don't move).
let shotPeds = [];
let combatFlash = null;
let combatAimOfficer = null;
let landmarkFocus = null; // round 6: { x, y, z, name, until } — the L key points the camera at a landmark for a few seconds
let focusSeq = 0; // round-11: increments on every L press, so the probe can tell a fresh look from a stale one
// Round-11 (Lane A): occlusion-safe focus view — the solved clear
// viewpoint for the active landmarkFocus ({ azimuth, rise, dist, x, y,
// z, clear, tried }), sticky while the focus window is open so the
// camera never flip-flops between azimuths as the player moves.
// focusViewBlend eases 0 -> 1 toward the solved view while the window
// is open and back to 0 after it closes, so the camera glides instead
// of snapping. focusViewFor names the landmark the sticky view belongs
// to. round11Last is the live probe state for __solmar.round11Camera.
let focusView = null;
let focusViewFor = null;
let focusViewPoint = null; // focus point (x, y, z) the sticky view looks at — survives the focus window expiring, so the probe can still test the sightline while the blend decays
let focusViewBlend = 0;
// Round-11 flight recorder: the last look that actually settled
// (blend >= 0.95), snapshotted the moment it settles and kept after
// the window closes. The live blend decays within one headless frame
// of expiry, so a polling harness can never reliably observe the
// settled state itself — the snapshot is the durable evidence of
// what the camera did during the look. Overwritten by the next look
// that settles; `seq` (from the L press) tells a fresh snapshot from
// a stale one.
let round11Settled = null;
let round11FocusToastSeq = -1; // round-11 final: seq of the last settled look already toasted as CLEAR VIEW, so the toast fires once per look, not every frame while settled.
let focusViewWallNow = 0; // performance.now() at the last updateCamera call
let round11Last = {
  focusName: null, focusAzimuthDeg: null, focusRise: null, focusDist: null,
  focusClear: null, focusTried: 0, focusBlend: 0, focusPoint: null,
  cameraInside: false, cameraRescued: false, focusLosBlocked: false,
};
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

// Round 19 (stretch): the muzzle-flash HALO — a warm glow sprite
// around the frozen muzzle sphere in the combat shot, so the shot
// reads as a flash, not a pale dot (1 draw call while visible, 0
// otherwise; combat headroom ~279 calls). Positioned + made visible
// by the frozen combat block below, next to the muzzle sphere.
const muzzleHalo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeGlowTexture('rgba(255,255,255,0.95)'), transparent: true, depthWrite: false,
  opacity: CONFIG.round19?.smg?.muzzleHaloOpacity ?? 0.9, color: 0xffe9a8,
}));
muzzleHalo.scale.set(CONFIG.round19?.smg?.muzzleHaloScale ?? 2.5, CONFIG.round19?.smg?.muzzleHaloScale ?? 2.5, 1);
muzzleHalo.visible = false;
scene.add(muzzleHalo);

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

function makePersonMesh(shirtColor, hostile) {
  const g = new THREE.Group();
  const matShirt = new THREE.MeshStandardMaterial({ color: shirtColor || 0x888888, roughness: 0.9 });
  const matSkin = new THREE.MeshStandardMaterial({ color: 0xc98d64, roughness: 0.8 });
  const matPants = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.72, 0.3), matShirt);
  // Round 18: the torso mesh is tagged so syncPersonMeshes can
  // recolour it when a staged shot reassigns the ped's shirt
  // (cover: three distinct shirt colours, forced deterministically).
  body.userData.shirtMesh = true;
  g.userData.shirt = shirtColor || 0x888888;
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
  if (hostile) {
    // Round-13B (Lane B): a hostile reads as a hostile, not a
    // pedestrian. Red diamond marker floating just above the head
    // (unlit, always vivid) + a dark pistol held forward toward Rico
    // (local +z is the facing direction: rotation.y = heading).
    // Only built when `hostile` is passed (the combat shot) — normal
    // gameplay officers keep the plain mesh, so no other shot pays
    // for it. Cost per officer: +2 meshes, +20 tris.
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.38, 0),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    );
    marker.position.y = 2.25;
    g.add(marker);
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.14, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }),
    );
    gun.position.set(0.15, 1.15, 0.35);
    g.add(gun);
  }
  return g;
}
const pedMeshes = new Map();
const officerMeshes = new Map();
function syncPersonMeshes(list, meshMap, shirtColor, hostile) {
  const seen = new Set();
  for (const person of list) {
    seen.add(person);
    let mesh = meshMap.get(person);
    if (!mesh) {
      mesh = makePersonMesh(person.shirt || shirtColor, hostile);
      meshMap.set(person, mesh);
      scene.add(mesh);
    }
    mesh.position.set(person.position.x, person.position.y || 0, person.position.z);
    mesh.rotation.y = person.heading || 0;
    mesh.visible = person.alive !== false;
    // Round 18: a staged shirt reassignment (cover peds) recolours
    // the live torso material — the mesh is cached by person, so
    // changing person.shirt alone would never repaint it. Only the
    // shirt colour moves; skin / pants / markers are untouched.
    if (person.shirt && mesh.userData.shirt !== person.shirt) {
      mesh.userData.shirt = person.shirt;
      mesh.traverse((o) => {
        if (o.userData && o.userData.shirtMesh && o.material && o.material.color) {
          o.material.color.set(person.shirt);
        }
      });
    }
    // Round 14: a fallen officer lies on the ground (the combat shot's
    // downed officer). The mesh is a Y-up humanoid, so rotating about
    // X by ~-90° puts it flat; the red hostile marker hides (a downed
    // officer is not a target) while the pistol stays visible as a
    // dropped gun. Live officers keep rotation.x = 0.
    if (person.fallen) {
      mesh.rotation.x = -Math.PI / 2 * 0.92;
      mesh.traverse((o) => { if (o.geometry?.type === 'OctahedronGeometry') o.visible = false; });
    } else {
      mesh.rotation.x = 0;
      mesh.traverse((o) => { if (o.geometry?.type === 'OctahedronGeometry') o.visible = true; });
    }
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
        // Round 17 (save v9): restore the arsenal — the owned set +
        // equipped weapon + every weapon's mag/reserve. The save wrote
        // the weapons block for rounds, but this load block never read
        // it back, so a reload silently re-locked the SMG / shotgun
        // even when the save owned them. v8 and older saves carry no
        // block (undefined), and fromSaveData treats a missing block
        // as fists + pistol only, so every earlier save still works.
        ...(loaded.weapons && typeof loaded.weapons === 'object' ? loaded.weapons : {}),
      });
    } else {
      timesPlayed = 1;
    }
  }
  if (!missions.current && !missions.getCurrentMissionNumber()) {
    // Resume at the next uncompleted mission, not always mission 1.
    const done = missions.getCompletedMissions();
    const next = done.length ? Math.min(8, Math.max(...done) + 1) : 1;
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
    // Round 17 (v9): the owned arsenal — owned set + equipped weapon
    // + every weapon's mag/reserve — so a reload restores the SMG /
    // shotgun exactly as they were left, not as a fresh pistol.
    weapons: combat.toSaveData(),
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

// ---- Round-11 (Lane A): camera occlusion handling --------------------
// Round 10 proved the defect: the L-key look only swings the look
// target while the chase camera stays behind the player, so 3 of 4
// approaches to the Spire are blocked by buildings (north puts the
// camera INSIDE a building; only east is clear). The fix repositions
// the focus camera instead of trusting the player's side:
//   1. solveLandmarkView() rings the landmark at the framing distance
//      (render.js framingDistanceForHeight, clamped to the round-11
//      min/max) and tries azimuths outward from the current view in
//      sweep steps, then rises in steps if no ground-level azimuth is
//      clear. A candidate wins only when its position is outside every
//      building box AND the segment to the landmark focus point crosses
//      no building (the landmark's own footprint is ignored).
//   2. While no focus is open, the ordinary chase camera is rescued by
//      pulling it in toward the player until its position is clear and
//      the sightline to the player is unblocked (last resort: rise
//      above the roof). The camera therefore never sits inside a
//      building in either mode.
// The blend uses WALL-clock seconds (focusViewWallNow): the game runs
// a fixed 60 Hz step capped at 4 steps/frame, so under headless
// SwiftShader game time advances ~0.07 s per wall second and a
// game-dt blend would never converge inside the 4 s focus window.

// Solve a clear viewpoint for `landmark` ({ x, y, z }) starting from
// the camera azimuth in `camPos`. Returns the first clear candidate,
// or the best-effort (highest, current-azimuth) view with clear:
// false when nothing clears — the caller still uses it, because a
// high view over the roofs beats a camera inside a building.
function solveLandmarkView(landmark, camPos) {
  const cfg = (CONFIG.round11 && CONFIG.round11.camera) || {};
  const pad = cfg.pad ?? 1.5;
  const maxRise = cfg.maxRise ?? 40;
  const riseStep = cfg.riseStep ?? 8;
  const sweepStep = ((cfg.sweepStepDeg ?? 15) * Math.PI) / 180;
  const sweepMax = ((cfg.sweepMaxDeg ?? 180) * Math.PI) / 180;
  const minD = cfg.minFrameDistance ?? 45;
  const maxD = cfg.maxFrameDistance ?? 100;
  const baseH = cfg.baseHeight ?? 5;
  const occ = world.round11Occlusion;
  const fx = landmark.x, fz = landmark.z, fy = landmark.y;
  let dist = framingDistanceForHeight(fy, camera.fov || CONFIG.camera.fov || 62, cfg.frameFill ?? 0.9);
  dist = Math.max(minD, Math.min(maxD, dist));
  const startAz = Math.atan2((camPos.x || 0) - fx, (camPos.z || 0) - fz);
  const ignore = { x: fx, z: fz };
  let tried = 0;
  const testCandidate = (az, rise) => {
    const px = fx + Math.sin(az) * dist;
    const pz = fz + Math.cos(az) * dist;
    // Round-11 final: low landmarks (the 8 m bridge) lift the camera
    // above the focus height — at street height the camera sits under
    // the deck and the bridge reads as a slab, not a span. The lift
    // applies ONLY to low landmarks: for tall ones lift is 0 and the
    // camera stays at baseH + rise (max() against fy + 0 would park
    // every Spire look at 95 m).
    const lift = fy <= (cfg.lowLandmarkMaxFocusY ?? 20) ? (cfg.lowLandmarkLift ?? 6) : 0;
    const py = lift > 0 ? Math.max(baseH + rise, fy + lift) : baseH + rise;
    const effRise = py - baseH;
    tried += 1;
    if (!occ) return { azimuth: az, rise: effRise, dist, x: px, y: py, z: pz, clear: true, tried };
    if (occ.containsPoint(px, py, pz, pad)) return null;
    if (occ.segmentBlocked(px, py, pz, fx, fy, fz, ignore)) return null;
    return { azimuth: az, rise: effRise, dist, x: px, y: py, z: pz, clear: true, tried };
  };
  // Azimuth order: the current view first, then alternating either side
  // in sweep steps, so the camera swings as little as possible. Rise is
  // the outer loop: a low street-level view from another side is
  // preferred over a raised view from the current side (the proven
  // round-10 east frame is low and ~85 m out, not a rooftop shot).
  const azimuths = [startAz];
  for (let off = sweepStep; off <= sweepMax + 1e-9; off += sweepStep) {
    azimuths.push(startAz + off, startAz - off);
  }
  for (let rise = 0; rise <= maxRise + 1e-9; rise += riseStep) {
    for (const az of azimuths) {
      const hit = testCandidate(az, rise);
      if (hit) return hit;
    }
  }
  return {
    azimuth: startAz, rise: maxRise, dist,
    x: fx + Math.sin(startAz) * dist, y: baseH + maxRise, z: fz + Math.cos(startAz) * dist,
    clear: false, tried,
  };
}

// Is the sticky focus view still clear? Re-tested every frame while the
// focus window is open; a newly-blocking building (none exist — the city
// is static — but a player-side change could invalidate it) forces a
// fresh solve instead of a stale view.
function focusViewStillClear(view, landmark) {
  const occ = world.round11Occlusion;
  if (!occ || !view) return false;
  const cfg = (CONFIG.round11 && CONFIG.round11.camera) || {};
  const pad = cfg.pad ?? 1.5;
  if (occ.containsPoint(view.x, view.y, view.z, pad)) return false;
  if (occ.segmentBlocked(view.x, view.y, view.z, landmark.x, landmark.y, landmark.z, { x: landmark.x, z: landmark.z })) return false;
  return true;
}

// Pull the chase camera (px, py, pz) in toward `focus` until its
// position is outside every building box and the sightline to the
// player is unblocked; last resort is rising above the roof. Returns
// { x, y, z, rescued }. The player can never be inside a building
// (collision), so walking toward the player always exits the box.
function rescueChasePosition(px, py, pz, focus) {
  const cfg = (CONFIG.round11 && CONFIG.round11.camera) || {};
  const occ = world.round11Occlusion;
  if (!occ) return { x: px, y: py, z: pz, rescued: false };
  const pad = cfg.pad ?? 1.5;
  const lookY = (focus.y || 0) + 1.4;
  const blocked = () => occ.containsPoint(px, py, pz, pad)
    || occ.segmentBlocked(px, py, pz, focus.x, lookY, focus.z, null);
  let rescued = false;
  const maxPasses = cfg.maxRescuePasses ?? 24;
  for (let step = 0; step < maxPasses; step++) {
    if (!blocked()) break;
    rescued = true;
    px = lerp(px, focus.x, 0.25);
    py = lerp(py, (focus.y || 0) + 1.5, 0.25);
    pz = lerp(pz, focus.z, 0.25);
  }
  if (blocked()) {
    const hit = occ.containsPoint(px, py, pz, pad);
    if (hit) py = (hit.height || 0) + (cfg.insideClearance ?? 2);
  }
  return { x: px, y: py, z: pz, rescued };
}

// Sun-follow (round-2 polish): re-centre the tight shadow frustum on the
// camera focus every frame, so shadows stay crisp wherever the player
// goes. The staged end vista keeps its fixed low sun (updateCamera
// returns early for it).
function followSun(fx, fz) {
  // Round-13: a staged shot may override the sun offset (high noon sun
  // for the pursuit); otherwise the default low golden-hour sun.
  const off = shotSunOffset || CONFIG.lighting.sunOffset;
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

  // Round-13 staged cameras (shotCam is set by stage*(); the legacy
  // ?shot=play&seed=1 shot uses the same 'front' mode with side 0).
  // 'front': the camera sits ahead of the driven car looking back down
  // the road, so the car AND the police cars trailing behind it are in
  // frame at once. `side` shifts it off the road centreline for a
  // three-quarter angle (kept on the road so no building can block it);
  // `ahead` / `height` tighten the framing per shot (defaults are the
  // proven round-12 values). 'fixed': a locked vista camera — the
  // sunset story moment holds this exact frame, with the sun still
  // following the subject.
  if (shotCam && state === 'playing') {
    if (shotCam.mode === 'front' && player.currentCar) {
      const car = player.currentCar;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const rx = Math.cos(car.heading);
      const rz = -Math.sin(car.heading);
      const ahead = shotCam.ahead ?? 24;
      const height = shotCam.height ?? 6.5;
      camera.position.set(
        car.position.x + fx * ahead + rx * shotCam.side,
        (car.position.y || 0) + height,
        car.position.z + fz * ahead + rz * shotCam.side,
      );
      // Round 23: cover-only lookAt — 8 m beyond the car (the proven round-12 value) (CONFIG.
      // round23.coverCam.lookAhead) instead of 8 m, so the view axis
      // stays ~20 deg west of south and the nearer Deco
      // block recentres while the east tower stays in frame. Every
      // other front-mode shot keeps the proven 8 m lookAt.
      const lookBack = (SHOT === 'cover-chase' && typeof CONFIG.round23?.coverCam?.lookAhead === 'number')
        ? CONFIG.round23.coverCam.lookAhead : 8;
      camera.lookAt(car.position.x - fx * lookBack, 1.5, car.position.z - fz * lookBack);
      followSun(car.position.x, car.position.z);
      return;
    }
    if (shotCam.mode === 'fixed') {
      followSun(shotCam.look[0], shotCam.look[2]);
      camera.position.set(shotCam.pos[0], shotCam.pos[1], shotCam.pos[2]);
      camera.lookAt(shotCam.look[0], shotCam.look[1], shotCam.look[2]);
      return;
    }
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
  // Round-11 (Lane A): solve / hold / release the occlusion-safe
  // focus view. While the L focus window is open the camera eases
  // toward the solved clear viewpoint (solveLandmarkView); the sticky
  // view is re-solved only if it stops being clear, and the blend
  // decays after the window closes so the camera glides back to the
  // chase instead of snapping. Wall-clock dt, capped at 2 s: the game
  // steps at a fixed 60 Hz capped at 4 steps/frame, so under headless
  // SwiftShader frames are ~2 s apart and game dt would never converge
  // inside the 4 s window — worse, with a small cap the blend rises
  // ~0.6/frame and falls ~0.9/frame, so blend >= 0.95 may never be
  // observed at all before the window expires. A 2 s cap saturates
  // the blend in a single headless frame and is a no-op at 60 fps
  // (wall dt there is ~0.016 s).
  const nowWall = performance.now();
  const wallDt = focusViewWallNow ? Math.min((nowWall - focusViewWallNow) / 1000, 2) : 0;
  focusViewWallNow = nowWall;
  const focusActive = !!(landmarkFocus && nowWall < landmarkFocus.until);
  const cfg11 = (CONFIG.round11 && CONFIG.round11.camera) || {};
  const blendRate = cfg11.blendRate ?? 2.5;
  if (focusActive) {
    if (!focusView || focusViewFor !== landmarkFocus.name) {
      focusView = solveLandmarkView(landmarkFocus, camera.position);
      focusViewFor = landmarkFocus.name;
      focusViewPoint = { x: landmarkFocus.x, y: landmarkFocus.y, z: landmarkFocus.z };
      focusView.seq = landmarkFocus.seq;
    } else if (!focusViewStillClear(focusView, landmarkFocus)) {
      focusView = solveLandmarkView(landmarkFocus, camera.position);
      focusViewPoint = { x: landmarkFocus.x, y: landmarkFocus.y, z: landmarkFocus.z };
      focusView.seq = landmarkFocus.seq;
    }
    focusViewBlend = Math.min(1, focusViewBlend + wallDt * blendRate);
  } else {
    focusViewBlend = Math.max(0, focusViewBlend - wallDt * blendRate * 1.5);
    if (focusViewBlend === 0) { focusView = null; focusViewFor = null; focusViewPoint = null; }
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
  // Round-11 (Lane A): the focus camera blends toward the solved clear
  // viewpoint (never inside a building, clear sightline to the
  // landmark); the ordinary chase camera is rescued by pulling it in
  // toward the player when a building blocks it. Both start from the
  // round-10 pulled-back chase position above. The straight blend path
  // between two clear points can still clip a building corner, so a
  // blended position that lands inside a box snaps straight to the
  // solved view (which is clear by construction).
  let camX = px, camY = py, camZ = pz;
  let rescued = false;
  if (focusView && focusViewBlend > 0) {
    camX = lerp(px, focusView.x, focusViewBlend);
    camY = lerp(py, focusView.y, focusViewBlend);
    camZ = lerp(pz, focusView.z, focusViewBlend);
    const occBlend = world.round11Occlusion;
    if (occBlend && occBlend.containsPoint(camX, camY, camZ, cfg11.pad ?? 1.5)) {
      focusViewBlend = 1;
      camX = focusView.x; camY = focusView.y; camZ = focusView.z;
    }
  } else {
    const fixed = rescueChasePosition(px, py, pz, focus);
    camX = fixed.x; camY = fixed.y; camZ = fixed.z; rescued = fixed.rescued;
  }
  camera.position.set(camX, camY, camZ);
  // Round-11 probe state (live values; __solmar.round11Camera re-reads the
  // occlusion tests at probe time, so the harness sees ground truth
  // rather than a cached claim). focusLosBlocked is only meaningful
  // once the blend has settled (>= 0.95); mid-blend it is null.
  const occ11 = world.round11Occlusion;
  round11Last = {
    focusName: focusViewFor,
    focusAzimuthDeg: focusView ? +((focusView.azimuth * 180) / Math.PI).toFixed(1) : null,
    focusRise: focusView ? focusView.rise : null,
    focusDist: focusView ? +focusView.dist.toFixed(1) : null,
    focusClear: focusView ? focusView.clear : null,
    focusTried: focusView ? focusView.tried : 0,
    focusBlend: +focusViewBlend.toFixed(3),
    focusPoint: focusViewPoint ? { ...focusViewPoint } : null,
    cameraInside: occ11 ? !!occ11.containsPoint(camX, camY, camZ, cfg11.pad ?? 1.5) : false,
    cameraRescued: rescued,
    focusLosBlocked: (focusView && focusViewBlend >= 0.95 && occ11 && focusViewPoint)
      ? !!occ11.segmentBlocked(camX, camY, camZ, focusViewPoint.x, focusViewPoint.y, focusViewPoint.z, { x: focusViewPoint.x, z: focusViewPoint.z })
      : null,
  };
  // Round-11 flight recorder: snapshot the look the moment its blend
  // settles (and refresh it while settled). The snapshot survives the
  // focus window closing, so the settled camera position and sightline
  // stay observable after the blend has decayed away.
  if (focusView && focusViewBlend >= 0.95 && focusViewPoint) {
    round11Settled = {
      seq: focusView.seq ?? null,
      name: focusViewFor,
      azimuthDeg: round11Last.focusAzimuthDeg,
      rise: round11Last.focusRise,
      dist: round11Last.focusDist,
      clear: round11Last.focusClear,
      tried: round11Last.focusTried,
      camera: { x: +camX.toFixed(1), y: +camY.toFixed(1), z: +camZ.toFixed(1) },
      cameraInside: round11Last.cameraInside,
      losBlocked: round11Last.focusLosBlocked,
      at: Math.round(performance.now()),
    };
  }
  // Round-11 final (game-feel: the clear view gets a HUD echo, so the
  // player knows the solver found an unobstructed framing — feedback
  // must clarify state, never just decorate it). Once per look (seq).
  if (round11Settled && round11Settled.clear === true && round11Settled.seq !== round11FocusToastSeq) {
    round11FocusToastSeq = round11Settled.seq;
    if (typeof hud.showFocusClear === 'function') hud.showFocusClear(round11Settled.name);
  }
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
    // Round-11 final: aim at lookFrac of the focus height, not the
    // apex — aiming at the apex crops the base out of the frame (see
    // CONFIG.round11.camera.lookFrac). The sightline probe still tests
    // the apex segment, so the clearance guarantee is unchanged.
    lookY = lerp(lookY, landmarkFocus.y * (cfg11.lookFrac ?? 1), w);
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
  // Round 17: a gun already in hand stays in hand — the SMG / shotgun
  // shoot with their own definitions (rate / range / damage). Fists
  // still quick-draw the pistol (the round-5 behaviour), and after a
  // quick-drawn shot Rico lowers the gun back to fists.
  const quickDraw = combat.getWeapon() === 'fists';
  if (quickDraw) combat.selectWeapon('pistol');
  const targets = combat.collectTargets({ traffic, police });
  const result = combat.shoot(aimPoint(), player, targets);
  if (result && result.reason === 'no-ammo') showMessage('Out of ammo.');
  else if (result && result.fired && quickDraw) combat.selectWeapon('fists');
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
  // Round 11: the key code comes from input.landmarkLookKey (the
  // LANDMARK_LOOK_KEY constant) so the binding cannot drift from the
  // HUD hint; the occlusion-safe framing itself lives in updateCamera.
  if (code === (input.landmarkLookKey || 'KeyL')) {
    if (state === 'playing' && landmarkList.length) {
      const nearest = nearestLandmark(player.position);
      if (nearest) {
        landmarkFocus = {
          x: nearest.focusX ?? nearest.x,
          y: nearest.focusY ?? 30,
          z: nearest.focusZ ?? nearest.z,
          name: nearest.name,
          until: performance.now() + (CONFIG.round11?.camera?.focusWindowMs ?? 4000),
          seq: ++focusSeq, // round-11: identifies this look in the probe
        };
        hud.showLandmark?.(nearest.name, (CONFIG.round11?.camera?.focusWindowMs ?? 4000) / 1000);
        audio.playFocusSting?.(); // round-11 final: the look gets a soft audio echo on the same frame (game-feel: sound fires with the visual).
        showMessage(`Look: ${nearest.name}.`);
      }
    }
    return;
  }
  if (state !== 'playing') return;
  // Round 17: digits 1–5 select the weapon wheel slots (fists,
  // pistol, SMG, shotgun, rifle). A locked weapon is REFUSED by
  // combat.selectWeapon — the equipped weapon stays put and the HUD
  // says so, never silently swapped for another gun.
  if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3' || code === 'Digit4' || code === 'Digit5') {
    const key = ['fists', 'pistol', 'smg', 'shotgun', 'rifle'][Number(code.slice(-1)) - 1];
    const before = combat.getWeapon();
    combat.selectWeapon(key);
    if (combat.getWeapon() !== key) showMessage(`${key === 'rifle' ? 'Rifle' : key.toUpperCase()} is locked.`);
    else if (before !== key) showMessage(`${key === 'fists' ? 'Fists' : key.toUpperCase()} equipped.`);
    return;
  }
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
  if (next <= 8) missions.startMission(next, world, systems());
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
  // Round 15: FROZEN in staged shots (SHOT_MODE) — the staged clock
  // (17:48 / 18:05 / 18:20 / 18:36) is part of the shot, and the
  // convergence wait would otherwise drift it a minute or two by
  // capture time, breaking the rising-arc sheet. Normal play still
  // advances the clock; the sun itself is position-based (followSun).
  if (!SHOT_MODE) timeOfDay = (timeOfDay + dt * 0.024) % 24;
  playTimeSeconds += dt; // persisted by save v2

  // 2. player or driven car.
  if (player.onFoot) {
    player.update(dt, input, world, camYaw);
  } else if (player.currentCar) {
    // Staged driving shot: hold the car at speed (no throttle input in a
    // headless shot, so drag would otherwise bleed it to a crawl).
    if (shotHoldSpeed > 0) player.currentCar.speed = shotHoldSpeed;
    player.currentCar.update(dt, world, undefined, input);
    // Round 14: Rico's position IS the car's while driving. Without
    // this, player.position stays at the enterCar point and every
    // distance the HUD reports (police panel, district, minimap) is
    // measured from where the car WAS, not where it is — the 13B
    // pursuit panel's "2m · ROADBLOCK" for a car 13 m away, and the
    // police themselves chasing the stale point instead of the car.
    player.position.set(player.currentCar.position.x, player.currentCar.position.y || 0, player.currentCar.position.z);
    player.heading = player.currentCar.heading;
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
  syncPersonMeshes(police.getOfficers(), officerMeshes, '#1a2a4a', SHOT === 'combat');

  // Police light bars (round-2 polish): flash every police car's roof
  // bar on the siren phase.
  for (const pc of police.getPoliceCars()) {
    setPoliceLightPhase(pc, police.getSirenPhase());
  }

  // Round-13: the staged fallback helicopter hovers over the chase with
  // a slow drift and a spinning rotor. Game time advances ~0.067 s per
  // rendered headless frame, so the drift is small between staging and
  // the capture — the chopper stays in the cover frame.
  if (shotHeli) {
    shotHeli.t += dt;
    // Round 17: staged shots are FROZEN (SHOT_MODE) — no hover bob,
    // no drift, no rotor spin. The cover probe projects the hub /
    // nav lights from the live matrix, then the screenshot is taken
    // seconds later; a ±0.8 m bob moves those point features ~15 px
    // between probe and capture, so the hub/nav gates read empty sky
    // (hubDarkFrac 0.0, navs 0) and the rotor phase drags the
    // body-vs-sky contrast box at random. Live play keeps the motion;
    // a still image cannot tell a frozen rotor from a caught one.
    const frozen = SHOT_MODE;
    // Round 14: the cover heli TRACKS the player car (followOffset, set
    // by stageCoverChase) instead of drifting from a fixed point — the
    // car drives on during the HUD convergence wait, so a fixed heli
    // sinks toward the dialogue box and out of the frame; a tracked
    // heli holds its screen position at any capture moment.
    if (shotHeli.followOffset && SHOT === 'cover-chase' && player.currentCar) {
      const c = player.currentCar.position;
      shotHeli.group.position.set(
        c.x + shotHeli.followOffset.x,
        c.y + shotHeli.followOffset.y + (frozen ? 0 : Math.sin(shotHeli.t * 0.5) * 0.8),
        c.z + shotHeli.followOffset.z,
      );
      // Round 16: SIDE-ON — the face-the-car yaw (round 15) showed the
      // chopper head-on, so the tail boom hid behind the fuselage and
      // the body read as a 21 px wide box. The +90 deg offset (from
      // CONFIG.round16.heli.sideYawDeg) lays the long axis across the
      // screen: nose one way, tail boom + fin the other, skids below,
      // rotor disc above. A tracking heli crabs sideways like this in
      // real life; the cone still hangs from the belly onto the road.
      const sideYaw = ((CONFIG.round16?.heli?.sideYawDeg ?? 90) * Math.PI) / 180;
      shotHeli.group.rotation.y = Math.atan2(c.x - shotHeli.group.position.x, c.z - shotHeli.group.position.z) + sideYaw;
    } else {
      const a = shotHeli.angle + (frozen ? 0 : Math.sin(shotHeli.t * 0.1) * 0.15);
      shotHeli.group.position.set(
        shotHeli.x + Math.cos(a) * 4,
        shotHeli.y + (frozen ? 0 : Math.sin(shotHeli.t * 0.5) * 1.2),
        shotHeli.z + Math.sin(a) * 4,
      );
      shotHeli.group.rotation.y = a + Math.PI / 2;
    }
    // Round 17: a frozen rotor sits at a shallow 10 deg diagonal —
    // at 0 deg (bars horizontal / foreshortened) neither bar crosses
    // the disc-read row (y = mean rotor-tip y), so discDarkFrac fell
    // to 0.32 (gate 0.35); a shallow diagonal bar crosses the row
    // over a long segment and restores it. Live play keeps the spin.
    if (frozen) shotHeli.rotor.rotation.y = (10 * Math.PI) / 180;
    else shotHeli.rotor.rotation.y += dt * 22;
  }

  // Round 14 (pursuit shot): the roadblock pair and the race rivals are
  // staged cars, not traffic — they hold their marks relative to the
  // player car every frame, so the frame reads ROADBLOCK + RACE at any
  // capture moment. The front camera looks back down the road, so
  // world-ahead of the player (z behind the camera's look direction)
  // is where the roadblock sits in the picture. Headings are set
  // directly on the group (staged cars skip car.update, which would
  // steer them away); the light-bar flash for the roadblock cars runs
  // in the loop above (they are in police.policeCars).
  if (SHOT === 'pursuit' && player.currentCar) {
    const pc = player.currentCar;
    const hx = Math.sin(pc.heading || 0);
    const hz = Math.cos(pc.heading || 0);
    for (let i = 0; i < shotRoadblock.length; i++) {
      const rb = shotRoadblock[i];
      // NEGATIVE along: the front camera looks BACK down the road, so
      // the picture's "ahead" is behind the car's direction of travel.
      // Round 15: the roadblock sits CLOSE (16 / 22 m beyond the car,
      // was 30 / 36) and WIDE (laterals ±3.5, was ±3) — big crosswise
      // cars with a visible gap between them, not four small cars
      // bunched at 30+ m. The chasing interceptors hold farther back
      // (26 / 32 m), so the block owns the mid-frame.
      const ahead = -(16 + i * 6);
      const lateral = i === 0 ? -3.5 : 3.5;
      rb.position.set(pc.position.x + hx * ahead + Math.cos(pc.heading || 0) * lateral, 0, pc.position.z + hz * ahead - Math.sin(pc.heading || 0) * lateral);
      rb.group.rotation.y = pc.heading + (i === 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    for (let i = 0; i < shotRivals.length; i++) {
      const rv = shotRivals[i];
      const lateral = i === 0 ? -4.5 : 4.5;
      const along = i === 0 ? -3 : 2;
      rv.position.set(pc.position.x + hx * along + Math.cos(pc.heading || 0) * lateral, 0, pc.position.z + hz * along - Math.sin(pc.heading || 0) * lateral);
      rv.group.rotation.y = pc.heading;
    }
  }

  // Round 15: staged pedestrians track the player car (cover +
  // pursuit) — see trackStagedPeds. The car drives on during the HUD
  // convergence wait; without this the peds drift far up-frame and
  // shrink to dots by capture time.
  if ((SHOT === 'cover-chase' || SHOT === 'pursuit') && player.currentCar && shotPeds.length) {
    const pc = player.currentCar;
    for (const tp of shotPeds) {
      if (!tp.ped) continue;
      tp.ped.position.x = pc.position.x + tp.dx;
      tp.ped.position.z = pc.position.z + tp.dz;
    }
  }

  // Round 20: staged cover traffic tracks the player car (same pattern
  // as the roadblock above — the GT drives on during the HUD
  // convergence wait, so fixed world spots would drift up-frame and
  // shrink to dots by capture time). Staged cars are NOT in
  // traffic.getCars() and NOT police cars, so nothing else moves them;
  // the re-assertion is belt-and-braces against any drift.
  if (SHOT === 'cover-chase' && player.currentCar && shotTraffic.length) {
    const pc = player.currentCar;
    for (const st of shotTraffic) {
      if (!st.car) continue;
      st.car.position.set(pc.position.x + st.dx, 0, pc.position.z + st.dz);
      st.car.group.rotation.y = st.heading;
    }
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
  // Round 14 (combat shot): the staged muzzle flash is FROZEN — the
  // one real shot's flash lasts 0.06 s of game time, far shorter than
  // the HUD convergence wait, so re-assert the muzzle sphere, the
  // tracer line and the impact flash every frame with the staged
  // endpoints (computed once in stageCombat). Zero new meshes: the
  // three singletons already exist. Runs after the timer blocks above
  // so it wins over the hide-on-expiry.
  if (SHOT === 'combat' && combatFlash) {
    muzzle.position.set(combatFlash.muzzle.x, combatFlash.muzzle.y, combatFlash.muzzle.z);
    muzzle.visible = true;
    muzzle.scale.setScalar(1.2);
    // Round 19 (stretch): the halo rides the frozen muzzle point.
    muzzleHalo.position.set(combatFlash.muzzle.x, combatFlash.muzzle.y, combatFlash.muzzle.z);
    muzzleHalo.visible = true;
    const pos = tracerGeo.attributes.position;
    pos.setXYZ(0, combatFlash.muzzle.x, combatFlash.muzzle.y, combatFlash.muzzle.z);
    pos.setXYZ(1, combatFlash.target.x, combatFlash.target.y, combatFlash.target.z);
    pos.needsUpdate = true;
    tracerLine.visible = true;
    tracerMat.opacity = 0.9;
    impactMesh.position.set(combatFlash.target.x, combatFlash.target.y, combatFlash.target.z);
    impactMesh.visible = true;
    impactMesh.scale.setScalar(1.4);
  }

  // Busted / wasted can be raised by police or combat during the update.
  if (police.isBusted()) { showBusted(); return; }
  if (combat.isPlayerDown() || player.health <= 0) { showWasted(); return; }
  if (state !== 'playing') return; // a mission-complete event changed state

  // 7. HUD.
  // Round 14: the crosshair belongs on the aim point, not on Rico's
  // head. Sunset hides it entirely (a story moment, not combat);
  // combat pins it to the aimed officer's chest (projected through the
  // live camera; hidden if the officer leaves the frame); everywhere
  // else the legacy rule stands (visible only on foot).
  const crosshair = document.getElementById('crosshair');
  if (crosshair) {
    if (SHOT === 'sunset') {
      crosshair.classList.add('hidden');
    } else if (SHOT === 'combat' && combatAimOfficer) {
      const p = projectToScreen(combatAimOfficer.position.x, 1.35, combatAimOfficer.position.z);
      if (p && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) {
        crosshair.classList.remove('hidden');
        crosshair.style.left = `${(p.x * 100).toFixed(1)}%`;
        crosshair.style.top = `${(p.y * 100).toFixed(1)}%`;
        crosshair.style.transform = 'translate(-50%, -50%)';
      } else {
        crosshair.classList.add('hidden');
      }
    } else {
      crosshair.classList.toggle('hidden', !player.onFoot);
    }
  }
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
    // Round-13 (final agent, Lane 1 patch note): the missionSummary
    // alias — hud.js reads missionProgress || missionSummary, and the
    // mission panel / dialogue / respect fallbacks all accept either.
    // Same object, no new computation; staging (?shot=) is untouched.
    missionSummary: missions.getMissionProgress(),
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
    message: (shotDialogue ? shotDialogue.text : messageText) || undefined,
    ammo: combat.getAmmo(),
    mag: combat.getMag(),
    police: police.getUnits(),
    traffic: traffic.getCars(),
    pedestrians: traffic.getPedestrians(),
    marker: marker ? { x: marker.x, z: marker.z } : null,
    // Round-13 (Lane 3): richer HUD state for Lane 1's panels. Lane 1
    // reads the driven car as an object with model / speed / topSpeed /
    // color (renderVehiclePanel falls back to state.player.currentCar),
    // so pass the LIVE car — a summary object without those fields
    // shadows the real car and reads as ON FOOT / 0 km/h. The weapon
    // is the equipped weapon NAME string (combat.getWeapon(), not the
    // getWeaponDef object — the wheel string-compares it). Respect is
    // derived from live money + jobs done. The radio identity and the
    // staged dialogue line are staged-only (the game has no real radio
    // station yet), so they are passed only in shot mode.
    vehicle: car || null,
    weapon: typeof combat.getWeapon === 'function' ? combat.getWeapon() : null,
    // Round 17: the full arsenal for the weapon wheel — the five
    // slots with live mag/reserve + the owned set (combat.js
    // getWeaponsState). The wheel reads this, never a hardcoded
    // LOCKED list; without it the SMG / shotgun would still show
    // LOCKED after being earned.
    weapons: typeof combat.getWeaponsState === 'function' ? combat.getWeaponsState() : null,
    respect: respectState(),
    ...(SHOT_MODE && shotRadio ? { radio: shotRadio } : {}),
    ...(SHOT_MODE && shotDialogue ? { dialogue: shotDialogue } : {}),
    player,
    world,
    // Round 14: garage levels + race chip + save/checkpoint for the
    // new HUD panels (hud.js reads these every frame; the values are
    // derived from the live profile, so they agree with the respect
    // panel and the mission panel by construction).
    garage: garageState(),
    race: raceState(),
    saveInfo: save.getSaveInfo(),
    checkpoint: checkpointName(),
    // Round 14: the staged roadblock cars (pursuit shot only) — the
    // police panel labels exactly these ROADBLOCK. Without this, the
    // panel called the first car ROADBLOCK in every shot (the 13B
    // cover/pursuit contradiction: a chasing interceptor labelled as
    // a roadblock it never was).
    roadblockCars: shotRoadblock,
    // Round 15: the air unit for the police panel's AIR ONE row
    // (hud.js renderAirSupportPanel) — the staged fallback heli of
    // the cover shot, or null when no heli is in the sky.
    airSupport: shotHeli ? { callsign: 'AIR ONE', status: 'OVERHEAD' } : null,
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

// Round 14: project a world point to normalised screen coordinates
// (0..1) through the live camera — for the combat crosshair (pinned to
// the aimed officer's chest) and for the probe's screen measurements.
// Returns null when the point is behind the camera.
function projectToScreen(x, y, z) {
  const v = new THREE.Vector3(x, y, z).project(camera);
  if (v.z > 1) return null;
  return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
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
    shotCam = { mode: 'front', side: 0 }; // legacy framing, unchanged
    shotHoldSpeed = 26;
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

// ---- Round-13 shot staging (Lane 3, screenshot director) ------------
// Deterministic staging for the four round-13 screenshots. Every stage
// runs in real gameplay state ('playing', never a menu overlay), sets a
// real mission / wanted level / police presence through the live
// systems, settles the simulation, then pins the wanted level back
// (the speeding-heat rule fires once during the settle) and plants the
// dialogue line last, so no mission/police toast can overwrite it.
//
// Lane 1 (HUD density) and Lane 2 (scene density) work in parallel:
// this staging calls only APIs that already exist in the repo, and
// exposes the rest through hud.update state (vehicle / weapon /
// respect / radio / dialogue — see the hud.update call above) plus the
// __solmar.round13 probe below, so their panels pick the staged data
// up with no staging change. The one fallback this file owns is the
// police helicopter (buildShotHeli), built only when Lane 2 has not
// provided one yet.

function respectState() {
  // Rank from live money; points/completed from jobs done (Lane 1's
  // scale: 12 points per completed mission — 8 jobs in the chain, so
  // a full chain is ~96 + the current job's progress — plus up to 12
  // for the current mission's objective progress). `next` names the
  // following rank so the panel never falls back to "TOP RANK" mid-climb.
  const completed = missions.getCompletedMissions().length;
  const prog = missions.getMissionProgress() || {};
  const active = (typeof prog.objectiveIndex === 'number' && typeof prog.objectiveCount === 'number' && prog.objectiveCount > 0)
    ? Math.round((prog.objectiveIndex / prog.objectiveCount) * 12) : 0;
  const points = Math.max(0, Math.min(100, completed * 12 + active));
  const score = money + completed * 500;
  const ranks = ['ROOKIE', 'HUSTLER', 'MADE', 'KINGPIN'];
  const band = score < 1000 ? 0 : score < 3000 ? 1 : score < 8000 ? 2 : 3;
  const floor = [0, 1000, 3000, 8000][band];
  const ceil = [1000, 3000, 8000, 16000][band];
  return {
    rank: ranks[band],
    points,
    progress: Math.max(0, Math.min(1, (score - floor) / (ceil - floor))),
    completed,
    next: band < ranks.length - 1 ? ranks[band + 1] : null,
  };
}

// Round 14: the garage — upgrade levels for the driven car, derived
// from the same profile the respect panel reads (jobs done + cash),
// so the two panels can never disagree. No shop transaction exists
// yet, so the levels are a derived read, exactly like respect ranks:
// armour grows with jobs done, engine grows with the score.
function garageState() {
  const completed = missions.getCompletedMissions().length;
  const score = money + completed * 500;
  return {
    armor: Math.max(1, Math.min(3, 1 + completed)),
    engine: Math.max(1, Math.min(3, 1 + Math.floor(score / 2000))),
  };
}

// Round 14: the street race — live position among the cars on this
// road, checkpoint distance and the par clock. Only while driving a
// mission. Position counts the cars ahead of the player along the
// driving direction; the field counts the non-police cars within
// 150 m (rivals + traffic). The checkpoint is the mission marker.
function raceState() {
  const car = player.currentCar;
  if (!car || !missions.getCurrentMission()) return null;
  // The race chip belongs to the pursuit (a street race with rivals)
  // and to normal gameplay; the cover chase is not a race, and the
  // on-foot shots have no car at all.
  if (SHOT_MODE && SHOT !== 'pursuit') return null;
  const fx = Math.sin(car.heading || 0);
  const fz = Math.cos(car.heading || 0);
  const px = player.position.x;
  const pz = player.position.z;
  const marker = missions.getMarkerPosition(world);
  let ahead = 0;
  let total = 1;
  // The staged race rivals (shotRivals, main.js staging) are not in
  // the traffic list — count them the same way as traffic cars.
  // Round 14: when rivals are staged (the pursuit shot), the race is
  // against THEM, not the whole street — counting every traffic car
  // within 150 m put Rico at POS 13/14 in a race he is contesting
  // against two rivals. In normal gameplay (no rivals) the field is
  // the traffic around the player, as before.
  const field = shotRivals.length ? [...shotRivals] : [...traffic.getCars()];
  for (const other of field) {
    if (!other?.position || other === car) continue;
    const dx = other.position.x - px;
    const dz = other.position.z - pz;
    if (Math.hypot(dx, dz) > 150) continue;
    total += 1;
    if (dx * fx + dz * fz > 1) ahead += 1;
  }
  return {
    position: ahead + 1,
    total,
    checkpointM: marker ? Math.round(Math.hypot(marker.x - px, marker.z - pz)) : null,
    parRemaining: missions.getParRemaining(),
  };
}

// Round 14: the checkpoint name for the save line — the current
// objective's place (Marina / Hideout / Docks / Harbour ...), or the
// district when no mission is running.
function checkpointName() {
  const marker = missions.getMarkerPosition(world);
  if (marker?.label) return String(marker.label).toUpperCase();
  return (world.districtAt(player.position.x, player.position.z) || 'SOLMAR BAY').toUpperCase();
}

// Run the simulation N fixed steps so traffic / police / peds settle
// around the staged player before the first rendered frame.
function settleShot(frames = 24) {
  for (let i = 0; i < frames; i++) update(1 / 60);
}

// Golden-hour grade: the default sunset palette, set explicitly so the
// shot does not depend on whatever the menu left behind.
function applyGoldenHour() {
  world.sky.setPalette(CONFIG.colors.sunsetTop, CONFIG.colors.sunsetHorizon);
  scene.background = new THREE.Color(CONFIG.colors.sunsetHorizon);
  scene.fog = new THREE.Fog(CONFIG.colors.sunsetFog, 200, 850);
}

// Noon grade for the pursuit: a blue sky (explicit mid stops — the
// default mids are sunset rust), pale haze, a high white sun, and the
// low sunset sun sprites hidden (they sit at y ~130 toward the
// south-east; in a noon sky they would read as a stray orange blob).
// Only the high sprites are hidden — lamp halos and light-bar glows
// sit low and are untouched.
function applyNoon() {
  const noonMids = [
    { stop: 0.18, hex: 0x2f7fd0 },
    { stop: 0.30, hex: 0x5ea8e0 },
    { stop: 0.40, hex: 0x8ec8ee },
    { stop: 0.47, hex: 0xc4e2f7 },
  ];
  world.sky.setPalette(0x1e5fb8, 0xbfe0f2, noonMids);
  scene.background = new THREE.Color(0x8ec8ee);
  scene.fog = new THREE.Fog(0xbfe0f2, 300, 1200);
  sunLight.color.set(0xfff6e0);
  sunLight.intensity = 3.2;
  hemiLight.intensity = 1.3;
  shotSunOffset = [60, 220, 40]; // high noon sun, short shadows
  scene.traverse((o) => { if (o.isSprite && o.position.y > 50) o.visible = false; });
}

// Freeze pedestrians on the sidewalk of a vertical road (constant x):
// spots are { roadX, side (+1 east / -1 west), z, heading }. Peds are
// taken nearest-first from the live list; extra settle frames spawn
// more when too few exist yet. A paused ped's update() only counts its
// pauseTimer down, so with a huge timer it stands exactly where put
// (traffic.update skips the roadT recompute while paused). roadT is
// kept consistent with the spot so the ped stays put if it ever
// unpauses (z-roads run z -320 -> beachStartZ 272).
function placePeds(spots) {
  let guard = 0;
  while (traffic.getPedestrians().length < spots.length && guard < 40) { update(1 / 60); guard += 1; }
  const peds = [...traffic.getPedestrians()].sort((a, b) =>
    Math.hypot(a.position.x - player.position.x, a.position.z - player.position.z)
    - Math.hypot(b.position.x - player.position.x, b.position.z - player.position.z));
  // Round 15: return the placed peds so the caller can track them
  // (trackStagedPeds) or flee one of them.
  const placed = [];
  spots.forEach((s, i) => {
    const ped = peds[i];
    if (!ped) return;
    const roadIdx = world.roads.findIndex((r) => r.axis === 'z' && r.start.x === s.roadX);
    ped.position.x = s.roadX + s.side * 8.5;
    ped.position.y = 0;
    ped.position.z = s.z;
    ped.heading = s.heading;
    ped.roadIndex = roadIdx;
    ped.roadT = (s.z + 320) / 592;
    ped.side = s.side;
    ped.roadDirection = 1;
    ped.cross = null;
    ped.wantCross = false;
    ped.paused = true;
    ped.pauseTimer = 3600;
    placed.push(ped);
  });
  return placed;
}

// Round 15: snapshot the placed peds' offsets from the player car, so
// the update loop can hold them in the frame while the car drives on
// (cover + pursuit only — the car is moving in both). Offsets are
// world-space (dx lateral, dz along the road); the loop re-applies
// them verbatim, so a ped staged 8 m beyond the car stays 8 m beyond
// it at capture, whatever the convergence wait did.
function trackStagedPeds(placed) {
  const car = player.currentCar;
  if (!car || !Array.isArray(placed)) return;
  shotPeds = placed.map((ped) => ({
    ped,
    dx: ped.position.x - car.position.x,
    dz: ped.position.z - car.position.z,
  }));
}

// Arrange the on-foot officers in an arc in front of the player —
// visible enemies for the combat shot. Officers keep chasing (their
// update steers them at Rico), but game time under headless SwiftShader
// advances ~0.067 s per rendered frame, so from 8+ m out they cannot
// reach the 2.2 m arrest range (plus 1.6 s arrest timer) before the
// capture lands.
// Round 14: the officers HOLD their marks (officer.staged — the
// police update skips staged officers, so the arc cannot collapse
// onto Rico while the panels converge), the arc breaks into clusters
// (laterals vary per officer instead of one even spacing), and one
// officer is down (fallen — the sync lays its mesh on the ground and
// hides its marker; its pistol stays as a dropped gun).
function placeOfficersArc(distances, laterals = null, fallenIndex = -1, headingJitter = null) {
  const officers = police.getOfficers();
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  const rx = Math.cos(player.heading);
  const rz = -Math.sin(player.heading);
  officers.forEach((off, i) => {
    const d = distances[i % distances.length];
    const lateral = laterals ? laterals[i % laterals.length] : (i - (officers.length - 1) / 2) * 3.2;
    off.position.x = player.position.x + fx * d + rx * lateral;
    off.position.y = 0;
    off.position.z = player.position.z + fz * d + rz * lateral;
    // Round 15: per-officer heading jitter (radians) — the line stops
    // reading as identical dolls facing one way; the AIM officer keeps
    // jitter 0 (square-on to Rico, the muzzle / crosshair target).
    const jitter = headingJitter ? headingJitter[i % headingJitter.length] : 0;
    off.heading = Math.atan2(player.position.x - off.position.x, player.position.z - off.position.z) + jitter;
    off.arrestTimer = 0;
    off.staged = true;
    off.fallen = (i === fallenIndex);
  });
}

// Two pursuit cars on the same road behind the player, close enough
// that the staged front camera (looking back down the road) frames
// them with the player car. Mirrors the proven round-12 stagePlay
// placement; police.update keeps exactly these two while
// maxPoliceCars is 2.
function stagePursuitCars(x, zBehind1, zBehind2, heading) {
  const pc1 = makeCar({ position: { x, y: 0, z: zBehind1 }, heading, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
  const pc2 = makeCar({ position: { x, y: 0, z: zBehind2 }, heading, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
  for (const pc of [pc1, pc2]) {
    pc.kind = 'police-car';
    pc.siren = true;
    pc.speed = 24;
  }
  police.policeCars = [pc1, pc2];
}

// Fallback police helicopter for the cover shot. Lane 2 owns the real
// scene-density pass (a police heli included) — if their heli is
// already in the world or on the police system, this is skipped so the
// sky never gets two choppers. Round 16: the heli is built SIDE-ON
// (see the follow branch in the update loop) and BRIGHT — white
// fuselage + tail boom, navy stripe/fin, dark outline rim, dark rotor
// + disc — with a small dim searchlight cone + ground pool below: the
// air unit must read as a helicopter at 768x480, not a dark blob or a
// white triangle. Cost at scale 2.3: 14 meshes, ~216 tris. Exposed as
// __solmar.round13.heli.
function buildShotHeli(x, y, z, scale = 1) {
  // Skip only when a heli actually exists right now. (A bare
  // `typeof police.getHelicopter === 'function'` check used to skip
  // whenever Lane 2's API existed — even with no heli spawned — which
  // left the cover with no heli at all.)
  const lane2Heli = police.helicopter || (typeof police.getHelicopter === 'function' && police.getHelicopter());
  if (world.helicopter || lane2Heli) return null;
  const s = scale;
  // Round 16: the chopper must read AS a helicopter at 768x480, not
  // as a blue box. Round 15 measured the failure: face-on yaw (nose-
  // tail 21 px on screen), light-blue body vs orange sky contrast
  // 15.7, pale rotor disc invisible (0% dark pixels on the rotor
  // line). Round 16: near-white fuselage (bright vs the orange sky)
  // with a navy stripe + navy fin, a dark outline shell peeking out
  // around the fuselage rim (thinner in depth than the body, taller +
  // longer, so only the rim shows), dark unlit rotor bar + tail rotor
  // + skids (silhouette parts read dark against a bright sky — the
  // lit-standard-material greys washed out), and a dark translucent
  // rotor disc. The side-on yaw lives in the update loop (follow
  // branch); the geometry here is built for it: the long axis is
  // local z, so a +90 deg yaw lays body + tail across the screen.
  // Iteration 2 (run-1 review): the first side-on build read as a
  // white BILLBOARD — the navy tail boom vanished against the dark
  // left tower, so the fuselage did not connect to any tail. The boom
  // is WHITE now (one connected fuselage+tail silhouette), the fin
  // stays navy, and a dark windshield at the nose marks the front
  // (the aircraft cue a flat white box lacks). 14 meshes, ~216 tris
  // (was 11 / ~180).
  const r16 = CONFIG.round16?.heli || {};
  const coneRadius = typeof r16.coneRadius === 'number' ? r16.coneRadius : 3.0;
  const coneOpacity = typeof r16.coneOpacity === 'number' ? r16.coneOpacity : 0.30;
  const poolOpacity = typeof r16.poolOpacity === 'number' ? r16.poolOpacity : 0.45;
  const poolScale = typeof r16.poolScale === 'number' ? r16.poolScale : 14;
  const discRadius = typeof r16.discRadius === 'number' ? r16.discRadius : 4.25;
  const matBody = new THREE.MeshStandardMaterial({ color: 0xe2ecf5, roughness: 0.4, metalness: 0.15, emissive: 0x8fa8c8, emissiveIntensity: 0.25 });
  const matNavy = new THREE.MeshStandardMaterial({ color: 0x16305e, roughness: 0.5, metalness: 0.2, emissive: 0x0a1830, emissiveIntensity: 0.4 });
  const matGlass = new THREE.MeshBasicMaterial({ color: 0x0d1620 });
  const matDark = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  const g = new THREE.Group();
  // Dark outline shell: bigger than the body in height + length,
  // thinner in depth, so it only peeks out as a dark rim around the
  // fuselage silhouette from the side view.
  const outline = new THREE.Mesh(new THREE.BoxGeometry(1.9 * s, 1.9 * s, 4.7 * s), new THREE.MeshBasicMaterial({ color: 0x14181f }));
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2 * s, 1.5 * s, 4.2 * s), matBody);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.24 * s, 0.4 * s, 4.24 * s), matNavy);
  stripe.position.y = -0.2 * s;
  // Round 16 iteration 2: the tail boom is WHITE (was navy) — a dark
  // boom vanished against the dark left tower and the fuselage read
  // as a disconnected billboard. White boom + navy fin = one connected
  // aircraft silhouette, boom bright against the tower, fin dark
  // against the sky.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.5 * s, 3.4 * s), matBody);
  tail.position.set(0, 0.3 * s, -3.6 * s);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.15 * s, 1.4 * s, 0.6 * s), matNavy);
  fin.position.set(0, 0.9 * s, -5.0 * s);
  // Round 16 iteration 2: the windshield — a dark glass box at the
  // nose's upper front, slightly proud of the fuselage. The flat white
  // box's missing cue: without it the nose is indistinguishable from
  // a sign; with it the front reads as a cockpit.
  // Iteration 3: the windshield is a THROUGH-body band (wider than
  // the fuselage, so it reads on the camera-facing side face) at the
  // nose — the first version sat on the nose's end face, nearly
  // edge-on to the side camera and invisible. A dark window band
  // across the nose's upper side is the cockpit cue from any side.
  const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.3 * s, 0.7 * s, 1.2 * s), matGlass);
  windshield.position.set(0, 0.3 * s, 1.5 * s);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(8.5 * s, 0.08, 0.55 * s), matDark);
  rotor.position.y = 1.0 * s;
  // Round 16: the cross bar — a second rotor bar at 90 deg (a child of
  // the spinning rotor, so it spins with it). Face-on, the first bar
  // reads; side-on it foreshortens to nothing, and the cross bar is
  // the one that spans the screen.
  const rotorCross = new THREE.Mesh(new THREE.BoxGeometry(0.55 * s, 0.08, 8.5 * s), matDark);
  rotor.add(rotorCross);
  const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.8 * s, 0.3), matDark);
  tailRotor.position.set(0.35 * s, 0.4 * s, -4.9 * s);
  // Round 16: skids scaled in cross-section too (was a fixed 0.12 m —
  // ~1 px at any scale). At 0.16*s they read as landing skids.
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.16 * s, 3.4 * s), matDark);
  skidL.position.set(-0.9 * s, -1.0 * s, 0);
  const skidR = skidL.clone();
  skidR.position.x = 0.9 * s;
  // Rotor blur disc: the spinning bar reads as a rotor, not a plank.
  // Round 16: DARK translucent (was pale 0xfff2cc @ 0.50 — it measured
  // 0% dark pixels on the rotor line, invisible against the bright
  // sky). A dark disc over a bright sky reads as rotor blur.
  // Round 17: darker + more opaque (0x1a1a1a @ 0.70, was 0x2e2e2e @
  // 0.38) — the 0.38 disc over a ~67 sky reads ~59, only 8 darker
  // than the sky reference, so the disc-dark fraction measured the
  // rotor blades, not the disc, and drifted 0.38 -> 0.35 -> 0.32
  // (below the 0.35 gate). At 0.70 the disc reads ~38 over the sky,
  // ~29 darker than the reference. The disc sits above the fuselage
  // sightline, so it darkens only the sky row, never the body box.
  const rotorBlur = new THREE.Mesh(
    new THREE.CircleGeometry(discRadius * s, 20),
    new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
  );
  rotorBlur.rotation.x = -Math.PI / 2;
  rotorBlur.position.y = 1.0 * s;
  // Searchlight: a translucent cone from the belly to the ground (apex
  // at the belly, base on the road) + a warm pool of light below it.
  // The heli hovers ~y above the road, so the cone is y long.
  // Round 16: SMALLER + DIMMER (radius / opacity from CONFIG.round16)
  // — in round 15 the big pale cone dominated the frame and read as a
  // white triangle; the helicopter is the subject now, not the beam.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(coneRadius, y, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: coneOpacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  cone.position.y = -y / 2;
  const pool = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('rgba(255,255,255,0.95)'), transparent: true, depthWrite: false,
    opacity: poolOpacity, color: 0xffe9a8,
  }));
  pool.scale.set(poolScale, poolScale, 1);
  pool.position.y = -y + 0.6;
  // Round 17: the heli DETAIL — a helicopter is more than a body +
  // rotor. Mast + hub above the fuselage (the rotor has something to
  // spin on), dark glass on BOTH fuselage sides (the camera-facing
  // side is local -x under the side-on yaw, but a symmetric pair can
  // never be on the wrong side), a strut from each skid up to the
  // belly, red tail / green nose nav lights, a horizontal stabilizer
  // on the tail boom, engine exhausts on both flanks and a belly
  // antenna. 12 meshes, ~290 tris — the cover has ~35k tris of
  // headroom, and every round-16 gate (contrast, nose-tail, rotor
  // span, disc dark fraction) is untouched: the detail sits inside
  // the old silhouette, it does not redraw it. All named heli-* so
  // the probe can count them.
  const r17 = CONFIG.round17?.heliDetail || {};
  const hd = (mesh, name) => { mesh.name = name; g.add(mesh); return mesh; };
  // Round 17 (mast + hub): the hub sits HIGH (y 1.45, on a 0.7 mast
  // from the roof) as the visible rotor head, and the probe's hub
  // point (y 1.1) lands ON the tall dark mast — the mast is a long
  // dark column that stays in the 10x6 probe box at every bob phase
  // (run2: hubDarkFrac 1.0). The mast stays navy: the hub gate reads
  // it dark, and the staged-shot bob freeze (update loop) holds the
  // column at the probe point for the screenshot.
  const mast = hd(new THREE.Mesh(new THREE.CylinderGeometry((r17.mast?.radius ?? 0.2) * s, (r17.mast?.radius ?? 0.2) * s, (r17.mast?.height ?? 0.7) * s, 8), matNavy), 'heli-mast');
  mast.position.set(0, (r17.mast?.y ?? 1.1) * s, 0);
  const hub = hd(new THREE.Mesh(new THREE.BoxGeometry((r17.hub?.width ?? 0.4) * s, (r17.hub?.height ?? 0.14) * s, (r17.hub?.width ?? 0.4) * s), matNavy), 'heli-hub');
  hub.position.set(0, (r17.hub?.y ?? 1.45) * s, 0);
  const st = r17.strut || {};
  for (const sx of [-1, 1]) {
    const glass = hd(new THREE.Mesh(new THREE.BoxGeometry(0.06 * s, 0.5 * s, 1.4 * s), matGlass), 'heli-side-glass');
    glass.position.set(sx * 1.13 * s, 0.25 * s, 0.9 * s);
    const strutLen = Math.hypot((st.topY ?? -0.1) - (st.botY ?? -1.0), (st.topX ?? 1.12) - (st.x ?? 0.9));
    // Round 17 (struts): LEANING struts, not vertical — the top sits
    // just outboard of the fuselage face (x 1.12) and the foot on the
    // skid (x 0.9), so the strut reads dark along its whole body->skid
    // run. A vertical strut at x 0.9 hides behind the fuselage above
    // the belly, and the probe line reads white, not dark.
    const strut = hd(new THREE.Mesh(new THREE.BoxGeometry((st.thickness ?? 0.12) * s, strutLen * s, (st.thickness ?? 0.12) * s), matDark), 'heli-strut');
    strut.position.set(sx * (((st.topX ?? 1.12) + (st.x ?? 0.9)) / 2) * s, (((st.topY ?? -0.1) + (st.botY ?? -1.0)) / 2) * s, (st.z ?? 0.3) * s);
    strut.rotation.z = -sx * Math.atan2((st.topX ?? 1.12) - (st.x ?? 0.9), (st.topY ?? -0.1) - (st.botY ?? -1.0));
    const exhaust = hd(new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.16 * s, 0.6 * s, 8), matDark), 'heli-exhaust');
    exhaust.rotation.z = Math.PI / 2;
    // Round 17: exhausts at y 0.5 (CONFIG.round17.heliDetail.exhaust.y),
    // on the fuselage side below the body-vs-sky contrast sample box —
    // at 0.85 they sat inside it as a dark disc and dragged it ~5 lum.
    exhaust.position.set(sx * 1.3 * s, (r17.exhaust?.y ?? 0.5) * s, -0.5 * s);
  }
  const navTail = hd(new THREE.Mesh(
    new THREE.SphereGeometry(0.12 * s, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  ), 'heli-nav-tail');
  navTail.position.set(0, (r17.navTail?.y ?? 0.5) * s, (r17.navTail?.z ?? -5.35) * s);
  const navNose = hd(new THREE.Mesh(
    new THREE.SphereGeometry(0.15 * s, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0x2aff5a }),
  ), 'heli-nav-nose');
  // Round 17: the nose light sits ON the south face at the nose
  // (x -1.2, on the through-body windshield, z 1.9), radius 0.15 —
  // the old spot (x 0, z 2.2, the nose TIP) is inside the fuselage's
  // silhouette from the low south camera: the fuselage (x ±1.1)
  // hides it completely (navNoseGreen 0 in run1 AND run2, even at
  // radius 0.15). A nav light belongs on the aircraft's side anyway
  // (green = starboard, which faces this camera); on the dark
  // windshield it reads as a clear green dot. Probe point moved to
  // match (see round17-test.mjs / round17-probe.mjs).
  navNose.position.set((r17.navNose?.x ?? -1.2) * s, (r17.navNose?.y ?? 0.3) * s, (r17.navNose?.z ?? 1.9) * s);
  const stab = hd(new THREE.Mesh(new THREE.BoxGeometry(1.6 * s, 0.08 * s, 0.5 * s), matBody), 'heli-stabilizer');
  stab.position.set(0, 0.6 * s, -4.2 * s);
  const antenna = hd(new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.3 * s, 6), matDark), 'heli-antenna');
  antenna.position.set(0, -0.9 * s, 0.5 * s);
  g.add(outline, body, stripe, tail, fin, windshield, rotor, tailRotor, skidL, skidR, rotorBlur, cone, pool);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  g.position.set(x, y, z);
  scene.add(g);
  return { group: g, rotor, x, y, z, angle: 0.6, t: 0, scale: s, followOffset: null };
}

// The staged dialogue line: shown as the HUD message toast (the
// round-12 fallback every shot can rely on) and passed to hud.update
// as `dialogue` for Lane 1's renderDialogue. A null speaker means a
// banner line, not spoken dialogue (the pursuit's VEHICLE STOLEN).
function setShotDialogue(speaker, role, line) {
  const text = speaker ? `${speaker}: '${line}'` : line;
  shotDialogue = { speaker, role, line, text };
  showMessage(text, 30);
}

// Round 18: cover shopfront + SOLMAR sign + edge trim — staging-only
// dressing on the nearest tall tower's south face in the cover frame.
// Deterministic: the face is DERIVED from the world building boxes
// (largest maxZ among tall faces ahead of the car, overlapping the
// road corridor's west side), no rng is consumed, so the seeded city
// layout never shifts, and no other shot pays for it. 12 draw calls,
// ~100 tris, against the cover's huge headroom (2.9k / 4.3k calls).
// The placed points are collected in coverShopfront so the probe can
// verify them (window clusters, sign, trim) instead of trusting the
// staging code. If no face qualifies the function skips, never crashes.
function stageCoverShopfront() {
  const cfg = CONFIG.round18?.cover || {};
  const carZ = player.position.z;
  let target = null;
  for (const b of world.buildings) {
    if ((b.height || 0) < 30) continue;
    if (b.maxZ < -170 || b.maxZ > carZ - 40) continue;
    if (b.maxX < -20 || b.minX > 30) continue;
    if (!target || b.maxZ > target.maxZ) target = b;
  }
  if (!target) return;
  const faceZ = target.maxZ;
  const cx = (target.minX + target.maxX) / 2;
  const faceW = target.maxX - target.minX;
  const glassColor = cfg.glassColor ?? 0xffd98a;
  const frameColor = cfg.frameColor ?? 0x2a2a22;
  const awningColor = cfg.awningColor ?? 0xc23a2a;
  const trimColor = cfg.trimColor ?? 0xd8c9a8;
  const winW = cfg.windowW ?? 4.5, winH = cfg.windowH ?? 2.2, winY = cfg.windowY ?? 1.6;
  const points = {
    building: { minX: target.minX, maxX: target.maxX, minZ: target.minZ, maxZ: target.maxZ, height: target.height },
    windows: [], sign: null, trim: [],
  };
  const add = (mesh, name) => { mesh.name = name; scene.add(mesh); return mesh; };
  // Three warm shopfront windows (dark frame backing + warm glass
  // proud of it, so each pane reads framed, not pasted on). The row
  // sits WEST of centre: the police light-bar glow sprites ride
  // the sightline to the east pane (raycast: red/white sprites at
  // ~30 m, x 33, in front of the cx+7 pane; even at cx+4 the blue
  // halo still washed the east pane), so the panes are shifted
  // west of the glow cluster, clear of it. The west pane stays
  // inside the face (centre cx-12, half-width 2.25 m, face edge
  // cx-15).
  for (const wx of [cx - 12, cx - 5, cx + 2]) {
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(winW + 0.6, winH + 0.6),
      new THREE.MeshBasicMaterial({ color: frameColor }),
    );
    frame.position.set(wx, winY, faceZ + 0.12);
    add(frame, 'cover-shopfront-frame');
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(winW, winH),
      new THREE.MeshBasicMaterial({ color: glassColor }),
    );
    glass.position.set(wx, winY, faceZ + 0.2);
    add(glass, 'cover-shopfront-glass');
    points.windows.push({ x: wx, y: winY, z: faceZ + 0.2 });
  }
  // Red awning above the windows, tilted out over the sidewalk.
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(faceW - 4, 26), 0.18, 1.8),
    new THREE.MeshStandardMaterial({ color: awningColor, roughness: 0.85 }),
  );
  awning.position.set(cx, cfg.awningY ?? 3.5, faceZ + 0.9);
  awning.rotation.x = 0.22;
  add(awning, 'cover-shopfront-awning');
  // Edge trim: one horizontal band above the awning + vertical strips
  // down both face edges, so the tower's ground floor reads framed.
  const trimBand = new THREE.Mesh(
    new THREE.BoxGeometry(faceW - 1, 0.35, 0.12),
    new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.8 }),
  );
  trimBand.position.set(cx, cfg.trimY ?? 5.6, faceZ + 0.12);
  add(trimBand, 'cover-trim-band');
  points.trim.push({ x: cx, y: cfg.trimY ?? 5.6, z: faceZ + 0.12 });
  for (const ex of [target.minX + 0.4, target.maxX - 0.4]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 11, 0.12),
      new THREE.MeshStandardMaterial({ color: trimColor, roughness: 0.8 }),
    );
    strip.position.set(ex, 5.5, faceZ + 0.12);
    add(strip, 'cover-trim-strip');
    points.trim.push({ x: ex, y: 5.5, z: faceZ + 0.12 });
  }
  // The SOLMAR sign — the game's own name, lit, above the shopfront.
  const signW = cfg.signW ?? 14, signH = cfg.signH ?? 2.6, signY = cfg.signY ?? 7.5;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(signW, signH),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(cfg.signText ?? 'SOLMAR', cfg.signBg ?? '#123a5c', cfg.signFg ?? '#ffd94a'), transparent: true }),
  );
  sign.position.set(cx, signY, faceZ + 0.22);
  add(sign, 'cover-solmar-sign');
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture('#ffd94a'), transparent: true, depthWrite: false, opacity: 0.35,
  }));
  glow.scale.set(signW + 2, signH + 2, 1);
  glow.position.set(cx, signY, faceZ + 0.4);
  add(glow, 'cover-solmar-glow');
  points.sign = { x: cx, y: signY, z: faceZ + 0.22 };
  coverShopfront = points;
}

// Round 21: Art Deco block on the SOLMAR tower's south face, ABOVE
// the round-18 shopfront — staging-only, cover frame only, same
// deterministic face derivation as stageCoverShopfront (no rng, the
// seeded city never shifts). Three wedding-cake tiers step 0.8 m
// proud of the one below as they rise (y 10-33), a 2-step crown
// caps the top tier (y 33-36), a vertical fin runs the west edge
// (y 10-36, clear of the heli), and each tier top carries a dark
// balcony band + a thin rail. The block NEVER touches the shopfront
// (tier base y 10 is above the sign top 8.8, trim 5.6, awning 3.5,
// windows 1.6). All faces are MeshBasicMaterial (UNLIT, like the
// shopfront glass) in MUTED pastel (config luminance 117-155), so
// the block reads as architecture, not a billboard, and cannot lift
// the heli-contrast ring the way a bright white block would.
// 12 draw calls, ~144 tris, against the cover's huge headroom.
// The placed points are collected in coverDeco so the probe can
// verify them (tier faces, balcony lines, fin line) instead of
// trusting the staging code. If no face qualifies the function
// skips, never crashes.
function stageCoverDeco() {
  // Round 22: the round-22 deco overrides (wider bottom tier +
  // fin shifted west, plan §2b) merge over the round-21 block — the
  // round-21 values stay the fallback, so a copy that lost the
  // round-22 block still stages the round-21 block.
  const cfg = { ...(CONFIG.round21?.deco || {}), ...(CONFIG.round22?.deco || {}) };
  const carZ = player.position.z;
  let target = null;
  for (const b of world.buildings) {
    if ((b.height || 0) < 30) continue;
    if (b.maxZ < -170 || b.maxZ > carZ - 40) continue;
    if (b.maxX < -20 || b.minX > 30) continue;
    if (!target || b.maxZ > target.maxZ) target = b;
  }
  if (!target) return;
  const faceZ = target.maxZ;
  const cx = (target.minX + target.maxX) / 2;
  const tierColors = cfg.tierColors || [0xa86a52, 0xb57f74, 0x87a06e];
  const bandColor = cfg.bandColor ?? 0x2e2a26;
  const railColor = cfg.railColor ?? 0x6a5a44;
  const finColor = cfg.finColor ?? 0xa89a7c;
  const crownColor = cfg.crownColor ?? 0x87a06e;
  const baseY = cfg.tierBaseY ?? 10;
  const heights = cfg.tierHeights || [8, 8, 7];
  const widths = cfg.tierWidths || [24, 20, 16];
  const depths = cfg.tierDepths || [0.8, 1.6, 2.4];
  const points = {
    building: { minX: target.minX, maxX: target.maxX, minZ: target.minZ, maxZ: target.maxZ, height: target.height },
    tiers: [], tierCorners: [], finCorners: [], finLine: null, balcony: [],
  };
  const add = (mesh, name) => { mesh.name = name; scene.add(mesh); return mesh; };
  const basic = (color) => new THREE.MeshBasicMaterial({ color });
  let y = baseY;
  for (let i = 0; i < 3; i++) {
    const w = widths[i], h = heights[i], d = depths[i];
    const tier = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic(tierColors[i]));
    tier.position.set(cx, y + h / 2, faceZ + d / 2);
    add(tier, 'deco-tier');
    const topY = y + h;
    points.tiers.push({ x: cx, y: y + h / 2, z: faceZ + d, w, h });
    points.tierCorners.push(
      { x: cx - w / 2, y, z: faceZ + d }, { x: cx + w / 2, y, z: faceZ + d },
      { x: cx - w / 2, y: topY, z: faceZ + d }, { x: cx + w / 2, y: topY, z: faceZ + d },
    );
    // Dark balcony band at the tier top, proud of the tier face, +
    // a thin rail bar above its front edge — the two horizontal
    // lines that read as a balcony from the street.
    const bandY = topY - 0.4;
    const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 0.35), basic(bandColor));
    band.position.set(cx, bandY, faceZ + d + 0.175);
    add(band, 'deco-balcony-band');
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.12), basic(railColor));
    rail.position.set(cx, topY + 0.55, faceZ + d + 0.3);
    add(rail, 'deco-balcony-rail');
    points.balcony.push({
      a: { x: cx - w / 2, y: bandY, z: faceZ + d + 0.35 },
      b: { x: cx + w / 2, y: bandY, z: faceZ + d + 0.35 },
    });
    y = topY;
  }
  // Stepped crown on the top tier, set back to the middle tier's
  // depth so it reads as a cap, not another full tier.
  const crownDepth = cfg.crownDepth ?? 1.6;
  const crownWidths = cfg.crownWidths || [12, 8];
  const crownHeights = cfg.crownHeights || [2, 1];
  for (let i = 0; i < 2; i++) {
    const cw = crownWidths[i], ch = crownHeights[i];
    const step = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, crownDepth), basic(crownColor));
    step.position.set(cx, y + ch / 2, faceZ + crownDepth / 2);
    add(step, 'deco-crown');
    points.tierCorners.push(
      { x: cx - cw / 2, y, z: faceZ + crownDepth }, { x: cx + cw / 2, y, z: faceZ + crownDepth },
      { x: cx - cw / 2, y: y + ch, z: faceZ + crownDepth }, { x: cx + cw / 2, y: y + ch, z: faceZ + crownDepth },
    );
    y += ch;
  }
  // Round 22 (Target 3, stage 2): a FOURTH balcony band + rail on
  // the crown's first step (y 33-35, width 12 m) — the same dark
  // band + brass rail as the three tier bands, so the Deco block
  // reads 4 balcony lines instead of 3. Band at step-1 top - 0.4
  // (y 34.6), rail 0.55 above the step-1 top (y 35.55, crossing the
  // second step's face exactly like the tier rails cross the next
  // tier). Cover-only, +2 draw calls / ~4 tris. The band is dark,
  // so it cannot lift the heli-contrast ring or the pastel counts.
  if (cfg.crownBand) {
    const crownBandY = y - crownHeights[1] - 0.4; // step-1 top (35) - 0.4 = 34.6
    const crownBand = new THREE.Mesh(new THREE.BoxGeometry(crownWidths[0], 0.5, 0.35), basic(bandColor));
    crownBand.position.set(cx, crownBandY, faceZ + crownDepth + 0.175);
    add(crownBand, 'deco-crown-band');
    const crownRail = new THREE.Mesh(new THREE.BoxGeometry(crownWidths[0], 0.12, 0.12), basic(railColor));
    crownRail.position.set(cx, crownBandY + 0.95, faceZ + crownDepth + 0.3);
    add(crownRail, 'deco-crown-rail');
    points.balcony.push({
      a: { x: cx - crownWidths[0] / 2, y: crownBandY, z: faceZ + crownDepth + 0.35 },
      b: { x: cx + crownWidths[0] / 2, y: crownBandY, z: faceZ + crownDepth + 0.35 },
    });
  }
  // Vertical fin on the WEST edge of the block (x = minX + 2, so it
  // stands clear of the heli, which rides the east half of the
  // face) — the Art Deco silhouette, readable from the street.
  // Round 22: finWestShift moves it 1.0 m further west (west edge
  // minX+1.0, still fully on the tower face) so the block's
  // projected crop — and the visible pastel bbox — widens; the fin
  // stays ~50 px clear of the narrowed dialogue box (right edge 456).
  const finW = cfg.finWidth ?? 2.0;
  const finTopY = cfg.finTopY ?? 36;
  const finDepth = cfg.finDepth ?? 1.2;
  const finX = target.minX + finW - (cfg.finWestShift ?? 0);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(finW, finTopY - baseY, finDepth), basic(finColor));
  fin.position.set(finX, (baseY + finTopY) / 2, faceZ + finDepth / 2);
  add(fin, 'deco-fin');
  points.finCorners.push(
    { x: finX - finW / 2, y: baseY, z: faceZ + finDepth }, { x: finX + finW / 2, y: baseY, z: faceZ + finDepth },
    { x: finX - finW / 2, y: finTopY, z: faceZ + finDepth }, { x: finX + finW / 2, y: finTopY, z: faceZ + finDepth },
  );
  points.finLine = {
    a: { x: finX, y: baseY + 2, z: faceZ + finDepth },
    b: { x: finX, y: finTopY - 2, z: faceZ + finDepth },
  };
  coverDeco = points;
}

// Round 21: shaded shopfront + balcony bands on the WEST face of
// the nearest east tower (x[76.4,106], minX 76.4) — staging-only,
// cover frame only, same deterministic derivation as the shopfront
// (no rng). Two warm glass panes + a shaded-blue awning at ground
// level (the y 265-325 lane, below the police panel) and two dark
// balcony bands at y 21 / 26 (the y 90-140 lane, above the police
// panel, clear of the heli). The face is seen at a grazing angle
// from the road, so the panes are the same size as the SOLMAR
// shopfront's — the probe measures them by their projected centres.
// 9 draw calls, ~108 tris. If no tower qualifies the function
// skips, never crashes; the test treats an absent east staging as
// "skipped", not as a failure (Target 2 is optional by plan).
function stageCoverEast() {
  // Round 22: the round-22 east overrides (wider panes + longer
  // awning, plan §3) merge over the round-21 block — the round-21
  // values stay the fallback, so a copy that lost the round-22
  // block still stages the round-21 panes.
  const cfg = { ...(CONFIG.round21?.east || {}), ...(CONFIG.round22?.east || {}) };
  const carZ = player.position.z;
  let target = null;
  for (const b of world.buildings) {
    if ((b.height || 0) < 30) continue;
    if (b.minX < 70 || b.minX > 80) continue;
    if (b.maxZ < -170 || b.maxZ > carZ - 40) continue;
    if (!target || b.maxZ > target.maxZ) target = b;
  }
  if (!target) return;
  const faceX = target.minX;
  const cz = (target.minZ + target.maxZ) / 2;
  const glassColor = cfg.glassColor ?? 0xffd98a;
  const frameColor = cfg.frameColor ?? 0x2a2a22;
  const awningColor = cfg.awningColor ?? 0x2e86c1;
  const bandColor = cfg.bandColor ?? 0x2e2a26;
  const railColor = cfg.railColor ?? 0x6a5a44;
  const winW = cfg.windowW ?? 4.5, winH = cfg.windowH ?? 2.2, winY = cfg.windowY ?? 1.6;
  const points = {
    building: { minX: target.minX, maxX: target.maxX, minZ: target.minZ, maxZ: target.maxZ, height: target.height },
    windows: [], awning: null, balcony: [],
  };
  const add = (mesh, name) => { mesh.name = name; scene.add(mesh); return mesh; };
  // Two warm panes on the west face (planes face -x, toward the
  // road), each with a dark frame backing, like the SOLMAR row.
  for (const wz of [cz - 5.5, cz + 3.5]) {
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(winW + 0.6, winH + 0.6),
      new THREE.MeshBasicMaterial({ color: frameColor }),
    );
    frame.rotation.y = -Math.PI / 2;
    frame.position.set(faceX - 0.12, winY, wz);
    add(frame, 'deco-east-frame');
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(winW, winH),
      new THREE.MeshBasicMaterial({ color: glassColor }),
    );
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(faceX - 0.2, winY, wz);
    add(glass, 'deco-east-glass');
    points.windows.push({ x: faceX - 0.2, y: winY, z: wz });
  }
  // Shaded awning above the panes, tilted so its outer (-x) edge
  // drops over the sidewalk (rotation about z, not x — the face
  // points west, so the tilt axis is z).
  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.18, cfg.awningLength ?? 12),
    new THREE.MeshStandardMaterial({ color: awningColor, roughness: 0.85 }),
  );
  awning.position.set(faceX - 0.9, cfg.awningY ?? 3.5, cz);
  awning.rotation.z = 0.22;
  add(awning, 'deco-east-awning');
  points.awning = { x: faceX - 0.9, y: cfg.awningY ?? 3.5, z: cz };
  // Dark balcony bands up the face, each with a thin rail bar
  // above its front edge — the horizontal lines that break the
  // repeated glass grid on the tower's west face.
  const bandLength = cfg.bandLength ?? 14;
  for (const bandY of (cfg.bandY || [21, 26])) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.5, bandLength),
      new THREE.MeshBasicMaterial({ color: bandColor }),
    );
    band.position.set(faceX - 0.175, bandY, cz);
    add(band, 'deco-east-band');
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, bandLength),
      new THREE.MeshBasicMaterial({ color: railColor }),
    );
    rail.position.set(faceX - 0.3, bandY + 0.55, cz);
    add(rail, 'deco-east-rail');
    points.balcony.push({
      a: { x: faceX - 0.35, y: bandY, z: cz - bandLength / 2 },
      b: { x: faceX - 0.35, y: bandY, z: cz + bandLength / 2 },
    });
  }
  coverEast = points;
}

// 1-cover-chase.jpg — golden-hour police chase. Player in the red
// sports car on the x=40 downtown road (the proven round-12 spot),
// four stars, two interceptors tight behind, the fallback heli above,
// Hot Wheels objective, Dante on the radio, peds on the sidewalk.
// 1-cover-chase.jpg — Round 15: the sheet's opening beat (chapter 1),
// FOUR stars (was five — the arc now rises 4 → 4 → 5 → 5), the GT big
// in the frame, the two interceptors FLANKING the player, the heli BIG
// (scale 2.3, SIDE-ON) and TRACKING the car over the OPEN SKY above the road
// corridor (followOffset x 0, y 14.5 — round 14 parked it over the dark
// right-hand tower where it read as a black block), skid marks +
// exhaust smoke on the GT, peds TRACKED relative to the car (8 / 14 m
// beyond it on the east sidewalk, 11 m on the west) so they hold their
// size at capture instead of drifting up-frame as dots.
// Round 20: two staged traffic cars on the road ahead of the GT (one
// per lane, different depths) + their lights — the cover road read as
// mostly empty asphalt with one far interceptor + one red car. The cars
// are real sculpted sedans from the shared factory (createCar via
// makeCar, the same factory traffic.js uses), staged like the pursuit
// rivals and tracked in shotTraffic; the far car shows its BRAKE lights
// (rear to the camera), the near car its HEADLIGHTS (front to the
// camera) — the same dusk values traffic.js applies to its own cars.
// Cover-only: shotTraffic is empty on every other shot, and the cars
// are never added to traffic.getCars() or police.policeCars, so no
// gameplay system, panel count or other shot sees them.
function stageCoverTraffic() {
  const cfg = CONFIG.round20?.traffic || {};
  const lc = CONFIG.round20?.lights || {};
  const car = player.currentCar;
  if (!car) return [];
  const made = [];
  for (const key of ['far', 'near']) {
    const t = cfg[key];
    if (!t) continue;
    const c = makeCar({
      position: { x: car.position.x + t.dx, y: 0, z: car.position.z + t.dz },
      heading: t.heading ?? 0, model: t.model || 'sedan',
      colour: t.colour ?? 0xc23a2a, driver: 'ai',
    });
    c.kind = 'cover-traffic';
    c.speed = 0;
    c.staged = true;
    if (t.lights === 'head') {
      if (c.headMat) c.headMat.emissiveIntensity = lc.headEmissive ?? 1.8;
      if (Array.isArray(c.headGlows)) for (const g of c.headGlows) if (g) g.opacity = lc.headGlowOpacity ?? 0.95;
      if (Array.isArray(c.headGlowSprites)) for (const s of c.headGlowSprites) if (s && s.scale) s.scale.setScalar(lc.headGlowScale ?? 1.8);
    } else if (t.lights === 'tail') {
      if (c.tailMat) c.tailMat.emissiveIntensity = lc.tailEmissive ?? 2.0;
      if (Array.isArray(c.tailGlows)) for (const g of c.tailGlows) if (g) g.opacity = lc.tailGlowOpacity ?? 0.95;
    }
    shotTraffic.push({ car: c, dx: t.dx, dz: t.dz, heading: t.heading ?? 0, key });
    made.push(c);
  }
  return made;
}
function stageCoverChase() {
  state = 'playing';
  showOnly(null);
  input.attach(canvas);
  applyGoldenHour();
  // Round 21: sun-soaked cover light, cover-only, AFTER the global
  // golden-hour grade (applyGoldenHour() itself is untouched, so
  // combat / pursuit / sunset keep their own palettes): a warmer
  // sky gradient at every stop + warmer fog, and the directional
  // sun a little lower (CONFIG.round21.coverLight.sunOffset, ~15
  // deg -> ~11.5 deg) for longer shadows. All via CONFIG,
  // deterministic, no other shot pays for it.
  {
    const cl = CONFIG.round21?.coverLight || {};
    if (typeof cl.skyTop === 'number' && typeof cl.skyHorizon === 'number') {
      world.sky.setPalette(cl.skyTop, cl.skyHorizon, cl.mids);
      scene.background = new THREE.Color(cl.skyHorizon);
      if (typeof cl.fog === 'number') scene.fog = new THREE.Fog(cl.fog, 200, 850);
    }
    if (Array.isArray(cl.sunOffset) && cl.sunOffset.length === 3) shotSunOffset = [...cl.sunOffset];
  }
  // Round 15: 17.81, not 17.8 — formatClock floors the minutes, and
  // 17.8 in binary float is 17.7999..., which floors to 17:47. The
  // 0.01 h (36 s) is invisible in the light; the sheet says 17:48.
  timeOfDay = 17.81;
  money = 1200;
  // Round 23: the whole cover staging moves 8 m north toward the
  // round-22 capture point (CONFIG.round23.coverSpawn.carZ -72)
  // and the GT is held still (holdSpeed 0): at capture the camera
  // sits ~70 m from the tower face instead of ~83 m,
  // deterministically (see config.js for the failed closer tries).
  const coverSpawnZ = CONFIG.round23?.coverSpawn?.carZ ?? -80;
  const car = createCar(scene, 'sports', 0xd7263d, 40, coverSpawnZ, 0);
  spawnedCars.add(car);
  // Round 23: holdSpeed 0 — the GT stands still (see config).
  car.speed = CONFIG.round23?.coverSpawn?.holdSpeed ?? 26;
  // Round 17: the hero trim — taillight bar, exhausts, rear glass,
  // flank stripes, rim discs, mirrors, grille, headlight lenses —
  // on the GT ONLY (the hero car). The shared sports model is never
  // touched, so the interceptors and traffic stay plain.
  attachHeroDetail(car);
  player.teleport(40, coverSpawnZ, 0);
  player.enterCar(car);
  camYaw = car.heading + Math.PI;
  // Round 23: cover camera from CONFIG.round23.coverCam (side /
  // ahead / height keep the proven round-12 values; the re-frame is
  // the spawn shift + the lookAt below, not the camera offsets).
  {
    const cc = CONFIG.round23?.coverCam || {};
    shotCam = { mode: 'front', side: cc.side ?? 6, ahead: cc.ahead ?? 8.5, height: cc.height ?? 4 };
  }
  shotHoldSpeed = CONFIG.round23?.coverSpawn?.holdSpeed ?? 26;
  police.maxPoliceCars = 2;
  police.maxOfficers = 0;
  police.addWanted(4);
  // Round 23: pursuit spawns shift 6 m south (-98/-110 ->
  // -104/-116), so the interceptors end ~13/23 m behind the GT
  // instead of ramming it at 1 m (see config.js).
  {
    const pz = CONFIG.round23?.coverSpawn?.pursuitZ || [-98, -110];
    stagePursuitCars(40, pz[0], pz[1], 0);
  }
  // Round 14: the interceptors FLANK the GT (one each side of the
  // road centre) instead of trailing in a single file — the chase
  // reads as a pincer, and both light bars stay in the frame. x 33 /
  // 47 puts them at the road edges (the road is ~14 m wide), so they
  // read on opposite sides of the GT in the picture.
  // Round 23: flank wider (31/49 instead of 33/47) — with the GT
  // held still the interceptors steer toward its x as they close
  // in, collapsing the flank below the 8 m gate (run1: 37.1/44.4);
  // 2 m outside the road edge buys the margin back.
  police.policeCars[0].position.x = 31;
  police.policeCars[1].position.x = 49;
  // Round 14: NO lane-2 heli — the police._scene wiring used to spawn
  // a second heli at altitude 38 whose dark body hung at the top edge
  // of the frame (the ambiguous dark blob in 13B). The fallback heli
  // below is the only chopper in the sky.
  // Round 16: the heli sits over the OPEN SKY above the road corridor
  // (followOffset x 0 — dead-centre over the road, not x +10 over the
  // dark right-hand tower where round 14 read as a black block — and
  // y 15.5, clear of the dialogue box below and the clock above).
  // The bright SIDE-ON body (buildShotHeli, CONFIG.round16) + the
  // orange sky behind it make the chopper countable without reading
  // any text. Scale 2.3 (rotor span ~330 px); the update loop holds
  // it there.
  shotHeli = buildShotHeli(45, 22, -97, CONFIG.round16?.heli?.scale ?? 2.0);
  // Round 19: the heli rides LOWER + to the side (CONFIG.round19.heli
  // followOffset: y 15.5 -> 11.5, x 0 -> 4) — the round-18 heli
  // crowded the top edge (rotor-disc top at y -37, fuselage half
  // hidden behind the centred dialogue box), so the whole aircraft
  // now sits inside the frame with the rotor disc + skids visible
  // against the sky. The dialogue box moves out of its way (below).
  if (shotHeli) shotHeli.followOffset = { ...(CONFIG.round19?.heli?.followOffset ?? { x: 0, y: 15.5, z: -30 }) };
  // Skid marks + exhaust smoke, as children of the GT group (they
  // travel with the car): 2 dark planes at the rear wheels, 2 grey
  // glow sprites at the exhaust. 4 draw calls, ~8 tris.
  const skidMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthWrite: false });
  for (const sx of [-0.8, 0.8]) {
    const skid = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 2.6), skidMat);
    skid.rotation.x = -Math.PI / 2;
    skid.position.set(sx, 0.05, -2.5);
    car.group.add(skid);
  }
  const smokeTex = makeGlowTexture('rgba(200,200,200,0.9)');
  for (const sx of [-0.6, 0.6]) {
    const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.35, depthWrite: false, color: 0x888888 }));
    puff.scale.set(2.5, 2.5, 1);
    puff.position.set(sx, 0.5, -2.6);
    car.group.add(puff);
  }
  missions.startMission(1, world, systems());
  settleShot(24);
  police.setWanted(4); // re-pin after the settle (speeding rule fires once)
  // Round 15: peds staged RELATIVE to the car as it stands after the
  // settle (car.z has driven ~10 m from its staging spot) and TRACKED
  // from here (trackStagedPeds) — 8 / 14 m beyond the car on the east
  // sidewalk, 11 m on the west, so they hold ~55-75 px tall in the
  // frame at capture instead of drifting far up-frame as dots.
  const coverCarZ = player.position.z;
  const coverPlaced = placePeds([
    { roadX: 40, side: 1, z: coverCarZ - 8, heading: -Math.PI / 2 },
    { roadX: 40, side: 1, z: coverCarZ - 14, heading: -Math.PI / 2 },
    { roadX: 40, side: -1, z: coverCarZ - 11, heading: Math.PI / 2 },
    // Round 20: one ped CROSSING the road mid-frame (side 0 = road
    // centre, heading across it) + two extra on the west sidewalk
    // (1 -> 3 there) — the road's left side balances the right, and
    // the crossing ped puts a person ON the road, not just beside it.
    // All three ride the same trackStagedPeds offsets as the original
    // three, so they hold their framing at capture.
    { roadX: 40, side: 0, z: coverCarZ - 18, heading: Math.PI / 2 },
    { roadX: 40, side: -1, z: coverCarZ - 20, heading: Math.PI / 2 },
    { roadX: 40, side: -1, z: coverCarZ - 26, heading: Math.PI / 2 },
  ]);
  trackStagedPeds(coverPlaced);
  // Round 18: the three staged cover peds wear three DIFFERENT vivid
  // shirts (red / blue / amber) with varied heights, forced here so
  // the variety is deterministic, not a lucky rng draw — the mesh
  // recolour rides on syncPersonMeshes (person.shirt change) and the
  // scale rides on the cached mesh (sync never resets scale).
  // Round 20: the three new peds get vivid shirts too (green / purple
  // / red) with varied heights, same mechanism.
  {
    const coverShirts = ['#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#9b59b6', '#e74c3c'];
    const coverScales = [1.07, 0.94, 1.0, 1.02, 0.96, 1.05];
    coverPlaced.forEach((ped, i) => {
      if (!ped) return;
      ped.shirt = coverShirts[i % coverShirts.length];
      const mesh = pedMeshes.get(ped);
      if (mesh) mesh.scale.setScalar(coverScales[i % coverScales.length]);
    });
  }
  // Round 20: the two staged traffic cars on the road ahead of the GT
  // (stageCoverTraffic — one per lane, different depths, lights on).
  stageCoverTraffic();
  // Round 18: warm shopfront + SOLMAR sign + edge trim on the nearest
  // tower face ahead (staging-only, cover frame only).
  stageCoverShopfront();
  // Round 21: Art Deco block above the shopfront on the same tower
  // face + shaded shopfront / balcony bands on the nearest east
  // tower's west face (staging-only, cover frame only).
  stageCoverDeco();
  stageCoverEast();
  // Round 19: the cover dialogue box moves TOP-LEFT (CONFIG.round19
  // coverDialogue — the same override pattern as the round-16 sunset
  // shift): above the mission panel (bottom ~102 < panel top 118),
  // clear of the heli zone (right edge 536 < heli bbox left ~580)
  // and of the clock (x 596-647). The round-18 centred box (x
  // 360-920) overlapped the heli bbox by ~7,800 px^2.
  // Round 20: the WHOLE cover left stack drops 72 px (CONFIG.round20
  // coverStack) — the round-19 dialogue box (top 36) covered the
  // legacy OBJECTIVE block (bottom 99): the "OBJECTIVE" title was half
  // cut and the "1/2 · ..." line fully hidden. Dialogue top 108
  // clears it; mission/radio/respect shift by the same 72 px, so no
  // new overlap appears and respect still ends above the minimap.
  // Cover-only inline styles — hud.js defaults and every other shot
  // are untouched.
  // Round 22: the round-22 cover overrides merge over the round-19
  // dialogue box (narrower: 520 -> 440 px, right edge 536 -> 456,
  // clear of the fin line at x ~509-530 and the left tier edges)
  // and the round-20 left stack (empty in round 22 — the narrowed
  // box keeps its 2-line / 73 px height, so the stack is untouched).
  // The round-19/20 values stay the fallback, so a copy that lost
  // the round-22 block still stages the round-20 left stack.
  {
    const dlgCfg = { ...(CONFIG.round19?.coverDialogue || {}), ...(CONFIG.round22?.coverDialogue || {}) };
    const stackCfg = { ...(CONFIG.round20?.coverStack || {}), ...(CONFIG.round22?.coverStack || {}) };
    const dlg = document.getElementById('hud-dialogue');
    if (dlg && typeof dlgCfg.left === 'number' && typeof dlgCfg.width === 'number') {
      dlg.style.left = `${dlgCfg.left}px`;
      dlg.style.top = `${stackCfg.dialogueTop ?? dlgCfg.top ?? 112}px`;
      dlg.style.transform = 'none';
      dlg.style.width = `${dlgCfg.width}px`;
    }
    const setTop = (id, top) => {
      const el = document.getElementById(id);
      if (el && typeof top === 'number') el.style.top = `${top}px`;
    };
    setTop('hud-mission-panel', stackCfg.missionTop);
    setTop('hud-radio', stackCfg.radioTop);
    setTop('hud-respect', stackCfg.respectTop);
  }
  shotRadio = { station: 'SOLMAR FM 101.5', song: 'Golden Hour — The Palms' };
  setShotDialogue('DANTE', 'Wheelman', 'Four stars and a chopper on you, Rico — Marina can wait, lose them first!');
  saveProgress(missions.getCurrentMissionNumber());
}

// 2-combat.jpg — Round 14: the SECOND job turns into a shootout.
// Mission 2 "Hot Wheels" (the sheet's chapter 2 — the cover used to
// claim it while the sunset claimed mission 1), four stars, Rico
// AIMING his pistol (aim pose + a pistol mesh in his right hand +
// a frozen muzzle flash + tracer onto the nearest officer), the six
// officers BROKEN into TWO clusters at 7-11 m (was a neat 10-12.5 m
// line of dolls) with one officer DOWN prone in the open gap between
// them, one officer square-on AIMING (nearest, jitter 0 — the muzzle
// + crosshair target), the rest varying their facing, one staged
// interceptor in the frame (the panel's "10-12 m PURSUIT" is now
// true), three peds on the west sidewalk clear of the officer line.
// Fixed camera moved to the south side so Rico reads 3/4, ~120 px
// tall. Round 15: 18:05 (was 18:13) — the sheet's clock rises.
function stageCombat() {
  state = 'playing';
  showOnly(null);
  input.attach(canvas);
  applyGoldenHour();
  timeOfDay = 18.09; // Round 15: 18:05 — the sheet's clock rises 17:48 → 18:05 → 18:20 → 18:36.
  money = 2450;
  player.teleport(200, 200, -Math.PI / 2); // facing west, into the city
  camYaw = player.heading + Math.PI;
  // Round 17: mission 1 is DONE (the sheet's chapter 2) — the SMG
  // is Mama Lou's reward for it, so Rico unlocks it here and carries
  // it into the shootout: full mag 30 + reserve 60, equipped. The
  // pistol stays owned but holstered; the wheel's slot 3 now reads
  // a real gun, not a LOCKED placeholder.
  combat.unlockWeapon('smg');
  combat.selectWeapon('smg');
  combat.addArmour(50);
  police.maxPoliceCars = 1;
  police.maxOfficers = 6;
  // Round 14: one interceptor in the frame, staged BEFORE the spawn
  // loop — policeCars already holds the capped 1 car, so the loop's
  // spawn tick cannot field a second (orphan) chasing car. It never
  // moves (staged) and never rams (SHOT_MODE damage is off); its light
  // bar flashes via the update loop. The police panel's UNIT 1 reads
  // it as the INTERCEPTOR (first car at 3+ stars).
  const pc = makeCar({ position: { x: 197, y: 0, z: 188 }, heading: 0, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
  pc.kind = 'police-car';
  pc.siren = true;
  pc.speed = 0;
  pc.staged = true;
  police.policeCars = [pc];
  // Triangle budget: the Harbour view ran 155,452 tris in run 2
  // (cap 150,000) — the six officers are required, so thin the
  // ambient fleet instead. These caps are instance props read by the
  // traffic spawn loop, and staging runs before the first update, so
  // the settle only ever spawns up to these numbers.
  traffic.maxCars = 10;
  traffic.maxPedestrians = 8;
  // Job 1 is done (the sheet's chapter 2): mark it before the mission
  // starts so the respect / garage panels read 1/8 from the first frame.
  missions.completed.add(1);
  missions.startMission(2, world, systems());
  settleShot(24);
  // Round 14: wanted 4 BEFORE the spawn loop — mission 2's startWanted
  // is 2, and the spawn tick fields only desiredUnits() officers, so
  // looping at wanted 2 fields just 2 officers (the 13B grab spiked
  // wanted to 4 before its loop, which is why 13B got all six).
  // Re-pin after the settle too (the speeding rule fires once).
  police.setWanted(4);
  // Officers spawn on the police 0.75 s spawn cooldown — the 24-step
  // settle is only 0.4 s of game time, so no officer exists yet at
  // this point. Run more steps until all six are fielded (cap 90
  // steps = 1.5 s game), then place them at once; the loop exits on
  // the spawn tick, so they have no time to close in first, and
  // placeOfficersArc zeroes their arrest timers.
  for (let i = 0; i < 90 && police.getOfficers().length < 6; i++) update(1 / 60);
  // Round 15: TWO clusters, not a line — the right cluster (officers 0,
  // 1, 5) ADVANCES at 7-9 m on the near side, the left cluster
  // (officers 3, 4) holds at 8.5-10 m on the far side, and officer 2
  // is DOWN (fallen — the sync lays it flat and hides its marker)
  // PRONE in the open gap between them, clear of the HUD panels.
  // Officer 0 is the AIM officer: nearest (7.4 m in 2D — its lateral
  // is -2.5, not -4.5, so it is genuinely closest), jitter 0
  // (square-on to Rico — the frozen muzzle flash + crosshair target),
  // pistol arm forward by construction. The others vary their facing
  // (jitter ±0.3 rad) so no two read as the same doll. Officer 4
  // pulled in to (10 m, +3): at (11, +3.5) it sat at screen x ~171,
  // isolated behind the radio panel instead of in the left cluster.
  placeOfficersArc([7, 7.5, 9, 8.5, 10, 9], [-2.5, -4.5, 0, 2, 3, -1], 2, [0, -0.3, 0, 0.3, -0.25, 0.2]);
  // Round 16: a warm light pool on the asphalt under the FALLEN
  // officer (officer 2, prone in the gap between the clusters).
  // Baseline: his dark uniform on dark asphalt measured body-vs-ring
  // contrast 20.2 — he was barely distinguishable from the road. The
  // pool (the same radial glow texture as the heli's ground pool, flat
  // on the road, 1 draw call, 2 tris — staging-only; combat is the
  // tightest budget shot) lifts the asphalt around him so the dark
  // prone silhouette reads. The fallen officer is staged (never
  // moves), so the static pool stays under him through the capture.
  {
    const fallen = police.getOfficers().find((o) => o.fallen);
    const poolCfg = CONFIG.round16?.fallenPool || {};
    if (fallen) {
      const poolW = typeof poolCfg.width === 'number' ? poolCfg.width : 4;
      const poolL = typeof poolCfg.length === 'number' ? poolCfg.length : 8;
      const poolOpacity = typeof poolCfg.opacity === 'number' ? poolCfg.opacity : 0.65;
      const fallenPool = new THREE.Mesh(
        new THREE.PlaneGeometry(poolW, poolL),
        new THREE.MeshBasicMaterial({ map: makeGlowTexture('rgba(255,255,255,0.95)'), transparent: true, depthWrite: false, opacity: poolOpacity, color: 0xffe9a8 }),
      );
      fallenPool.rotation.x = -Math.PI / 2;
      fallenPool.position.set(fallen.position.x, 0.06, fallen.position.z);
      scene.add(fallenPool);
    }
  }
  // Rico AIMING: the aim pose (player.js setAim) + an SMG in his
  // right hand — the mission-1 reward, not the pistol. The SMG is a
  // long dark gun (0.09 x 0.14 x 0.62, longer than the pistol's 0.42
  // — the combat probe's pistol-mesh count gates on depth 0.42, so
  // the SMG never inflates the officers' pistol count) with a
  // magazine hanging below the receiver, 3 draw calls, ~36 tris.
  player.setAim(true);
  // Round 19 (stretch): the SMG reads BRIGHT now (CONFIG.round19.smg
  // — pale steel, was near-black 0x1a1a1a, probe mean 28.8) so the gun
  // in Rico's hands stops being a dark blob against the dark street.
  const smgCfg = CONFIG.round19?.smg || {};
  const smgMat = new THREE.MeshStandardMaterial({ color: smgCfg.color ?? 0x9aa0a8, roughness: smgCfg.roughness ?? 0.35, metalness: smgCfg.metalness ?? 0.7, emissive: smgCfg.emissive ?? 0x1a1a1a, emissiveIntensity: smgCfg.emissiveIntensity ?? 0.35 });
  const smg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.62), smgMat);
  smg.position.set(0, -0.36, 0.10);
  player.foreR.add(smg);
  const smgMag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.12), smgMat);
  smgMag.position.set(0, -0.5, 0.22);
  player.foreR.add(smgMag);
  player._aimSmg = smg;
  player._aimPistol = null;
  // The frozen muzzle flash: muzzle = Rico's gun tip (forward 0.95 m,
  // chest height), target = the nearest officer's chest. The update
  // loop re-asserts these three singletons every frame (combatFlash),
  // and the crosshair pins to the same officer (combatAimOfficer).
  const officers = police.getOfficers();
  combatAimOfficer = officers[0] || null;
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  combatFlash = {
    muzzle: { x: player.position.x + fx * 0.95, y: 1.3, z: player.position.z + fz * 0.95 },
    target: combatAimOfficer
      ? { x: combatAimOfficer.position.x, y: 1.35, z: combatAimOfficer.position.z }
      : { x: player.position.x + fx * 7, y: 1.35, z: player.position.z + fz * 7 },
  };
  // Round 15: the civilians stand on the WEST sidewalk clear of the
  // officer clusters — two paused bystanders up-street (z 190 / 200,
  // screen ~(640,359) / (427,414), clear of every HUD panel) and one
  // fleeing south from z 192. Round 14 parked them inside the officer
  // line (z 194 / 206) and at the frame edges, so none read as a
  // pedestrian. Grid-verified via round15-grid.mjs (combat camera).
  placePeds([
    { roadX: 200, side: -1, z: 190, heading: Math.PI / 2 },
    { roadX: 200, side: -1, z: 200, heading: Math.PI / 2 },
    { roadX: 200, side: -1, z: 186, heading: Math.PI / 2 },
  ]);
  // The third ped FLEES south, away from Rico (unpause it after
  // placePeds froze it with the other two).
  for (const ped of traffic.getPedestrians()) {
    if (Math.abs(ped.position.x - 191.5) < 1 && Math.abs(ped.position.z - 186) < 1) {
      ped.paused = false;
      ped.pauseTimer = 0;
      ped.heading = Math.PI;
    }
  }
  // Fixed camera, south side: Rico 3/4 from the front-right, ~9 m out
  // (~120 px tall), officers beyond him, the interceptor in the
  // background. (Tune via the projection probe if the frame drifts.)
  shotCam = { mode: 'fixed', pos: [201, 2.8, 209], look: [196, 1.3, 199] };
  shotRadio = { station: 'SOLMAR FM 101.5', song: 'Night Drive — The Palms' };
  setShotDialogue('DANTE', 'Wheelman', 'Four stars and counting — drop them, Rico!');
  saveProgress(missions.getCurrentMissionNumber());
}

// Round 15: stageRoadblock — the TRUE roadblock: two staged police
// cars, crosswise across the road ahead (in the picture), one in the
// left lane, one in the right, at different depths so the gap between
// them is the hole the player will punch through. They are
// policeCars[0..1] so the panel's UNIT 1 / UNIT 2 honestly read
// ROADBLOCK. Repositioned every frame by the update loop (see the
// pursuit block there) — zero new geometry: they ARE two of the four
// units the wanted-5 count already fields. Named for the outline.
function stageRoadblock() {
  const rb1 = makeCar({ position: { x: -116.5, y: 0, z: 136 }, heading: Math.PI / 2, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
  const rb2 = makeCar({ position: { x: -123.5, y: 0, z: 142 }, heading: -Math.PI / 2, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
  for (const rb of [rb1, rb2]) {
    rb.kind = 'police-car';
    rb.siren = true;
    rb.speed = 0;
    rb.staged = true;
  }
  return [rb1, rb2];
}

// 3-pursuit.jpg — Round 15: GOLDEN HOUR, mission 3 "Borrowed Beauty"
// (the sheet's chapter 3), FIVE stars (was three — the arc rises
// 4 → 4 → 5 → 5), the coupe big in the frame, the interceptors offset
// laterally and holding FARTHER back (26 / 32 m, was 12 / 22), a TRUE
// ROADBLOCK pair CLOSE ahead (16 / 22 m, was 30 / 36 — crosswise,
// left lane + right lane, gap to punch through; stageRoadblock —
// zero new geometry: they ARE two of the four units the wanted-5
// count already fields), two race rivals alongside (the street-race
// chip is live), peds TRACKED on both sidewalks. VEHICLE STOLEN
// banner kept. 18:20 (was 17:48) — the sheet's clock rises.
function stagePursuit() {
  state = 'playing';
  showOnly(null);
  input.attach(canvas);
  applyGoldenHour();
  timeOfDay = 18.34; // Round 15: 18:20 — the sheet's clock rises 17:48 → 18:05 → 18:20 → 18:36.
  money = 3200;
  const car = makeCar({ position: { x: -120, y: 0, z: 120 }, heading: Math.PI, model: 'Palm Coupe', colour: 0xf5f0e6, driver: 'player' });
  car.speed = 24;
  // Round 17: the hero trim on the player's stolen coupe too — the
  // coupe is the hero car of this shot (the interceptors and rivals
  // stay plain; the shared models are never touched).
  attachHeroDetail(car);
  player.teleport(-120, 120, Math.PI);
  player.enterCar(car);
  camYaw = car.heading + Math.PI;
  shotCam = { mode: 'front', side: -6, ahead: 10.5, height: 5 };
  shotHoldSpeed = 24;
  police.maxPoliceCars = 4;
  police.maxOfficers = 0;
  police.addWanted(5); // Round 15: five stars — the arc rises 4 → 4 → 5 → 5.
  stagePursuitCars(-120, 146, 152, Math.PI);
  // Round 15: the chasing interceptors hold FARTHER back (26 / 32 m
  // beyond the car, was 12 / 22) so the roadblock owns the mid-frame
  // and the four units stop bunching into one cluster on screen.
  police.policeCars[0].position.x = -124;
  police.policeCars[1].position.x = -116;
  // Round 15: the roadblock (stageRoadblock) — two staged police cars
  // crosswise in the road ahead, left lane + right lane at different
  // depths. They are policeCars[0..1] so the panel's UNIT 1 / UNIT 2
  // honestly read ROADBLOCK, and the wanted-5 count (4 cars) is
  // exactly the four units fielded.
  shotRoadblock = stageRoadblock();
  // Round 19: light pools under the roadblock (police.js
  // attachRoadblockLightPools) — headlight cones + red/blue wash on
  // the asphalt, the round-16 fallen-officer trick. Pursuit-only.
  for (const rb of shotRoadblock) attachRoadblockLightPools(rb);
  police.policeCars = [shotRoadblock[0], shotRoadblock[1], ...police.policeCars];
  // Round 14: two race rivals alongside the coupe (sports orange +
  // sedan blue), repositioned every frame by the update loop. They
  // feed the live race chip (POS / total) in the mission panel.
  const r1 = makeCar({ position: { x: -124.5, y: 0, z: 117 }, heading: Math.PI, model: 'Solmar Sports', colour: 0xe67e22, driver: 'ai' });
  const r2 = makeCar({ position: { x: -115.5, y: 0, z: 122 }, heading: Math.PI, model: 'Solmar Sedan', colour: 0x2e86c1, driver: 'ai' });
  shotRivals = [r1, r2];
  // Jobs 1-2 are done (the sheet's chapter 3).
  missions.completed.add(1);
  missions.completed.add(2);
  // Round 17 (re-touch): mission 1 is already done in chapter 3, so
  // Rico ALREADY owns the SMG (Mama Lou's mission-1 reward) — unlock
  // it here so the pursuit wheel honestly reads SMG 30 / 60 instead of
  // SMG LOCKED. The shotgun stays LOCKED in this shot (mission-3
  // reward, only owned after mission 3 finishes).
  combat.unlockWeapon('smg');
  missions.startMission(3, world, systems());
  settleShot(24);
  police.setWanted(5); // re-pin after the settle (speeding rule fires once)
  // Round 15: peds staged RELATIVE to the car as it stands after the
  // settle and TRACKED from here (trackStagedPeds) — 8 / 14 m beyond
  // the car on the east sidewalk, 11 m on the west, so they hold
  // ~55-65 px tall in the frame at capture instead of drifting
  // up-frame as dots.
  const pursuitCarZ = player.position.z;
  trackStagedPeds(placePeds([
    { roadX: -120, side: 1, z: pursuitCarZ + 8, heading: -Math.PI / 2 },
    { roadX: -120, side: 1, z: pursuitCarZ + 14, heading: -Math.PI / 2 },
    { roadX: -120, side: -1, z: pursuitCarZ + 11, heading: Math.PI / 2 },
  ]));
  shotRadio = { station: 'SOLMAR FM 101.5', song: 'Golden Hour — The Palms' };
  setShotDialogue('RICO VEGA', 'Wheelman', 'VEHICLE STOLEN — Palm Coupe, pearl white');
  saveProgress(missions.getCurrentMissionNumber());
}

// 4-sunset.jpg — Round 15: the pre-heist briefing, mission 5
// "Harbour Heist" (the sheet's chapter 5), $4,500, FIVE stars (was
// one — the finale is the five-star climax) with TWO staged patrol
// cars in the frame (a mid-ground unit + the far patrol), crosshair
// hidden (a story moment, not combat), the Marina Bridge vista kept,
// the flat brown wall dressed with two neon signs (world.js), THREE
// civilians on the west sidewalk (Dante + two), camera moved CLOSER
// + LOWER so Rico + the teal coupe + the patrols fill the frame.
// NEXT reads "Escape the five-star chase" (mission 5 is a five-star
// job now — see missions.js).
function stageSunset() {
  state = 'playing';
  showOnly(null);
  input.attach(canvas);
  applyGoldenHour();
  timeOfDay = 18.6;
  money = 4500;
  player.teleport(196, -138, 1.26); // facing ESE, toward Dante
  camYaw = player.heading + Math.PI;
  // Round 15: TWO patrol cars (was one) — the finale is the five-star
  // climax, so the street holds a mid-ground unit as well as the far
  // patrol. maxPoliceCars = 2 caps the spawn loop at these two cars
  // (desiredUnits at wanted 5 is 6, but the cap wins), so no chasing
  // car can arrive and bust the briefing. Both are staged (never
  // move, never ram; SHOT_MODE damage is off).
  police.maxPoliceCars = 2;
  police.maxOfficers = 0;
  const patrol = makeCar({ position: { x: 206, y: 0, z: -165 }, heading: 0, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
  patrol.kind = 'police-car';
  patrol.siren = true;
  patrol.speed = 0;
  patrol.staged = true;
  const patrol2 = makeCar({ position: { x: 194, y: 0, z: -156 }, heading: 0, model: 'Solmar Police Interceptor', colour: '#1a1a2e', driver: 'police' });
  patrol2.kind = 'police-car';
  patrol2.siren = true;
  patrol2.speed = 0;
  patrol2.staged = true;
  police.policeCars = [patrol, patrol2];
  police.addWanted(5); // Round 15: five stars — the arc rises 4 → 4 → 5 → 5.
  // Round-13B (Lane B): coupe moved to (200,-142) (was 204,-134) —
  // the closer camera pushes a coupe at -134 out of the right edge,
  // and at (204,-142) its centre lands at screen (1087, 382), hidden
  // behind the VEHICLE panel (x 980-1265, y 360-490). At (200,-142)
  // it projects to (882, 379): right of Rico, clear of the panel.
  const car = createCar(scene, 'coupe', 0x2e86c1, 200, -142, 0);
  spawnedCars.add(car);
  // Round 17: the hero trim on the player's parked teal coupe (the
  // hero car of this shot), and the arsenal by chapter 5 — missions
  // 1–4 are done, so the SMG (mission-1 reward) and the shotgun
  // (mission-3 reward) are both owned; Rico stands on foot with
  // fists, so the panel reads FISTS READY while the wheel shows
  // SHOTGUN 6 / 12 in slot 4. The save written below therefore
  // carries both guns, and a fresh load restores them.
  // Round 18: missions 1–4 are done, so the RIFLE (mission-4 reward)
  // is owned too — and Rico CARRIES it here, low-ready in his right
  // hand: the long gun runs FORWARD from the hand (the combat SMG's
  // pattern — receiver + barrel + wooden stock + magazine, ~1 m
  // along the forearm's forward axis), NOT vertical along the arm:
  // a vertical carry hangs behind the torso from the sunset camera
  // and reads as his jacket, not a gun. Low-ready, the barrel clears
  // his silhouette over the road. The panel reads WEAPON — RIFLE
  // 24 / 48, the wheel's slot 5 reads RIFLE 24 / 48, slot 4 still
  // SHOTGUN 6 / 12.
  attachHeroDetail(car);
  combat.unlockWeapon('smg');
  combat.unlockWeapon('shotgun');
  combat.unlockWeapon('rifle');
  combat.selectWeapon('rifle');
  {
    // Round 19: the rifle reads BRIGHT now (CONFIG.round19.rifle) —
    // pale steel barrel + tan wooden stock with a warm edge glow, so
    // it cannot be missed against the dark road and Rico's dark
    // torso (round 18: dark metal on dark asphalt — lineBrightFrac
    // 0.0, brightPx 0, bgDelta -39.5). Longer barrel + stock and a
    // raised (more horizontal) low-ready carry, so the tip-to-stock
    // span clears 60 px (round 18: 40 px). Still 4 named rifle-*
    // meshes, still parented to the right forearm, still low-ready.
    const rc = CONFIG.round19?.rifle || {};
    // Round 19: MeshBasicMaterial (UNLIT) — a standard material with
    // high metalness and no environment map renders black here.
    const rifleMat = new THREE.MeshBasicMaterial({ color: rc.barrelColor ?? 0xdde2e8 });
    const receiverMat = new THREE.MeshBasicMaterial({ color: rc.receiverColor ?? 0xb9bec6 });
    const stockMat = new THREE.MeshBasicMaterial({ color: rc.stockColor ?? 0xe0aa6a });
    const magMat = new THREE.MeshBasicMaterial({ color: rc.magColor ?? 0x8a8f96 });
    const rifle = new THREE.Group();
    rifle.name = 'rifle-carry';
    const barrelLen = rc.barrelLength ?? 0.7;
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), receiverMat);
    receiver.name = 'rifle-receiver';
    receiver.position.set(0, -0.36, 0.1);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, barrelLen), rifleMat);
    barrel.name = 'rifle-barrel';
    barrel.position.set(0, -0.33, rc.barrelZ ?? 0.7);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, rc.stockLength ?? 0.3), stockMat);
    stock.name = 'rifle-stock';
    stock.position.set(0, -0.36, rc.stockZ ?? -0.3);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), magMat);
    mag.name = 'rifle-magazine';
    mag.position.set(0, -0.48, 0.15);
    rifle.add(receiver, barrel, stock, mag);
    rifle.rotation.x = rc.tiltX ?? -0.4; // raise the barrel toward horizontal, across the body
    player.foreR.add(rifle);
    player._aimRifle = rifle;
    player._aimSmg = null;
    player._aimPistol = null;
  }
  // Round 15: camera CLOSER + LOWER (was 10 m from Rico, y 2.3) — Rico
  // + the teal coupe + the two patrol cars fill the frame instead of
  // half of it being empty asphalt. Probe-verified: Rico ~130 px,
  // Dante + coupe + both patrols + both neon signs + the bridge deck
  // all stay on screen (see round15-probe).
  shotCam = { mode: 'fixed', pos: [198.3, 1.9, -130.5], look: [196.0, 1.4, -138.3] };
  // Jobs 1-4 are done (the sheet's chapter 5).
  missions.completed.add(1);
  missions.completed.add(2);
  missions.completed.add(3);
  missions.completed.add(4);
  missions.startMission(5, world, systems());
  settleShot(24);
  police.setWanted(5); // re-pin after the settle
  placePeds([
    // Dante on the WEST sidewalk, facing Rico — the east spot put him
    // behind the parked coupe and out of the frame. Round-13B: z -138
    // (was -134) — with the closer 10 m camera, -134 projects to
    // screen (232, 420), dead-centre behind the RADIO + RESPECT panels
    // (x 15-345); -138 projects to (427, 386), clear of every panel,
    // beside Rico with the coupe to his right.
    { roadX: 200, side: -1, z: -138, heading: Math.PI / 2 },
    // Round 15: TWO more civilians on the same west sidewalk (z -143
    // / -148, up-street from Dante) — the left foreground stops being
    // empty asphalt + a flat brown wall. All three project clear of
    // the left HUD panels (probe-verified).
    { roadX: 200, side: -1, z: -143, heading: Math.PI / 2 },
    { roadX: 200, side: -1, z: -148, heading: -Math.PI / 2 },
  ]);
  shotRadio = { station: 'SOLMAR FM 101.5', song: 'Golden Hour — The Palms' };
  // Round 16: the dialogue box moves RIGHT + NARROWS for this shot
  // only — the centred 560 px box covered 7,458 px^2 of the MARINA
  // neon sign (its left half: the sign spans screen x 290-473, the
  // box x 360-920). The shifted box (left 485, width 420, from
  // CONFIG.round16.sunsetDialogue) clears the sign's right edge (473)
  // and the police panel's left edge (980); the PIER 12 sign and the
  // bridge deck sit below the box's bottom. Text content is untouched
  // (the convergence + dialogue gates read textContent, not layout),
  // and hud.renderDialogue never resets the box position, so the
  // override holds through the capture. Other shots keep the centred
  // box — this override runs only in stageSunset.
  {
    const dlgCfg = CONFIG.round16?.sunsetDialogue || {};
    const dlg = document.getElementById('hud-dialogue');
    if (dlg && typeof dlgCfg.left === 'number' && typeof dlgCfg.width === 'number') {
      dlg.style.left = `${dlgCfg.left}px`;
      dlg.style.transform = 'none';
      dlg.style.width = `${dlgCfg.width}px`;
    }
  }
  setShotDialogue('MAMA LOU', 'Boss', 'Golden hour over the Bay, Rico. Make it count.');
  saveProgress(missions.getCurrentMissionNumber());
}

// ---- boot ------------------------------------------------------------------

if (SHOT === 'start') stageStart();
else if (SHOT === 'play') stagePlay();
else if (SHOT === 'end') stageEnd();
else if (SHOT === 'cover-chase') stageCoverChase();
else if (SHOT === 'combat') stageCombat();
else if (SHOT === 'pursuit') stagePursuit();
else if (SHOT === 'sunset') stageSunset();
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
  // Round-11 probes (Lane A, camera occlusion): the LIVE camera state,
  // read off the scene — named round11Camera because __solmar.round11
  // is Lane B's fill-light probe and a second `round11` getter would
  // silently shadow it. cameraInside re-tests the CURRENT camera
  // position against every building box (must be false in every shot);
  // the focus* fields are the solved viewpoint for the active L look
  // (azimuth / rise / distance / whether a clear candidate was found /
  // how many candidates were tried / blend 0..1); focusLosBlocked
  // re-tests the CURRENT camera -> landmark-focus segment once the
  // blend has settled (null mid-blend). settledView is the flight
  // recorder: the last look that settled, snapshotted the moment it
  // settled and kept after the window closes — the durable evidence
  // under headless timing, where the live blend can decay before a
  // polling read ever lands on it.
  get round11Camera() {
    const occ = world.round11Occlusion || null;
    const cp = camera.position;
    const fp = focusViewPoint;
    const settled = focusView && focusViewBlend >= 0.95;
    return {
      config: (CONFIG.round11 && CONFIG.round11.camera) || null,
      camera: { x: +cp.x.toFixed(1), y: +cp.y.toFixed(1), z: +cp.z.toFixed(1) },
      cameraInside: occ ? !!occ.containsPoint(cp.x, cp.y, cp.z, 1.5) : null,
      focusName: round11Last.focusName,
      focusAzimuthDeg: round11Last.focusAzimuthDeg,
      focusRise: round11Last.focusRise,
      focusDist: round11Last.focusDist,
      focusClear: round11Last.focusClear,
      focusTried: round11Last.focusTried,
      focusBlend: round11Last.focusBlend,
      focusPoint: round11Last.focusPoint,
      cameraRescued: round11Last.cameraRescued,
      settledView: round11Settled,
      focusLosBlocked: (settled && occ && fp)
        ? !!occ.segmentBlocked(cp.x, cp.y, cp.z, fp.x, fp.y, fp.z, { x: fp.x, z: fp.z })
        : null,
      landmarks: landmarkList.map((lm) => ({ name: lm.name, x: lm.x, z: lm.z, focusY: lm.focusY })),
      buildingCount: occ ? occ.buildingCount : null,
    };
  },
  // Round-11 probes (Lane B, fill light): the LIVE light values, read
  // off the scene — not config claims. hemiIntensity / bounce
  // intensity + colour + direction prove the pass is actually wired
  // (a config block alone would not), and sunIntensity is reported
  // alongside so a reviewer can see the sun was NOT touched to buy
  // the lift. world.round11Fill echoes the config values (world.round11
  // itself is Lane C's road totals — the fill probe is deliberately
  // named round11Fill so neither lane's key shadows the other).
  get round11() {
    const cfg = (CONFIG.round11 && CONFIG.round11.fill) || {};
    const fill = scene.children.find((o) => o.isDirectionalLight && o.castShadow === false
      && Math.abs(o.position.x - (cfg.bounceOffset?.[0] ?? -165)) < 1
      && Math.abs(o.position.z - (cfg.bounceOffset?.[2] ?? -85)) < 1) || null;
    return {
      fill: world.round11Fill || null,
      hemiIntensity: +hemiLight.intensity.toFixed(3),
      hemiSky: '#' + hemiLight.color.getHexString(),
      hemiGround: '#' + hemiLight.groundColor.getHexString(),
      bounce: fill ? {
        intensity: +fill.intensity.toFixed(3),
        color: '#' + fill.color.getHexString(),
        position: [Math.round(fill.position.x), Math.round(fill.position.y), Math.round(fill.position.z)],
        castShadow: fill.castShadow,
      } : null,
      sunIntensity: +sunLight.intensity.toFixed(3),
      sunColor: '#' + sunLight.color.getHexString(),
      sunShadowIntensity: (sunLight.shadow && typeof sunLight.shadow.intensity === 'number')
        ? +sunLight.shadow.intensity.toFixed(3) : null,
      exposure: renderer.toneMappingExposure,
    };
  },
  // Round-11 final (debug-profiler diagnostics): the live renderer
  // counts for the fixed-scenario profile — draw calls, triangles,
  // geometries and textures, read off renderer.info, not estimated.
  // The consolidated harness snapshots these at the same scenario on
  // the round-10 and round-11 builds and gates on no regression.
  get rendererInfo() {
    const info = renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      points: info.render.points,
      lines: info.render.lines,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  },
  // Round-11 final: the consolidated verification summary in one
  // probe — fill (live lights), camera (solver state), traffic
  // (fleet composition) and renderer counts — so the harness and a
  // reviewer can confirm all three lanes are live without reading
  // three separate probes.
  get round11Final() {
    return {
      fill: (CONFIG.round11 && CONFIG.round11.fill) || null,
      traffic: (CONFIG.round11 && CONFIG.round11.traffic) || null,
      camera: (CONFIG.round11 && CONFIG.round11.camera) || null,
      renderer: this.rendererInfo,
    };
  },
  // Round-13 (Lane 3): the staged-shot probe — what the capture script
  // asserts per shot (wanted level, police presence, mission, heli,
  // dialogue) plus the live renderer counts for the perf budget.
  get round13() {
    return {
      shot: SHOT || null,
      state,
      dialogue: shotDialogue ? shotDialogue.text : null,
      cameraMode: shotCam ? shotCam.mode : null,
      heli: shotHeli ? {
        present: true, source: 'shot-fallback',
        x: +shotHeli.group.position.x.toFixed(1),
        y: +shotHeli.group.position.y.toFixed(1),
        z: +shotHeli.group.position.z.toFixed(1),
        scale: shotHeli.scale || 1,
      } : (world.helicopter || police.helicopter ? { present: true, source: 'lane2' } : null),
      wanted: police.getWantedLevel(),
      policeCars: police.getPoliceCars().length,
      officers: police.getOfficers().length,
      mission: missions.getCurrentMission() ? missions.getCurrentMission().name : null,
      objective: missions.getCurrentObjectiveText(),
      peds: traffic.getPedestrians().length,
      trafficCars: traffic.getCars().length,
      weapon: typeof combat.getWeaponDef === 'function' ? combat.getWeaponDef().name : null,
      renderer: this.rendererInfo,
      // Round 14: the new HUD state + combat staging facts, so the
      // test can gate on them without scraping panel text.
      timeOfDay: +timeOfDay.toFixed(1),
      garage: garageState(),
      race: raceState(),
      saveInfo: save.getSaveInfo(),
      fallenOfficers: police.getOfficers().filter((o) => o.fallen).length,
      ricoPistol: Boolean(player._aimPistol),
      // Round 17: Rico holds the SMG in the combat shot (mission 1
      // done — the SMG is his reward), and the probe carries the
      // whole arsenal so the harness can gate on owned slots.
      ricoSmg: Boolean(player._aimSmg),
      // Round 18: Rico carries the rifle in the sunset shot (mission
      // 4 done — the rifle is his reward), and the probe carries the
      // cover shopfront placement for the same reason.
      ricoRifle: Boolean(player._aimRifle),
      ricoGun: player._aimRifle ? 'Rifle' : (player._aimSmg ? 'SMG' : (player._aimPistol ? 'Pistol' : null)),
      weapons: typeof combat.getWeaponsState === 'function' ? combat.getWeaponsState() : null,
      muzzleVisible: muzzle.visible,
      roadblock: shotRoadblock ? shotRoadblock.length : 0,
      // Round 15: the roadblock cars' world positions, so the test can
      // gate on the block itself (crosswise, split lanes, ahead of the
      // player) instead of trusting the panel text alone.
      roadblockCars: shotRoadblock ? shotRoadblock.map((c) => ({ x: +c.position.x.toFixed(1), z: +c.position.z.toFixed(1) })) : [],
      rivals: shotRivals ? shotRivals.length : 0,
    };
  },
  // Round 18 probe: the rifle + cover shopfront, read straight off
  // the live scene (runtime facts, not config claims). cover is null
  // on every shot but the cover chase; rifleMesh lists the world
  // positions of the named rifle-* meshes in the sunset shot.
  get round18() {
    let rifleMeshes = [];
    if (player._aimRifle) {
      scene.updateMatrixWorld(true);
      player._aimRifle.traverse((o) => {
        if (!o.isMesh) return;
        const e = o.matrixWorld.elements;
        rifleMeshes.push({ name: o.name || null, x: +e[12].toFixed(2), y: +e[13].toFixed(2), z: +e[14].toFixed(2) });
      });
    }
    return {
      rifleUnlockMission: CONFIG.round18?.weapons?.rifleUnlockMission ?? null,
      rifleDef: CONFIG.round18?.rifle || null,
      ricoRifle: Boolean(player._aimRifle),
      rifleMeshes,
      coverShopfront: coverShopfront || null,
    };
  },
  // Round 20 probe: the cover stack shift + staged cover traffic +
  // staged cover peds, read straight off the live scene (runtime
  // facts, not config claims). coverTraffic is empty on every shot
  // but the cover chase; stagedPeds is the tracked-ped list (cover +
  // pursuit) with world positions + shirt colours.
  get round20() {
    return {
      coverStack: CONFIG.round20?.coverStack || null,
      coverTraffic: shotTraffic.map((st) => ({
        key: st.key, x: +st.car.position.x.toFixed(1), z: +st.car.position.z.toFixed(1),
        heading: +(st.heading || 0).toFixed(2),
      })),
      stagedPeds: shotPeds.map((tp) => ({
        x: +tp.ped.position.x.toFixed(1), z: +tp.ped.position.z.toFixed(1), shirt: tp.ped.shirt,
      })),
    };
  },
  // Round 21 probe: the Art Deco block + east-tower shopfront +
  // cover-light tuning, read straight off the live scene (runtime
  // facts, not config claims). coverDeco / coverEast are null on
  // every shot but the cover chase; coverLight is the tuning record
  // for the sun-soaked cover pass in stageCoverChase.
  get round21() {
    return {
      coverLight: CONFIG.round21?.coverLight || null,
      coverDeco: coverDeco || null,
      coverEast: coverEast || null,
    };
  },
  // Round 22 probe: the same staging facts as round21 above, under
  // the round-22 key (the round-22 probe/test read s.round22, and
  // the values are the round-22 overrides merged in stageCoverDeco /
  // stageCoverEast — tier widths, fin position, east pane width —
  // not the round-21 config claims).
  get round22() {
    return {
      coverLight: CONFIG.round21?.coverLight || null,
      coverDeco: coverDeco || null,
      coverEast: coverEast || null,
    };
  },
  // Round 23 probe: the re-frame facts (coverCam + coverSpawn) so
  // the test can verify the staging actually moved south and the
  // lookAt actually lengthened, not just that the config exists.
  get round23() {
    return {
      coverCam: CONFIG.round23?.coverCam || null,
      coverSpawn: CONFIG.round23?.coverSpawn || null,
      coverDeco: coverDeco || null,
      coverEast: coverEast || null,
    };
  },
  // Round 14: project a world point to normalised screen coordinates
  // through the live camera (see projectToScreen above). Called by
  // the probe script as a separate evaluate — the round13 getter
  // above must stay plain data (Playwright cannot serialise a
  // function in its return value).
  project(x, y, z) { return projectToScreen(x, y, z); },
  // Round-11 (final): harness camera-yaw probe. On foot the chase
  // camera yaw only moves by mouse look (or the direct sets after a
  // teleport/load/enterCar) — teleporting the player by writing
  // position/heading leaves camYaw stale, so harness screenshots
  // after a teleport framed the spawn direction instead of the
  // subject (official run1: bus/pickup/facades shots). The harness
  // sets the yaw explicitly after each teleport; nothing in the
  // game itself calls this, so gameplay is untouched.
  setCamYaw(yaw) { camYaw = yaw; },
  // Round-11 final (re-touch): the harness sets the yaw after every teleport a screenshot depends on, and the landmark shots re-arm L then shoot immediately — the 4 s focus window is shorter than a rAF wait plus capture latency under SwiftShader (diag6).
  // Round-12 final: re-touch — north-focus anomaly investigated (see round12 report); camera solve unchanged, art round.
};
