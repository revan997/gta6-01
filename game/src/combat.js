// combat.js — Solmar Bay combat staging (the harbour-heist shootout).
// arrangeCombatOfficers places the 7 staged officers around Rico's FINAL
// position (Rico is pre-positioned before stageShot — §7 fix #3 item 6).
// Layout is in Rico's heading frame (forward = (sin h, cos h), right =
// (-cos h, sin h)); officer 0 is the aim officer at 7.4 m, officer 3 is
// the fallen officer in the gap, the 7th officer sits at 8 m forward,
// lateral -3.7 (parent brief; the contract §3 says -3.5 — see report).
// The light pool is a RingGeometry annulus (inner 1.2 m, outer 4.5 m),
// emissive 0xffeebb at 4.0, y 0.12: a solid disc or a PointLight FAILS
// the fallen-contrast gate because the bright pool pollutes the body
// box; the annulus's dark hole over the body is the trick.
import * as THREE from '../vendor/three.module.min.js';

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

// RingGeometry annulus light pool. Emissive 0xffeebb at intensity 4.0,
// y 0.12 — measured contrast 41.8 vs the >= 35 gate (attempt #4 fix #2).
export function makeLightPool(x = 0, z = 0) {
  const geo = new THREE.RingGeometry(1.2, 4.5, 40);
  const mat = new THREE.MeshLambertMaterial({
    color: 0xffeebb, emissive: 0xffeebb, emissiveIntensity: 4.0,
    side: THREE.DoubleSide,
  });
  const pool = new THREE.Mesh(geo, mat);
  pool.name = 'lightPool';
  pool.userData.kind = 'lightPool';
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(x, 0.12, z);
  return pool;
}

function makeMuzzleFlash() {
  const g = new THREE.Group();
  g.name = 'muzzleFlash';
  g.userData.kind = 'muzzleFlash';
  const mat = new THREE.MeshBasicMaterial({ color: 0xffdd66 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat);
  core.name = 'muzzleFlash:core';
  core.userData.kind = 'muzzleFlash';
  g.add(core);
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 6), mat);
  spike.name = 'muzzleFlash:spike';
  spike.userData.kind = 'muzzleFlash';
  spike.rotation.x = Math.PI / 2;
  spike.position.z = 0.35;
  g.add(spike);
  return g;
}

function makeTracer(from, to) {
  const dx = to.x - from.x;
  const dy = (to.y || 1.15) - (from.y || 1.15);
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  const geo = new THREE.BoxGeometry(0.05, 0.05, len);
  const tracer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffcc44, transparent: true, opacity: 0.9 }));
  tracer.name = 'tracer';
  tracer.userData.kind = 'tracer';
  tracer.position.set((from.x + to.x) / 2, ((from.y || 1.15) + (to.y || 1.15)) / 2, (from.z + to.z) / 2);
  tracer.lookAt(to.x, to.y || 1.15, to.z);
  return tracer;
}

// Officer layout in Rico's heading frame: [forward, lateral].
// Clusters widened laterally so the screen gap between them is >= 70 px.
// The fallen officer (index 3) sits in the gap, slightly off the aim line
// so it peeks beside the aim officer instead of hiding behind him.
const OFFICER_LAYOUT = [
  { fwd: 7.4, lat: 0, role: 'aim' },
  { fwd: 8.5, lat: 3.5, role: 'right' },
  { fwd: 9.5, lat: 6.5, role: 'right' },
  { fwd: 9.0, lat: -1.8, role: 'fallen' },
  { fwd: 8.5, lat: -4.5, role: 'left' },
  { fwd: 9.5, lat: -7.5, role: 'left' },
  { fwd: 8.0, lat: -3.7, role: 'seventh', jitter: -0.2 },
];

