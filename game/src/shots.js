// shots.js — staged shot definitions for Solmar Bay (attempt #9, W4).
// Every shot is a deterministic staged moment: fixed positions, fixed camera,
// fixed time of day, zero random draws. The harness captures each shot at its
// pinned moment and saves it as a JPEG under screenshots/.
//
// The four shots:
//   1-cover-chase  the coastal car chase (the hero image)
//   2-combat       Rico aiming, police, one fallen officer
//   3-pursuit      the stolen Palm Coupe, interceptors, a roadblock
//   4-sunset       Rico on foot at the harbour, MARINA sign, golden hour

// ---------------------------------------------------------------- ids

export const SHOT_IDS = ['cover-chase', 'combat', 'pursuit', 'sunset'];

export const SHOT_ALIASES = {
  cover: 'cover-chase',
  'cover-chase': 'cover-chase',
  '1-cover-chase': 'cover-chase',
  combat: 'combat',
  '2-combat': 'combat',
  pursuit: 'pursuit',
  '3-pursuit': 'pursuit',
  sunset: 'sunset',
  '4-sunset': 'sunset',
};

export function normalizeShotId(id) {
  if (typeof id !== 'string') return null;
  const key = id.trim().toLowerCase();
  return SHOT_ALIASES[key] || null;
}

// ---------------------------------------------------------------- per-shot tuning

// Money the staged save carries per shot (live state AND staged save).
export const SHOT_MONEY = {
  'cover-chase': 1200,
  combat: 2450,
  pursuit: 3200,
  sunset: 4500,
};

// Jobs done per shot (live state AND staged save).
export const SHOT_JOBS_DONE = {
  'cover-chase': 0,
  combat: 1,
  pursuit: 2,
  sunset: 4,
};

// Completed missions per shot (1-based numbers, live state AND staged save).
export const SHOT_MISSIONS_DONE = {
  'cover-chase': [],
  combat: [1],
  pursuit: [1, 2],
  sunset: [1, 2, 3, 4],
};

// Mission number each shot stages (missions.getShotContext agrees).
export const SHOT_MISSION = {
  'cover-chase': 1,
  combat: 2,
  pursuit: 3,
  sunset: 4,
};

// Time of day per shot (hours). Sunset carries a clock-string epsilon so the
// formatted clock never rounds down a minute from float error.
export const SHOT_TIME = {
  'cover-chase': 17.8,
  combat: 18 + 5 / 60,
  pursuit: 18 + 20 / 60,
  sunset: 18.6,
};

// Wanted level per shot.
export const SHOT_WANTED = {
  'cover-chase': 4,
  combat: 4,
  pursuit: 5,
  sunset: 5,
};

// Staged cameras. The cover camera is the fix-#2 pose: lookAt y -7 (pitch
// down ~1.7 deg from attempt #9's -4) lifts the water band into the
// downscale window (rows 170-215) and puts the heli centre (101) + bottom
// (130) inside their gates; the heli's 12-deg bank (police.js) keeps all
// four rotor tips on screen. The sunset camera moved south (199, 2.0,
// -129) so the teal coupe at (200,-142), both patrol cars and all four
// MARINA sign corners are in frame; the pursuit camera sits at z 110
// (z 102 put the coupe at 101 px and the roadblock gap at 21 px).
export const SHOT_CAMERAS = {
  'cover-chase': {
    position: [39, 4.5, -58],
    lookAt: [41, -7, -140],
    fov: 62,
  },
  combat: {
    position: [36.5, 2.0, -13.5],
    lookAt: [40, 1.0, -22],
    fov: 62,
  },
  pursuit: {
    position: [-120, 4.5, 110],
    lookAt: [-120, 1.2, 134],
    fov: 62,
  },
  sunset: {
    position: [199, 2.0, -129],
    lookAt: [191, 1.5, -140],
    fov: 62,
  },
};

// Dialogue needles. The staged line per shot MUST contain the needle — cover
// and pursuit both stage mission 2's neighbourhood, so the needle is set PER
// SHOT here, never per mission.
export const FALLBACK_DIALOGUE = {
  'cover-chase': {
    speaker: 'Dante',
    text: 'Four stars and a chopper — keep the GT moving, Rico.',
  },
  combat: {
    speaker: 'Dante',
    text: 'Four stars and counting — hold the line, Rico.',
  },
  pursuit: {
    speaker: 'Mama Lou',
    text: 'VEHICLE STOLEN — the Palm Coupe is ours now, drive!',
  },
  sunset: {
    speaker: 'Dante',
    text: 'Golden hour over the Bay — one last job before the heist.',
  },
};

