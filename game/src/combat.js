import * as THREE from '../vendor/three.module.min.js';

// combat.js — aiming, firing, muzzle flash, officer clusters, fallen officer.
// createCombatSystem takes an OBJECT arg {scene, player, police, rng}.
// The fallen officer's light pool is a RingGeometry ANNULUS (inner 1.2 m,
// outer 4.5 m), emissive 0xffeebb at intensity 4.0, y 0.12: the dark hole
// over the body is what keeps the body-vs-pool contrast >= 35. A solid
// disc or a PointLight FAILS (the bright pool under the body pollutes the
// 4x4 body box and the contrast goes negative).

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

export function makeLightPool() {
  const pool = new THREE.Mesh(
    new THREE.RingGeometry(1.2, 4.5, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffeebb, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    }),
  );
  pool.material.emissive = new THREE.Color(0xffeebb);
  pool.material.emissiveIntensity = 4.0;
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.12;
  pool.name = 'lightPool';
  pool.userData.kind = 'lightPool';
  return pool;
}

export function createCombatSystem(ctx = {}) {
  const scene = ctx.scene || null;
  const player = ctx.player || null;
  const police = ctx.police || null;
  const rng = toCallableRng(ctx.rng);

  // Muzzle flash mesh (created once, shown on fire / frozen in staging).
  const muzzle = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 0.7, 8),
    new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.95 }),
  );
  muzzle.rotation.x = Math.PI / 2;
  muzzle.name = 'muzzleFlash';
  muzzle.userData.kind = 'muzzleFlash';
  muzzle.visible = false;
  if (scene) scene.add(muzzle);

  const state = {
    muzzleTimer: 0,
    _muzzleVisible: false,
    lightPool: null,
    tracers: [],
    staged: false,
  };

  function officerPos(officer) {
    return officer.position;
  }

  // Arrange the 7 staged officers around the player's FINAL spot.
  // Officer 0 = aim officer at 7.4 m (nearest, crosshair target).
  // Officer 3 = fallen prone in the gap between clusters, light pool under.
  // 7th officer = 8 m forward, lateral -3.7 (right cluster).
  function arrangeCombatOfficers(officers, anchorPlayer) {
    const p = anchorPlayer || player;
    if (!p || !officers || officers.length < 7) return false;
    const px = p.position.x;
    const pz = p.position.z;
    const h = p.heading || 0;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    const rx = Math.cos(h);
    const rz = -Math.sin(h);
    const at = (fwd, lat) => ({
      x: px + fx * fwd + rx * lat,
      z: pz + fz * fwd + rz * lat,
    });
    // Two clusters: left (advancing) and right (covering), gap in the middle.
    const spots = [
      at(7.4, 0.4),    // 0: aim officer, nearest, dead ahead
      at(9.2, -4.6),   // 1: left cluster
      at(10.5, 3.8),   // 2: right cluster
      at(6.55, -0.6),  // 3: FALLEN, prone in the gap (feet.x must land 969-980; 6.7 gave 980)
      at(11.8, -2.2),  // 4: left cluster rear
      at(12.6, 4.4),   // 5: right cluster rear
      at(8.0, -3.7),   // 6: 7th officer, right cluster, 8 m fwd lateral -3.7
    ];
    for (let i = 0; i < 7; i += 1) {
      const o = officers[i];
      const s = spots[i];
      const dx = px - s.x;
      const dz = pz - s.z;
      const faceHeading = Math.atan2(dx, dz);
      o.setPosition(s.x, s.z, faceHeading);
      o.staged = true;
      if (i === 3) {
        o.setFallen(true);
        // Fallen pistol dropped beside him, y ~0.5.
        o.pistol.position.set(0.5, 0.5, 0.6);
        o.pistol.rotation.z = Math.PI / 2;
      } else {
        o.setFallen(false);
      }
    }
    // Light pool annulus under the fallen officer (officer 3).
    if (state.lightPool && scene) scene.remove(state.lightPool);
    const pool = makeLightPool();
    const fallen = officers[3];
    pool.position.set(fallen.position.x, 0.12, fallen.position.z);
    state.lightPool = pool;
    if (scene) scene.add(pool);
    return true;
  }

  function aimOfficer() {
    if (!police || !player) return null;
    const officers = police.getOfficers().filter((o) => !o.fallen);
    let best = null;
    let bestD = Infinity;
    for (const o of officers) {
      const d = Math.hypot(o.position.x - player.position.x, o.position.z - player.position.z);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best ? { officer: best, distance: bestD } : null;
  }

  function fire() {
    if (!player) return false;
    const muzzlePos = new THREE.Vector3(
      player.position.x + Math.sin(player.heading) * 0.6,
      1.05,
      player.position.z + Math.cos(player.heading) * 0.6,
    );
    muzzle.position.copy(muzzlePos);
    muzzle.rotation.y = player.heading + Math.PI;
    muzzle.visible = true;
    state._muzzleVisible = true;
    state.muzzleTimer = 0.12;
    // Tracer line from muzzle toward the aim officer.
    const aim = aimOfficer();
    if (aim && scene) {
      const to = aim.officer.position.clone();
      to.y = 1.2;
      const geo = new THREE.BufferGeometry().setFromPoints([muzzlePos.clone(), to]);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.8 }));
      line.name = 'tracer';
      line.userData.kind = 'tracer';
      scene.add(line);
      state.tracers.push({ line, timer: 0.12 });
    }
    return true;
  }

  function stageShot(shotId, anchorPlayer) {
    if (shotId !== 'combat') return false;
    const p = anchorPlayer || player;
    const officers = police ? police.getOfficers() : [];
    arrangeCombatOfficers(officers, p);
    // Freeze the muzzle flash at Rico's muzzle (timer 999 = held).
    if (p) {
      muzzle.position.set(
        p.position.x + Math.sin(p.heading) * 0.6,
        1.05,
        p.position.z + Math.cos(p.heading) * 0.6,
      );
      muzzle.rotation.y = p.heading + Math.PI;
    }
    muzzle.visible = true;
    state._muzzleVisible = true;
    state.muzzleTimer = 999;
    state.staged = true;
    return true;
  }

  const system = {
    scene,
    player,
    police,
    get muzzleVisible() { return state._muzzleVisible; },
    set muzzleVisible(v) {
      state._muzzleVisible = !!v;
      muzzle.visible = !!v;
      if (v) state.muzzleTimer = Math.max(state.muzzleTimer, 0.12);
    },
    get ricoPistol() { return player ? player.pistol : null; },
    set ricoPistol(v) { /* harness read path; assignment is a no-op */ },
    get lightPool() { return state.lightPool; },
    makeLightPool,
    arrangeCombatOfficers,
    aimOfficer,
    fire,
    stageShot,
    update(dt = 1 / 60) {
      if (state.muzzleTimer !== 999) {
        state.muzzleTimer -= dt;
        if (state.muzzleTimer <= 0 && muzzle.visible) {
          muzzle.visible = false;
          state._muzzleVisible = false;
        }
      }
      for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
        const t = state.tracers[i];
        t.timer -= dt;
        if (t.timer <= 0) {
          if (scene) scene.remove(t.line);
          state.tracers.splice(i, 1);
        }
      }
    },
  };
  return system;
}
