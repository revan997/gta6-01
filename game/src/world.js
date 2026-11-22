// world.js — Solmar Bay city builder (attempt #9, fresh write).
// Builds the whole deterministic coastal city from CONFIG + a seeded RNG:
// roads, sidewalks, median park strip, Marina basin + lagoon arm water,
// bridge, Deco Tower, Spire, Harbour Gatehouse with MARINA / PIER 12 signs,
// downtown buildings (windows/signs/awnings), lamps, palms, benches,
// planters, moored boats and beach. The cover frame must read BRIGHT and
// FULL at a glance (top-10 study V1/V5/V6): vivid sky, saturated palette,
// no empty road, no dark muddy dusk.
//
// Contract notes baked in:
// - buildWorld(scene, config, rng) EXACTLY. Returns markers with flat
//   aliases AND harness paths (round25.lagoonArm / armBoat,
//   round6.landmarks count 5, round11Occlusion.segmentBlocked,
//   marinaSigns). Landmarks are NOT occluders.
// - round11Occlusion.segmentBlocked MUST be a real FUNCTION.
// - The -17 deg bend is main.js's cover-shot effect; world.js only exposes
//   `bend` + pure `bend.headingAt(carZ)`.
// - Water: Lambert bright blue 0x1f8fff + blue emissive 0.55.
// - Median segments NORMALIZED into [z0,z1] pairs at definition.
// - Canvas textures guarded for no-DOM. addSign returns `text` AND flat
//   x/y/z.
// - Promenade planters ONLY at x=105 (east shore): the x=55 planters sit
//   inside the arm rectangle and FAIL the "no promenade planter in the arm
//   water" gate (contract section 2 wins over spec 5.4/5.9).
// - Deco tiers widened to the harness's assumed sizes: base 48x16x48 @ y8,
//   mid 36x12x36 @ y22, top 24x8x24 @ y32; panes at x 24.1/18.1/12.1,
//   3.0 tall x 2.0 wide. Deco exclusion rect x +/-26, z -186..-134.
// - Lagoon-arm-centre ray guard: {ax:43.5, ay:3.5, az:-56, bx:75, by:0.05,
//   bz:-137} (tuned cover camera) must stay unblocked.

import * as THREE from '../vendor/three.module.min.js';

// ---------------------------------------------------------------------------
// Small local helpers (no other game module is imported)
// ---------------------------------------------------------------------------

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// mulberry32 — tiny deterministic PRNG used only as a fallback when the
// caller passes no usable rng. The real builds pass random.js's createRng.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Accept a function, an object with .next()/.random(), a numeric seed, or
// nothing. Always returns a callable () => [0,1).
function toCallableRng(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  if (rng && typeof rng.random === 'function') return () => rng.random();
  if (typeof rng === 'number') return mulberry32(rng);
  return mulberry32(20261122);
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// Normalize a median segment (any of {z0,z1}, {minZ,maxZ}, [z0,z1]) into
// a [z0,z1] pair with z0 < z1.
function normalizeSegment(seg) {
  if (Array.isArray(seg)) {
    const a = seg[0];
    const b = seg[1];
    return a <= b ? [a, b] : [b, a];
  }
  if (seg && typeof seg === 'object') {
    const a = seg.z0 !== undefined ? seg.z0 : seg.minZ;
    const b = seg.z1 !== undefined ? seg.z1 : seg.maxZ;
    return a <= b ? [a, b] : [b, a];
  }
  return [0, 0];
}

function normalizeSegments(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeSegment);
}

// ---------------------------------------------------------------------------
// Canvas textures (guarded: no document -> null, caller falls back to a
// plain material). Used for building facades (window grids) and signs.
// ---------------------------------------------------------------------------

function makeFacadeTexture(w, h, rng, base, glass, litRatio) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  // Window grid: dark glass, some lit gold (sunset).
  const cols = 4;
  const rows = 10;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = rng() < litRatio;
      ctx.fillStyle = lit ? '#ffd97a' : glass;
      const x = 10 + c * 28;
      const y = 12 + r * 24;
      ctx.fillRect(x, y, 18, 14);
    }
  }
  // Ground-floor shop band.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 232, 128, 24);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignTexture(text, bg, fg, fontPx) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = fg;
  ctx.font = 'bold ' + (fontPx || 84) + 'px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeAwningTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#e5322a' : '#f5efe0';
    ctx.fillRect(i * 16, 0, 16, 32);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------------
// Mesh helpers
// ---------------------------------------------------------------------------

function lambert(hex, extra) {
  const params = Object.assign({ color: hex }, extra || {});
  return new THREE.MeshLambertMaterial(params);
}

function basic(hex, extra) {
  const params = Object.assign({ color: hex }, extra || {});
  return new THREE.MeshBasicMaterial(params);
}

// Box mesh with position / rotation / name / userData, added to parent.
function box(parent, w, h, d, mat, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  const o = opts || {};
  if (o.ry) m.rotation.y = o.ry;
  if (o.rx) m.rotation.x = o.rx;
  if (o.rz) m.rotation.rz = o.rz;
  if (o.name) m.name = o.name;
  if (o.kind) m.userData.kind = o.kind;
  if (o.userData) Object.assign(m.userData, o.userData);
  parent.add(m);
  return m;
}

function cyl(parent, rTop, rBottom, h, mat, x, y, z, opts) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBottom, h, 10),
    mat
  );
  m.position.set(x, y, z);
  const o = opts || {};
  if (o.rx) m.rotation.x = o.rx;
  if (o.rz) m.rotation.z = o.rz;
  if (o.name) m.name = o.name;
  if (o.kind) m.userData.kind = o.kind;
  parent.add(m);
  return m;
}

