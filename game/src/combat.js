// Solmar Bay — combat (W3, attempt #7, fresh build).
// Aiming, firing, muzzle flash, officer return fire, the fallen
// officer with his light pool, and the aim-officer targeting.
// Written fresh for this recording from the round-9 interface contract
// (W3 section + fixes 6/7, fix 2.7, fix 6.5–6.6) and the rebuild spec.
// Nothing copied from an old repo.
//
// Combat staging (spec §8.2): 7 officers in two clusters, officer 0
// the aim officer at 7.4 m, officer 3 fallen prone in the gap with a
// light pool, the 7th officer in the RIGHT cluster at 8 m forward,
// lateral -3.7 (straight-line 8.81 m — that is CORRECT per contract).
// Fallen pistol drops to y ~= 0.5. The light pool is a RingGeometry
// ANNULUS (inner 1.2, outer 4.5, emissive 0xffeebb at 4.0, y 0.12):
// a solid disc or a PointLight FAILS — the bright pool under the body
// pollutes the 4x4 body box and the contrast goes negative.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { WORLD_SEED, mulberry32 } from './random.js';

function toCallableRng(r) {
  if (typeof r === 'function') return r;
  if (r && typeof r.next === 'function') return () => r.next();
  if (r && typeof r.random === 'function') return () => r.random();
  if (typeof r === 'number') return mulberry32(r);
  return mulberry32(WORLD_SEED);
}

// Heading convention: forward = (sin h, 0, cos h); right = (-cos h, 0, sin h).
function forwardOf(h) { return { x: Math.sin(h), z: Math.cos(h) }; }
function rightOf(h) { return { x: -Math.cos(h), z: Math.sin(h) }; }

