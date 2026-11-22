// world.js — Solmar Bay city builder (attempt #8, round-16 rebuild).
// Builds the whole city from CONFIG + a seeded generator: ground, roads,
// Marina basin + lagoon arm water, bridge, Deco Tower, Spire, Harbour
// Gatehouse with its MARINA / PIER 12 signs, downtown buildings, lamps,
// palms, planters, benches, moored boats. Deterministic: every layout
// decision comes from the seeded rng; new elements use fixed positions
// with zero random draws. Written fresh from the contract + rebuild spec.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';
import { createRng, mulberry32, toCallableRng, WORLD_SEED } from './random.js';
import { MATERIALS } from './render.js';

// The west bend is a cover-shot car/camera effect owned by main.js; world.js
// only defines it and exposes the pure heading function. Heading is 0 until
// the car reaches zStart, ramps linearly to angleDeg at zEnd, and stays
// there — so the bend is complete before the cover pin at z = -67.
export const BEND = {
  angleDeg: -17,
  maxDeg: -17,
  zStart: -80,
  zEnd: -70,
  headingAt(carZ) {
    if (carZ <= this.zStart) return 0;
    if (carZ >= this.zEnd) return (this.angleDeg * Math.PI) / 180;
    const t = (carZ - this.zStart) / (this.zEnd - this.zStart);
    return ((this.angleDeg * t) * Math.PI) / 180;
  },
};

// Median segments are NORMALIZED at definition into {z0, z1} pairs: the flat
// CONFIG uses {z0, z1} and round27.median uses {minZ, maxZ}. Never read
// [0]/[1] off a raw object (that produced NaN geometry in attempt #2).
export function normalizeMedianSegment(seg) {
  if (Array.isArray(seg)) return { z0: Math.min(seg[0], seg[1]), z1: Math.max(seg[0], seg[1]) };
  if (typeof seg.z0 === 'number' && typeof seg.z1 === 'number') {
    return { z0: Math.min(seg.z0, seg.z1), z1: Math.max(seg.z0, seg.z1) };
  }
  if (typeof seg.minZ === 'number' && typeof seg.maxZ === 'number') {
    return { z0: Math.min(seg.minZ, seg.maxZ), z1: Math.max(seg.minZ, seg.maxZ) };
  }
  return { z0: 0, z1: 0 };
}

function rectsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function pointInRect(x, z, r) {
  return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
}