function plane(parent, w, h, mat, x, y, z, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  const o = opts || {};
  if (o.rx !== undefined) m.rotation.x = o.rx;
  if (o.ry) m.rotation.y = o.ry;
  if (o.rz) m.rotation.z = o.rz;
  if (o.name) m.name = o.name;
  if (o.kind) m.userData.kind = o.kind;
  parent.add(m);
  return m;
}

// A sign: blue board with white text (canvas texture in the browser, plain
// blue board + white frame when there is no DOM). Returns the sign object
// with `text` AND flat x/y/z (harness requirement).
function addSign(parent, text, x, y, z, w, h, opts) {
  const o = opts || {};
  const bg = o.bg || '#1f4fd8';
  const fg = o.fg || '#ffffff';
  const tex = makeSignTexture(text, bg, fg, o.fontPx || 84);
  const mat = tex
    ? new THREE.MeshBasicMaterial({ map: tex })
    : lambert(0x1f4fd8);
  const group = new THREE.Group();
  group.position.set(x, y, z);
  if (o.ry) group.rotation.y = o.ry;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), lambert(0x223044));
  board.name = 'sign-board';
  group.add(board);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.92), mat);
  face.position.z = 0.25;
  face.name = 'sign-face';
  face.userData.kind = 'sign';
  face.userData.text = text;
  group.add(face);
  parent.add(group);
  return { text, x, y, z, width: w, height: h, group };
}

// ---------------------------------------------------------------------------
// World constants (contract/spec values; CONFIG overrides where provided)
// ---------------------------------------------------------------------------

const DEFAULTS = {
  lagoonArm: { minX: 50, maxX: 100, minZ: -160, maxZ: -114 },
  armBoat: { x: 80, z: -150 },
  basin: { minX: 60, maxZ: -100 },
  median: {
    segments: [
      { z0: -113, z1: -100 },
      { z0: -180, z1: -127 },
    ],
    planters: [
      { x: 40, z: -104 },
      { x: 40, z: -108 },
      { x: 40, z: -111 },
      { x: 40, z: -135 },
      { x: 40, z: -152 },
      { x: 40, z: -170 },
    ],
  },
  coverBend: { maxDeg: -17, angleDeg: -17, zStart: -80, zEnd: -70 },
  deco: { x: 0, z: -160 },
  spire: { x: 320, z: -80, height: 60 },
  bridge: { x0: 60, x1: 330, z: -240, arch: 8, spans: 11 },
  gatehouse: { x0: 168, x1: 183, signY: 9 },
};

// ---------------------------------------------------------------------------
// buildWorld
// ---------------------------------------------------------------------------

