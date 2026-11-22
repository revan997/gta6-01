// Staged screenshots for Solmar Bay — the four fixed moments the entry
// hands in. Each shot is deterministic: fixed positions, a fixed camera,
// a fixed time of day, zero random draws. The harness loads the game with
// ?shot=<id>&seed=1, waits for the dialogue needle plus the radio line,
// and captures the frame (the cover waits for the GT pin at z -67 first).
//
// Shot ids the harness uses: cover, combat, pursuit, sunset. The older
// 'cover-chase' spelling is accepted as an alias for 'cover' — the menu
// and the query parser both normalise it before anything stages.
import { createSolmarGT, createPalmCoupe, createTealCoupe, makeVehicle } from './vehicle.js';

export const SHOT_IDS = ['cover', 'combat', 'pursuit', 'sunset'];

// The staged line per shot. The harness converges when the needle below
// AND '101.5' are readable at the same poll, so the dialogue box must
// show exactly one of these lines and nothing else may repeat it.
// Pursuit: the needle lives in the dialogue ONLY — the centre banner
// says 'STOLEN VEHICLE' (a different string) so the needle stays 1x.
export const FALLBACK_DIALOGUE = {
  cover: { speaker: 'Dante', text: 'Four stars and a chopper — and the whole city is watching.' },
  combat: { speaker: 'Dante', text: 'Four stars and counting. Hold the line, Rico.' },
  pursuit: { speaker: 'Dispatch', text: 'VEHICLE STOLEN — all units, orange Palm Coupe heading north.' },
  sunset: { speaker: 'Mama Lou', text: 'Golden hour over the Bay. Tonight we take the harbour.' },
};

// Camera + mission per shot. The cover camera is the tuned pose: it puts
// the GT at ~115 px, the heli centre near x 567 on the downscale, and
// keeps the lagoon water spanning the horizon. The pursuit camera sits
// at z 110 so the coupe reads ~101 px with the roadblock gap at 21 px.
// The sunset lookAt x is 190 so all four MARINA corners stay on screen.
export const SHOT_DEFS = {
  cover: {
    mission: 1,
    missionName: 'First Run',
    wanted: 4,
    camera: { position: [43.5, 3.5, -56], lookAt: [46, -10, -140] },
    fov: 62,
  },
  combat: {
    mission: 2,
    missionName: 'Hot Wheels',
    wanted: 4,
    camera: { position: [36.5, 2.0, -13.5], lookAt: [40, 1.3, -22] },
    fov: 62,
  },
  pursuit: {
    mission: 3,
    missionName: 'Borrowed Beauty',
    wanted: 5,
    camera: { position: [-120, 7, 110], lookAt: [-120, 1.5, 128] },
    fov: 62,
  },
  sunset: {
    mission: 4,
    missionName: 'Harbour Heist',
    wanted: 5,
    camera: { position: [199.0, 2.3, -129.0], lookAt: [190, 2.5, -140] },
    fov: 62,
  },
};

// 'cover-chase' (the old query spelling) means the cover shot. Anything
// unknown falls back to the cover — the entry always has a hero frame.
export function normalizeShotId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  if (id === 'cover-chase' || id === 'coverchase' || id === 'cover_chase') return 'cover';
  if (SHOT_IDS.includes(id)) return id;
  return 'cover';
}

// The staged cars move on the +z convention but the model faces -z, so a
// staged car's mesh rotation is its logical heading plus pi. Staging-only:
// free-play driving syncs its own pose and never calls this.
export function syncCarMesh(car) {
  if (!car) return;
  const mesh = car.mesh || car.group || car.object || car.node || null;
  if (!mesh) return;
  const p = car.position || { x: car.x || 0, y: 0, z: car.z || 0 };
  if (mesh.position && typeof mesh.position.set === 'function') {
    mesh.position.set(p.x, p.y || 0, p.z);
  }
  const heading = typeof car.heading === 'number' ? car.heading : 0;
  mesh.rotation.y = heading + Math.PI;
}

// Put a car at (x, z) with a logical heading, however the car object
// stores its pose: a setPosition method, a position vector, or plain
// x/z fields. The mesh follows through syncCarMesh.
export function placeCar(car, x, z, heading) {
  if (!car) return;
  if (typeof car.setPosition === 'function') {
    car.setPosition(x, 0, z);
  } else if (car.position && typeof car.position.set === 'function') {
    car.position.set(x, car.position.y || 0, z);
  } else {
    if (car.position) { car.position.x = x; car.position.z = z; }
    if ('x' in car) car.x = x;
    if ('z' in car) car.z = z;
  }
  if (typeof car.setHeading === 'function') car.setHeading(heading);
  else car.heading = heading;
  syncCarMesh(car);
}

