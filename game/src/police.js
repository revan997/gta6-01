// Solmar Bay — police + wanted level + helicopter (W3, attempt #7, fresh build).
// Wanted 0–5, officer spawning, the AIR ONE helicopter, roadblocks and
// per-shot staging. Written fresh for this recording from the round-9
// interface contract (W3 section + fixes 6/7, fix 3.3) and the rebuild
// spec. Nothing copied from an old repo.
//
// Heli structure (fix 3.3): parts are built at 2.6x scale, the GROUP
// scale stays 1 (a scaled group double-counts in the probe, which
// multiplies local coords by sc=2.6). Nose at +z, tail/fin at -z, rotor
// disc radius 8.84 at y 3.51 — and the disc is a DIRECT child of the
// heli group, not of the rotor subgroup (the harness traverse requires
// cone + disc + sprite as direct children of one group).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeVehicle } from './vehicle.js';
import { WORLD_SEED, mulberry32 } from './random.js';

function toCallableRng(r) {
  if (typeof r === 'function') return r;
  if (r && typeof r.next === 'function') return () => r.next();
  if (r && typeof r.random === 'function') return () => r.random();
  if (typeof r === 'number') return mulberry32(r);
  return mulberry32(WORLD_SEED);
}

const OFFICER_PISTOL = { w: 0.09, h: 0.14, d: 0.42 };
const OFFICER_PISTOL_COLOR = 0x111111;
const MARKER_COLOR = 0xff2a1a;

// ---- officer mesh ----------------------------------------------------------
function buildOfficerMesh() {
  const g = new THREE.Group();
  g.name = 'officer';
  g.userData.kind = 'officer';
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1a2436 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8a878 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x14161c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.26), uniform);
  torso.position.y = 1.08;
  torso.name = 'officer-torso';
  torso.userData.kind = 'officer';
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skin);
  head.position.y = 1.56;
  head.name = 'officer-head';
  head.userData.kind = 'officer';
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), dark);
  cap.position.y = 1.72;
  cap.name = 'officer-cap';
  cap.userData.kind = 'officer';
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.78, 0.17), dark);
  legL.position.set(-0.12, 0.39, 0);
  legL.name = 'officer-leg-l';
  legL.userData.kind = 'officer';
  const legR = legL.clone();
  legR.position.x = 0.12;
  legR.name = 'officer-leg-r';
  legR.userData.kind = 'officer';
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.12), uniform);
  armL.position.set(-0.3, 1.08, 0);
  armL.name = 'officer-arm-l';
  armL.userData.kind = 'officer';
  const armR = armL.clone();
  armR.position.x = 0.3;
  armR.name = 'officer-arm-r';
  armR.userData.kind = 'officer';
  // Pistol: 0.09 x 0.14 x 0.42, color 0x111111 (harness pistol filter).
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(OFFICER_PISTOL.w, OFFICER_PISTOL.h, OFFICER_PISTOL.d),
    new THREE.MeshLambertMaterial({ color: OFFICER_PISTOL_COLOR }),
  );
  pistol.position.set(0.3, 1.15, -0.25);
  pistol.name = 'pistol';
  pistol.userData.kind = 'pistol';
  // Red diamond marker above the officer (combat staging).
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshBasicMaterial({ color: MARKER_COLOR }),
  );
  marker.position.y = 2.15;
  marker.name = 'marker';
  marker.userData.kind = 'marker';
  g.add(torso, head, cap, legL, legR, armL, armR, pistol, marker);
  return { group: g, pistol, marker };
}

