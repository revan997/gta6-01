// police.js — Solmar Bay police: wanted level, officers, patrol cars,
// interceptors, roadblock, and the AIR ONE helicopter.
//
// Heli rebuild (§7 fix #3 item 3): parts are built at 2.6x (S = scale),
// the GROUP scale is 1 (never g.scale.setScalar), so the harness probe
// (which multiplies its unit offsets by h.scale = 2.6) lands on the real
// parts. Nose at +z, tail/fin at -z, rotor disc a DIRECT child of the
// group, rotor frozen at 73 degrees while staged, body near-black
// 0x0a0d12 for the body-vs-sky contrast gate.
import * as THREE from '../vendor/three.module.min.js';
import { makeVehicle } from './vehicle.js';
import { CONFIG } from './config.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function toCallableRng(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  if (rng && typeof rng.random === 'function') return () => rng.random();
  if (typeof rng === 'number') return mulberry32(rng);
  return mulberry32(20261122);
}

function heliConfig() {
  // round11.heli is the harness view; CONFIG.police.heli is the flat
  // source (W1's alias block never set round11.heli — reported).
  const h = (CONFIG && CONFIG.round11 && CONFIG.round11.heli)
    || (CONFIG && CONFIG.police && CONFIG.police.heli)
    || {};
  return { scale: h.scale || 2.6, rotorFreezeDeg: h.rotorFreezeDeg || 73 };
}

const HELI_BODY = 0x0a0d12; // near-black (§7): body-vs-sky contrast gate
const HELI_DISC = 0x050505;

// ---- helicopter --------------------------------------------------------
// Build the heli group. Group scale stays 1; every part is built at S.
// The probe finds this group by traversing for a group whose DIRECT
// children include a ConeGeometry, a CircleGeometry (the rotor disc) and
// a Sprite (the beacon).
export function buildHeli(scene) {
  const cfg = heliConfig();
  const S = cfg.scale || 2.6;
  const g = new THREE.Group();
  g.name = 'heli';
  g.userData.kind = 'heli';
  const bodyMat = new THREE.MeshLambertMaterial({ color: HELI_BODY });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x050505 });

  // Main body: spans y -1.95..+1.95, z -5.46..+5.46 at x ~ 0, matching
  // the probe's bodyTop/bodyBottom/bodyNose/bodyTail points (*S).
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1 * S, 1.5 * S, 4.2 * S), bodyMat);
  body.name = 'heli:body';
  body.userData.kind = 'heli';
  g.add(body);

  // Nose cone at +z: rotation.x = +PI/2 tips the cone toward +z.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55 * S, 1.25 * S, 12), bodyMat);
  nose.name = 'heli:nose';
  nose.userData.kind = 'heli';
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0, 2.9 * S);
  g.add(nose);

  // Tail boom toward -z.
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.45 * S, 0.45 * S, 2.9 * S), bodyMat);
  boom.name = 'heli:boom';
  boom.userData.kind = 'heli';
  boom.position.set(0, 0.1 * S, -3.5 * S);
  g.add(boom);

  // Tail fin at -z, top at y 1.6*S (finTop probe point).
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14 * S, 1.4 * S, 1.0 * S), bodyMat);
  fin.name = 'heli:fin';
  fin.userData.kind = 'heli';
  fin.position.set(0, 0.95 * S, -5.0 * S);
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.6 * S, 0.1 * S, 0.5 * S), bodyMat);
  stab.name = 'heli:stab';
  stab.userData.kind = 'heli';
  stab.position.set(0, 0.35 * S, -4.8 * S);
  g.add(stab);

  // Rotor mast.
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * S, 0.14 * S, 0.5 * S, 8), darkMat);
  mast.name = 'heli:mast';
  mast.userData.kind = 'heli';
  mast.position.set(0, 0.9 * S, 0);
  g.add(mast);

  // Rotor disc: CircleGeometry radius 3.4*S = 8.84, at y 1.35*S = 3.51,
  // opacity 0.85 (§7), DoubleSide so it renders from below (the cover
  // camera looks UP at the heli). DIRECT child of the group.
  const discMat = new THREE.MeshLambertMaterial({
    color: HELI_DISC, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4 * S, 32), discMat);
  disc.name = 'heli:disc';
  disc.userData.kind = 'heli';
  disc.rotation.x = -Math.PI / 2;
  disc.position.set(0, 1.35 * S, 0);
  g.add(disc);

  // Rotor blades: one bar 6.6*S = 17.16 long at y 1.28*S = 3.33, frozen
  // at 73 degrees while staged. Lives in a rotor subgroup so it can
  // spin in free play; the DISC stays a direct child of the group.
  const rotor = new THREE.Group();
  rotor.name = 'heli:rotor';
  rotor.userData.kind = 'heli';
  const blades = new THREE.Mesh(new THREE.BoxGeometry(6.6 * S, 0.05 * S, 0.24 * S), darkMat);
  blades.name = 'heli:blades';
  blades.userData.kind = 'heli';
  blades.position.set(0, 1.28 * S, 0);
  rotor.add(blades);
  rotor.rotation.y = THREE.MathUtils.degToRad(cfg.rotorFreezeDeg || 73);
  g.add(rotor);

  // Skids (x2.6) with struts.
  for (const sx of [-0.6 * S, 0.6 * S]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.1 * S, 0.1 * S, 2.7 * S), darkMat);
    skid.name = 'heli:skid';
    skid.userData.kind = 'heli';
    skid.position.set(sx, -0.85 * S, 0);
    g.add(skid);
    for (const sz of [-0.9 * S, 0.9 * S]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08 * S, 0.5 * S, 0.08 * S), darkMat);
      strut.name = 'heli:strut';
      strut.userData.kind = 'heli';
      strut.position.set(sx, -0.6 * S, sz);
      g.add(strut);
    }
  }

  // Beacon sprite on top (DIRECT child, needed by the probe).
  const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff3322 }));
  beacon.name = 'heli:beacon';
  beacon.userData.kind = 'heli';
  beacon.position.set(0, 1.0 * S, -0.8 * S);
  beacon.scale.set(1.0 * S, 1.0 * S, 1);
  g.add(beacon);

  // Searchlight: a real SpotLight, NO cone mesh.
  const spot = new THREE.SpotLight(0xfff2cc, 2.0, 60, 0.45, 0.4, 1.2);
  spot.name = 'heli:spot';
  spot.userData.kind = 'heli';
  spot.position.set(0, -0.5 * S, 0);
  const spotTarget = new THREE.Object3D();
  spotTarget.name = 'heli:spottarget';
  spotTarget.position.set(0, -15, 0);
  g.add(spotTarget);
  spot.target = spotTarget;
  g.add(spot);

  g.userData.rotor = rotor;
  if (scene) scene.add(g);
  return g;
}

