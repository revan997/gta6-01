// combat.js — Solmar Bay combat: aiming, muzzle flash, officer clusters,
// the fallen officer + light pool (attempt #9, fresh build).
// Forward = (sin h, -cos h) in (x, z); right = (cos h, sin h).
// The fallen officer's light pool is a RingGeometry ANNULUS (inner 1.2 m,
// outer 4.5 m): the dark hole over the body is what keeps the contrast
// positive — a solid disc or a PointLight pollutes the body box.

import * as THREE from '../vendor/three.module.min.js';

function toCallableRng(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  if (rng && typeof rng.random === 'function') return () => rng.random();
  return () => 0.5;
}

export function createCombatSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const player = ctx.player || null;
  const police = ctx.police || null;
  const rng = toCallableRng(ctx.rng);

  // Muzzle flash at Rico's muzzle (kind 'muzzleFlash'). Bright amber,
  // opaque, 0.9 m wide — the pale 0.5 m cream box was invisible in the
  // render (probe: mesh in-scene + visible, zero pixels); a 3x red box
  // at the same spot renders, so size + saturation + opacity were the fix.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc21c });
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.2), flashMat);
  muzzle.name = 'muzzle flash';
  muzzle.userData.kind = 'muzzleFlash';
  muzzle.visible = false;
  if (scene) scene.add(muzzle);
  // White-hot core inside the flash: a flat amber box alone reads as a
  // bar; a bright core makes it read as a burst at the muzzle.
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.35, 0.14),
    new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
  core.name = 'muzzle flash core';
  core.userData.kind = 'muzzleFlash';
  core.position.set(0, 0, 0.1);
  muzzle.add(core);
  // Tracer line from muzzle toward the aim officer (kind 'tracer').
  // THIN (0.035, was 0.09) and SHORT (45% of the distance, from the
  // muzzle): the full-length 7 m bar read as a yellow UI rectangle
  // spanning the whole combat frame. Now a short streak at the muzzle.
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffc21c, transparent: true, opacity: 0.45 });
  const tracer = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 1), tracerMat);
  tracer.name = 'tracer';
  tracer.userData.kind = 'tracer';
  tracer.visible = false;
  if (scene) scene.add(tracer);

  const sys = {
    scene,
    player,
    police,
    _muzzleTimer: 0,
    _muzzleFrozen: false,
    _muzzleVisible: false,
    _lightPool: null,
    _droppedPistol: null,
    _staged: false,

    get muzzleVisible() { return sys._muzzleVisible; },
    set muzzleVisible(v) {
      sys._muzzleVisible = !!v;
      muzzle.visible = !!v;
    },
    get ricoPistol() {
      return player && player.pistol ? player.pistol : null;
    },

    _forward(heading) {
      return { x: Math.sin(heading), z: -Math.cos(heading) };
    },
    _right(heading) {
      return { x: Math.cos(heading), z: Math.sin(heading) };
    },
    _spot(playerPos, heading, fwd, lat) {
      const f = sys._forward(heading);
      const r = sys._right(heading);
      return { x: playerPos.x + f.x * fwd + r.x * lat, z: playerPos.z + f.z * fwd + r.z * lat };
    },

    arrangeCombatOfficers(pl) {
      const p = pl || player;
      if (!p || !police) return [];
      const officers = police.getOfficers();
      if (officers.length < 7) return officers;
      const pp = p.mesh ? p.mesh.position : p.position;
      const h = p.heading !== undefined ? p.heading : Math.PI / 2;
      // Spots are (forward metres, lateral metres) from Rico.
      // Officer 0 = aim officer at 7.4 m; officer 3 = fallen in the gap;
      // 7th officer at 8 m fwd, lateral -3.7 (right cluster).
      const spots = [
        { f: 7.4, l: 0 },     // 0 aim officer (nearest)
        { f: 8.5, l: 3.2 },   // 1 left cluster
        { f: 6.5, l: 4.2 },   // 2 left cluster
        { f: 6.55, l: -0.6 }, // 3 FALLEN, in the gap (feet ~974,415 downscale)
        { f: 8.0, l: -2.8 },  // 4 right cluster
        { f: 9.0, l: -4.0 },  // 5 right cluster
        { f: 8.0, l: -3.7 },  // 6 seventh officer, right cluster
      ];
      officers.forEach((o, i) => {
        const s = spots[i] || spots[0];
        const pos = sys._spot(pp, h, s.f, s.l);
        o.mesh.position.set(pos.x, 0, pos.z);
        // Face Rico.
        const dx = pp.x - pos.x;
        const dz = pp.z - pos.z;
        o.mesh.rotation.y = Math.atan2(dx, -dz);
        // The harness gates o.heading against atan2(dx, dz) toward Rico
        // (mesh rotation uses the -dz facing convention; heading is the
        // plain atan2 toward the player, so the aim error is 0).
        o.heading = Math.atan2(dx, dz);
        o.staged = true;
        if (i === 3) {
          o.setFallen(true);
          sys._placeLightPool(pos);
          sys._placeDroppedPistol(pos);
        } else if (o.fallen) {
          o.setFallen(false);
        }
      });
      return officers;
    },

    _placeLightPool(pos) {
      if (sys._lightPool && scene) scene.remove(sys._lightPool);
      if (sys._lightPoolHalo && scene) scene.remove(sys._lightPoolHalo);
      // Annulus: bright ring, dark hole over the body (contrast >= 35).
      // Warmer + softer than the blown-white 4.0 ring (it read as a
      // painted road marking), plus a faint outer halo so the edge falls
      // off like light instead of ending like paint.
      // MeshLambertMaterial (NOT Basic): the pool needs a real emissive
      // uniform — Basic has none, so setting .emissive threw on first
      // render (refreshUniformsCommon: uniforms.emissive undefined).
      const pool = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 4.5, 32),
        new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xffd9a0, emissiveIntensity: 2.6, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
      );
      pool.name = 'fallen light pool';
      pool.userData.kind = 'lightPool';
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(pos.x, 0.12, pos.z);
      sys._lightPool = pool;
      if (scene) scene.add(pool);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(4.5, 6.5, 32),
        new THREE.MeshLambertMaterial({ color: 0xffd9a0, emissive: 0xffd9a0, emissiveIntensity: 1.2, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      halo.name = 'fallen light pool halo';
      halo.userData.kind = 'lightPool';
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(pos.x, 0.11, pos.z);
      sys._lightPoolHalo = halo;
      if (scene) scene.add(halo);
      return pool;
    },

    _placeDroppedPistol(pos) {
      if (sys._droppedPistol && scene) scene.remove(sys._droppedPistol);
      // Officer-pistol geometry (0.09 x 0.14 x 0.42): the 7th pistol.
      const pistol = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.14, 0.42),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
      );
      pistol.name = 'dropped pistol';
      pistol.userData.kind = 'pistol';
      pistol.rotation.x = Math.PI / 2;
      pistol.position.set(pos.x + 0.5, 0.5, pos.z + 0.3);
      sys._droppedPistol = pistol;
      if (scene) scene.add(pistol);
      return pistol;
    },

    getAimOfficer() {
      if (!police || !player) return null;
      const pp = player.mesh ? player.mesh.position : player.position;
      let best = null;
      let bestD = Infinity;
      for (const o of police.getOfficers()) {
        if (o.fallen) continue;
        const d = Math.hypot(o.mesh.position.x - pp.x, o.mesh.position.z - pp.z);
        if (d < bestD) { bestD = d; best = o; }
      }
      if (!best) return null;
      const dx = best.mesh.position.x - pp.x;
      const dz = best.mesh.position.z - pp.z;
      const wantH = Math.atan2(dx, -dz);
      const h = player.heading !== undefined ? player.heading : 0;
      let err = wantH - h;
      while (err > Math.PI) err -= Math.PI * 2;
      while (err < -Math.PI) err += Math.PI * 2;
      return { officer: best, distance: bestD, headingError: Math.abs(err) };
    },

    fire() {
      if (!player) return false;
      const pp = player.mesh ? player.mesh.position : player.position;
      const h = player.heading !== undefined ? player.heading : 0;
      const f = sys._forward(h);
      const mx = pp.x + f.x * 0.7;
      const mz = pp.z + f.z * 0.7;
      muzzle.position.set(mx, 1.35, mz);
      muzzle.rotation.y = h;
      sys.muzzleVisible = true;
      sys._muzzleTimer = sys._muzzleFrozen ? 999 : 0.07;
      const aim = sys.getAimOfficer();
      if (aim) {
        const d = aim.distance;
        tracer.visible = true;
        tracerMat.opacity = 0.45;
        // Short streak from the muzzle (45% of the way to the officer),
        // not a bar across the whole frame.
        tracer.position.set(pp.x + f.x * (d * 0.225), 1.3, pp.z + f.z * (d * 0.225));
        tracer.scale.z = d * 0.45;
        tracer.rotation.y = h;
      }
      return true;
    },

    stageShot(shotId, pl) {
      if (shotId !== 'combat') return false;
      const p = pl || player;
      sys.arrangeCombatOfficers(p);
      sys._staged = true;
      // Freeze the muzzle flash at Rico's muzzle (timer 999 = stays on).
      sys._muzzleFrozen = true;
      sys.fire();
      sys._muzzleTimer = 999;
      sys.muzzleVisible = true;
      return true;
    },

    update(dt = 1 / 60) {
      if (sys._muzzleTimer > 0 && !sys._muzzleFrozen) {
        sys._muzzleTimer -= dt;
        if (sys._muzzleTimer <= 0) {
          sys.muzzleVisible = false;
          tracer.visible = false;
          tracerMat.opacity = 0;
        }
      }
      if (tracer.visible && !sys._muzzleFrozen) {
        tracerMat.opacity = Math.max(0, tracerMat.opacity - dt * 6);
        if (tracerMat.opacity <= 0) tracer.visible = false;
      }
    },
  };
  return sys;
}