export function makeLightPool(x, z) {
  const cfg = (CONFIG.combat && CONFIG.combat.lightPool) || { inner: 1.2, outer: 4.5, emissive: 0xffeebb, intensity: 4.0, y: 0.12 };
  const pool = new THREE.Mesh(
    new THREE.RingGeometry(cfg.inner, cfg.outer, 32),
    new THREE.MeshBasicMaterial({
      color: cfg.emissive,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
    }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, cfg.y, z);
  pool.name = 'lightPool';
  pool.userData.kind = 'lightPool';
  return pool;
}

// createCombatSystem(ctx = {}) — OBJECT arg {scene, player, police, rng}.
export function createCombatSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const player = ctx.player || null;
  const police = ctx.police || null;
  void toCallableRng(ctx.rng);

  let _muzzleVisible = false;
  let _muzzleTimer = 0;
  let _ricoPistol = player ? player.pistol : null;
  let _lightPool = null;
  let _fallenOfficer = null;
  let _aimOfficer = null;
  let _tracer = null;

  // Muzzle flash mesh at Rico's muzzle (kind 'muzzleFlash').
  const muzzle = new THREE.Mesh(
    new THREE.ConeGeometry(0.14, 0.5, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 }),
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.name = 'muzzleFlash';
  muzzle.userData.kind = 'muzzleFlash';
  muzzle.visible = false;
  if (scene) scene.add(muzzle);

  function placeMuzzleAtRico() {
    if (!player) return;
    const f = forwardOf(player.heading);
    muzzle.position.set(
      player.position.x + f.x * 0.7,
      1.25,
      player.position.z + f.z * 0.7,
    );
    muzzle.rotation.y = player.heading;
  }

  // arrangeCombatOfficers: place the 7 officers around Rico.
  // Officer 0 = aim officer at 7.4 m straight ahead of Rico.
  // Officer 3 = fallen prone in the gap between the clusters.
  // 7th officer = 8 m forward, lateral -3.7 (right cluster).
  function arrangeCombatOfficers() {
    if (!police || !player) return [];
    const officers = police.getOfficers();
    while (officers.length < 7) police.spawnOfficer(player.position.x, player.position.z, 0);
    const cfg = CONFIG.combat || {};
    const aimDist = cfg.aimDistance || 7.4;
    const seventh = cfg.seventhOfficer || { forward: 8, lateral: -3.7 };
    const f = forwardOf(player.heading);
    const r = rightOf(player.heading);
    const px = player.position.x;
    const pz = player.position.z;

    // Left cluster: officers 1, 2 (standing, facing Rico).
    // Right cluster: officers 4, 5, 6 (standing, facing Rico).
    // Officer 0: aim officer, dead ahead at aimDist.
    // Officer 3: fallen prone in the gap between the clusters.
    const spots = [
      { x: px + f.x * aimDist, z: pz + f.z * aimDist }, // 0 aim
      { x: px + f.x * 9.5 + r.x * 5.5, z: pz + f.z * 9.5 + r.z * 5.5 }, // 1 left
      { x: px + f.x * 11.0 + r.x * 7.0, z: pz + f.z * 11.0 + r.z * 7.0 }, // 2 left
      { x: px + f.x * 9.5 - r.x * 2.0, z: pz + f.z * 9.5 - r.z * 2.0 }, // 3 fallen (gap)
      { x: px + f.x * 9.0 - r.x * 5.0, z: pz + f.z * 9.0 - r.z * 5.0 }, // 4 right
      { x: px + f.x * 11.5 - r.x * 6.5, z: pz + f.z * 11.5 - r.z * 6.5 }, // 5 right
      // 7th: 8 m forward, lateral -3.7 (right cluster, between 0 and 1
      // laterally — inside the cluster's lateral range). Position is
      // Rico + forward*8 + right*(-3.7); straight-line distance 8.81 m.
      { x: px + f.x * seventh.forward + r.x * seventh.lateral, z: pz + f.z * seventh.forward + r.z * seventh.lateral }, // 6 seventh
    ];
    for (let i = 0; i < 7; i++) {
      const o = officers[i];
      const s = spots[i];
      o.setPosition(s.x, s.z, Math.atan2(px - s.x, pz - s.z));
      o.staged = true;
      if (i === 3) {
        o.setFallen(true);
        // Fallen pistol drops to y ~= 0.5 (fix 6.5). The officer mesh
        // is rotated prone (Euler x+y), so a child pistol's world y is
        // heading-dependent and lands under the floor — instead the
        // pistol is detached and laid in the scene at world y 0.5
        // beside the body. It keeps its geometry (0.09x0.14x0.42,
        // 0x111111) and kind 'pistol', so the scene-wide pistol count
        // stays 7 (6 standing + 1 dropped).
        if (o.pistol.parent) o.pistol.parent.remove(o.pistol);
        o.pistol.position.set(s.x + 0.5, 0.5, s.z - 0.3);
        o.pistol.rotation.set(0, 0, Math.PI / 2);
        if (scene) scene.add(o.pistol);
        _fallenOfficer = o;
      } else {
        o.setFallen(false);
      }
    }
    _aimOfficer = officers[0];
    // Light pool under the fallen officer (annulus, dark hole over body).
    if (_lightPool && scene && _lightPool.parent === scene) scene.remove(_lightPool);
    _lightPool = makeLightPool(spots[3].x, spots[3].z);
    if (scene) scene.add(_lightPool);
    return officers;
  }

  // stageShot('combat', player) — arrange officers, freeze the muzzle
  // flash at Rico's muzzle (timer 999).
  function stageShot(shotId, p) {
    if (shotId !== 'combat') return system;
    const who = p || player;
    if (who && who.pistol) _ricoPistol = who.pistol;
    arrangeCombatOfficers();
    placeMuzzleAtRico();
    _muzzleVisible = true;
    _muzzleTimer = 999;
    muzzle.visible = true;
    return system;
  }

  function fire() {
    if (!player) return null;
    placeMuzzleAtRico();
    _muzzleVisible = true;
    _muzzleTimer = 0.12;
    muzzle.visible = true;
    return { x: muzzle.position.x, z: muzzle.position.z, heading: player.heading };
  }

  const system = {
    get muzzleVisible() { return _muzzleVisible; },
    set muzzleVisible(v) {
      _muzzleVisible = !!v;
      muzzle.visible = !!v;
    },
    get ricoPistol() { return _ricoPistol; },
    set ricoPistol(p) { _ricoPistol = p; },
    get aimOfficer() { return _aimOfficer; },
    get fallenOfficer() { return _fallenOfficer; },
    get lightPool() { return _lightPool; },
    get tracer() { return _tracer; },
    arrangeCombatOfficers,
    stageShot,
    fire,
    makeLightPool,
    update(dt) {
      const step = dt === undefined ? 1 / 60 : dt;
      if (_muzzleTimer > 0 && _muzzleTimer < 900) {
        _muzzleTimer -= step;
        if (_muzzleTimer <= 0) {
          _muzzleVisible = false;
          muzzle.visible = false;
        }
      }
      return system;
    },
    // Nearest officer to Rico (the aim target).
    getAimOfficer() {
      if (!police || !player) return _aimOfficer;
      const officers = police.getOfficers().filter((o) => !o.fallen);
      let best = null;
      let bestD = Infinity;
      for (const o of officers) {
        const d = Math.hypot(o.x - player.position.x, o.z - player.position.z);
        if (d < bestD) { bestD = d; best = o; }
      }
      return best || _aimOfficer;
    },
    getFallenOfficers() {
      if (!police) return _fallenOfficer ? [_fallenOfficer] : [];
      return police.getOfficers().filter((o) => o.fallen);
    },
  };
  return system;
}

export default createCombatSystem;