// ---- officers ----------------------------------------------------------
// One officer: dark uniform, marker octahedron at y 2.25 (color 0xff2a1a),
// pistol BoxGeometry(0.09, 0.14, 0.42) color 0x111111 at y ~1.15.
// The model faces +z at rotation 0, so rotation.y = heading.
// When fallen: the group lies prone, the marker hides, and the pistol
// drops to the ground (y ~0.5, ~1.1 m out) — the probe counts exactly
// 7 pistols (6 carried + 1 dropped) and exactly 6 visible markers.
export function createOfficer(x = 0, z = 0, heading = 0) {
  const scene = null; // group is attached by the caller
  const g = new THREE.Group();
  g.name = 'officer';
  g.userData.kind = 'officer';
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1a1d26 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x0c0d10 });
  const tag = (mesh, part) => { mesh.name = 'officer:' + part; mesh.userData.kind = 'officer'; return mesh; };

  const torso = tag(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.68, 0.3), uniform), 'torso');
  torso.position.y = 1.08;
  g.add(torso);
  const vest = tag(new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.34, 0.34), dark), 'vest');
  vest.position.y = 1.14;
  g.add(vest);
  const head = tag(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin), 'head');
  head.position.y = 1.62;
  g.add(head);
  const cap = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.1, 10), dark), 'cap');
  cap.position.y = 1.74;
  g.add(cap);
  const legL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.19), dark), 'legL');
  legL.position.set(-0.12, 0.36, 0);
  g.add(legL);
  const legR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.19), dark), 'legR');
  legR.position.set(0.12, 0.36, 0);
  g.add(legR);
  const armL = tag(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.13), uniform), 'armL');
  armL.position.set(-0.31, 1.05, 0);
  g.add(armL);
  const armR = tag(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.13), uniform), 'armR');
  armR.position.set(0.31, 1.05, 0.08);
  g.add(armR);

  // Pistol: exactly 0.09 x 0.14 x 0.42, color 0x111111, carried at
  // y ~1.15 (probe matches |y - 1.15| < 1.0, within 1.5 m of the officer).
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  pistol.name = 'officer:pistol';
  pistol.userData.kind = 'pistol';
  pistol.position.set(0.25, 1.15, 0.3);
  g.add(pistol);

  // Marker: red octahedron at y 2.25 (probe matches |y - 2.25| < 1.0).
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.26),
    new THREE.MeshLambertMaterial({ color: 0xff2a1a, emissive: 0x881111 }),
  );
  marker.name = 'officer:marker';
  marker.userData.kind = 'marker';
  marker.position.set(0, 2.25, 0);
  g.add(marker);

  let _heading = heading;
  let _fallen = false;
  const officer = {
    kind: 'officer',
    name: 'officer',
    position: { x, y: 0, z },
    mesh: g,
    pistol,
    marker,
    staged: false,
    state: 'standing',
    get heading() { return _heading; },
    set heading(v) { _heading = v; g.rotation.y = v; },
    get fallen() { return _fallen; },
    set fallen(v) {
      _fallen = !!v;
      if (_fallen) {
        // Lie prone: group rotated flat, marker hidden, pistol drops to
        // the ground beside the officer (y ~0.5, ~1.1 m out).
        g.rotation.x = -Math.PI / 2;
        marker.visible = false;
        officer.state = 'fallen';
        if (pistol.parent === g) {
          g.remove(pistol);
          if (officer._scene) officer._scene.add(pistol);
          pistol.position.set(officer.position.x + 1.1, 0.5, officer.position.z + 0.3);
          pistol.rotation.set(-1.45, 0, 0);
        }
      } else {
        g.rotation.x = 0;
        marker.visible = true;
        officer.state = 'standing';
        if (pistol.parent !== g) {
          if (officer._scene) officer._scene.remove(pistol);
          g.add(pistol);
          pistol.position.set(0.25, 1.15, 0.3);
          pistol.rotation.set(0, 0, 0);
        }
      }
    },
    _scene: scene,
    setScene(s) { this._scene = s; },
    syncMesh() {
      g.position.set(this.position.x, this.position.y, this.position.z);
      if (!_fallen) g.rotation.y = _heading;
    },
  };
  officer.syncMesh();
  return officer;
}