// The banner text per shot (rendered by the HUD, exactly once in the body).
export const SHOT_BANNER = {
  'cover-chase': '',
  combat: '',
  pursuit: 'STOLEN VEHICLE',
  sunset: '',
};

// ---------------------------------------------------------------- car helpers

// Put a car at (x, z) with a logical heading, then fix its mesh rotation.
// The model faces -z while staged cars move on the +z convention, so the mesh
// rotation is heading + PI. The +PI must NEVER leak into car.heading: the
// heading is stored logically by setPosition and read back untouched.
export function syncCarMesh(car) {
  if (!car) return;
  const mesh = car.mesh || car.group || car.object3D || null;
  if (!mesh) return;
  const x = typeof car.x === 'number' ? car.x : (car.position ? car.position.x : null);
  const z = typeof car.z === 'number' ? car.z : (car.position ? car.position.z : null);
  if (typeof x === 'number') mesh.position.x = x;
  if (typeof z === 'number') mesh.position.z = z;
  const heading = typeof car.heading === 'number' ? car.heading : 0;
  mesh.rotation.y = heading + Math.PI;
}

// Place a car: the ONLY way to move a staged car is car.setPosition — never
// write mesh.position directly, or the logical heading and the mesh drift.
export function placeCar(car, x, z, heading) {
  if (!car) return null;
  if (typeof car.setPosition === 'function') {
    car.setPosition(x, z, heading);
  } else {
    car.x = x;
    car.z = z;
    car.heading = heading;
    if (car.position && typeof car.position === 'object') {
      car.position.x = x;
      car.position.z = z;
    }
  }
  syncCarMesh(car);
  return car;
}

// Make a car through the vehicle module, trying the named factory first and
// the generic factory second. Never throws for a missing named factory.
export function makeCar(game, kind, x, z, heading) {
  const mods = game.vehicleModule || {};
  const system = game.vehicleSystem || null;
  const factories = [
    kind === 'gt' ? mods.createGT : null,
    kind === 'gt' ? mods.createHeroCar : null,
    kind === 'gt' ? mods.createSolmarGT : null,
    kind === 'palmCoupe' ? mods.createPalmCoupe : null,
    kind === 'tealCoupe' ? mods.createTealCoupe : null,
    kind === 'interceptor' ? mods.createInterceptor : null,
    kind === 'patrol' ? mods.createPatrolCar : null,
  ].filter(Boolean);
  for (const factory of factories) {
    try {
      const car = factory(x, z, heading);
      if (car) return placeCar(car, x, z, heading);
    } catch (err) {
      // Fall through to the generic factory.
    }
  }
  if (typeof mods.createVehicle === 'function') {
    try {
      const car = mods.createVehicle(kind, x, z, heading);
      if (car) return placeCar(car, x, z, heading);
    } catch (err) {
      // Fall through to the system factory.
    }
  }
  if (system && typeof system.makeVehicle === 'function') {
    const car = system.makeVehicle(kind, x, z, heading);
    if (car) return placeCar(car, x, z, heading);
  }
  if (typeof mods.makeVehicle === 'function') {
    const car = mods.makeVehicle(kind, x, z, heading);
    if (car) return placeCar(car, x, z, heading);
  }
  return null;
}

// Add a car's mesh to the scene when the factory did not do it itself.
export function ensureCarInScene(game, car) {
  if (!car || !game.scene) return;
  const mesh = car.mesh || car.group || car.object3D || null;
  if (mesh && !mesh.parent) game.scene.add(mesh);
}

// ---------------------------------------------------------------- staging

// Stage one shot on the game context. `game` is main.js's context object:
// { scene, world, player, police, traffic, combat, missions, vehicleSystem,
//   vehicleModule, config, rng, state, race }. This function only stages
// actors and state; main.js owns the camera and the HUD.
export function stageShot(game, shotId) {
  const id = normalizeShotId(shotId);
  if (!id) throw new Error(`stageShot: unknown shot id ${String(shotId)}`);
  const state = game.state;
  state.shotId = id;
  state.timeOfDay = SHOT_TIME[id];
  state.wanted = SHOT_WANTED[id];
  state.money = SHOT_MONEY[id];
  state.jobsDone = SHOT_JOBS_DONE[id];
  state.completedMissions = SHOT_MISSIONS_DONE[id].slice();
  state.mission = SHOT_MISSION[id];
  state.dialogue = FALLBACK_DIALOGUE[id];
  state.banner = SHOT_BANNER[id];
  state.race = id === 'pursuit' ? { total: 3, position: 1 } : { total: 3, position: 0 };

  // Keep the missions module in step with the staged state.
  if (game.missions) {
    if (typeof game.missions.setCompletedMissions === 'function') {
      game.missions.setCompletedMissions(state.completedMissions.slice());
    }
    if (typeof game.missions.setJobsDone === 'function') {
      game.missions.setJobsDone(state.jobsDone);
    }
    if (typeof game.missions.startMission === 'function') {
      try {
        game.missions.startMission(state.mission);
      } catch (err) {
        // Staging must not die on a mission-module disagreement.
      }
    }
  }

  // Pin two paused pedestrians per shot (the traffic module owns the pins).
  if (game.traffic && typeof game.traffic.stageShot === 'function') {
    game.traffic.stageShot(id);
  }

  if (id === 'cover-chase') {
    stageCover(game);
  } else if (id === 'combat') {
    stageCombat(game);
  } else if (id === 'pursuit') {
    stagePursuit(game);
  } else if (id === 'sunset') {
    stageSunset(game);
  }
  return id;
}