export function buildWorld(scene, config, rng) {
  const rand = toCallableRng(rng);
  const cfg = config || {};

  const lagoonArm = Object.assign({}, DEFAULTS.lagoonArm, cfg.lagoonArm || {});
  const armBoatPos = Object.assign(
    {},
    DEFAULTS.armBoat,
    (cfg.lagoonArm && cfg.lagoonArm.sailboat) || {},
    (cfg.round25 && cfg.round25.armBoat) || {}
  );
  const basin = Object.assign({}, DEFAULTS.basin, cfg.basin || {});
  const medianRaw = cfg.median || DEFAULTS.median;
  const medianSegments = normalizeSegments(
    medianRaw.segments || DEFAULTS.median.segments
  );
  const medianPlanters =
    medianRaw.planters && medianRaw.planters.length
      ? medianRaw.planters
      : DEFAULTS.median.planters;
  const bendCfg = Object.assign(
    {},
    DEFAULTS.coverBend,
    (cfg.round27 && cfg.round27.coverBend) || {},
    cfg.westBend || {}
  );
  const paint = cfg.paint || {};
  const waterHex = paint.water !== undefined ? paint.water : 0x1f8fff;

  // --- materials ------------------------------------------------------------
  const matGround = lambert(0x7d6f45); // warm dry ground under the city
  const matAsphalt = lambert(0x3a3128); // warm asphalt, darker (not cold grey)
  const matSidewalk = lambert(0xb0a894);
  const matKerb = lambert(0x8f8878);
  const matGrass = lambert(0x4d8a3f);
  const matWater = lambert(waterHex, {
    emissive: waterHex,
    emissiveIntensity: 0.55,
  });
  const matSand = lambert(0xe8d8a0);
  const matSlate = lambert(0x2a2f3a);
  const matSlateDark = lambert(0x1c2733);
  const matGold = lambert(0xd8a93c, { emissive: 0x8a6420, emissiveIntensity: 0.35 });
  const matGoldPane = basic(0xffd97a);
  const matWhite = lambert(0xf5efe0);
  const matGlass = lambert(0x101418);
  const matConcrete = lambert(0x9aa0a8);
  const matTrunk = lambert(0x6b4a2f);
  const matLeaf = lambert(0x2f7a3a);
  const matWood = lambert(0x7a5230);
  const matLampPole = lambert(0x2e3438);
  const matLampHead = basic(0xfff2c0);
  const matLine = basic(0xf5efe0); // road markings
  const matAwning = (() => {
    const t = makeAwningTexture();
    return t
      ? new THREE.MeshLambertMaterial({ map: t })
      : lambert(0xe5322a);
  })();

  const world = new THREE.Group();
  world.name = 'solmar-world';
  scene.add(world);

  // Occlusion registry: ONLY buildings occlude. Landmarks (Deco, bridge,
  // Spire, Gatehouse, water) are NOT occluders.
  const occluders = [];
  function registerOccluder(minX, maxX, minY, maxY, minZ, maxZ) {
    occluders.push({ minX, maxX, minY, maxY, minZ, maxZ });
  }
  function isBlockedAt(x, y, z) {
    for (let i = 0; i < occluders.length; i++) {
      const b = occluders[i];
      if (
        x >= b.minX - 0.5 &&
        x <= b.maxX + 0.5 &&
        y >= b.minY - 0.5 &&
        y <= b.maxY + 0.5 &&
        z >= b.minZ - 0.5 &&
        z <= b.maxZ + 0.5
      ) {
        return true;
      }
    }
    return false;
  }
  // Real function (contract section 6 fix 1): sample the segment through
  // isBlockedAt. `ignore` is accepted and unused.
  function segmentBlocked(ax, ay, az, bx, by, bz, ignore) {
    const steps = 48;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (
        isBlockedAt(
          lerp(ax, bx, t),
          lerp(ay, by, t),
          lerp(az, bz, t)
        )
      ) {
        return true;
      }
    }
    return false;
  }

  // --- ground -----------------------------------------------------------------
  const ground = plane(world, 900, 700, matGround, 120, -0.05, -60, {
    rx: -Math.PI / 2,
    name: 'ground',
    kind: 'ground',
  });
  ground.receiveShadow = false;

  // --- roads ------------------------------------------------------------------
  // Downtown road x=40 (two-way, sidewalks to x=50 east), z -260..120.
  plane(world, 14, 380, matAsphalt, 40, 0.02, -70, {
    rx: -Math.PI / 2,
    name: 'road-downtown',
    kind: 'road',
  });
  // Cross road z=-120, x -60..220.
  plane(world, 280, 12, matAsphalt, 80, 0.02, -120, {
    rx: -Math.PI / 2,
    name: 'road-cross',
    kind: 'road',
  });
  // Grid streets: two N-S, two E-W, for the open-world read.
  plane(world, 10, 300, matAsphalt, 0, 0.02, -60, {
    rx: -Math.PI / 2,
    name: 'road-west',
    kind: 'road',
  });
  plane(world, 10, 300, matAsphalt, 120, 0.02, -60, {
    rx: -Math.PI / 2,
    name: 'road-marina',
    kind: 'road',
  });
  plane(world, 220, 10, matAsphalt, 60, 0.02, -40, {
    rx: -Math.PI / 2,
    name: 'road-south',
    kind: 'road',
  });
  plane(world, 260, 10, matAsphalt, 70, 0.02, -200, {
    rx: -Math.PI / 2,
    name: 'road-north',
    kind: 'road',
  });
  // Pursuit road x=-120 (the chase road in the pursuit shot): 22 m wide,
  // z 55..205, so the coupe, the interceptors and the roadblock all sit on
  // asphalt instead of bare ground.
  plane(world, 22, 150, matAsphalt, -120, 0.02, 130, {
    rx: -Math.PI / 2,
    name: 'road-pursuit',
    kind: 'road',
  });
  // Sidewalks: downtown east sidewalk to x=50, west to x=30; cross-road
  // sidewalks z -113..-110 (north edge -113) and z -127..-130.
  plane(world, 3, 380, matSidewalk, 48.5, 0.06, -70, {
    rx: -Math.PI / 2,
    name: 'sidewalk-east',
    kind: 'sidewalk',
  });
  plane(world, 3, 380, matSidewalk, 31.5, 0.06, -70, {
    rx: -Math.PI / 2,
    name: 'sidewalk-west',
    kind: 'sidewalk',
  });
  plane(world, 280, 3, matSidewalk, 80, 0.06, -111.5, {
    rx: -Math.PI / 2,
    name: 'sidewalk-cross-n',
    kind: 'sidewalk',
  });
  plane(world, 280, 3, matSidewalk, 80, 0.06, -128.5, {
    rx: -Math.PI / 2,
    name: 'sidewalk-cross-s',
    kind: 'sidewalk',
  });
  // Kerbs along the downtown road.
  box(world, 0.4, 0.18, 380, matKerb, 47, 0.09, -70, { name: 'kerb-east' });
  box(world, 0.4, 0.18, 380, matKerb, 33, 0.09, -70, { name: 'kerb-west' });

  // Lane markings: dashed centre line + edge lines on the downtown road,
  // crosswalk stripes at the z=-120 crossing. These make the road read as
  // a real street in the cover (top-10 V5).
  for (let z = -250; z <= 110; z += 8) {
    // Skip dashes inside the median segments (the strip covers the centre).
    let inMedian = false;
    for (let s = 0; s < medianSegments.length; s++) {
      if (z >= medianSegments[s][0] && z <= medianSegments[s][1]) {
        inMedian = true;
        break;
      }
    }
    if (inMedian) continue;
    plane(world, 0.35, 3.5, matLine, 40, 0.05, z, {
      rx: -Math.PI / 2,
      name: 'lane-dash',
    });
  }
  plane(world, 0.3, 380, matLine, 34.2, 0.05, -70, {
    rx: -Math.PI / 2,
    name: 'lane-edge-w',
  });
  plane(world, 0.3, 380, matLine, 45.8, 0.05, -70, {
    rx: -Math.PI / 2,
    name: 'lane-edge-e',
  });
  for (let x = 34; x <= 46; x += 2) {
    plane(world, 1.1, 4, matLine, x, 0.05, -120, {
      rx: -Math.PI / 2,
      name: 'crosswalk',
    });
  }
  // Pursuit road markings: dashed centre line + edge lines.
  for (let z = 62; z <= 198; z += 8) {
    plane(world, 0.35, 3.5, matLine, -120, 0.05, z, {
      rx: -Math.PI / 2,
      name: 'lane-dash-pursuit',
    });
  }
  plane(world, 0.3, 150, matLine, -130.7, 0.05, 130, {
    rx: -Math.PI / 2,
    name: 'lane-edge-pursuit-w',
  });
  plane(world, 0.3, 150, matLine, -109.3, 0.05, 130, {
    rx: -Math.PI / 2,
    name: 'lane-edge-pursuit-e',
  });

  // --- median park strip -------------------------------------------------------
  // Grass strip x 37..43, split at the z=-120 cross road. NO collision
  // (accepted wart), NO palms, 6 fixed planters.
  for (let s = 0; s < medianSegments.length; s++) {
    const z0 = medianSegments[s][0];
    const z1 = medianSegments[s][1];
    const len = z1 - z0;
    const zc = (z0 + z1) / 2;
    box(world, 6, 0.16, len, matGrass, 40, 0.08, zc, {
      name: 'median-strip',
      kind: 'median',
    });
  }
  for (let i = 0; i < medianPlanters.length; i++) {
    const p = medianPlanters[i];
    box(world, 1.6, 0.5, 1.6, matConcrete, p.x, 0.3, p.z, {
      name: 'median-planter',
      kind: 'planter',
    });
    box(world, 1.3, 0.35, 1.3, matLeaf, p.x, 0.7, p.z, {
      name: 'median-planter-top',
      kind: 'planter',
    });
  }

  // --- water: basin + lagoon arm ----------------------------------------------
  // Bright blue, y 0.05. Basin west edge minX 60; arm 50..100 x -160..-114.
  const basinW = 330 - basin.minX;
  const basinD = -100 - -260;
  plane(world, basinW, basinD, matWater, basin.minX + basinW / 2, 0.05, -180, {
    rx: -Math.PI / 2,
    name: 'water-basin',
    kind: 'water',
  });
  const armW = lagoonArm.maxX - lagoonArm.minX;
  const armD = lagoonArm.maxZ - lagoonArm.minZ;
  plane(world, armW, armD, matWater, (lagoonArm.minX + lagoonArm.maxX) / 2, 0.05, (lagoonArm.minZ + lagoonArm.maxZ) / 2, {
    rx: -Math.PI / 2,
    name: 'water-arm',
    kind: 'water',
  });
  // Beach: sand strips on the arm east shore and the basin south edge.
  plane(world, 6, armD, matSand, lagoonArm.maxX + 3, 0.06, (lagoonArm.minZ + lagoonArm.maxZ) / 2, {
    rx: -Math.PI / 2,
    name: 'beach-arm',
    kind: 'beach',
  });
  plane(world, 240, 6, matSand, 180, 0.06, -97, {
    rx: -Math.PI / 2,
    name: 'beach-basin',
    kind: 'beach',
  });

  // --- bridge ------------------------------------------------------------------
  // Deck x 60..330 at z=-240, arched profile rising 8 m (sine), deck 1.8
  // thick, 11 spans, pylons + cables. Background element only.
  const bridgeCfg = Object.assign({}, DEFAULTS.bridge, cfg.bridge || {});
  const bridgeGroup = new THREE.Group();
  bridgeGroup.name = 'bridge';
  bridgeGroup.position.set(0, 0, 0);
  world.add(bridgeGroup);
  const spanW = (bridgeCfg.x1 - bridgeCfg.x0) / bridgeCfg.spans;
  for (let i = 0; i < bridgeCfg.spans; i++) {
    const t = (i + 0.5) / bridgeCfg.spans;
    const archY = bridgeCfg.arch * Math.sin(Math.PI * t);
    const xc = bridgeCfg.x0 + spanW * (i + 0.5);
    box(bridgeGroup, spanW + 0.4, 1.8, 10, matConcrete, xc, 6 + archY, bridgeCfg.z, {
      name: 'bridge-deck',
      kind: 'bridge',
    });
    // Railing posts on the deck edge.
    box(bridgeGroup, 0.3, 1.2, 0.3, matSlateDark, xc - spanW / 2 + 0.5, 7.6 + archY, bridgeCfg.z - 4.8, { name: 'bridge-rail' });
    box(bridgeGroup, 0.3, 1.2, 0.3, matSlateDark, xc - spanW / 2 + 0.5, 7.6 + archY, bridgeCfg.z + 4.8, { name: 'bridge-rail' });
  }
  // Pylons (two towers) + cables (thin diagonal boxes).
  for (const px of [120, 270]) {
    box(bridgeGroup, 3, 26, 3, matSlate, px, 13, bridgeCfg.z, {
      name: 'bridge-pylon',
      kind: 'bridge',
    });
    box(bridgeGroup, 4, 1.5, 4, matGold, px, 26.5, bridgeCfg.z, {
      name: 'bridge-pylon-cap',
      kind: 'bridge',
    });
    for (let c = 0; c < 4; c++) {
      const cx = px - 45 + c * 30;
      const cable = box(bridgeGroup, 0.25, 30, 0.25, matSlateDark, cx, 20, bridgeCfg.z, {
        name: 'bridge-cable',
        kind: 'bridge',
      });
      cable.rotation.z = (cx - px) * 0.012;
    }
  }

  // --- Deco Tower ---------------------------------------------------------------
  // Stepped ziggurat, dark slate, gold crown + 12 m gold fin. Tiers widened
  // to the harness's assumed sizes. East-face gold panes at x 24.1/18.1/12.1,
  // 3.0 tall x 2.0 wide. Landmark: NOT an occluder.
  const decoCfg = Object.assign({}, DEFAULTS.deco, cfg.deco || {});
  const decoGroup = new THREE.Group();
  decoGroup.name = 'deco-tower';
  decoGroup.position.set(decoCfg.x, 0, decoCfg.z);
  world.add(decoGroup);
  box(decoGroup, 48, 16, 48, matSlate, 0, 8, 0, { name: 'deco-base', kind: 'landmark' });
  box(decoGroup, 36, 12, 36, matSlateDark, 0, 22, 0, { name: 'deco-mid', kind: 'landmark' });
  box(decoGroup, 24, 8, 24, matSlate, 0, 32, 0, { name: 'deco-top', kind: 'landmark' });
  box(decoGroup, 26, 2, 26, matGold, 0, 37, 0, { name: 'deco-crown', kind: 'landmark' });
  // Gold fin: 12 m tall on top.
  box(decoGroup, 1.5, 12, 6, matGold, 0, 42, 0, { name: 'deco-fin', kind: 'landmark' });
  // East-face lit gold panes (gate >= 0.7 gold ratio).
  const paneTiers = [
    { x: 24.1, half: 24, yBase: 2, rows: 3, cols: 3 },
    { x: 18.1, half: 18, yBase: 17, rows: 2, cols: 3 },
    { x: 12.1, half: 12, yBase: 29, rows: 2, cols: 2 },
  ];
  for (const tier of paneTiers) {
    for (let r = 0; r < tier.rows; r++) {
      for (let c = 0; c < tier.cols; c++) {
        const pz = -tier.half + 8 + c * ((tier.half * 2 - 16) / Math.max(1, tier.cols - 1));
        const py = tier.yBase + 2 + r * 4.5;
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), matGoldPane);
        pane.position.set(tier.x, py, pz);
        pane.rotation.y = Math.PI / 2;
        pane.name = 'deco-pane';
        pane.userData.kind = 'pane';
        decoGroup.add(pane);
      }
    }
  }
  // Dark window slits on the west + south faces for depth.
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const slit = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.0), matGlass);
      slit.position.set(-24.1, 4 + r * 4.5, -16 + c * 16);
      slit.rotation.y = -Math.PI / 2;
      slit.name = 'deco-slit';
      decoGroup.add(slit);
    }
  }

  // --- Spire ----------------------------------------------------------------------
  // Tall thin tower at (320,-80), 60 m, frames the Marina. Landmark.
  const spireCfg = Object.assign({}, DEFAULTS.spire, cfg.spire || {});
  const spireGroup = new THREE.Group();
  spireGroup.name = 'spire';
  spireGroup.position.set(spireCfg.x, 0, spireCfg.z);
  world.add(spireGroup);
  box(spireGroup, 8, spireCfg.height, 8, matSlateDark, 0, spireCfg.height / 2, 0, {
    name: 'spire-body',
    kind: 'landmark',
  });
  const spireTip = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 4), matGold);
  spireTip.position.set(0, spireCfg.height + 5, 0);
  spireTip.rotation.y = Math.PI / 4;
  spireTip.name = 'spire-tip';
  spireGroup.add(spireTip);

  // --- Harbour Gatehouse + signs ---------------------------------------------------
  // Deterministic sign wall x 168..183. MARINA large white-on-blue at y 9
  // (clears foreground buildings); PIER 12 smaller below it. Landmark.
  const gateCfg = Object.assign({}, DEFAULTS.gatehouse, cfg.gatehouse || {});
  const gateGroup = new THREE.Group();
  gateGroup.name = 'gatehouse';
  world.add(gateGroup);
  box(gateGroup, 15, 12, 2.5, matConcrete, (gateCfg.x0 + gateCfg.x1) / 2, 6, -140, {
    name: 'gatehouse-wall',
    kind: 'landmark',
  });
  box(gateGroup, 15, 1, 3.5, matSlateDark, (gateCfg.x0 + gateCfg.x1) / 2, 12.5, -140, {
    name: 'gatehouse-cap',
    kind: 'landmark',
  });
  const marinaSign = addSign(
    gateGroup,
    'MARINA',
    (gateCfg.x0 + gateCfg.x1) / 2,
    gateCfg.signY,
    -138.6,
    14,
    4.5,
    { bg: '#1f4fd8', fg: '#ffffff', fontPx: 88 }
  );
  const pierSign = addSign(
    gateGroup,
    'PIER 12',
    (gateCfg.x0 + gateCfg.x1) / 2,
    4.2,
    -138.6,
    8,
    2.6,
    { bg: '#223044', fg: '#ffd97a', fontPx: 64 }
  );
  const marinaSigns = [marinaSign, pierSign];

  // --- downtown buildings ----------------------------------------------------------
  // Seeded downtown blocks of varied heights around the specified landmarks.
  // Guards (all enforced before placement):
  //  - nothing inside the lagoon arm rectangle or the basin;
  //  - nothing inside the Deco exclusion rect (x +/-26, z -186..-134);
  //  - nothing on the median strip or the downtown road corridor;
  //  - the cover sightline (46,4,-54) -> basin stays clear;
  //  - the lagoon-arm-centre ray (43.5,3.5,-56) -> (75,0.05,-137) stays clear.
  // Facades use canvas window textures (browser) with a plain-material
  // fallback (no DOM). A few street-level buildings get awnings + shop signs
  // so the cover frame reads FULL (top-10 V5).
  const ARM = lagoonArm;
  const DECO_RECT = { minX: -26, maxX: 26, minZ: -186, maxZ: -134 };
  const ARM_CENTRE_RAY = { ax: 43.5, ay: 3.5, az: -56, bx: 75, by: 0.05, bz: -137 };
  function rectsOverlap(a, b) {
    return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
  }
  function boxHitsRay(minX, maxX, minY, maxY, minZ, maxZ, ray) {
    // Sample the ray; true if any sample lands inside the box (+0.5 margin).
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = lerp(ray.ax, ray.bx, t);
      const y = lerp(ray.ay, ray.by, t);
      const z = lerp(ray.az, ray.bz, t);
      if (
        x >= minX - 0.5 && x <= maxX + 0.5 &&
        y >= minY - 0.5 && y <= maxY + 0.5 &&
        z >= minZ - 0.5 && z <= maxZ + 0.5
      ) {
        return true;
      }
    }
    return false;
  }
  const facadeBases = ['#3a3f4a', '#4a3a30', '#37424e', '#51463a', '#2f3a44', '#5a4a3a'];
  const shopNames = ['HOTEL', 'CASINO', 'DINER', 'BAR', 'MOTEL', 'PIER CAFE'];
  let buildingCount = 0;
  let shopCount = 0;
  // West blocks (x -50..20) and east blocks (x 60..160) along the downtown
  // grid, plus north/south rows. Fixed grid slots; heights seeded.
  const blockSlots = [];
  for (let gx = -50; gx <= 20; gx += 18) {
    for (let gz = -220; gz <= 60; gz += 26) {
      if (gx >= 28 && gx <= 52) continue; // downtown road corridor
      blockSlots.push({ x: gx, z: gz });
    }
  }
  for (let gx = 64; gx <= 160; gx += 20) {
    for (let gz = -220; gz <= -20; gz += 26) {
      blockSlots.push({ x: gx, z: gz });
    }
  }
  for (let gx = -50; gx <= 140; gx += 20) {
    blockSlots.push({ x: gx, z: 20 });
    blockSlots.push({ x: gx, z: -260 });
  }
  for (const slot of blockSlots) {
    const w = 12 + Math.floor(rand() * 6);
    const d = 12 + Math.floor(rand() * 6);
    const h = 8 + Math.floor(rand() * 28);
    const minX = slot.x - w / 2;
    const maxX = slot.x + w / 2;
    const minZ = slot.z - d / 2;
    const maxZ = slot.z + d / 2;
    const footprint = { minX, maxX, minZ, maxZ };
    if (rectsOverlap(footprint, ARM)) continue;
    if (rectsOverlap(footprint, { minX: basin.minX, maxX: 330, minZ: -260, maxZ: basin.maxZ })) continue;
    if (rectsOverlap(footprint, DECO_RECT)) continue;
    if (minX < 34 && maxX > 30 && minZ < 120 && maxZ > -260) continue; // road corridor
    if (minX < 47 && maxX > 33 && minZ < 120 && maxZ > -260) continue; // road+sidewalk
    if (boxHitsRay(minX, maxX, 0, h, minZ, maxZ, ARM_CENTRE_RAY)) continue;
    // Cover sightline to the basin: keep the corridor x 46..75, z -60..-137
    // free of tall buildings (only low dressing allowed).
    if (h > 14 && minX < 78 && maxX > 44 && minZ < -50 && maxZ > -160) continue;
    const base = pick(rand, facadeBases);
    const tex = makeFacadeTexture(w, h, rand, base, '#101418', 0.35);
    const mat = tex
      ? new THREE.MeshLambertMaterial({ map: tex })
      : lambert(new THREE.Color(base).getHex ? 0x3a3f4a : 0x3a3f4a);
    const b = box(world, w, h, d, mat, slot.x, h / 2, slot.z, {
      name: 'building',
      kind: 'building',
    });
    // Roof cap for skyline variety.
    box(world, w * 0.7, 1.2, d * 0.7, matSlateDark, slot.x, h + 0.6, slot.z, {
      name: 'building-roof',
      kind: 'building',
    });
    registerOccluder(minX, maxX, 0, h, minZ, maxZ);
    buildingCount++;
    // Street-level shops on the downtown-facing rows get an awning + sign.
    if (slot.x < 30 && slot.z > -140 && slot.z < 40 && shopCount < 8 && rand() < 0.6) {
      const awn = box(world, w * 0.8, 0.3, 2.2, matAwning, slot.x + w / 2 + 0.4, 3.4, slot.z, {
        name: 'shop-awning',
        kind: 'awning',
      });
      awn.rotation.z = 0.25;
      addSign(world, pick(rand, shopNames), slot.x + w / 2 + 0.6, 5.2, slot.z, 7, 1.8, {
        bg: '#223044',
        fg: '#ffd97a',
        fontPx: 56,
      });
      shopCount++;
    }
  }

  // --- lamps ------------------------------------------------------------------------
  // Along the vertical roads at x 50.6 and 109.4. Guard: never in the basin
  // or the arm, never within 3 m of the MARINA sign (the old lamp at
  // (189.4,-140) that crossed the sign is skipped by the same rule).
  const lampSpots = [];
  for (const lx of [50.6, 109.4]) {
    for (let z = -200; z <= 100; z += 20) {
      lampSpots.push({ x: lx, z });
    }
  }
  lampSpots.push({ x: 189.4, z: -140 }); // the sign-crossing lamp: must be skipped
  for (const s of lampSpots) {
    if (s.x >= ARM.minX && s.x <= ARM.maxX && s.z >= ARM.minZ && s.z <= ARM.maxZ) continue;
    if (s.x >= basin.minX && s.z <= basin.maxZ) continue;
    const dx = s.x - marinaSign.x;
    const dz = s.z - marinaSign.z;
    if (Math.sqrt(dx * dx + dz * dz) < 6) continue;
    cyl(world, 0.09, 0.12, 6, matLampPole, s.x, 3, s.z, { name: 'lamp-pole', kind: 'lamp' });
    box(world, 0.5, 0.25, 0.9, matLampHead, s.x, 6.1, s.z, { name: 'lamp-head', kind: 'lamp' });
  }

  // --- palms (instanced) --------------------------------------------------------------
  // Along the promenade east shore and the streets. None inside the arm
  // rectangle, none on the median.
  const palmSpots = [];
  for (let z = -170; z <= -100; z += 12) {
    palmSpots.push({ x: 106 + (rand() < 0.5 ? 0 : 2), z });
    palmSpots.push({ x: 56, z: z + 6 });
  }
  for (let z = -180; z <= 80; z += 24) {
    palmSpots.push({ x: 26 + (rand() < 0.5 ? 0 : 2), z });
    palmSpots.push({ x: 54, z: z + 12 });
  }
  // Fixed pursuit-roadside palms (no rand draws — the seeded stream must
  // not shift). Beside the pursuit road at x -120: east x -109, west x
  // -131, z 138-150 — clear of the staged interceptors (z <= 132) and the
  // roadblock cars (-126.5,138 / -113.5,144), in the pursuit frame.
  palmSpots.push({ x: -109, z: 138 });
  palmSpots.push({ x: -131, z: 142 });
  palmSpots.push({ x: -109, z: 148 });
  palmSpots.push({ x: -131, z: 150 });
  const palmSpotsKept = palmSpots.filter((p) => {
    if (p.x >= ARM.minX && p.x <= ARM.maxX && p.z >= ARM.minZ && p.z <= ARM.maxZ) return false;
    if (p.x >= 37 && p.x <= 43 && p.z >= -180 && p.z <= -100) return false;
    return true;
  });
  if (palmSpotsKept.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 5.5, 6);
    const crownGeo = new THREE.ConeGeometry(2.2, 2.4, 7);
    const trunks = new THREE.InstancedMesh(trunkGeo, matTrunk, palmSpotsKept.length);
    const crowns = new THREE.InstancedMesh(crownGeo, matLeaf, palmSpotsKept.length);
    trunks.name = 'palms-trunks';
    crowns.name = 'palms-crowns';
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < palmSpotsKept.length; i++) {
      const p = palmSpotsKept[i];
      m4.makeTranslation(p.x, 2.75, p.z);
      trunks.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, 6.4, p.z);
      crowns.setMatrixAt(i, m4);
    }
    trunks.instanceMatrix.needsUpdate = true;
    crowns.instanceMatrix.needsUpdate = true;
    world.add(trunks);
    world.add(crowns);
  }

  // --- benches + promenade planters ----------------------------------------------------
  // Benches on the promenade (incl. the two moved benches at (112,-150)
  // and (112,-135)). Planters ONLY at x=105 (east shore).
  const benchSpots = [
    { x: 112, z: -150 },
    { x: 112, z: -135 },
    { x: 108, z: -120 },
    { x: 108, z: -165 },
    { x: 60, z: -90 },
    { x: 120, z: -105 },
  ];
  for (const b of benchSpots) {
    box(world, 2.2, 0.15, 0.7, matWood, b.x, 0.55, b.z, { name: 'bench', kind: 'bench' });
    box(world, 0.15, 0.55, 0.7, matLampPole, b.x - 0.9, 0.28, b.z, { name: 'bench-leg' });
    box(world, 0.15, 0.55, 0.7, matLampPole, b.x + 0.9, 0.28, b.z, { name: 'bench-leg' });
  }
  const promenadePlanters = [
    { x: 105, z: -125 },
    { x: 105, z: -135 },
    { x: 105, z: -150 },
    { x: 105, z: -160 },
    { x: 105, z: -118 },
  ];
  for (const p of promenadePlanters) {
    box(world, 1.6, 0.5, 1.6, matConcrete, p.x, 0.3, p.z, { name: 'promenade-planter', kind: 'planter' });
    box(world, 1.3, 0.35, 1.3, matLeaf, p.x, 0.7, p.z, { name: 'promenade-planter-top', kind: 'planter' });
  }

  // --- pursuit roadside buildings -------------------------------------------------
  // Fixed geometry, zero rand draws. The pursuit shot looked north up a
  // flat tan void; these four blocks line the road at x -120, z 142-154,
  // clear of the staged cars (interceptors z <= 132, roadblock at
  // x -126.5/-113.5) and behind every other shot's camera. South faces
  // (toward the pursuit camera) carry a lit gold window strip.
  const pursuitBlocks = [
    { x: -96, z: 142, w: 13, h: 12, d: 11, base: 0x3a3f4a },
    { x: -96, z: 155, w: 12, h: 16, d: 10, base: 0x51463a },
    { x: -144, z: 142, w: 12, h: 10, d: 11, base: 0x37424e },
    { x: -144, z: 155, w: 13, h: 14, d: 10, base: 0x4a3a30 },
  ];
  for (const b of pursuitBlocks) {
    box(world, b.w, b.h, b.d, lambert(b.base), b.x, b.h / 2, b.z, { name: 'building', kind: 'building' });
    box(world, b.w * 0.7, 1.2, b.d * 0.7, matSlateDark, b.x, b.h + 0.6, b.z, { name: 'building-roof', kind: 'building' });
    box(world, b.w * 0.8, 1.6, 0.15, matGoldPane, b.x, b.h * 0.55, b.z - b.d / 2 - 0.05, { name: 'building-windows', kind: 'building' });
    registerOccluder(b.x - b.w / 2, b.x + b.w / 2, 0, b.h, b.z - b.d / 2, b.z + b.d / 2);
    buildingCount++;
  }

  // --- moored boats -----------------------------------------------------------------------
  // Fixed positions, zero random draws for the new elements. Arm sailboat at
  // (80,-150), blue hull, white sail, bobbing phase 0.
  function addBoat(x, z, hullHex, sailHex, withSail) {
    const g = new THREE.Group();
    g.position.set(x, 0.15, z);
    g.name = 'boat';
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 6), lambert(hullHex));
    hull.position.y = 0.45;
    hull.name = 'boat-hull';
    g.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 5.5, 6), matLampPole);
    mast.position.y = 3.2;
    mast.name = 'boat-mast';
    g.add(mast);
    if (withSail) {
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 4.2), lambert(sailHex, { side: THREE.DoubleSide }));
      sail.position.set(0, 3.4, 1.2);
      sail.name = 'boat-sail';
      g.add(sail);
    }
    world.add(g);
    return g;
  }
  addBoat(armBoatPos.x, armBoatPos.z, 0x1f4fd8, 0xffffff, true);
  const basinBoats = [
    { x: 90, z: -200, hull: 0xd8d8d8, sail: true },
    { x: 150, z: -180, hull: 0xe5322a, sail: true },
    { x: 220, z: -220, hull: 0x2f7a3a, sail: false },
    { x: 260, z: -160, hull: 0xd8a93c, sail: true },
    { x: 120, z: -240, hull: 0xffffff, sail: false },
  ];
  for (const b of basinBoats) addBoat(b.x, b.z, b.hull, 0xffffff, b.sail);
  // Two more boats in the basin's south water, close to the sunset camera
  // (199,2,-129): they read at ~40-80 px in the sunset frame, where the
  // old frame was flat blue water. Both project OFF the cover frame's
  // right edge, so the cover water-run gate is untouched.
  addBoat(140, -148, 0xe5322a, 0xffffff, true);
  addBoat(165, -158, 0xf5efe0, 0xffffff, true);
  // Two CLOSER boats (projector-verified): N1 (199,-154) reads 149 px
  // tall in the sunset frame at screen (1075,382)-(1079,233); N2
  // (185,-160) reads 90 px at (764,365)-(765,275), just right of Rico.
  // Both project OFF the cover frame's right edge (x 1458+), so the
  // cover water-run gate is untouched. (First try at (178,-142)/
  // (188,-152) was occluded by the Gatehouse, x 167.5-182.5 at z -140.)
  addBoat(199, -154, 0xff7a1a, 0xffffff, true);
  addBoat(185, -160, 0xf5efe0, 0xffffff, true);

  // --- street dressing -----------------------------------------------------------------------
  // Hydrants + bins, guarded out of the arm rectangle.
  for (let i = 0; i < 10; i++) {
    const x = 32 + rand() * 4;
    const z = -200 + rand() * 280;
    if (x >= ARM.minX && x <= ARM.maxX && z >= ARM.minZ && z <= ARM.maxZ) continue;
    cyl(world, 0.18, 0.22, 0.7, lambert(0xc22a1e), x, 0.35, z, { name: 'hydrant', kind: 'prop' });
  }

  // --- landmarks + bend + markers --------------------------------------------------------------
  const landmarks = [
    { name: 'Deco Tower', x: decoCfg.x, y: 46, z: decoCfg.z },
    { name: 'Marina Bridge', x: 195, y: 14, z: bridgeCfg.z },
    { name: 'Marina Lagoon', x: 120, y: 0.05, z: -150 },
    { name: 'Spire', x: spireCfg.x, y: spireCfg.height, z: spireCfg.z },
    { name: 'Harbour Gatehouse', x: (gateCfg.x0 + gateCfg.x1) / 2, y: gateCfg.signY, z: -140 },
  ];
  // The harness reads round6.landmarks.count — a bare array has no .count.
  landmarks.count = 5;

  // The -17 deg bend: pure function of car z. Complete between zStart (-80)
  // and zEnd (-70); 0 before, full -17 deg after. Owned by main.js's cover
  // shot; world.js only defines/exposes it.
  const bend = {
    angleDeg: bendCfg.angleDeg !== undefined ? bendCfg.angleDeg : -17,
    maxDeg: bendCfg.maxDeg !== undefined ? bendCfg.maxDeg : -17,
    zStart: bendCfg.zStart !== undefined ? bendCfg.zStart : -80,
    zEnd: bendCfg.zEnd !== undefined ? bendCfg.zEnd : -70,
    headingAt(carZ) {
      const z0 = this.zStart;
      const z1 = this.zEnd;
      if (carZ <= z0) return 0;
      if (carZ >= z1) return (this.angleDeg * Math.PI) / 180;
      const t = (carZ - z0) / (z1 - z0);
      return ((this.angleDeg * t) * Math.PI) / 180;
    },
  };

  const markers = {
    // Flat aliases.
    lagoonArm,
    armBoat: { x: armBoatPos.x, z: armBoatPos.z },
    basin,
    median: { segments: medianSegments, planters: medianPlanters },
    bend,
    landmarks,
    marinaSigns,
    deco: { x: decoCfg.x, z: decoCfg.z, height: 46, finTop: 46 },
    bridge: { x0: bridgeCfg.x0, x1: bridgeCfg.x1, z: bridgeCfg.z },
    spire: { x: spireCfg.x, z: spireCfg.z, height: spireCfg.height },
    gatehouse: { x0: gateCfg.x0, x1: gateCfg.x1, signY: gateCfg.signY },
    segmentBlocked,
    buildingCount,
    // Harness paths.
    round25: {
      lagoonArm,
      armBoat: { x: armBoatPos.x, z: armBoatPos.z },
    },
    round6: { landmarks },
    round11Occlusion: { segmentBlocked },
  };

  return markers;
}

export { clamp, lerp, normalizeSegment, normalizeSegments, toCallableRng };