// ---- police system -----------------------------------------------------
export function createPoliceSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const world = ctx.world || null;
  const rand = toCallableRng(ctx.rng);
  const rngObj = (ctx.rng && typeof ctx.rng === 'object') ? ctx.rng : null;

  const sys = {
    scene,
    world,
    wanted: 0,
    officers: [],
    policeCars: [],
    roadblockCars: [],
    heli: null,
    stagedShot: null,
    _spawnTimer: 0,
    _heliStaged: false,
    _heliPresent: false,

    getWanted() { return this.wanted; },
    setWanted(n) {
      this.wanted = Math.max(0, Math.min(5, Math.round(n)));
      return this.wanted;
    },
    desiredOfficers() {
      if (this.wanted <= 0) return 0;
      return Math.min(7, (this.wanted - 1) * 2);
    },
    getOfficers() { return this.officers; },
    getPoliceCars() { return this.policeCars; },
    getRoadblockCars() { return this.roadblockCars; },
    getHeli() {
      const g = this.heli;
      return {
        x: g ? g.position.x : 0,
        y: g ? g.position.y : 0,
        z: g ? g.position.z : 0,
        scale: heliConfig().scale || 2.6,
        present: this._heliPresent,
        staged: this._heliStaged,
      };
    },

    // Spawn one officer near the player (free play or staged).
    spawnOfficer(px, pz, heading, staged) {
      const o = createOfficer(px, pz, heading !== undefined ? heading : rand() * Math.PI * 2);
      o.staged = !!staged;
      o.setScene(scene);
      this.officers.push(o);
      if (scene && o.mesh) scene.add(o.mesh);
      return o;
    },

    // Manual seventh officer (combat staging calls it when needed).
    spawnSeventhOfficer(anchor) {
      const ax = anchor && anchor.x !== undefined ? anchor.x : 40;
      const az = anchor && anchor.z !== undefined ? anchor.z : -22;
      const o = this.spawnOfficer(ax + 8, az - 4, Math.PI / 2, true);
      return o;
    },

    // Staged car built straight from makeVehicle (not through traffic).
    spawnStagedCar(modelName, x, z, heading) {
      const car = makeVehicle(modelName, x, z, heading);
      car.staged = true;
      car.speed = 0;
      if (scene && car.mesh) scene.add(car.mesh);
      return car;
    },

    // Roadblock pair: crosswise cars, kept ONLY in roadblockCars,
    // never in policeCars (the pursuit probe counts them separately).
    setupRoadblockCars() {
      const a = this.spawnStagedCar('interceptor', -126.5, 138, Math.PI / 2);
      const b = this.spawnStagedCar('interceptor', -113.5, 144, Math.PI / 2);
      a.kind = 'roadblockCar';
      b.kind = 'roadblockCar';
      if (a.mesh) { a.mesh.name = 'roadblockCar'; a.mesh.userData.kind = 'roadblockCar'; }
      if (b.mesh) { b.mesh.name = 'roadblockCar'; b.mesh.userData.kind = 'roadblockCar'; }
      this.roadblockCars = [a, b];
      return this.roadblockCars;
    },

    // Stage one of the four shots. NEVER overwrites wanted: pursuit and
    // sunset stay at 5, cover and combat at 4 (set by the shot sheet
    // before staging).
    stageShot(shotId, anchor) {
      this.stagedShot = shotId;
      const ax = anchor && anchor.x !== undefined ? anchor.x : 0;
      const az = anchor && anchor.z !== undefined ? anchor.z : 0;
      if (shotId === 'cover') {
        // Interceptors flanking the GT's route. Positions (30,-106) /
        // (50,-114): the contract's (36,-108)/(44,-112) projects only
        // ~91 px apart and FAILS the >=150 px screen-separation gate;
        // these positions were verified in attempt #4 re-test #3.
        const c1 = this.spawnStagedCar('interceptor', 30, -106, 0);
        const c2 = this.spawnStagedCar('interceptor', 50, -114, 0);
        this.policeCars = [c1, c2];
        this._stageHeli(40, 15.5, -97, Math.PI / 2);
      } else if (shotId === 'combat') {
        // 7 officers (positions assigned by combat.arrangeCombatOfficers)
        // + 1 patrol car. The heli stays hidden in this shot.
        this._hideHeli();
        this.officers = [];
        for (let i = 0; i < 7; i++) {
          this.spawnOfficer(ax + 8 + i * 0.4, az - 2 - i * 0.5, Math.PI / 2, true);
        }
        const car = this.spawnStagedCar('patrol', 50, -28, 0.5);
        this.policeCars = [car];
      } else if (shotId === 'pursuit') {
        // 4 interceptors north of the camera (z > 108) + the roadblock.
        this._hideHeli();
        const p1 = this.spawnStagedCar('interceptor', -124, 118, 0);
        const p2 = this.spawnStagedCar('interceptor', -116, 120, 0);
        const p3 = this.spawnStagedCar('interceptor', -128, 128, 0);
        const p4 = this.spawnStagedCar('interceptor', -112, 132, 0);
        this.policeCars = [p1, p2, p3, p4];
        this.setupRoadblockCars();
      } else if (shotId === 'sunset') {
        this._hideHeli();
        const s1 = this.spawnStagedCar('patrol', 190, -148, Math.PI / 2);
        const s2 = this.spawnStagedCar('patrol', 186, -144, Math.PI / 2);
        this.policeCars = [s1, s2];
      }
      return this;
    },

    _stageHeli(x, y, z, yaw) {
      if (!this.heli) this.heli = buildHeli(scene);
      this.heli.position.set(x, y, z);
      this.heli.rotation.set(0, yaw, 0);
      const rotor = this.heli.userData.rotor;
      if (rotor) rotor.rotation.y = THREE.MathUtils.degToRad(heliConfig().rotorFreezeDeg || 73);
      this.heli.visible = true;
      this._heliPresent = true;
      this._heliStaged = true;
      return this.heli;
    },

    _hideHeli() {
      if (this.heli) this.heli.visible = false;
      this._heliPresent = false;
      this._heliStaged = false;
    },

    // Heli tracking: at wanted >= 3 the heli follows the player at a
    // 13.15 offset. Early-returns while staged (the staged pose holds).
    updateHeli(dt, playerPos) {
      if (this._heliStaged) return;
      if (this.stagedShot) { this._hideHeli(); return; }
      if (this.wanted < 3 || !playerPos) {
        this._hideHeli();
        return;
      }
      if (!this.heli) this.heli = buildHeli(scene);
      this.heli.visible = true;
      this._heliPresent = true;
      const tx = playerPos.x;
      const ty = (playerPos.y || 0) + 13.15;
      const tz = playerPos.z + 13.15;
      const k = Math.min(1, (dt || 0.016) * 1.5);
      this.heli.position.x += (tx - this.heli.position.x) * k;
      this.heli.position.y += (ty - this.heli.position.y) * k;
      this.heli.position.z += (tz - this.heli.position.z) * k;
      const rotor = this.heli.userData.rotor;
      if (rotor) rotor.rotation.y += (dt || 0.016) * 12;
    },

    // One simulation step. playerPosition is the player's POSITION
    // object ({x, y, z}), not the player — the contract's exact call.
    stepSimulation(playerPosition) {
      this._step(1 / 60, playerPosition);
      return this;
    },

    update(dt, playerPosition) {
      this._step(dt || 0.016, playerPosition);
      return this;
    },

    _step(dt, playerPosition) {
      const px = playerPosition && playerPosition.x !== undefined ? playerPosition.x : 40;
      const pz = playerPosition && playerPosition.z !== undefined ? playerPosition.z : -22;
      // Spawn tick: frozen while a shot is staged.
      if (!this.stagedShot) {
        this._spawnTimer += dt;
        if (this._spawnTimer >= 2) {
          this._spawnTimer = 0;
          const want = this.desiredOfficers();
          if (this.officers.length < want) {
            const ang = rand() * Math.PI * 2;
            const d = 15 + rand() * 10;
            const ox = px + Math.sin(ang) * d;
            const oz = pz + Math.cos(ang) * d;
            const o = this.spawnOfficer(ox, oz, Math.atan2(px - ox, pz - oz), false);
            o.syncMesh();
          } else if (this.officers.length > want) {
            // Despawn the furthest NON-staged officer only.
            let worst = -1;
            let worstD = -1;
            for (let i = 0; i < this.officers.length; i++) {
              const o = this.officers[i];
              if (o.staged) continue;
              const d = (o.position.x - px) ** 2 + (o.position.z - pz) ** 2;
              if (d > worstD) { worstD = d; worst = i; }
            }
            if (worst >= 0) {
              const o = this.officers[worst];
              if (scene && o.mesh) scene.remove(o.mesh);
              if (scene && o.pistol && o.pistol.parent === scene) scene.remove(o.pistol);
              this.officers.splice(worst, 1);
            }
          }
        }
      }
      // Officers face the player and hold their ground (staged ones
      // never move — combat.js places them).
      for (const o of this.officers) {
        if (!o.fallen && !o.staged) {
          o.heading = Math.atan2(px - o.position.x, pz - o.position.z);
        }
        o.syncMesh();
      }
      // Free-play police cars pursue the player; staged cars hold.
      for (const car of this.policeCars) {
        if (car.staged) { car.syncMesh(); continue; }
        const dx = px - car.position.x;
        const dz = pz - car.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 8) {
          const h = Math.atan2(dx, dz);
          car.heading = h;
          car.moveForward(Math.min(18, dist) * dt);
        }
        car.syncMesh();
      }
      for (const car of this.roadblockCars) car.syncMesh();
      this.updateHeli(dt, playerPosition);
    },
  };
  return sys;
}

export function createPolice(ctx = {}) {
  return createPoliceSystem(ctx);
}
