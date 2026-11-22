// police.js — Solmar Bay police: wanted level, officers, AIR ONE heli
// (attempt #9, fresh build).
// Heli: scale 2.6, rotor frozen 73 deg when staged, disc opacity 1.0,
// SpotLight with NO cone mesh, tracking offset 13.15 at wanted >= 3.
// The rotor disc is a DIRECT child of the heli group (harness traverse).
// Parts are built at 2.6x, group scale stays 1 (a scaled group would
// double-count the probe's own 2.6x multiplication).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { makeVehicle } from './vehicle.js';

const HELI_SCALE = 2.6;
const ROTOR_FREEZE_DEG = 73;
const HELI_OFFSET = 13.15;
const OFFICER_PISTOL = { w: 0.09, h: 0.14, d: 0.42, color: 0x111111 };
const MARKER_COLOR = 0xff2a1a;

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

function lambert(color, emissive, intensity) {
  const m = new THREE.MeshLambertMaterial({ color });
  if (emissive !== undefined) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = intensity === undefined ? 1.0 : intensity;
  }
  return m;
}

function buildHeliGroup() {
  const g = new THREE.Group();
  g.name = 'AIR ONE';
  g.userData.kind = 'heli';
  const bodyMat = lambert(0x0a0d12); // near-black: body-vs-sky contrast gate
  const glassMat = lambert(0x0d1218);
  const darkMat = lambert(0x14181d);
  const add = (mesh, name) => {
    mesh.name = 'heli ' + name;
    mesh.userData.kind = 'heli';
    g.add(mesh);
    return mesh;
  };
  // Fuselage (2.6x scale baked into the dimensions).
  const fuselage = add(new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.1, 7.6), bodyMat), 'fuselage');
  fuselage.position.set(0, 0.3, 0);
  const belly = add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 6.0), darkMat), 'belly');
  belly.position.set(0, -0.85, 0);
  const cockpit = add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.9, 2.2), lambert(0x2a4258)), 'cockpit');
  cockpit.position.set(0, 0.7, 2.2);
  // Nose cone: tip toward +z (rotation.x = +PI/2), tip lands at z +7.54.
  const nose = add(new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.9, 12), bodyMat), 'nose');
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.3, 6.1);
  // Tail boom + fin at -z (fin z -13.0).
  const boom = add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 9.0), bodyMat), 'tail-boom');
  boom.position.set(0, 0.4, -8.0);
  const fin = add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.2, 1.6), bodyMat), 'tail-fin');
  fin.position.set(0, 1.2, -13.0);
  const stab = add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.15, 1.2), darkMat), 'stabilizer');
  stab.position.set(0, 0.5, -12.0);
  // Skids.
  for (const sx of [-1, 1]) {
    const skid = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 7.0, 8), darkMat), 'skid');
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sx * 1.05, -1.5, 0.5);
    for (const sz of [-2.2, 2.2]) {
      const strut = add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.8, 6), darkMat), 'skid-strut');
      strut.position.set(sx * 1.05, -1.1, sz);
    }
  }
  // Rotor mast + blades (frozen at 73 deg when staged).
  const mast = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8), darkMat), 'rotor-mast');
  mast.position.set(0, 1.9, 0);
  const rotor = new THREE.Group();
  rotor.name = 'heli rotor';
  rotor.userData.kind = 'heli';
  g.add(rotor);
  const bladeMat = lambert(0x05070a);
  const blade1 = new THREE.Mesh(new THREE.BoxGeometry(17.16, 0.08, 0.55), bladeMat);
  blade1.name = 'heli rotor-blade-1';
  blade1.userData.kind = 'heli';
  blade1.position.y = 2.75;
  rotor.add(blade1);
  const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 17.16), bladeMat);
  blade2.name = 'heli rotor-blade-2';
  blade2.userData.kind = 'heli';
  blade2.position.y = 2.75;
  rotor.add(blade2);
  // Rotor blur disc: DIRECT child of g, tilted, near-black, opacity 1.0.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(8.84, 24),
    new THREE.MeshBasicMaterial({ color: 0x0a0d12, transparent: true, opacity: 1.0, side: THREE.DoubleSide })
  );
  disc.name = 'heli rotor-disc';
  disc.userData.kind = 'heli';
  disc.rotation.x = -Math.PI / 2;
  disc.rotation.y = -0.25;
  disc.position.y = 2.6;
  g.add(disc);
  // Beacon sprite: DIRECT child of g (cone + disc + sprite traverse).
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff2a1a }));
  beacon.name = 'heli beacon';
  beacon.userData.kind = 'heli';
  beacon.scale.set(1.6, 1.6, 1);
  beacon.position.set(0, 2.4, -3.5);
  g.add(beacon);
  // Searchlight: SpotLight + a translucent cone mesh so the beam reads
  // as a helicopter spotlight (rank 5 has a big visible cone; a bare
  // SpotLight leaves a black silhouette). The cone is a direct child of
  // the heli group, apex at the searchlight, base at the spot target.
  const spot = new THREE.SpotLight(0xfff2c0, 90, 70, 0.5, 0.45, 1.2);
  spot.position.set(0, -0.6, 2.0);
  spot.target.position.set(0, -16, 6);
  g.add(spot);
  g.add(spot.target);
  const coneH = Math.hypot(15.4, 4);
  // Cone opacity 0.30 (was 0.16: a faint wisp) + wider base 4.2 (was
  // 3.5): rank 5's cone is a BIG bright beam, and ours must read as one
  // at a glance on the downscale. Plus a bright lamp at the apex so the
  // beam has a visible source.
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(4.2, coneH, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false })
  );
  cone.name = 'heli spotlight-cone';
  cone.userData.kind = 'heli';
  // Cone +Y runs apex->base; tilt -0.253 rad about X so +Y points from
  // the base (0,-16,6) to the apex (0,-0.6,2.0). Centre = midpoint.
  cone.rotation.x = -0.253;
  cone.position.set(0, -8.3, 4.0);
  g.add(cone);
  // Bright searchlight lamp at the cone apex (the beam's source).
  const lamp = add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5),
    new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xfff2c0, emissiveIntensity: 3.0 })), 'searchlight-lamp');
  lamp.position.set(0, -0.6, 2.0);
  return { group: g, rotor, disc, spot };
}