// Slab test: does the segment (a->b) hit the axis-aligned box?
// Used to keep buildings out of the cover sightlines at placement time.
function segmentHitsBox(ax, ay, az, bx, by, bz, box) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  let t0 = 0, t1 = 1;
  const axes = [
    [ax, dx, box.minX, box.maxX],
    [ay, dy, 0, box.height],
    [az, dz, box.minZ, box.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return t1 >= 0 && t0 <= 1;
}

// Sign helper: builds a text plane (canvas texture in the browser, solid
// blue in Node) and returns the sign object with `text` AND flat x/y/z —
// the harness reads sg.text / sg.x / sg.y / sg.z.
export function addSign(scene, text, x, y, z, opts) {
  const o = opts || {};
  const w = o.width || 8.8;
  const h = o.height || 2.2;
  let mat = MATERIALS.signBlue;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a4a8a';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 84px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat = new THREE.MeshLambertMaterial({ map: tex });
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.PI / 2; // faces east (+x)
  mesh.name = 'sign-' + text.replace(/\s+/g, '-').toLowerCase();
  scene.add(mesh);
  return { text, x, y, z, width: w, height: h, mesh };
}

function makeBox(group, mat, w, h, d, x, y, z, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function makePlane(group, mat, w, d, x, y, z, name) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  if (name) mesh.name = name;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// buildWorld(scene, config, rng) — signature is EXACTLY (scene, config, rng).
// Returns the markers the harness reads: round25 (arm rect + boat),
// round11Occlusion (segmentBlocked as a real function), round6 (landmarks
// count 5), marinaSigns, bend, roads, plus the occlusion helpers.
export function buildWorld(scene, config, rng) {
  const C = config || CONFIG;
  const rand = toCallableRng(rng === undefined ? createRng(WORLD_SEED) : rng);
  const rRange = (a, b) => a + rand() * (b - a);
  const rPick = (arr) => arr[Math.floor(rand() * arr.length)];

  const group = new THREE.Group();
  group.name = 'world';
  scene.add(group);

  const arm = C.lagoonArm;
  const basin = C.basin;
  const medianSegs = (C.median.segments || []).map(normalizeMedianSegment);
  const medianPlanters = C.median.planters || [];
  const armBenches = (arm.benches && arm.benches.length)
    ? arm.benches
    : [{ x: 112, z: -150 }, { x: 112, z: -135 }];
  const armPlanters = arm.planters || [];
  const promenade = C.round23.promenade || { benches: armBenches, planters: [] };

  // Exclusion rectangles: nothing structural is ever placed inside these.
  const armRect = { minX: arm.minX, maxX: arm.maxX, minZ: arm.minZ, maxZ: arm.maxZ };
  // Basin water: north basin (x 60..330, z -240..-160) + east basin
  // (x 130..330, z -160..-100). The strip x 100..130, z -160..-100 is
  // promenade land (benches + planters sit there, east of the arm).
  const basinNorth = { minX: basin.minX, maxX: 330, minZ: -240, maxZ: -160 };
  const basinEast = { minX: 130, maxX: 330, minZ: -160, maxZ: basin.maxZ };
  const medianRect = { minX: 37, maxX: 43, minZ: -180, maxZ: -100 };
  const decoRect = { minX: -26, maxX: 26, minZ: -186, maxZ: -134 };
  const gatehouseRect = { minX: 168, maxX: 183, minZ: -152, maxZ: -128 };
  const roadCorridorX = { minX: 28, maxX: 52, minZ: -260, maxZ: 200 };
  const crossRoadRect = { minX: -260, maxX: 330, minZ: -130, maxZ: -110 };
  const sunsetClear = { minX: 180, maxX: 215, minZ: -155, maxZ: -120 };
  const pursuitClear = { minX: -145, maxX: -95, minZ: 95, maxZ: 155 };

  // ---- Ground, sea, basin + arm water (bright blue, y 0.05) ----
  makePlane(group, MATERIALS.ground, 700, 560, 100, 0, -40, 'ground');
  // Open sea north of the bridge.
  makePlane(group, MATERIALS.water, 500, 160, 150, 0.05, -320, 'sea');
  makePlane(group, MATERIALS.water,
    basinNorth.maxX - basinNorth.minX, basinNorth.maxZ - basinNorth.minZ,
    (basinNorth.minX + basinNorth.maxX) / 2, 0.05,
    (basinNorth.minZ + basinNorth.maxZ) / 2, 'basin-water-north');
  makePlane(group, MATERIALS.water,
    basinEast.maxX - basinEast.minX, basinEast.maxZ - basinEast.minZ,
    (basinEast.minX + basinEast.maxX) / 2, 0.05,
    (basinEast.minZ + basinEast.maxZ) / 2, 'basin-water-east');
  makePlane(group, MATERIALS.water,
    armRect.maxX - armRect.minX, armRect.maxZ - armRect.minZ,
    (armRect.minX + armRect.maxX) / 2, 0.05,
    (armRect.minZ + armRect.maxZ) / 2, 'lagoon-arm-water');

  // ---- Roads: downtown x=40, cross z=-120, plus the downtown grid ----
  const roads = [
    { id: 'downtown', axis: 'z', at: 40, from: -200, to: 100, width: 12, name: 'Downtown Rd' },
    { id: 'cross', axis: 'x', at: -120, from: -100, to: 200, width: 12, name: 'Cross Rd' },
    { id: 'west', axis: 'z', at: -40, from: -200, to: 100, width: 10, name: 'West Rd' },
    { id: 'east1', axis: 'z', at: 120, from: -100, to: 100, width: 10, name: 'East Rd' },
    { id: 'east2', axis: 'z', at: 200, from: -100, to: 100, width: 10, name: 'Harbour Rd' },
    { id: 'north', axis: 'x', at: -40, from: -140, to: 330, width: 10, name: 'North Rd' },
    { id: 'south', axis: 'x', at: 40, from: -140, to: 330, width: 10, name: 'South Rd' },
    { id: 'far-north', axis: 'x', at: -200, from: -140, to: 50, width: 10, name: 'Far North Rd' },
  ];
  for (const road of roads) {
    if (road.axis === 'z') {
      makePlane(group, MATERIALS.asphalt, road.width, road.to - road.from,
        road.at, 0.02, (road.from + road.to) / 2, 'road-' + road.id);
      makePlane(group, MATERIALS.sidewalk, 4, road.to - road.from,
        road.at - road.width / 2 - 2, 0.03, (road.from + road.to) / 2, 'walk-' + road.id + '-w');
      makePlane(group, MATERIALS.sidewalk, 4, road.to - road.from,
        road.at + road.width / 2 + 2, 0.03, (road.from + road.to) / 2, 'walk-' + road.id + '-e');
    } else {
      makePlane(group, MATERIALS.asphalt, road.to - road.from, road.width,
        (road.from + road.to) / 2, 0.02, road.at, 'road-' + road.id);
      makePlane(group, MATERIALS.sidewalk, road.to - road.from, 4,
        (road.from + road.to) / 2, 0.03, road.at - road.width / 2 - 2, 'walk-' + road.id + '-n');
      makePlane(group, MATERIALS.sidewalk, road.to - road.from, 4,
        (road.from + road.to) / 2, 0.03, road.at + road.width / 2 + 2, 'walk-' + road.id + '-s');
    }
  }
  // Dashed centre line on the downtown road (x=40).
  for (let z = -195; z < 95; z += 10) {
    makePlane(group, MATERIALS.roadLine, 0.4, 4, 40, 0.04, z, 'dash-' + z);
  }
  // Dashed centre line on the cross road (z=-120).
  for (let x = -95; x < 195; x += 10) {
    makePlane(group, MATERIALS.roadLine, 4, 0.4, x, 0.04, -120, 'dashx-' + x);
  }

  // ---- Median park strip (x 37..43, two segments) + its 6 planters ----
  for (const seg of medianSegs) {
    const midZ = (seg.z0 + seg.z1) / 2;
    makePlane(group, MATERIALS.grass, 6, seg.z1 - seg.z0, 40, 0.04, midZ, 'median-grass');
  }
  for (const p of medianPlanters) {
    makeBox(group, MATERIALS.planterBox, 2.2, 0.9, 2.2, p.x, 0.45, p.z, 'median-planter');
    makeBox(group, MATERIALS.shrub, 1.8, 0.7, 1.8, p.x, 1.2, p.z, 'median-shrub');
  }

  // ---- Marina bridge (deck x 60..330, z -240, arch 8, 11 spans) ----
  const bridge = { x0: 60, x1: 330, z: -240, arch: 8, spans: 11, deck: 1.8 };
  const spanW = (bridge.x1 - bridge.x0) / bridge.spans;
  for (let i = 0; i < bridge.spans; i += 1) {
    const cx = bridge.x0 + (i + 0.5) * spanW;
    const archY = bridge.arch * Math.sin((Math.PI * (cx - bridge.x0)) / (bridge.x1 - bridge.x0));
    makeBox(group, MATERIALS.bridgeDeck, spanW + 0.4, bridge.deck, 10,
      cx, archY, bridge.z, 'bridge-deck-' + i);
    if (i % 2 === 0) {
      makeBox(group, MATERIALS.bridgePylon, 2, 14, 2, cx, 7, bridge.z - 6, 'bridge-pylon-' + i);
      makeBox(group, MATERIALS.bridgePylon, 2, 14, 2, cx, 7, bridge.z + 6, 'bridge-pylon-' + i);
    }
  }
  // Cables: thin diagonal boxes from deck ends up to the arch crown.
  for (let i = 0; i <= bridge.spans; i += 2) {
    const cx = bridge.x0 + i * spanW;
    const archY = bridge.arch * Math.sin((Math.PI * (cx - bridge.x0)) / (bridge.x1 - bridge.x0));
    const cable = makeBox(group, MATERIALS.bridgeCable, 0.25, 9, 0.25,
      cx, archY / 2 + 1, bridge.z - 4.6, 'bridge-cable-' + i);
    cable.rotation.z = 0.5;
  }

  // ---- Deco Tower (x 0, z -160): stepped ziggurat, gold crown + fin ----
  // Tiers (contract fix #3.9): base 48x16x48 @ y 8, mid 36x12x36 @ y 22,
  // top 24x8x24 @ y 32. Fin top y 46, base y 34.
  makeBox(group, MATERIALS.buildingSlate, 48, 16, 48, 0, 8, -160, 'deco-base');
  makeBox(group, MATERIALS.buildingDark, 36, 12, 36, 0, 22, -160, 'deco-mid');
  makeBox(group, MATERIALS.buildingSlate, 24, 8, 24, 0, 32, -160, 'deco-top');
  makeBox(group, MATERIALS.goldFin, 26, 2, 26, 0, 37, -160, 'deco-crown');
  makeBox(group, MATERIALS.goldFin, 1.5, 12, 5, 0, 40, -160, 'deco-fin');
  // Lit gold panes on the east face (x 24.1 / 18.1 / 12.1), 3.0 tall x 5.0
  // wide, 6 m apart — the east-panes gate (>= 0.7) samples this face.
  // FIX #1 (attempt #8): MeshBasicMaterial (0xffc861, fog off), NOT
  // Lambert+emissive — the Lambert emissive provably does not reach the
  // framebuffer in this build (emissiveIntensity 5.0 live + forced
  // render: peak pane pixel still R=115; NoToneMapping + sRGB confirmed;
  // global max IS 255, so no global cap). The binding constraint is
  // COVERAGE, not brightness: at ~79 deg off-normal the pane is a thin
  // sliver and every pixel blends ~45% pane / 55% dark facade, so even a
  // 255 material reads R~115. A 5.0 m pane (~8 px full-res) puts fully
  // covered pixels on screen (R~193, contrast ~0.76). Spacing 6 m keeps
  // 1 m dark gaps so the panes stay distinct.
  const paneMat = new THREE.MeshBasicMaterial({ color: 0xffc861, fog: false });
  const paneRows = [
    { x: 24.1, ys: [4, 8, 12], zs: [-172, -166, -160, -154, -148] },
    { x: 18.1, ys: [19, 25], zs: [-170, -164, -158, -152] },
    { x: 12.1, ys: [31], zs: [-168, -162, -156] },
  ];
  for (const row of paneRows) {
    for (const py of row.ys) {
      for (const pz of row.zs) {
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 3.0), paneMat);
        pane.position.set(row.x, py, pz);
        pane.rotation.y = Math.PI / 2;
        pane.name = 'deco-pane';
        group.add(pane);
      }
    }
  }

  // ---- Spire (x 320, z -80, 60 m) — frames the Marina, never blocks it ----
  makeBox(group, MATERIALS.buildingLight, 10, 60, 10, 320, 30, -80, 'spire');
  const spireTip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.8, 10, 6), MATERIALS.lampPost);
  spireTip.position.set(320, 65, -80);
  spireTip.name = 'spire-antenna';
  group.add(spireTip);

  // ---- Harbour Gatehouse (x 168..183) + MARINA / PIER 12 signs ----
  // The gatehouse block spans x 168..183; both signs face east (+x) from
  // its east face. Each sign plane is 8.8 x 2.2 m — the harness reads its
  // four corners at (x, y +/- 1.1, z +/- 4.4).
  makeBox(group, MATERIALS.marinaWall, 15, 9, 24, 175.5, 4.5, -140, 'gatehouse');
  makeBox(group, MATERIALS.buildingDark, 16, 1, 25, 175.5, 9.5, -140, 'gatehouse-cap');
  const marinaSigns = [];
  marinaSigns.push(addSign(group, 'MARINA', 183.2, 9, -144));
  // FIX #1 (attempt #8): PIER 12's centre projected 11 px above the
  // frame (sunset camera sits close, y 2.3, sign y 9). Lowered 1 m to
  // y 8.0 — text top (8.0 + 0.79) stays below the gatehouse cap (y 9).
  marinaSigns.push(addSign(group, 'PIER 12', 183.2, 8.0, -132));
  // The marinaSigns entries keep flat x/y/z (addSign returns them).

  // ---- Downtown buildings (seeded, exclusion + sightline guarded) ----
  // Landmarks are NOT occluders — only these building boxes block rays.
  const occluders = [];
  // Cover sightlines that must stay clear (cover camera + tuned camera).
  const coverCams = [
    { x: 46, y: 4, z: -54 },
    { x: 43.5, y: 3.5, z: -58 },
  ];
  const sightTargets = [
    { x: 0, y: 46, z: -160 }, { x: 0, y: 8, z: -160 },
    { x: 75, y: 0.05, z: -137 }, { x: 50, y: 0.05, z: -114 },
    { x: 50, y: 0.05, z: -137 }, { x: 40, y: 0.5, z: -140 },
    { x: 40, y: 0.5, z: -175 }, { x: 150, y: 0.05, z: -170 },
    { x: 195, y: 8, z: -240 }, { x: 320, y: 30, z: -80 },
    // FIX #1 (attempt #8): the lagoon-band rays to the basin-east SOUTH
    // water (rows 200-215 of the downscale band). A seeded building at
    // x 136.5-150.4, z -86..-71.8, h 10.3 sat on these rays and filled
    // the band with dark faces (waterRunGap4 139 vs 150). Any building
    // blocking them is shrunk, then skipped — draws happen before the
    // check, so the seeded city keeps its order.
    { x: 190, y: 0.05, z: -100 }, { x: 250, y: 0.05, z: -100 },
    { x: 310, y: 0.05, z: -100 }, { x: 330, y: 0.05, z: -100 },
    { x: 250, y: 0.05, z: -110 }, { x: 310, y: 0.05, z: -130 },
  ];
  // The lagoon-arm-centre ray (contract fix #3.8): a seeded building once
  // sat on this corridor and blocked the arm centre (centre-third water
  // 72 px vs >= 800). It is covered by the sightline set above.
  function buildingClearOfSightlines(box) {
    const pad = { minX: box.minX - 1, maxX: box.maxX + 1, minZ: box.minZ - 1, maxZ: box.maxZ + 1, height: box.height };
    for (const cam of coverCams) {
      for (const t of sightTargets) {
        if (segmentHitsBox(cam.x, cam.y, cam.z, t.x, t.y, t.z, pad)) return false;
      }
    }
    return true;
  }
  const noBuild = [armRect, basinNorth, basinEast, medianRect, decoRect,
    gatehouseRect, roadCorridorX, crossRoadRect, sunsetClear, pursuitClear,
    { minX: 100, maxX: 130, minZ: -160, maxZ: -100 }, // promenade strip
    { minX: 310, maxX: 330, minZ: -90, maxZ: -70 }, // Spire footprint
    { minX: -45, maxX: -35, minZ: -260, maxZ: 200 }, // west grid road
    { minX: 115, maxX: 125, minZ: -260, maxZ: 200 }, // east grid road 1
    { minX: 195, maxX: 205, minZ: -260, maxZ: 200 }, // east grid road 2
    { minX: -260, maxX: 330, minZ: -45, maxZ: -35 }, // north grid road
    { minX: -260, maxX: 330, minZ: 35, maxZ: 45 }, // south grid road
    { minX: -260, maxX: 330, minZ: -205, maxZ: -195 }, // far-north road
  ];
  const plots = [
    { minX: -140, maxX: -60, minZ: -200, maxZ: -135 },
    { minX: -140, maxX: -60, minZ: -105, maxZ: -50 },
    { minX: -140, maxX: -60, minZ: -30, maxZ: 30 },
    { minX: -140, maxX: -60, minZ: 50, maxZ: 95 },
    { minX: -35, maxX: 28, minZ: -200, maxZ: -135 },
    { minX: -35, maxX: 28, minZ: -105, maxZ: -50 },
    { minX: -35, maxX: 28, minZ: -30, maxZ: 30 },
    { minX: -35, maxX: 28, minZ: 50, maxZ: 95 },
    { minX: 125, maxX: 195, minZ: -105, maxZ: -50 },
    { minX: 125, maxX: 195, minZ: -30, maxZ: 30 },
    { minX: 125, maxX: 195, minZ: 50, maxZ: 110 },
    { minX: 210, maxX: 330, minZ: -105, maxZ: -50 },
    { minX: 210, maxX: 330, minZ: -30, maxZ: 30 },
    { minX: 210, maxX: 330, minZ: 50, maxZ: 110 },
    { minX: -140, maxX: -60, minZ: -260, maxZ: -210 },
    { minX: -35, maxX: 50, minZ: -260, maxZ: -210 },
  ];
  const buildingMats = [MATERIALS.buildingSlate, MATERIALS.buildingDark, MATERIALS.buildingLight];
  let buildingCount = 0;
  for (const plot of plots) {
    const n = 1 + Math.floor(rand() * 2.5);
    for (let i = 0; i < n; i += 1) {
      const w = 12 + rand() * 16;
      const d = 12 + rand() * 16;
      let h = 8 + rand() * 34;
      const x = plot.minX + 4 + rand() * Math.max(1, (plot.maxX - plot.minX) - w - 8);
      const z = plot.minZ + 4 + rand() * Math.max(1, (plot.maxZ - plot.minZ) - d - 8);
      const box = {
        minX: x - w / 2, maxX: x + w / 2,
        minZ: z - d / 2, maxZ: z + d / 2, height: h,
      };
      if (noBuild.some((r) => rectsOverlap(box, r))) continue;
      // Sightline guard: shrink the building before dropping it.
      if (!buildingClearOfSightlines(box)) {
        box.height = Math.max(6, h * 0.5);
        h = box.height;
        if (!buildingClearOfSightlines(box)) continue;
      }
      const mesh = makeBox(group, rPick(buildingMats), w, h, d, x, h / 2, z, 'building-' + buildingCount);
      mesh.userData.occluder = true;
      occluders.push(box);
      buildingCount += 1;
    }
  }

  // ---- Street lamps (x 50.6 and 109.4 along the vertical roads) ----
  // Lamp guard: never in the basin or the arm; never crossing the MARINA
  // sign (no lamp line runs near x 189.4 in this layout).
  const lampSpots = [];
  for (let z = -190; z <= 90; z += 20) {
    if (!pointInRect(50.6, z, armRect) && !pointInRect(50.6, z, basinNorth) && !pointInRect(50.6, z, basinEast)) {
      lampSpots.push({ x: 50.6, z });
    }
    if (!pointInRect(109.4, z, armRect) && !pointInRect(109.4, z, basinNorth) && !pointInRect(109.4, z, basinEast)) {
      lampSpots.push({ x: 109.4, z });
    }
  }
  if (lampSpots.length > 0) {
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
    const poles = new THREE.InstancedMesh(poleGeo, MATERIALS.lampPost, lampSpots.length);
    const headGeo = new THREE.BoxGeometry(0.9, 0.25, 0.35);
    const heads = new THREE.InstancedMesh(headGeo, MATERIALS.lampGlow, lampSpots.length);
    const m4 = new THREE.Matrix4();
    lampSpots.forEach((s, i) => {
      m4.makeTranslation(s.x, 3, s.z);
      poles.setMatrixAt(i, m4);
      m4.makeTranslation(s.x, 6.1, s.z);
      heads.setMatrixAt(i, m4);
    });
    poles.name = 'lamps';
    heads.name = 'lamp-heads';
    group.add(poles);
    group.add(heads);
  }

  // ---- Palms (instanced): promenade + street sidewalks. Never inside the
  // arm rectangle and never on the median.
  const palmSpots = [];
  function addPalm(x, z) {
    if (pointInRect(x, z, armRect)) return;
    if (pointInRect(x, z, medianRect)) return;
    if (pointInRect(x, z, basinNorth) || pointInRect(x, z, basinEast)) return;
    palmSpots.push({ x, z });
  }
  for (let z = -155; z <= -105; z += 12) addPalm(104 + rand() * 8, z);
  for (let z = -95; z <= 85; z += 15) addPalm(52, z);
  for (let x = -95; x <= 45; x += 18) { addPalm(x, -108); addPalm(x, -132); }
  for (let x = 125; x <= 195; x += 18) addPalm(x, -108);
  if (palmSpots.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5, 6);
    const trunks = new THREE.InstancedMesh(trunkGeo, MATERIALS.trunk, palmSpots.length);
    const leafGeo = new THREE.ConeGeometry(2.2, 3.2, 6);
    const leaves = new THREE.InstancedMesh(leafGeo, MATERIALS.palmLeaf, palmSpots.length);
    const m4 = new THREE.Matrix4();
    palmSpots.forEach((s, i) => {
      m4.makeTranslation(s.x, 2.5, s.z);
      trunks.setMatrixAt(i, m4);
      m4.makeTranslation(s.x, 6.2, s.z);
      leaves.setMatrixAt(i, m4);
    });
    trunks.name = 'palms';
    leaves.name = 'palm-leaves';
    group.add(trunks);
    group.add(leaves);
  }

  // ---- Planters: promenade (from CONFIG) + median (6, from CONFIG) ----
  // A guard skips SEEDED planters inside the arm rectangle; CONFIG-specified
  // planters are placed as specified.
  const planterSpots = [];
  for (const p of armPlanters) planterSpots.push({ x: p.x, z: p.z });
  for (const p of medianPlanters) planterSpots.push({ x: p.x, z: p.z });
  for (let i = 0; i < 10; i += 1) {
    const px = 104 + rand() * 10;
    const pz = -155 + rand() * 50;
    if (!pointInRect(px, pz, armRect)) planterSpots.push({ x: px, z: pz });
  }
  if (planterSpots.length > 0) {
    const boxGeo = new THREE.BoxGeometry(2.2, 0.9, 2.2);
    const boxes = new THREE.InstancedMesh(boxGeo, MATERIALS.planterBox, planterSpots.length);
    const shrubGeo = new THREE.BoxGeometry(1.8, 0.7, 1.8);
    const shrubs = new THREE.InstancedMesh(shrubGeo, MATERIALS.shrub, planterSpots.length);
    const m4 = new THREE.Matrix4();
    planterSpots.forEach((s, i) => {
      m4.makeTranslation(s.x, 0.45, s.z);
      boxes.setMatrixAt(i, m4);
      m4.makeTranslation(s.x, 1.2, s.z);
      shrubs.setMatrixAt(i, m4);
    });
    boxes.name = 'planters';
    shrubs.name = 'planter-shrubs';
    group.add(boxes);
    group.add(shrubs);
  }

  // ---- Benches on the promenade (from CONFIG: the two moved benches) ----
  for (const b of armBenches) {
    makeBox(group, MATERIALS.benchWood, 2.4, 0.5, 0.8, b.x, 0.55, b.z, 'bench');
    makeBox(group, MATERIALS.benchWood, 2.4, 0.9, 0.15, b.x, 0.9, b.z - 0.4, 'bench-back');
  }
  for (const b of (promenade.benches || [])) {
    if (armBenches.some((a) => a.x === b.x && a.z === b.z)) continue;
    makeBox(group, MATERIALS.benchWood, 2.4, 0.5, 0.8, b.x, 0.55, b.z, 'bench');
  }

  // ---- Moored boats: the arm sailboat (fixed, zero random draws) + basin ----
  const boats = [];
  function addBoat(x, z, sail, name) {
    const hull = makeBox(group, MATERIALS.boatHull, 3.2, 1.0, 7, x, 0.5, z, name + '-hull');
    hull.userData.bobPhase = 0;
    let mast = null;
    let sailMesh = null;
    if (sail) {
      mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 7, 6), MATERIALS.lampPost);
      mast.position.set(x, 4, z);
      mast.name = name + '-mast';
      group.add(mast);
      sailMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.5), MATERIALS.boatSail);
      sailMesh.position.set(x, 4.2, z + 0.4);
      sailMesh.name = name + '-sail';
      group.add(sailMesh);
    }
    const boat = { x, z, hull, mast, sail: sailMesh };
    boats.push(boat);
    return boat;
  }
  // Deterministic variant of the boat routine: fixed coordinates, no draws.
  const armBoat = addBoat(arm.sailboat.x, arm.sailboat.z, true, 'arm-sailboat');
  armBoat.x = arm.sailboat.x;
  armBoat.z = arm.sailboat.z;
  addBoat(180, -200, false, 'boat-1');
  addBoat(250, -190, true, 'boat-2');
  addBoat(150, -130, false, 'boat-3');
  addBoat(280, -150, false, 'boat-4');
  addBoat(200, -220, true, 'boat-5');

  // ---- Occlusion: landmarks are NOT occluders; only building boxes are. ----
  function isBlockedAt(x, y, z) {
    for (const o of occluders) {
      if (x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ && y >= 0 && y <= o.height) {
        return true;
      }
    }
    return false;
  }
  // segmentBlocked MUST be a real function (contract §6.1): sample the
  // segment through isBlockedAt. The harness calls it with
  // (ax, ay, az, bx, by, bz, ignore).
  function segmentBlocked(ax, ay, az, bx, by, bz, _ignore) {
    const steps = 64;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      if (isBlockedAt(
        ax + (bx - ax) * t,
        ay + (by - ay) * t,
        az + (bz - az) * t,
      )) return true;
    }
    return false;
  }
  const round11Occlusion = { segmentBlocked, isBlockedAt, occluders };

  // ---- Road helpers for traffic / spawns ----
  function roadPointForLength(road, s) {
    const len = road.to - road.from;
    const t = Math.max(0, Math.min(1, s / len));
    if (road.axis === 'z') return { x: road.at, z: road.from + t * len, heading: 0 };
    return { x: road.from + t * len, z: road.at, heading: Math.PI / 2 };
  }
  const spawns = { downtown: { x: 40, z: -40, heading: 0 } };

  // ---- Landmarks (5): spire, bridge, pyramid/Deco, marina, gatehouse ----
  const landmarks = [
    { name: 'Solmar Spire', kind: 'spire', x: 320, z: -80 },
    { name: 'Marina Bridge', kind: 'bridge', x: 195, z: -240 },
    { name: 'Deco Tower', kind: 'deco', x: 0, z: -160 },
    { name: 'Marina Lagoon', kind: 'marina', x: 150, z: -170 },
    { name: 'Harbour Gatehouse', kind: 'gatehouse', x: 175, z: -140 },
  ];
  const round6 = {
    landmarks: {
      count: landmarks.length,
      names: landmarks.map((l) => l.name),
      items: landmarks,
    },
    sky: { timeOfDay: 17.8, sunset: true },
    visited: [],
  };

  return {
    group,
    scene,
    config: C,
    roads,
    roadPointForLength,
    spawns,
    round25: {
      lagoonArm: { minX: arm.minX, maxX: arm.maxX, minZ: arm.minZ, maxZ: arm.maxZ },
      armBoat: { x: arm.sailboat.x, z: arm.sailboat.z },
    },
    round11Occlusion,
    round6,
    marinaSigns,
    bend: BEND,
    landmarks,
    median: { segments: medianSegs, planters: medianPlanters, collidable: false },
    water: { material: MATERIALS.water, basin, arm: armRect },
    bridge,
    deco: { x: 0, z: -160, finTop: { x: 0, y: 46, z: -160 } },
    boats,
    isBlockedAt,
    segmentBlocked,
    addSign: (text, x, y, z, opts) => addSign(group, text, x, y, z, opts),
    buildingCount,
    palmCount: palmSpots.length,
    lampCount: lampSpots.length,
  };
}
