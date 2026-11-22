import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeVehicle } from './vehicle.js';

// police.js — wanted level, officers, interceptors, and the AIR ONE heli.
// Heli: parts built at 2.6x, group scale 1 (the probe multiplies local
// coords by 2.6 — a scaled group would double-count it). Rotor disc is a
// DIRECT child of the heli group, tilted rotateY(-0.25), y 2.6, opacity 1.0.

function toCallableRng(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  if (rng && typeof rng.random === 'function') return () => rng.random();
  if (typeof rng === 'number') {
    let s = rng >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let s = 20261122;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HELI_CFG = (CONFIG && CONFIG.police && CONFIG.police.heli)
  || { scale: 2.6, rotorFreezeDeg: 73, offset: 13.15 };
const S = HELI_CFG.scale || 2.6;
const ROTOR_FREEZE = (HELI_CFG.rotorFreezeDeg || 73) * Math.PI / 180;
const HELI_OFFSET = HELI_CFG.offset || 13.15;

function buildOfficerMesh() {
  const g = new THREE.Group();
  g.name = 'officer';
  g.userData.kind = 'officer';
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1a2233 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), uniform);
  torso.position.y = 1.1;
  torso.name = 'officer:torso';
  torso.userData.kind = 'officer';
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skin);
  head.position.y = 1.56;
  head.name = 'officer:head';
  head.userData.kind = 'officer';
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), new THREE.MeshLambertMaterial({ color: 0x0e1420 }));
  cap.position.y = 1.74;
  cap.name = 'officer:cap';
  cap.userData.kind = 'officer';
  g.add(cap);
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.19), uniform);
    leg.position.set(sx * 0.12, 0.4, 0);
    leg.name = 'officer:leg';
    leg.userData.kind = 'officer';
    g.add(leg);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), uniform);
    arm.position.set(sx * 0.3, 1.05, 0);
    arm.name = 'officer:arm';
    arm.userData.kind = 'officer';
    g.add(arm);
  }
  // Pistol: 0.09 x 0.14 x 0.42, near-black. Rico's pistol uses DIFFERENT
  // geometry so it never matches the officer-pistol filter.
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  pistol.position.set(0.32, 1.05, 0.2);
  pistol.name = 'officer:pistol';
  pistol.userData.kind = 'pistol';
  g.add(pistol);
  // Red diamond marker above the head.
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.22),
    new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  );
  marker.position.y = 2.15;
  marker.name = 'officer:marker';
  marker.userData.kind = 'marker';
  g.add(marker);
  return { group: g, pistol, marker };
}

// AIR ONE. All parts built at 2.6x; the group itself is scale 1.
// Nose (+z) and tail/fin (-z) so the probe's fin point lands on screen.
export function buildHeliMesh() {
  const g = new THREE.Group();
  g.name = 'heli';
  g.userData.kind = 'heli';
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x0a0d12 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x11141a });
  // Main body.
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 9.0), bodyMat);
  body.position.set(0, 0, 0);
  body.name = 'heli:body';
  body.userData.kind = 'heli';
  g.add(body);
  // Glass nose cone at +z.
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(1.35, 5.0, 10),
    new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.2, 7.54);
  nose.name = 'heli:nose';
  nose.userData.kind = 'heli';
  g.add(nose);
  // Tail boom toward -z and the vertical fin at z -13.0.
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 6.5), bodyMat);
  boom.position.set(0, 0.4, -7.0);
  boom.name = 'heli:boom';
  boom.userData.kind = 'heli';
  g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 1.6), darkMat);
  fin.position.set(0, 1.2, -13.0);
  fin.name = 'heli:fin';
  fin.userData.kind = 'heli';
  g.add(fin);
  // Rotor mast.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8), darkMat);
  mast.position.set(0, 1.8, 0);
  mast.name = 'heli:mast';
  mast.userData.kind = 'heli';
  g.add(mast);
  // Rotor blur disc: DIRECT child of g, horizontal, tilted -0.25 rad.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(8.84, 40),
    new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 1.0, side: THREE.DoubleSide }),
  );
  disc.rotation.x = -Math.PI / 2;
  disc.rotateY(-0.25);
  disc.position.y = 2.6;
  disc.name = 'heli:disc';
  disc.userData.kind = 'heli';
  g.add(disc);
  // Rotor blades (cross pair), pure black, at y 3.33.
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  for (const angle of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(17.16, 0.12, 0.7), bladeMat);
    blade.position.y = 3.33;
    blade.rotation.y = angle + ROTOR_FREEZE;
    blade.name = 'heli:blade';
    blade.userData.kind = 'heli';
    g.add(blade);
  }
  // Skids.
  for (const sx of [-1, 1]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 6.0), darkMat);
    skid.position.set(sx * 1.3, -1.5, 0);
    skid.name = 'heli:skid';
    skid.userData.kind = 'heli';
    g.add(skid);
  }
  // Beacon sprite — the harness finds the heli by cone+disc+sprite together.
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff2a1a }));
  beacon.scale.set(1.6, 1.6, 1);
  beacon.position.set(0, 2.6, 0);
  beacon.name = 'heli:beacon';
  beacon.userData.kind = 'heli';
  g.add(beacon);
  // Spotlight, NO cone mesh (a cone mesh would occlude the frame).
  const spot = new THREE.SpotLight(0xfff2c0, 2.0, 60, 0.5, 0.4, 1.0);
  spot.position.set(0, -1.0, 0);
  spot.name = 'heli:spot';
  spot.userData.kind = 'heli';
  g.add(spot);
  return g;
}