export function createCombatSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const player = ctx.player || null;
  const police = ctx.police || null;
  const rand = toCallableRng(ctx.rng);

  let _muzzleVisible = false;
  let _ricoPistol = false;
  let _muzzleTimer = 0;
  let _muzzle = null;
  let _tracer = null;
  let _lightPool = null;

  const sys = {
    scene,
    player,
    police,
    get muzzleVisible() { return _muzzleVisible; },
    set muzzleVisible(v) {
      _muzzleVisible = !!v;
      if (_muzzle) _muzzle.visible = _muzzleVisible;
    },
    get ricoPistol() { return _ricoPistol; },
    set ricoPistol(v) { _ricoPistol = !!v; },

    // Place the 7 staged officers around the anchor (default: the
    // player's CURRENT position — Rico must already be at his final
    // spot when this runs). Officer 0 aims at Rico from 7.4 m; officer
    // 3 falls prone in the gap with the light pool under him.
    arrangeCombatOfficers(anchor) {
      const a = anchor || player;
      if (!a || !police) return [];
      const ax = a.position ? a.position.x : a.x;
      const az = a.position ? a.position.z : a.z;
      const heading = a.heading !== undefined ? a.heading : Math.PI / 2;
      const fx = Math.sin(heading);
      const fz = Math.cos(heading);
      const rx = -Math.cos(heading);
      const rz = Math.sin(heading);
      const officers = police.getOfficers();
      const placed = [];
      for (let i = 0; i < Math.min(officers.length, OFFICER_LAYOUT.length); i++) {
        const o = officers[i];
        const lay = OFFICER_LAYOUT[i];
        const lat = lay.lat + (lay.jitter || 0);
        const ox = ax + fx * lay.fwd + rx * lat;
        const oz = az + fz * lay.fwd + rz * lat;
        o.position.x = ox;
        o.position.z = oz;
        o.position.y = 0;
        // Face Rico.
        o.heading = Math.atan2(ax - ox, az - oz);
        if (lay.role === 'fallen') {
          o.fallen = true;
          // Light pool under the fallen officer.
          if (_lightPool && scene) scene.remove(_lightPool);
          _lightPool = makeLightPool(ox, oz);
          if (scene) scene.add(_lightPool);
        } else {
          o.fallen = false;
        }
        o.syncMesh();
        placed.push(o);
      }
      return placed;
    },

    // Stage the combat shot: arrange the officers, freeze the muzzle
    // flash (timer 999), show Rico's pistol and the tracer to the aim
    // officer.
    stageShot(shotId, anchor) {
      if (shotId !== 'combat') return this;
      const p = anchor || player;
      this.arrangeCombatOfficers(p);
      // Muzzle flash at Rico's muzzle, frozen visible.
      if (scene && p) {
        if (_muzzle) scene.remove(_muzzle);
        _muzzle = makeMuzzleFlash();
        const h = p.heading !== undefined ? p.heading : Math.PI / 2;
        const fx = Math.sin(h);
        const fz = Math.cos(h);
        const mx = p.position.x + fx * 0.6 + (-Math.cos(h)) * 0.3;
        const mz = p.position.z + fz * 0.6 + Math.sin(h) * 0.3;
        _muzzle.position.set(mx, 1.0, mz);
        _muzzle.rotation.y = h;
        scene.add(_muzzle);
        // Tracer from the muzzle to the aim officer (officer 0).
        const officers = police ? police.getOfficers() : [];
        if (officers.length > 0) {
          if (_tracer) scene.remove(_tracer);
          _tracer = makeTracer(
            { x: mx, y: 1.0, z: mz },
            { x: officers[0].position.x, y: 1.15, z: officers[0].position.z },
          );
          scene.add(_tracer);
        }
      }
      _muzzleTimer = 999; // frozen
      this.muzzleVisible = true;
      this.ricoPistol = true;
      return this;
    },

    update(dt) {
      const step = dt || 0.016;
      if (_muzzleTimer > 0 && _muzzleTimer < 900) {
        _muzzleTimer -= step;
        if (_muzzleTimer <= 0) {
          this.muzzleVisible = false;
        }
      }
      if (_tracer) {
        const mat = _tracer.material;
        if (mat && mat.transparent) {
          mat.opacity = Math.max(0.15, mat.opacity - step * 0.4);
        }
      }
      return this;
    },

    getLightPool() { return _lightPool; },
    getMuzzle() { return _muzzle; },
    getTracer() { return _tracer; },
    getOfficerLayout() { return OFFICER_LAYOUT; },
  };
  return sys;
}