function stageCover(game) {
  // The red Solmar GT starts at the proven round-12 spot, x 40, z -95, and
  // drives south; the harness pins the capture at car z >= -67.
  const gt = makeCar(game, 'gt', 40, -95, 0);
  ensureCarInScene(game, gt);
  game.gt = gt;
  game.coverDriveZ = -95; // Reset by staging; the loop tracks it (see main.js).
  if (game.player && typeof game.player.enterCar === 'function' && gt) {
    game.player.enterCar(gt);
  }
  if (game.police && typeof game.police.stageShot === 'function') {
    game.police.stageShot('cover', { x: 40, z: -95 });
  }
}

function stageCombat(game) {
  // Rico is pre-positioned at his FINAL spot BEFORE the officers are
  // arranged, so the aim officer is 7.4 m away — not 28.5 m.
  const player = game.player;
  if (player && typeof player.setPosition === 'function') {
    player.setPosition(40, -22, Math.PI / 2);
  } else if (player && player.position) {
    player.position.x = 40;
    player.position.z = -22;
    player.heading = Math.PI / 2;
  }
  // TWO independent ifs, not else-if: BOTH the officers AND the patrol car
  // must stage. Police FIRST: combat.stageShot arranges the officers and
  // arrangeCombatOfficers early-returns when fewer than 7 exist — staging
  // combat first left the officers unarranged AND officer 0 exactly on
  // Rico's pre-position (minOfficer 0, converge failed). arrangeCombatOfficers
  // already marks officer 3 fallen in the gap (and un-fallens the rest), so
  // no extra setFallen call here — a second one made TWO fallen officers.
  if (game.police && typeof game.police.stageShot === 'function') {
    game.police.stageShot('combat', { x: 40, z: -22 });
  }
  if (game.combat && typeof game.combat.stageShot === 'function') {
    game.combat.stageShot('combat', player);
  }
}

function stagePursuit(game) {
  // The orange Palm Coupe is being stolen at x -120, z 120, facing north.
  const coupe = makeCar(game, 'palmCoupe', -120, 122, Math.PI);
  ensureCarInScene(game, coupe);
  game.palmCoupe = coupe;
  if (game.player && typeof game.player.enterCar === 'function' && coupe) {
    game.player.enterCar(coupe);
  }
  if (game.police && typeof game.police.stageShot === 'function') {
    game.police.stageShot('pursuit', { x: -120, z: 120 });
  }
}

function stageSunset(game) {
  // Rico on foot at the harbour, centre-frame. The teal coupe parks at the
  // right of the shot; the two patrol cars come from police.stageShot.
  const player = game.player;
  if (player && typeof player.setPosition === 'function') {
    player.setPosition(194.3, -137.7, 0.5);
  } else if (player && player.position) {
    player.position.x = 194.3;
    player.position.z = -137.7;
    player.heading = 0.5;
  }
  // The teal coupe parks at the harness's fixed sunset point (200,-142)
  // so the camera (199,2.0,-129) sees it in frame (was 210,-134: behind
  // the old camera, invisible).
  const teal = makeCar(game, 'tealCoupe', 200, -142, 0.3);
  ensureCarInScene(game, teal);
  game.tealCoupe = teal;
  if (game.police && typeof game.police.stageShot === 'function') {
    game.police.stageShot('sunset', { x: 194.3, z: -137.7 });
  }
}

// The camera pose for a shot (position + lookAt + fov). main.js applies it.
export function shotCamera(shotId) {
  const id = normalizeShotId(shotId) || 'cover-chase';
  const cam = SHOT_CAMERAS[id];
  return {
    position: cam.position.slice(),
    lookAt: cam.lookAt.slice(),
    fov: cam.fov,
  };
}