function buildOfficerMesh() {
  const g = new THREE.Group();
  g.name = 'Police Officer';
  g.userData.kind = 'officer';
  const uniform = lambert(0x2e4158); // brighter navy: officers read on the brown road
  const dark = lambert(0x14181d);
  const skin = lambert(0xc99878);
  const body = new THREE.Group();
  body.name = 'officer body';
  body.userData.kind = 'officer';
  g.add(body);
  const add = (mesh, name) => {
    mesh.name = 'officer ' + name;
    mesh.userData.kind = 'officer';
    body.add(mesh);
    return mesh;
  };
  const legL = add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.82, 0.17), dark), 'leg-left');
  legL.position.set(-0.12, 0.41, 0);
  const legR = add(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.82, 0.17), dark), 'leg-right');
  legR.position.set(0.12, 0.41, 0);
  const torso = add(new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.3), uniform), 'torso');
  torso.position.y = 1.15;
  const vest = add(new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.4, 0.32), dark), 'vest');
  vest.position.y = 1.18;
  const head = add(new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.29, 0.27), skin), 'head');
  head.position.y = 1.63;
  const cap = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), dark), 'cap');
  cap.position.y = 1.8;
  const brim = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.14), dark), 'cap-brim');
  brim.position.set(0, 1.76, -0.19);
  const armL = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.13), uniform), 'arm-left');
  armL.position.set(-0.33, 1.12, 0);
  const armR = add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.6, 0.13), uniform), 'arm-right');
  armR.position.set(0.33, 1.12, -0.1);
  armR.rotation.x = -0.9;
  // Pistol 0.09 x 0.14 x 0.42, color 0x111111 (officer-pistol filter).
  const pistol = add(
    new THREE.Mesh(new THREE.BoxGeometry(OFFICER_PISTOL.w, OFFICER_PISTOL.h, OFFICER_PISTOL.d), lambert(OFFICER_PISTOL.color)),
    'pistol'
  );
  pistol.position.set(0.33, 1.0, -0.42);
  // Red diamond marker above the head (kind 'marker', color 0xff2a1a).
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28),
    new THREE.MeshBasicMaterial({ color: MARKER_COLOR })
  );
  marker.name = 'officer marker';
  marker.userData.kind = 'marker';
  marker.position.set(0, 2.35, 0);
  g.add(marker);
  return { group: g, body, pistol, marker };
}