// Build a car through its named factory. The factory takes (x, z,
// heading) like makeVehicle; a zero-argument factory is tried next and
// the car is then placed explicitly, so either shape stages correctly.
function summonCar(factory, modelName, x, z, heading) {
  let car = null;
  try { car = factory(x, z, heading); } catch { car = null; }
  if (!car) {
    try { car = makeVehicle(modelName, x, z, heading); } catch { car = null; }
  }
  if (!car) {
    try { car = factory(); } catch { car = null; }
  }
  if (car) placeCar(car, x, z, heading);
  return car;
}

// Heli helpers: the heli object carries its pose on .position (a vector)
// or on plain x/y/z fields. Pull it down to y 15.5 when staging left it
// higher — above that it projects off the top of the cover frame.
function heliHeight(heli) {
  if (!heli) return null;
  if (heli.position && typeof heli.position.y === 'number') return heli.position.y;
  if (typeof heli.y === 'number') return heli.y;
  return null;
}

function setHeliHeight(heli, y) {
  if (!heli) return;
  if (heli.position && typeof heli.position.y === 'number') heli.position.y = y;
  else if (typeof heli.y === 'number') heli.y = y;
}

// Stage one shot. ctx carries the live systems main.js built:
// { player, police, combat, traffic, missions, game }.
// Returns { def, car } where car is the hero car the loop autopilots
// (the GT on cover, the Palm Coupe on pursuit, null on the foot shots).
//
// Order matters. Combat: the caller pre-positions Rico at his final
// spot BEFORE this runs, so combat.stageShot arranges the officers
// around where he actually stands (7.4 m aim), not 28 m away.
// Peds: traffic.stageShot pins two paused peds per shot — never a
// pinPeds call, which does not exist and silently does nothing.
// Combat block: TWO independent ifs, so both the officer arrangement
// AND the police patrol car run (an else-if starves one of them).
export function stageShot(shotId, ctx) {
  const id = normalizeShotId(shotId);
  const def = SHOT_DEFS[id];
  const { player, police, combat, traffic } = ctx;
  let car = null;

  if (id === 'cover') {
    police.stageShot('cover', { x: 40, z: -95 });
    // The staged interceptors sit one per lane, staggered in depth so
    // they read at least 150 px apart on the downscale.
    const interceptors = police.getPoliceCars();
    if (interceptors[0]) placeCar(interceptors[0], 30, -106, 0);
    if (interceptors[1]) placeCar(interceptors[1], 50, -114, 0);
    // The heli stages high; pull it down to y 15.5 so its centre stays
    // on screen with its top above y 10.
    const heli = police.getHeli();
    const height = heliHeight(heli);
    if (height !== null && height > 15.5) setHeliHeight(heli, 15.5);
    // The hero GT starts at (40, -95) and drives south at 22 m/s; the
    // loop autopilots it through the west bend to the pin at z -67.
    car = summonCar(createSolmarGT, 'gt', 40, -95, 0);
    if (car && player) player.enterCar(car);
    traffic.stageShot('cover');
  } else if (id === 'combat') {
    // Rico is already at his final spot (40, -22, heading pi/2) — the
    // officers arrange around him, aim officer at 7.4 m.
    police.stageShot('combat', { x: 40, z: -22 });
    combat.stageShot('combat', player);
    traffic.stageShot('combat');
  } else if (id === 'pursuit') {
    // The Palm Coupe faces north at (-120, 120); Rico steals it, so he
    // rides in it and the camera reads the theft from the south.
    car = summonCar(createPalmCoupe, 'palmCoupe', -120, 120, Math.PI);
    if (car && player) player.enterCar(car);
    police.stageShot('pursuit', { x: -120, z: 120 });
    traffic.stageShot('pursuit');
  } else if (id === 'sunset') {
    // Rico on foot at the harbour, centre-frame, facing the camera and
    // the MARINA sign. The teal coupe parks at his right.
    if (player) {
      if (typeof player.setPosition === 'function') player.setPosition(194.3, 0, -137.7);
      else if (player.position && typeof player.position.set === 'function') player.position.set(194.3, player.position.y || 0, -137.7);
      else if (player.position) { player.position.x = 194.3; player.position.z = -137.7; }
      try { player.heading = 0.5; } catch { /* heading is read-only here; the pose still stands */ }
    }
    summonCar(createTealCoupe, 'tealCoupe', 200, -142, 0);
    police.stageShot('sunset', { x: 194.3, z: -137.7 });
    traffic.stageShot('sunset');
  }

  return { def, car };
}