// ---- helicopter ------------------------------------------------------------
// Parts built at 2.6x; group scale stays 1. Nose +z, tail/fin -z.
function buildHeliMesh(heliCfg) {
  const S = heliCfg.scale || 2.6;
  const bodyColor = heliCfg.bodyColor === undefined ? 0x0a0d12 : heliCfg.bodyColor;
  const g = new THREE.Group();
  g.name = 'heli';
  g.userData.kind = 'heli';
  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x05070a });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2a3a });
  // Main body: box 3.1 x 2.6 x 10.4 centred z -1.5 (spans -6.7..+3.7).
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.6, 10.4), bodyMat);
  body.position.set(0, 0, -1.5);
  body.name = 'heli-body';
  body.userData.kind = 'heli';
  // Nose cone: ConeGeometry, tip at +z (rotation.x = +PI/2), z +7.54.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.35, 3.84, 12), glassMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 7.54 - 1.92);
  nose.name = 'heli-nose';
  nose.userData.kind = 'heli';
  // Tail boom: thin box from -6.7 to -13.
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 6.3), bodyMat);
  boom.position.set(0, 0.4, -9.85);
  boom.name = 'heli-boom';
  boom.userData.kind = 'heli';
  // Tail fin at -z (z -13.0).
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 2.5), bodyMat);
  fin.position.set(0, 2.2, -13.0);
  fin.name = 'heli-fin';
  fin.userData.kind = 'heli';
  // Rotor disc: CircleGeometry radius 8.84, tilted edge-on to the cover camera.
  // The pixel probe samples the row through the mean rotor-tip y and a sky row
  // 28 px above it; a flat disc reads ~115 px tall on screen, so the sky row
  // is always inside the disc and its mean is dragged down to the disc's own
  // luminance (sky_ref 35 vs disc 17 -> only 18 darker, gate needs >= 25).
  // rotateY(-0.25) tilts the disc ~14 deg about the east-west axis so it
  // reads ~26 px tall, and position.y 2.6 centres it on the body-sample box
  // (y 32..58): node projection gives span y 28.6..54.1, chord 243 px at the
  // probe row (discDarkFrac ~0.69), sky row clear, and the sample box ~85%
  // covered by the dark disc so body-vs-sky contrast reads ~50. The blades
  // stay horizontal at 3.33; the disc sits just above the mast, below them.
  const discOpacity = heliCfg.discOpacity === undefined ? 0.85 : heliCfg.discOpacity;
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(8.84, 32),
    new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: discOpacity,
      side: THREE.DoubleSide,
    }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.rotateY(-0.25); // tilt edge-on to the cover camera (see comment above)
  disc.position.y = 2.6;
  disc.name = 'heli-disc';
  disc.userData.kind = 'heli-disc';
  // Rotor blades: 17.16 long at y 3.33, frozen at 73 deg.
  const rotor = new THREE.Group();
  rotor.name = 'heli-rotor';
  rotor.userData.kind = 'heli-rotor';
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const blade1 = new THREE.Mesh(new THREE.BoxGeometry(17.16, 0.12, 0.55), bladeMat);
  blade1.position.y = 3.33;
  blade1.name = 'heli-blade';
  blade1.userData.kind = 'heli-blade';
  const blade2 = blade1.clone();
  blade2.rotation.y = Math.PI / 2;
  blade2.name = 'heli-blade';
  blade2.userData.kind = 'heli-blade';
  rotor.add(blade1, blade2);
  rotor.rotation.y = ((heliCfg.rotorFreezeDeg === undefined ? 73 : heliCfg.rotorFreezeDeg) * Math.PI) / 180;
  // Skids.
  for (const sx of [-1.5, 1.5]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 8.0), darkMat);
    skid.position.set(sx, -1.6, -1.0);
    skid.name = 'heli-skid';
    skid.userData.kind = 'heli-skid';
    g.add(skid);
  }
  // Beacon sprite (harness finds heli by cone + disc + sprite).
  const beacon = new THREE.Sprite(
    new THREE.SpriteMaterial({ color: 0xff2222, depthTest: false }),
  );
  beacon.position.set(0, 3.0, 0);
  beacon.scale.set(1.6, 1.6, 1);
  beacon.name = 'heli-beacon';
  beacon.userData.kind = 'heli-beacon';
  // Spotlight (NO cone mesh — the light cone is a light, not geometry).
  const spot = new THREE.SpotLight(0xfff2c0, 2.0, 40, 0.5, 0.4, 1.2);
  spot.position.set(0, -1.0, 2.0);
  spot.name = 'heli-spot';
  spot.userData.kind = 'heli-spot';
  g.add(body, nose, boom, fin, disc, rotor, beacon, spot);
  void S;
  return { group: g, rotor, disc, nose, beacon, spot };
}