export function createPoliceSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const rng = toCallableRng(ctx.rng);
  const world = ctx.world || null;

  const heliGroup = buildHeliMesh();
  heliGroup.position.set(40, 15.5, -97);
  heliGroup.rotation.y = Math.PI / 2;
  if (scene) scene.add(heliGroup);

  const state = {
    wanted: 0,
    officers: [],
    policeCars: [],
    roadblockCars: [],
    staged: false,
    stagedShot: null,
    spawnTick: 0,
    heliYaw: Math.PI / 2,
    rotorAngle: ROTOR_FREEZE,
  };

  function desiredOfficers() {
    return Math.min(7, Math.max(0, (state.wanted - 1) * 2));
  }

  function makeOfficer(x, z, heading, staged) {
    const { group, pistol, marker } = buildOfficerMesh();
    group.position.set(x, 0, z);
    group.rotation.y = heading + Math.PI;
    const officer = {
      id: state.officers.length,
      mesh: group,
      group,
      position: new THREE.Vector3(x, 0, z),
      heading,
      kind: 'officer',
      pistol,
      marker,
      staged: !!staged,
      _fallen: false,
      state: 'standing',
      get fallen() { return this._fallen; },
      setFallen(v) {
        this._fallen = !!v;
        this.state = v ? 'fallen' : 'standing';
        // A fallen officer's red marker is hidden (harness: 6 visible markers).
        marker.visible = !v;
        if (v) {
          group.rotation.x = -Math.PI / 2;
          group.position.y = 0.25;
          this.position.y = 0.25;
        } else {
          group.rotation.x = 0;
          group.position.y = 0;
          this.position.y = 0;
        }
      },
      setPosition(nx, nz, nh) {
        if (nh !== undefined && nh !== null) this.heading = nh;
        this.position.x = nx;
        this.position.z = nz;
        group.position.x = nx;
        group.position.z = nz;
        group.rotation.y = this.heading + Math.PI;
      },
    };
    if (scene) scene.add(group);
    return officer;
  }

  function spawnOfficerAt(x, z, heading, staged) {
    const officer = makeOfficer(x, z, heading, staged);
    state.officers.push(officer);
    return officer;
  }

  function syncOfficerCount() {
    const want = desiredOfficers();
    // Despawn non-staged extras (staged officers are exempt).
    while (state.officers.filter((o) => !o.staged).length > want) {
      const idx = state.officers.findIndex((o) => !o.staged);
      if (idx < 0) break;
      const [gone] = state.officers.splice(idx, 1);
      if (scene) scene.remove(gone.mesh);
    }
    // Spawn up to the desired count around the origin.
    while (state.officers.length < want) {
      const a = rng() * Math.PI * 2;
      const d = 12 + rng() * 10;
      spawnOfficerAt(Math.sin(a) * d, Math.cos(a) * d, a + Math.PI, false);
    }
  }

  function spawnStagedCar(model, x, z, heading) {
    const car = makeVehicle(model, x, z, heading);
    car.syncMesh();
    if (scene) scene.add(car.mesh);
    return car;
  }

  function setupRoadblockCars() {
    const a = spawnStagedCar('interceptor', -126.5, 138, Math.PI / 2);
    const b = spawnStagedCar('interceptor', -113.5, 144, Math.PI / 2);
    a.roadblockCar = true;
    b.roadblockCar = true;
    state.roadblockCars.push(a, b);
    return state.roadblockCars;
  }

  function stageShot(shotId, anchor) {
    // stageShot must NOT overwrite wanted.
    state.stagedShot = shotId;
    state.staged = true;
    if (shotId === 'cover') {
      // FIX #1 (attempt #8): 14 m lateral separation for the 150 px
      // screen gate (was (36,-108)/(44,-112) = 8 m = 92 px).
      const c1 = spawnStagedCar('interceptor', 34, -108, 0);
      const c2 = spawnStagedCar('interceptor', 48, -112, 0);
      state.policeCars.push(c1, c2);
      heliGroup.position.set(40, 15.5, -97);
      heliGroup.rotation.y = Math.PI / 2;
      state.heliYaw = Math.PI / 2;
      state.rotorAngle = ROTOR_FREEZE;
    } else if (shotId === 'combat') {
      const ax = (anchor && anchor.x) || 40;
      const az = (anchor && anchor.z) || -22;
      for (let i = 0; i < 7; i += 1) {
        const a = (i / 7) * Math.PI * 2;
        spawnOfficerAt(ax + Math.sin(a) * 9, az + Math.cos(a) * 9, a + Math.PI, true);
      }
      const car = spawnStagedCar('patrol', 50, -28, 0.5);
      state.policeCars.push(car);
    } else if (shotId === 'pursuit') {
      const spots = [[-124, 118], [-116, 126], [-112, 122], [-132, 124]];
      for (const [x, z] of spots) {
        const c = spawnStagedCar('interceptor', x, z, Math.PI);
        state.policeCars.push(c);
      }
      setupRoadblockCars();
    } else if (shotId === 'sunset') {
      const c1 = spawnStagedCar('patrol', 188, -146, Math.PI / 2);
      const c2 = spawnStagedCar('patrol', 180, -138, Math.PI / 2);
      state.policeCars.push(c1, c2);
    }
    return state.stagedShot;
  }

  function updateHeli(dt, playerPos) {
    // Early return while staged: hold pose + frozen rotor.
    if (state.staged) return;
    if (!playerPos) return;
    if (state.wanted >= 3) {
      const tx = playerPos.x - HELI_OFFSET;
      const tz = playerPos.z - HELI_OFFSET;
      heliGroup.position.x += (tx - heliGroup.position.x) * Math.min(1, dt * 0.5);
      heliGroup.position.z += (tz - heliGroup.position.z) * Math.min(1, dt * 0.5);
      heliGroup.position.y += (15.5 - heliGroup.position.y) * Math.min(1, dt * 0.5);
    }
    state.rotorAngle += dt * 12;
  }

  const system = {
    scene,
    world,
    heli: heliGroup,
    heliGroup,
    get wanted() { return state.wanted; },
    set wanted(v) { this.setWanted(v); },
    get staged() { return state.staged; },
    get stagedShot() { return state.stagedShot; },
    desiredOfficers,
    setWanted(n) {
      state.wanted = Math.min(5, Math.max(0, Math.round(n || 0)));
      syncOfficerCount();
      return state.wanted;
    },
    spawnOfficerAt,
    // FIX #1 (attempt #8): remove every LIVE (non-staged) officer from
    // the scene + the array, so combat staging starts from exactly the
    // 7 staged officers. Called by shots.js BEFORE police.stageShot.
    clearLiveOfficers() {
      for (let i = state.officers.length - 1; i >= 0; i -= 1) {
        if (!state.officers[i].staged) {
          const [gone] = state.officers.splice(i, 1);
          if (scene) scene.remove(gone.mesh);
        }
      }
      return state.officers.length;
    },
    spawnSeventhOfficer() {
      if (state.officers.length >= 7) return state.officers[6];
      const a = rng() * Math.PI * 2;
      const d = 8 + rng() * 4;
      return spawnOfficerAt(Math.sin(a) * d, Math.cos(a) * d, a + Math.PI, false);
    },
    spawnStagedCar,
    setupRoadblockCars,
    stageShot,
    getOfficers() { return state.officers; },
    getPoliceCars() { return state.policeCars; },
    getRoadblockCars() { return state.roadblockCars; },
    getHeli() {
      return {
        present: true,
        staged: state.staged,
        scale: S,
        x: heliGroup.position.x,
        y: heliGroup.position.y,
        z: heliGroup.position.z,
        yaw: state.heliYaw,
        rotorAngle: state.rotorAngle,
      };
    },
    updateHeli,
    stepSimulation(playerPosition, dt = 1 / 60) {
      // MUST be passed player.position (a Vector3), never the player object.
      if (!playerPosition) return;
      updateHeli(dt, playerPosition);
      if (!state.staged) {
        for (const o of state.officers) {
          if (o.fallen) continue;
          const dx = playerPosition.x - o.position.x;
          const dz = playerPosition.z - o.position.z;
          const d = Math.hypot(dx, dz) || 1;
          if (d > 6) {
            const step = Math.min(2.2 * dt, d - 6);
            o.position.x += (dx / d) * step;
            o.position.z += (dz / d) * step;
            o.mesh.position.copy(o.position);
            o.heading = Math.atan2(dx, dz);
            o.mesh.rotation.y = o.heading + Math.PI;
          }
        }
      }
    },
    update(dt = 1 / 60, playerPos) {
      // The spawn tick freezes while a shot is staged.
      if (!state.stagedShot) {
        state.spawnTick += dt;
        if (state.spawnTick > 2) {
          state.spawnTick = 0;
          syncOfficerCount();
        }
      }
      if (playerPos) updateHeli(dt, playerPos);
    },
  };
  return system;
}

export const createPolice = createPoliceSystem;