export function createPoliceSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const rng = toCallableRng(ctx.rng);
  const heliParts = buildHeliGroup();
  const heliGroup = heliParts.group;
  heliGroup.position.set(40, 15.5, -97);
  if (scene) scene.add(heliGroup);

  const sys = {
    scene,
    wanted: 0,
    officers: [],
    policeCars: [],
    roadblockCars: [],
    stagedShot: null,
    _staged: false,
    _spawnTimer: 0,
    _heli: {
      present: true,
      staged: false,
      scale: HELI_SCALE,
      group: heliGroup,
      rotor: heliParts.rotor,
      disc: heliParts.disc,
      spot: heliParts.spot,
    },
    _playerPos: null,

    getHeli() {
      return {
        present: true,
        staged: sys._staged,
        scale: HELI_SCALE,
        x: heliGroup.position.x,
        y: heliGroup.position.y,
        z: heliGroup.position.z,
        yaw: heliGroup.rotation.y,
        group: heliGroup,
        rotorFrozenDeg: ROTOR_FREEZE_DEG,
      };
    },

    get desiredOfficers() {
      return Math.min(7, Math.max(0, (sys.wanted - 1) * 2));
    },

    setWanted(n) {
      sys.wanted = Math.max(0, Math.min(5, Math.floor(n)));
      // While a shot is staged, the staged officers ARE the count —
      // never spawn free-play officers on top of them.
      if (!sys.stagedShot) sys._syncOfficers();
      return sys.wanted;
    },

    getWanted() { return sys.wanted; },

    addWanted(n) { return sys.setWanted(sys.wanted + n); },

    spawnOfficer(x, z, heading = 0) {
      const built = buildOfficerMesh();
      const officer = {
        mesh: built.group,
        group: built.group,
        body: built.body,
        pistol: built.pistol,
        marker: built.marker,
        kind: 'officer',
        staged: false,
        _fallen: false,
        heading,
        get fallen() { return this._fallen; },
        get position() { return this.mesh.position; },
        setFallen(v) {
          this._fallen = !!v;
          this.marker.visible = !v;
          // Hide the carried pistol while fallen: prone, it lies at ground
          // level and the harness counts it as a 2nd dropped pistol (want
          // exactly 1 dropped, 7 pistol meshes total).
          this.pistol.visible = !v;
          if (v) {
            this.body.rotation.x = -Math.PI / 2;
            this.body.position.y = 0.3;
          } else {
            this.body.rotation.x = 0;
            this.body.position.y = 0;
          }
        },
      };
      officer.mesh.position.set(x, 0, z);
      officer.mesh.rotation.y = heading;
      sys.officers.push(officer);
      if (scene) scene.add(officer.mesh);
      return officer;
    },

    spawnSeventhOfficer() {
      // The manual 7th-officer call after the normal spawn loop (6 -> 7).
      // Never exceed 7: if 7 are already present (e.g. staged), it is a no-op.
      if (sys.officers.length >= 7) return sys.officers[sys.officers.length - 1] || null;
      const p = sys._playerPos || { x: 40, z: -22 };
      const officer = sys.spawnOfficer(p.x + 8, p.z - 3.7, 0);
      return officer;
    },

    _syncOfficers() {
      const want = sys.desiredOfficers;
      const live = sys.officers.filter((o) => !o.staged);
      while (live.length < want) {
        const p = sys._playerPos || { x: 40, z: -22 };
        const a = rng() * Math.PI * 2;
        const d = 10 + rng() * 8;
        const o = sys.spawnOfficer(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d, a);
        live.push(o);
      }
      while (live.length > want) {
        const o = live.pop();
        const i = sys.officers.indexOf(o);
        if (i >= 0) sys.officers.splice(i, 1);
        if (scene) scene.remove(o.mesh);
      }
    },

    spawnStagedCar(model, x, z, heading, roadblock = false) {
      const car = makeVehicle(model, x, z, heading);
      if (roadblock) {
        car.mesh.userData.tag = 'roadblockCar';
        sys.roadblockCars.push(car);
      } else {
        sys.policeCars.push(car);
      }
      if (scene) scene.add(car.mesh);
      return car;
    },

    setupRoadblockCars() {
      sys.spawnStagedCar('interceptor', -126.5, 138, Math.PI / 2, true);
      sys.spawnStagedCar('interceptor', -113.5, 144, -Math.PI / 2, true);
      return sys.roadblockCars;
    },

    getOfficers() { return sys.officers; },
    getPoliceCars() { return sys.policeCars; },
    getRoadblockCars() { return sys.roadblockCars; },

    stageShot(shotId, anchor) {
      sys.stagedShot = shotId;
      sys._staged = true;
      sys._heli.staged = true;
      if (shotId === 'cover') {
        // 16 m lateral separation: the pair reads ~184 px apart on the
        // cover frame (was 36/44 -> 92 px, gate >= 150).
        sys.spawnStagedCar('interceptor', 32, -108, 0);
        sys.spawnStagedCar('interceptor', 48, -112, 0);
        heliGroup.position.set(40, 15.5, -97);
        heliGroup.rotation.y = Math.PI / 2;
        // 12-deg bank around the nose axis: the near rotor tip (local -x,
        // the one that projected 12 px above the frame top) drops ~2.4 m,
        // so all four canonical tips stay on screen while the centre
        // (101) and bottom (130) gates pass at the pitched-down camera.
        // Yaw is unchanged (the roll is around local +z, the nose axis).
        heliGroup.rotation.z = 0.21;
        heliParts.rotor.rotation.y = (ROTOR_FREEZE_DEG * Math.PI) / 180;
      } else if (shotId === 'combat') {
        // Exactly 7 staged officers: drop any free-play officers first,
        // so the count is deterministic whatever the call order was.
        for (const o of sys.officers.filter((x) => !x.staged)) {
          if (scene) scene.remove(o.mesh);
        }
        sys.officers = sys.officers.filter((x) => x.staged);
        for (let i = 0; i < 7; i++) {
          const o = sys.spawnOfficer(40 + i * 2, -22 - i, 0);
          o.staged = true;
        }
        sys.spawnStagedCar('patrol', 50, -28, 0.5);
      } else if (shotId === 'pursuit') {
        sys.spawnStagedCar('interceptor', -124, 118, Math.PI);
        // Was (-112,116): projected OFF at ~53 deg off-axis (half-FOV 47).
        // (-116,124) is on screen at (473,417). The two outer cars are
        // pushed out so the police-list distances stop reading identical
        // "12 m": (-130,132) -> 14 m, (-104,126) -> 16 m (both verified
        // on screen with the pursuit camera).
        sys.spawnStagedCar('interceptor', -116, 124, Math.PI);
        sys.spawnStagedCar('interceptor', -130, 132, Math.PI);
        sys.spawnStagedCar('interceptor', -104, 126, Math.PI);
        sys.setupRoadblockCars();
      } else if (shotId === 'sunset') {
        sys.spawnStagedCar('patrol', 188, -146, 0.4);
        sys.spawnStagedCar('patrol', 180, -138, 0.4);
      }
      return shotId;
    },

    updateHeli(dt) {
      if (sys._staged) return; // holds pose + frozen rotor while staged
      const p = sys._playerPos;
      if (sys.wanted >= 3 && p) {
        const tx = p.x - HELI_OFFSET;
        const tz = p.z - HELI_OFFSET;
        heliGroup.position.x += (tx - heliGroup.position.x) * Math.min(1, dt * 0.8);
        heliGroup.position.z += (tz - heliGroup.position.z) * Math.min(1, dt * 0.8);
        heliGroup.position.y += (15.5 - heliGroup.position.y) * Math.min(1, dt * 0.8);
        heliGroup.rotation.y += dt * 0.2;
      }
      heliParts.rotor.rotation.y += dt * 9;
    },

    update(dt = 1 / 60) {
      if (!sys.stagedShot) {
        sys._spawnTimer += dt;
        if (sys._spawnTimer > 1.5) {
          sys._spawnTimer = 0;
          sys._syncOfficers();
        }
      }
      sys.updateHeli(dt);
      const p = sys._playerPos;
      if (p && sys.wanted > 0) {
        for (const o of sys.officers) {
          if (o.fallen || o.staged) continue;
          const dx = p.x - o.mesh.position.x;
          const dz = p.z - o.mesh.position.z;
          const d = Math.hypot(dx, dz);
          if (d > 6 && d < 40) {
            const step = Math.min(d - 6, 2.2 * dt);
            o.mesh.position.x += (dx / d) * step;
            o.mesh.position.z += (dz / d) * step;
            o.mesh.rotation.y = Math.atan2(dx, -dz);
          }
        }
      }
    },

    stepSimulation(playerPosition, dt = 1 / 60) {
      sys._playerPos = playerPosition;
      sys.update(dt);
    },
  };
  return sys;
}

export const createPolice = createPoliceSystem;