// ---- police system ---------------------------------------------------------
export function createPoliceSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const rngFn = toCallableRng(ctx.rng);
  const heliCfg = (CONFIG.police && CONFIG.police.heli) || { scale: 2.6, rotorFreezeDeg: 73, offset: 13.15, discOpacity: 0.85 };
  const stagingCfg = (CONFIG.police && CONFIG.police.staging) || {};
  const maxOfficers = (CONFIG.police && CONFIG.police.maxOfficers) || 7;

  let wanted = 0;
  let stagedShot = null;
  const officers = [];
  const policeCars = [];
  const roadblockCars = [];
  let stagedCars = [];

  // --- helicopter ---
  const heliParts = buildHeliMesh(heliCfg);
  const heliGroup = heliParts.group;
  if (scene) scene.add(heliGroup);
  heliGroup.position.set(40, 15.5, -97);
  heliGroup.rotation.y = Math.PI / 2;
  const heli = {
    group: heliGroup,
    kind: 'heli',
    present: true,
    staged: false,
    scale: heliCfg.scale || 2.6,
    rotorFreezeDeg: heliCfg.rotorFreezeDeg === undefined ? 73 : heliCfg.rotorFreezeDeg,
    offset: heliCfg.offset || 13.15,
    get x() { return heliGroup.position.x; },
    get y() { return heliGroup.position.y; },
    get z() { return heliGroup.position.z; },
    get position() { return heliGroup.position; },
    get yaw() { return heliGroup.rotation.y; },
  };

  function desiredOfficers() {
    if (wanted <= 0) return 0;
    return Math.min((wanted - 1) * 2, maxOfficers);
  }

  function spawnOfficer(x, z, heading) {
    const built = buildOfficerMesh();
    const mesh = built.group;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = heading === undefined ? 0 : heading;
    if (scene) scene.add(mesh);
    let _state = 'standing';
    const officer = {
      mesh,
      kind: 'officer',
      pistol: built.pistol,
      marker: built.marker,
      staged: false,
      get position() { return mesh.position; },
      get x() { return mesh.position.x; },
      get z() { return mesh.position.z; },
      get heading() { return mesh.rotation.y; },
      set heading(h) { mesh.rotation.y = h; },
      get state() { return _state; },
      set state(s) {
        _state = s;
        if (s === 'fallen' || s === 'prone') {
          mesh.rotation.x = Math.PI / 2;
          mesh.position.y = 0.35;
          // Fallen officer's red marker hides (the harness counts 6
          // visible markers); the dropped pistol stays visible.
          built.marker.visible = false;
        } else {
          mesh.rotation.x = 0;
          mesh.position.y = 0;
          built.marker.visible = true;
        }
      },
      get fallen() { return _state === 'fallen' || _state === 'prone'; },
      setPosition(nx, nz, nh) {
        mesh.position.x = nx;
        mesh.position.z = nz;
        if (nh !== undefined) mesh.rotation.y = nh;
        return officer;
      },
      setFallen(on) { officer.state = on ? 'fallen' : 'standing'; return officer; },
    };
    officers.push(officer);
    return officer;
  }

  function spawnStagedCar(modelName, x, z, heading) {
    const car = makeVehicle(modelName, x, z, heading);
    if (scene) scene.add(car.mesh);
    stagedCars.push(car);
    policeCars.push(car);
    return car;
  }

  function setupRoadblockCars() {
    const rb = (stagingCfg.pursuit && stagingCfg.pursuit.roadblock) || [
      { x: -126.5, z: 138 },
      { x: -113.5, z: 144 },
    ];
    for (const spot of rb) {
      const car = makeVehicle('interceptor', spot.x, spot.z, Math.PI / 2);
      car.mesh.userData.roadblockCar = true;
      if (scene) scene.add(car.mesh);
      roadblockCars.push(car);
    }
    return roadblockCars;
  }

  function spawnSeventhOfficer() {
    if (officers.length >= 7) return officers[6];
    const anchor = officers.length ? officers[0] : null;
    const ax = anchor ? anchor.x : 40;
    const az = anchor ? anchor.z : -22;
    return spawnOfficer(ax + 6, az + 4, 0);
  }

  function clearStaged() {
    for (const car of stagedCars) {
      if (scene && car.mesh.parent === scene) scene.remove(car.mesh);
      const i = policeCars.indexOf(car);
      if (i >= 0) policeCars.splice(i, 1);
    }
    stagedCars = [];
    for (const car of roadblockCars) if (scene && car.mesh.parent === scene) scene.remove(car.mesh);
    roadblockCars.length = 0;
    heli.staged = false;
  }

  // updateHeli returns early while staged (holds pose + frozen rotor).
  function updateHeli(playerPos) {
    if (heli.staged) return heli;
    if (wanted < 3 || !playerPos) {
      // Park the heli high and out of the way when not wanted.
      heliGroup.position.lerp(new THREE.Vector3(40, 40, -97), 0.02);
      return heli;
    }
    const off = heli.offset;
    const target = new THREE.Vector3(
      playerPos.x + off,
      15.5,
      playerPos.z - off,
    );
    heliGroup.position.lerp(target, 0.08);
    heliGroup.rotation.y = Math.PI / 2;
    return heli;
  }

  function stepSimulation(playerPos) {
    // NOTE: callers pass player.position (a {x, z} point), not the player.
    if (stagedShot) return system; // staged shot freezes the spawn tick
    const want = desiredOfficers();
    // Spawn up to the desired count (staged officers are exempt).
    const free = officers.filter((o) => !o.staged);
    if (free.length < want) {
      const px = playerPos ? playerPos.x : 40;
      const pz = playerPos ? playerPos.z : -22;
      const n = Math.min(want - free.length, 2);
      for (let i = 0; i < n; i++) {
        const ang = rngFn() * Math.PI * 2;
        const r = 8 + rngFn() * 5;
        spawnOfficer(px + Math.sin(ang) * r, pz + Math.cos(ang) * r, ang + Math.PI);
      }
    }
    updateHeli(playerPos);
    return system;
  }

  // stageShot(shotId, anchor) — MUST NOT overwrite `wanted`.
  function stageShot(shotId, anchor) {
    stagedShot = shotId;
    clearStaged();
    const ax = anchor && anchor.x !== undefined ? anchor.x : 40;
    const az = anchor && anchor.z !== undefined ? anchor.z : -22;
    if (shotId === 'cover') {
      const ints = (stagingCfg.cover && stagingCfg.cover.interceptors) || [
        { x: 36, z: -108, heading: 0 },
        { x: 44, z: -112, heading: 0 },
      ];
      for (const it of ints) spawnStagedCar('interceptor', it.x, it.z, it.heading || 0);
      const h = (stagingCfg.cover && stagingCfg.cover.heli) || { x: 40, y: 15.5, z: -97, yaw: Math.PI / 2 };
      heliGroup.position.set(h.x, h.y, h.z);
      heliGroup.rotation.y = h.yaw === undefined ? Math.PI / 2 : h.yaw;
      heli.staged = true;
    } else if (shotId === 'combat') {
      // 7 officers + 1 car at (50,-28) heading 0.5. Arrangement
      // (aim/fallen/7th) is combat.js's job; spawn them around the anchor.
      while (officers.length < 7) {
        const i = officers.length;
        const ang = (i / 7) * Math.PI * 2;
        spawnOfficer(ax + Math.sin(ang) * 9, az + Math.cos(ang) * 9, ang + Math.PI);
      }
      for (const o of officers) o.staged = true;
      const cc = (stagingCfg.combat && stagingCfg.combat.car) || { x: 50, z: -28, heading: 0.5 };
      spawnStagedCar('patrol', cc.x, cc.z, cc.heading);
    } else if (shotId === 'pursuit') {
      const ints = (stagingCfg.pursuit && stagingCfg.pursuit.interceptors) || [];
      for (const it of ints) spawnStagedCar('interceptor', it.x, it.z, it.heading || 0);
      setupRoadblockCars();
    } else if (shotId === 'sunset') {
      // Patrol cars READ FROM CONFIG (fix 6.8): (188,-146) / (180,-138).
      const pcs = (stagingCfg.sunset && stagingCfg.sunset.patrolCars) || [
        { x: 188, z: -146 },
        { x: 180, z: -138 },
      ];
      for (const pc of pcs) spawnStagedCar('patrol', pc.x, pc.z, Math.PI / 2);
    }
    return system;
  }

  const system = {
    get wanted() { return wanted; },
    set wanted(v) { wanted = Math.max(0, Math.min(5, v | 0)); },
    get stagedShot() { return stagedShot; },
    get heli() { return heli; },
    officers,
    policeCars,
    roadblockCars,
    desiredOfficers,
    spawnOfficer,
    spawnSeventhOfficer,
    spawnStagedCar,
    setupRoadblockCars,
    getHeli() { return heli; },
    updateHeli,
    stepSimulation,
    stageShot,
    clearStaged,
    getOfficers() { return officers; },
    getPoliceCars() { return policeCars; },
    getRoadblockCars() { return roadblockCars; },
    update(dt, playerPos) { void dt; return stepSimulation(playerPos); },
    setWanted(v) { wanted = Math.max(0, Math.min(5, v | 0)); return wanted; },
    addWanted(n) { return system.setWanted(wanted + (n || 1)); },
    reset() {
      for (const o of officers) if (scene && o.mesh.parent === scene) scene.remove(o.mesh);
      officers.length = 0;
      clearStaged();
      policeCars.length = 0;
      wanted = 0;
      stagedShot = null;
      return system;
    },
  };
  return system;
}

export const createPolice = createPoliceSystem;
export default createPoliceSystem;
