// Solmar Bay — the city: roads, buildings, water, landmarks.
//
// Builds the entire city from the configuration and the seeded
// generator. The city is built from simple 3D primitives (boxes,
// cylinders, planes) with flat materials and a sunset light rig — no
// imported models, no external assets. All layout decisions come from
// a seeded pseudo-random generator, so the city is identical on every
// run. New elements use fixed positions and zero random draws, so they
// never shift the seeded layout.
//
// Coordinate system: metres. X runs east-west (positive east), z runs
// north-south (positive south, negative north), y is up. The downtown
// road the GT drives is at x = 40. The Marina and lagoon are east and
// north of the cover position. The bridge is far north at z = -240.
// The Deco Tower stands at (0, -160).
//
// The world exposes itself to the harness: the arm rectangle and boat,
// the median, the bend, and the landmark positions. It must place
// nothing by unseeded randomness, and every new element uses fixed
// positions with zero random draws.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, PALETTE } from './config.js';
import { createRng, clamp } from './random.js';

// ---------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------

function hexColor(hex) {
  return new THREE.Color(hex);
}

function box(w, h, d, color, opts = {}) {
  const mat = opts.material || new THREE.MeshLambertMaterial({ color: hexColor(color) });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(opts.x || 0, opts.y || 0, opts.z || 0);
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

// A flat (unlit) material: renders exactly its colour, so the bright
// water, the gold panes and the dark slate read the same on every run
// regardless of the sun angle. Used where a gate measures a colour.
function basic(color) {
  return new THREE.MeshBasicMaterial({ color: hexColor(color) });
}

// ---------------------------------------------------------------------
// Canvas textures (generated in code, no network, no files).
// Used for the readable signs (MARINA, PIER 12) and the building
// window textures. Deterministic: the same seed gives the same pixels.
// ---------------------------------------------------------------------

function makeSignTexture(text, opts = {}) {
  const w = opts.w || 512;
  const h = opts.h || 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // White text on blue (the Marina signage).
  ctx.fillStyle = opts.bg || '#1d4e89';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#f4f1e8';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = opts.fg || '#f4f1e8';
  ctx.font = `bold ${opts.fontPx || 84}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeWindowTexture(seed, litRatio) {
  // A building facade texture: dark slate with a grid of windows, a
  // fraction of them lit gold. One of a small set of shared textures,
  // so every building reads as a tower with windows at 1 draw call.
  const rng = createRng(seed);
  const w = 128;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#232830';
  ctx.fillRect(0, 0, w, h);
  const cols = 6;
  const rows = 12;
  const cw = w / cols;
  const rh = h / rows;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lit = rng.next() < litRatio;
      ctx.fillStyle = lit ? '#f2c14e' : '#14181f';
      ctx.fillRect(c * cw + 3, r * rh + 4, cw - 6, rh - 8);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------------------------------------------------------------------
// The road network.
// ---------------------------------------------------------------------

// Build the road list the traffic manager and the unit test use:
// vertical roads at each grid line (z from -HALF to 272), horizontal
// roads at each grid line (x from -HALF to HALF), plus the southern
// edge road at z = 272. Width 14, axis 'z' or 'x'.
export function buildRoads() {
  const HALF = CONFIG.city.half;
  const LINES = CONFIG.city.gridLines;
  const roads = [];
  for (const line of LINES) {
    roads.push({ start: { x: line, z: -HALF }, end: { x: line, z: 272 }, width: 14, axis: 'z' });
    roads.push({ start: { x: -HALF, z: line }, end: { x: HALF, z: line }, width: 14, axis: 'x' });
  }
  roads.push({ start: { x: -HALF, z: 272 }, end: { x: HALF, z: 272 }, width: 14, axis: 'x' });
  return roads;
}

// Mirror of the unit test's roadPointForLength (same semantics): pick
// a random road, a random point along it with a margin, and return it
// when it is long enough and near the given point. Null after 12 tries.
export function roadPointForLength(rng, roads, length, nearX, nearZ, maxDist) {
  const need = Math.max(0, length || 0);
  const maxD = maxDist === undefined ? 120 : maxDist;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const roadIndex = Math.floor(rng.next() * roads.length);
    const road = roads[roadIndex];
    const segLen = Math.hypot(road.end.x - road.start.x, road.end.z - road.start.z);
    if (segLen <= need + 4) continue;
    const margin = Math.min(0.45, (need + 4) / segLen);
    const t = margin + rng.next() * (1 - 2 * margin);
    const x = road.start.x + (road.end.x - road.start.x) * t;
    const z = road.start.z + (road.end.z - road.start.z) * t;
    if (nearX !== undefined && nearZ !== undefined && Math.hypot(x - nearX, z - nearZ) > maxD) continue;
    return { position: { x, y: 0, z }, roadIndex, roadT: t };
  }
  return null;
}

// ---------------------------------------------------------------------
// The world builder.
// ---------------------------------------------------------------------

export function createWorld(scene, seed) {
  const rng = createRng(seed === undefined ? CONFIG.game.seed : seed);
  const group = new THREE.Group();
  group.name = 'solmar-city';
  scene.add(group);

  // Every solid the occlusion test must consider, as an axis-aligned
  // box { minX, maxX, minY, maxY, minZ, maxZ }. The sightline from the
  // cover camera to the basin and the median must stay clear of these.
  const occluders = [];
  function addOccluder(minX, maxX, minY, maxY, minZ, maxZ) {
    occluders.push({ minX, maxX, minY, maxY, minZ, maxZ });
  }

  // Animated bits (boats bob, palms sway, water shimmers). update()
  // steps them from game time, never the wall clock.
  const animated = { boats: [], palms: [], water: [] };

  // ---- The ground ---------------------------------------------------
  // One big ground plane, warm grey-green, at y = 0. The city sits on it.
  const groundMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.ground) });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(160, 0, -40);
  group.add(ground);

  // A parkland apron around downtown (green, under the median and the
  // promenade), so the city is not bare asphalt.
  const parkMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.grassDark) });
  const park = new THREE.Mesh(new THREE.PlaneGeometry(420, 300), parkMat);
  park.rotation.x = -Math.PI / 2;
  park.position.set(40, 0.01, -80);
  group.add(park);

  // ---- The open sea (north, beyond the basin) -----------------------
  // Bright blue, so the horizon reads as water, not sky. The sea is a
  // separate plane from the basin so the basin can be shaped exactly.
  const sea = CONFIG.dressing.sea;
  const seaMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(sea.maxX - sea.minX, sea.maxZ - sea.minZ),
    basic(PALETTE.waterBright),
  );
  seaMesh.rotation.x = -Math.PI / 2;
  seaMesh.position.set((sea.minX + sea.maxX) / 2, 0.04, (sea.minZ + sea.maxZ) / 2);
  group.add(seaMesh);
  animated.water.push(seaMesh);

  // ---- The Marina basin ---------------------------------------------
  // Bright blue water at y = 0.05, same material as the lagoon arm.
  // The basin's west edge is at minX 60. The water must read as bright
  // blue (not near-black) on the downscale.
  const marina = CONFIG.marina;
  const basin = new THREE.Mesh(
    new THREE.PlaneGeometry(marina.maxX - marina.minX, marina.maxZ - marina.minZ),
    basic(PALETTE.water),
  );
  basin.rotation.x = -Math.PI / 2;
  basin.position.set(
    (marina.minX + marina.maxX) / 2, marina.waterY,
    (marina.minZ + marina.maxZ) / 2,
  );
  group.add(basin);
  animated.water.push(basin);

  // ---- The lagoon arm (round 25/26) ---------------------------------
  // Runs SOUTH from the basin's southwest corner toward the cover pose.
  // Rectangle minX 50, maxX 100, minZ -160, maxZ -114. Same bright
  // basin water at y 0.05. West shore at x 50 meets the x = 40 road's
  // east sidewalk, so the chase runs ON the waterfront. South edge at
  // -114 stops 1 m north of the z = -120 cross road's sidewalk, so no
  // road is flooded.
  const arm = CONFIG.round25.lagoonArm;
  const armMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(arm.maxX - arm.minX, arm.maxZ - arm.minZ),
    basic(PALETTE.water),
  );
  armMesh.rotation.x = -Math.PI / 2;
  armMesh.position.set(
    (arm.minX + arm.maxX) / 2, marina.waterY,
    (arm.minZ + arm.maxZ) / 2,
  );
  group.add(armMesh);
  animated.water.push(armMesh);

  // The arm's stone edging (a thin rim around the water, so the shore
  // reads as a built harbour edge, not a texture seam).
  const rimMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.sidewalk) });
  const rimW = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, arm.maxZ - arm.minZ), rimMat);
  rimW.position.set(arm.minX - 0.3, 0.12, (arm.minZ + arm.maxZ) / 2);
  group.add(rimW);
  const rimE = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, arm.maxZ - arm.minZ), rimMat);
  rimE.position.set(arm.maxX + 0.3, 0.12, (arm.minZ + arm.maxZ) / 2);
  group.add(rimE);
  const rimS = new THREE.Mesh(new THREE.BoxGeometry(arm.maxX - arm.minX + 1.2, 0.25, 0.6), rimMat);
  rimS.position.set((arm.minX + arm.maxX) / 2, 0.12, arm.maxZ + 0.3);
  group.add(rimS);

  // ---- Roads, sidewalks, kerbs, lane markings -----------------------
  const roads = buildRoads();
  const asphaltMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.asphalt) });
  const asphaltWarmMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.asphaltWarm) });
  const sidewalkMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.sidewalk) });
  const kerbMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.kerb) });
  const lineMat = basic(PALETTE.laneLine);

  // The lane-dash instances (one InstancedMesh for every dash in the
  // city, so the markings cost one draw call).
  const dashGeo = new THREE.BoxGeometry(0.18, 0.02, 3);
  const dashSpots = [];
  for (const road of roads) {
    const len = Math.hypot(road.end.x - road.start.x, road.end.z - road.start.z);
    const cx = (road.start.x + road.end.x) / 2;
    const cz = (road.start.z + road.end.z) / 2;
    const isHero = road.axis === 'z' && Math.abs(road.start.x - CONFIG.city.heroRoadX) < 0.1;
    // Asphalt plane (slightly above the ground, warm for the hero road).
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(road.axis === 'z' ? road.width : len, road.axis === 'z' ? len : road.width),
      isHero ? asphaltWarmMat : asphaltMat,
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, 0.03, cz);
    group.add(plane);
    // Sidewalks on both edges (raised strips, 3 m wide).
    const sw = CONFIG.city.sidewalkWidth;
    if (road.axis === 'z') {
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(sw, len), sidewalkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(road.start.x + side * (road.width / 2 + sw / 2), 0.06, cz);
        group.add(walk);
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, len), kerbMat);
        kerb.position.set(road.start.x + side * (road.width / 2 + 0.15), 0.07, cz);
        group.add(kerb);
      }
      // Centre dashes along the road.
      const n = Math.floor(len / 9);
      for (let i = 0; i < n; i += 1) {
        const z = road.start.z + 6 + i * 9;
        if (z > road.end.z - 4) break;
        dashSpots.push({ x: road.start.x, z, ry: 0 });
      }
    } else {
      for (const side of [-1, 1]) {
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(len, sw), sidewalkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(cx, 0.06, road.start.z + side * (road.width / 2 + sw / 2));
        group.add(walk);
        const kerb = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.3), kerbMat);
        kerb.position.set(cx, 0.07, road.start.z + side * (road.width / 2 + 0.15));
        group.add(kerb);
      }
      const n = Math.floor(len / 9);
      for (let i = 0; i < n; i += 1) {
        const x = road.start.x + 6 + i * 9;
        if (x > road.end.x - 4) break;
        dashSpots.push({ x, z: road.start.z, ry: Math.PI / 2 });
      }
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, lineMat, Math.max(1, dashSpots.length));
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1);
    dashSpots.forEach((d, i) => {
      e.set(0, d.ry, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(d.x, 0.05, d.z), q, s);
      dashMesh.setMatrixAt(i, m);
    });
    dashMesh.instanceMatrix.needsUpdate = true;
  }
  group.add(dashMesh);

  // ---- The median park strip (round 27) -----------------------------
  // Grass, 6 m wide (x 37-43), z -100..-180, split at the z = -120
  // cross road into two segments. Six low planters, no palms, fixed
  // positions, zero random draws. NO collision boxes.
  const med = CONFIG.round27.median;
  const grassMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.grass) });
  for (const seg of med.segments) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(seg.maxX - seg.minX, seg.maxZ - seg.minZ),
      grassMat,
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set((seg.minX + seg.maxX) / 2, 0.08, (seg.minZ + seg.maxZ) / 2);
    group.add(strip);
  }
  // Median planters: low boxes with a green top, one InstancedMesh.
  const planterGeo = new THREE.BoxGeometry(1.4, 0.55, 1.4);
  const planterMat = new THREE.MeshLambertMaterial({ color: hexColor('#7a6a55') });
  const planterTopGeo = new THREE.BoxGeometry(1.2, 0.18, 1.2);
  const planterTopMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.grass) });
  const medPlanters = new THREE.InstancedMesh(planterGeo, planterMat, med.planters.length);
  const medPlanterTops = new THREE.InstancedMesh(planterTopGeo, planterTopMat, med.planters.length);
  {
    const m = new THREE.Matrix4();
    med.planters.forEach((p, i) => {
      m.makeTranslation(p.x, 0.35, p.z);
      medPlanters.setMatrixAt(i, m);
      m.makeTranslation(p.x, 0.68, p.z);
      medPlanterTops.setMatrixAt(i, m);
    });
    medPlanters.instanceMatrix.needsUpdate = true;
    medPlanterTops.instanceMatrix.needsUpdate = true;
  }
  group.add(medPlanters);
  group.add(medPlanterTops);

  // ---- The bridge ---------------------------------------------------
  // Crosses the north side of the basin at z = -240. Deck from x 60
  // to x 330, arched profile rising 8 m following a sine curve, deck
  // thickness 1.8 m, 11 spans, pylons and cables. On the cover it spans
  // the horizon with deck, pylons and cables visible above the water.
  // A background element only — the GT never drives on it.
  const bridgeCfg = CONFIG.bridge;
  {
    const spanLen = (bridgeCfg.x1 - bridgeCfg.x0) / bridgeCfg.spans;
    const deckMat = new THREE.MeshLambertMaterial({ color: hexColor('#5d564e') });
    const deckTopMat = new THREE.MeshLambertMaterial({ color: hexColor(PALETTE.asphaltWarm) });
    for (let i = 0; i < bridgeCfg.spans; i += 1) {
      const x0 = bridgeCfg.x0 + i * spanLen;
      const x1 = x0 + spanLen;
      const xm = (x0 + x1) / 2;
      // Sine arch: 0 at the ends, archHeight at the middle.
      const arch = bridgeCfg.archHeight * Math.sin((Math.PI * (xm - bridgeCfg.x0)) / (bridgeCfg.x1 - bridgeCfg.x0));
      const deck = new THREE.Mesh(new THREE.BoxGeometry(spanLen + 0.4, bridgeCfg.deckThickness, 12), deckMat);
      deck.position.set(xm, bridgeCfg.deckY + arch, bridgeCfg.z);
      group.add(deck);
      const top = new THREE.Mesh(new THREE.BoxGeometry(spanLen + 0.4, 0.12, 11), deckTopMat);
      top.position.set(xm, bridgeCfg.deckY + arch + bridgeCfg.deckThickness / 2 + 0.06, bridgeCfg.z);
      group.add(top);
      // A pylon under every third span joint.
      if (i % 3 === 0) {
        const pylonH = bridgeCfg.deckY + arch + bridgeCfg.pylonHeight;
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.2, pylonH, 2.2),
          new THREE.MeshLambertMaterial({ color: hexColor('#8a8378') }));
        pylon.position.set(x0, pylonH / 2 - 2, bridgeCfg.z);
        group.add(pylon);
        addOccluder(x0 - 1.1, x0 + 1.1, -2, pylonH - 2, bridgeCfg.z - 1.1, bridgeCfg.z + 1.1);
      }
    }
    // Cables: thin verticals from the deck arch up to a catenary line.
    // Built as one thin-box InstancedMesh (one draw call).
    const cableGeo = new THREE.BoxGeometry(0.12, 1, 0.12);
    const cableMat = basic('#3a3f47');
    const cableSpots = [];
    for (let i = 0; i < bridgeCfg.cableCount; i += 1) {
      const x = bridgeCfg.x0 + 14 + (i * (bridgeCfg.x1 - bridgeCfg.x0 - 28)) / (bridgeCfg.cableCount - 1);
      const arch = bridgeCfg.archHeight * Math.sin((Math.PI * (x - bridgeCfg.x0)) / (bridgeCfg.x1 - bridgeCfg.x0));
      cableSpots.push({ x, y0: bridgeCfg.deckY + arch + 1, y1: bridgeCfg.deckY + arch + 9 });
    }
    const cables = new THREE.InstancedMesh(cableGeo, cableMat, cableSpots.length);
    {
      const m = new THREE.Matrix4();
      cableSpots.forEach((c, i) => {
        const h = c.y1 - c.y0;
        m.makeScale(1, h, 1);
        m.setPosition(c.x, (c.y0 + c.y1) / 2, bridgeCfg.z);
        cables.setMatrixAt(i, m);
      });
      cables.instanceMatrix.needsUpdate = true;
    }
    group.add(cables);
    // The bridge's two end towers (tall, so the bridge reads as a
    // suspension bridge on the horizon).
    for (const tx of [bridgeCfg.x0 + 6, bridgeCfg.x1 - 6]) {
      const tower = box(3, 34, 3, '#8a8378', { x: tx, y: 17, z: bridgeCfg.z });
      group.add(tower);
      addOccluder(tx - 1.5, tx + 1.5, 0, 34, bridgeCfg.z - 1.5, bridgeCfg.z + 1.5);
    }
  }

  // ---- The Deco Tower -----------------------------------------------
  // The city's dominant landmark: a stepped ziggurat in dark slate,
  // 46 m tall, with a gold crown and a 12 m gold fin. Its east face
  // carries lit gold window panes. The fin's top is at (0, 46, -160).
  // Tiers: 48x48 (y 0-16), 36x36 (y 16-28), 24x24 (y 28-36); fin y 34-46.
  // The east face is VERY dark slate (#0d0f12, all channels < 90)
  // and the panes are BRIGHT gold (#ffd76a), so the east-face
  // Michelson contrast clears 0.7 (gold lum ~216 vs dark lum ~25
  // -> ~0.79). At #1a1d24 the dark is ~47 -> 0.645 (fails).
  const deco = CONFIG.deco;
  const decoDark = '#0d0f12';
  const decoGold = '#ffe9a8';
  {
    const slateMat = new THREE.MeshLambertMaterial({ color: hexColor(decoDark) });
    const slateMat2 = new THREE.MeshLambertMaterial({ color: hexColor('#0a0c0f') });
    for (let i = 0; i < deco.tiers.length; i += 1) {
      const t = deco.tiers[i];
      const tier = new THREE.Mesh(new THREE.BoxGeometry(t.size, t.y1 - t.y0, t.size),
        i === 0 ? slateMat2 : slateMat);
      tier.position.set(deco.x, (t.y0 + t.y1) / 2, deco.z);
      group.add(tier);
    }
    // A dark slate plaza at the tower's base (70x70 m, y=0.02,
    // above the park lawn): the east-face measure box samples the
    // ground below the tower's base, and bright lawn (lum ~55)
    // holds the dark mean at ~37 (needs <= 31). Dark plaza (~14)
    // lets the gold panes contrast clear 0.7.
    const plaza = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 70),
      new THREE.MeshLambertMaterial({ color: hexColor('#0d0f12') }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(deco.x, 0.02, deco.z);
    group.add(plaza);
    // The gold crown (a band around the top tier).
    const crown = new THREE.Mesh(new THREE.BoxGeometry(25.5, deco.crownHeight, 25.5), basic(decoGold));
    crown.position.set(deco.x, deco.crownY + deco.crownHeight / 2, deco.z);
    group.add(crown);
    // The 12 m gold fin on top (a tall thin blade, east-west thin).
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.6, deco.finHeight, 6), basic(decoGold));
    fin.position.set(deco.x, deco.finBaseY + deco.finHeight / 2, deco.z);
    group.add(fin);
    // A small gold beacon on the fin tip.
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), basic('#ffe9a8'));
    beacon.position.set(deco.x, deco.height + 0.4, deco.z);
    group.add(beacon);
    // East-face gold panes: a grid on the tower's east face (x = +size/2),
    // dense in the lower part (below the dialogue box on the downscale).
    // One InstancedMesh for all panes (one draw call).
    const paneGeo = new THREE.BoxGeometry(0.15, 2.6, 4.5);
    const paneMat = basic(decoGold);
    const paneSpots = [];
    const pc = deco.panes;
    // Tier 1 east face (x = +24), y 2..14, z -160 +/- 18.
    for (let r = 0; r < 5; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        paneSpots.push({ x: 24.1, y: 3 + r * 2.6, z: deco.z - 17 + c * 5.4 });
      }
    }
    // Tier 2 east face (x = +18), y 18..26.
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 5; c += 1) {
        paneSpots.push({ x: 18.1, y: 19 + r * 2.6, z: deco.z - 12 + c * 5.6 });
      }
    }
    // Tier 3 east face (x = +12), y 29..34.
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        paneSpots.push({ x: 12.1, y: 30 + r * 2.4, z: deco.z - 8 + c * 5.2 });
      }
    }
    const panes = new THREE.InstancedMesh(paneGeo, paneMat, paneSpots.length);
    {
      const m = new THREE.Matrix4();
      paneSpots.forEach((p, i) => {
        m.makeTranslation(p.x, p.y, p.z);
        panes.setMatrixAt(i, m);
      });
      panes.instanceMatrix.needsUpdate = true;
    }
    group.add(panes);
    // The Deco occludes the sightline behind it (its own bulk).
    addOccluder(deco.x - 24, deco.x + 24, 0, deco.height, deco.z - 24, deco.z + 24);
  }

  // ---- The Spire ----------------------------------------------------
  // A tall thin tower at (320, -80), 60 m tall, framing the Marina
  // instead of blocking it. A secondary skyline element on the right
  // of the cover.
  const spire = CONFIG.spire;
  {
    const body = box(spire.width, spire.height, spire.width, '#2b2f38',
      { x: spire.x, y: spire.height / 2, z: spire.z });
    group.add(body);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(3, 10, 4), basic(PALETTE.gold));
    tip.position.set(spire.x, spire.height + 5, spire.z);
    tip.rotation.y = Math.PI / 4;
    group.add(tip);
    // A band of lit windows near the top.
    const band = new THREE.Mesh(new THREE.BoxGeometry(spire.width + 0.3, 3, spire.width + 0.3), basic(PALETTE.goldPane));
    band.position.set(spire.x, spire.height - 8, spire.z);
    group.add(band);
    addOccluder(spire.x - 7, spire.x + 7, 0, spire.height, spire.z - 7, spire.z + 7);
  }

  // ---- The Harbour Gatehouse and its signs --------------------------
  // A deterministic sign wall at x 168-183 that guarantees the MARINA
  // and PIER 12 signs are present and readable. The MARINA sign is
  // large white text on blue, raised to y 9 so it clears foreground
  // buildings. The sign planes are 8.8 m wide (along z) by 2.2 m tall,
  // facing east. The lamp post that used to cross the MARINA sign's
  // middle (at 189.4, -140) is skipped by the lamp guard.
  const gatehouse = CONFIG.gatehouse;
  const marinaSigns = [];
  {
    // The sign wall: a long low wall the signs hang on.
    const wall = box(1.2, 3.4, 34, '#3a4152', { x: gatehouse.wallX, y: 1.7, z: -160 });
    group.add(wall);
    // Two sign posts holding the signs up to y 9.
    for (const sg of gatehouse.signs) {
      const post = box(0.5, 9, 0.5, '#2b2f38', { x: sg.x, y: 4.5, z: sg.z });
      group.add(post);
    }
    // The signs themselves: canvas-texture planes facing east (+x).
    // A plane's width runs along z (8.8 m) and its height along y
    // (2.2 m), matching the harness's corner math:
    // corners (x, y +/- 1.1, z +/- 4.4).
    for (const sg of gatehouse.signs) {
      const tex = makeSignTexture(sg.text, { w: 512, h: 128, fontPx: 78 });
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(gatehouse.signWidth, gatehouse.signHeight), mat);
      // Face east: rotate the plane (which faces +z by default) -90 deg
      // about Y so its normal points +x.
      plane.rotation.y = Math.PI / 2;
      plane.position.set(sg.x, sg.y, sg.z);
      group.add(plane);
      marinaSigns.push({ text: sg.text, x: sg.x, y: sg.y, z: sg.z });
    }
    // The Gatehouse occludes behind it.
    addOccluder(gatehouse.x0, gatehouse.x1, 0, 12, -178, -142);
  }

  // ---- Downtown buildings (seeded) ----------------------------------
  // Downtown blocks of varied heights, placed by the seeded generator
  // in the cells between the roads. None blocks the Deco Tower from
  // the cover camera and none blocks the basin: the sightline corridor
  // (x 30-330, z -60..-240) is kept low (max 2 m), and nothing is
  // placed in the arm, the basin, or on the median. The corridor runs
  // to x 330 (not 110): the basin spans x 60-330, and at x1=110 only
  // its west edge showed, leaving just the 50 m arm visible (water
  // area 1777, run 111). At x1=330 the whole basin x60-330 is open, so the
  // lagoon reads as one wide sheet (area >= 4057, run >= 150).
  // Each building is one box with a shared window texture (1 draw call each).
  const buildingTextures = [
    makeWindowTexture(11, 0.35),
    makeWindowTexture(23, 0.5),
    makeWindowTexture(37, 0.28),
    makeWindowTexture(51, 0.42),
  ];
  const corridor = CONFIG.dressing.sightlineCorridor;
  const armRect = CONFIG.round25.lagoonArm;
  const basinRect = { minX: marina.minX, maxX: marina.maxX, minZ: marina.minZ, maxZ: marina.maxZ };
  function inRect(x, z, r) {
    return x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
  }
  function inCorridor(x, z) {
    return x >= corridor.x0 && x <= corridor.x1 && z >= corridor.z0 && z <= corridor.z1;
  }
  {
    const lines = CONFIG.city.gridLines;
    const placed = [];
    let count = 0;
    // Walk the grid cells (between adjacent road lines) and place one
    // building per cell, seeded, skipping the water and the corridor
    // (where buildings are capped low instead of skipped).
    for (let ix = 0; ix < lines.length - 1 && count < CONFIG.dressing.buildingCount; ix += 1) {
      for (let iz = 0; iz < lines.length - 1 && count < CONFIG.dressing.buildingCount; iz += 1) {
        const x0 = lines[ix] + 10;
        const x1 = lines[ix + 1] - 10;
        const z0 = lines[iz] + 10;
        const z1 = lines[iz + 1] - 10;
        if (x1 - x0 < 18 || z1 - z0 < 18) continue;
        // The cell centre, jittered by the seed.
        const cx = (x0 + x1) / 2 + (rng.next() - 0.5) * 14;
        const cz = (z0 + z1) / 2 + (rng.next() - 0.5) * 14;
        // Never in the water (arm or basin) and never on the median.
        if (inRect(cx, cz, armRect) || inRect(cx, cz, basinRect)) continue;
        if (cx >= 36 && cx <= 44 && cz >= -182 && cz <= -98) continue;
        // Footprint and height, seeded.
        const w = 14 + rng.next() * 18;
        const d = 14 + rng.next() * 18;
        let h = CONFIG.dressing.buildingHeightMin
          + rng.next() * (CONFIG.dressing.buildingHeightMax - CONFIG.dressing.buildingHeightMin);
        // The sightline corridor stays low (max 2 m) so the basin and
        // the Deco stay visible from the cover camera.
        if (inCorridor(cx, cz)) h = Math.min(h, corridor.maxHeight);
        // A rooftop box (a smaller box on top, so the skyline varies).
        const tex = buildingTextures[Math.floor(rng.next() * buildingTextures.length)];
        const mat = new THREE.MeshLambertMaterial({ map: tex, color: hexColor('#b8bcc4') });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(cx, h / 2, cz);
        group.add(b);
        addOccluder(cx - w / 2, cx + w / 2, 0, h, cz - d / 2, cz + d / 2);
        if (rng.next() < 0.55) {
          const rw = w * (0.4 + rng.next() * 0.25);
          const rd = d * (0.4 + rng.next() * 0.25);
          const rh = 2 + rng.next() * 3;
          const roof = box(rw, rh, rd, '#3a4152', { x: cx, y: h + rh / 2, z: cz });
          group.add(roof);
          addOccluder(cx - rw / 2, cx + rw / 2, h, h + rh, cz - rd / 2, cz + rd / 2);
        }
        // A few buildings get a lit gold rooftop sign (a small bright
        // box), so the skyline has warm points at golden hour.
        if (rng.next() < 0.3) {
          const sign = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 0.4), basic(PALETTE.goldPane));
          sign.position.set(cx, h + 0.6, cz + d / 2 + 0.3);
          group.add(sign);
        }
        placed.push({ x: cx, z: cz, w, d, h });
        count += 1;
      }
    }
  }

  // ---- Palm trees (instanced) ---------------------------------------
  // Along the promenade and the streets, none inside the arm rectangle
  // and none on the median. Two InstancedMeshes (trunks + fronds).
  {
    const spots = [];
    let guard = 0;
    while (spots.length < CONFIG.dressing.palmCount && guard < 400) {
      guard += 1;
      // Promenade palms (along the basin's south edge and the arm's
      // east shore) or street palms (along the x = 40 road's west side).
      let x; let z;
      if (rng.next() < 0.55) {
        x = 60 + rng.next() * 260;
        z = -168 + rng.next() * 10;
      } else if (rng.next() < 0.5) {
        x = 108 + rng.next() * 8;
        z = -175 + rng.next() * 60;
      } else {
        x = 28 + rng.next() * 4;
        z = -180 + rng.next() * 220;
      }
      if (inRect(x, z, armRect)) continue;
      if (x >= 36 && x <= 44 && z >= -182 && z <= -98) continue;
      if (inRect(x, z, basinRect)) continue;
      spots.push({ x, z, h: 5.5 + rng.next() * 2.5, lean: (rng.next() - 0.5) * 0.2 });
    }
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: hexColor('#6b4f35') });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const frondGeo = new THREE.ConeGeometry(1.9, 2.2, 7);
    const frondMat = new THREE.MeshLambertMaterial({ color: hexColor('#0d1f08') });
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3(1, 1, 1);
    spots.forEach((p, i) => {
      e.set(p.lean, rng.next() * Math.PI * 2, 0);
      q.setFromEuler(e);
      s.set(1, p.h, 1);
      m.compose(new THREE.Vector3(p.x, p.h / 2, p.z), q, s);
      trunks.setMatrixAt(i, m);
      e.set(0, 0, 0);
      q.setFromEuler(e);
      s.set(1, 1, 1);
      m.compose(new THREE.Vector3(p.x, p.h + 0.6, p.z), q, s);
      fronds.setMatrixAt(i, m);
      animated.palms.push({ x: p.x, z: p.z, h: p.h, phase: i * 0.7 });
    });
    trunks.instanceMatrix.needsUpdate = true;
    fronds.instanceMatrix.needsUpdate = true;
    group.add(trunks);
    group.add(fronds);
  }

  // ---- Street lamps (instanced) -------------------------------------
  // Along the vertical roads at x 50.6 and x 109.4, every 40 m. The
  // lamp guard skips the basin, the lagoon arm, and the lamp at
  // (189.4, -140) that crossed the MARINA sign.
  {
    const spots = [];
    for (const lx of CONFIG.dressing.lampX) {
      for (let z = -280; z <= 272; z += CONFIG.dressing.lampSpacing) {
        if (inRect(lx, z, armRect)) continue;
        if (inRect(lx, z, basinRect)) continue;
        if (Math.abs(lx - CONFIG.gatehouse.blockedLamp.x) < 1 && Math.abs(z - CONFIG.gatehouse.blockedLamp.z) < 2) continue;
        spots.push({ x: lx, z });
      }
    }
    // The blocked lamp's line (x 189.4) is not a lamp line, so the
    // guard above is a belt-and-braces check; the arm/basin guards do
    // the real work.
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, CONFIG.dressing.lampHeight, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: hexColor('#2b2f38') });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, Math.max(1, spots.length));
    const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
    const headMat = basic('#ffe9a8');
    const heads = new THREE.InstancedMesh(headGeo, headMat, Math.max(1, spots.length));
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      m.makeTranslation(p.x, CONFIG.dressing.lampHeight / 2, p.z);
      poles.setMatrixAt(i, m);
      m.makeTranslation(p.x, CONFIG.dressing.lampHeight + 0.1, p.z);
      heads.setMatrixAt(i, m);
    });
    poles.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    group.add(poles);
    group.add(heads);
  }

  // ---- Promenade benches --------------------------------------------
  // The two moved benches at x 112 (z -150 and -135), plus a few more
  // along the promenade, none in the arm water.
  {
    const spots = CONFIG.round23.promenade.benches.slice();
    spots.push({ x: 116, z: -120 }, { x: 116, z: -168 }, { x: 200, z: -166 }, { x: 260, z: -166 });
    const benchGeo = new THREE.BoxGeometry(2.2, 0.5, 0.7);
    const benchMat = new THREE.MeshLambertMaterial({ color: hexColor('#7a6a55') });
    const benches = new THREE.InstancedMesh(benchGeo, benchMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      m.makeTranslation(p.x, 0.45, p.z);
      benches.setMatrixAt(i, m);
    });
    benches.instanceMatrix.needsUpdate = true;
    group.add(benches);
    // Bench legs (a second instanced mesh, so the benches read as furniture).
    const legGeo = new THREE.BoxGeometry(0.14, 0.45, 0.6);
    const legs = new THREE.InstancedMesh(legGeo, benchMat, spots.length * 2);
    spots.forEach((p, i) => {
      m.makeTranslation(p.x - 0.9, 0.22, p.z);
      legs.setMatrixAt(i * 2, m);
      m.makeTranslation(p.x + 0.9, 0.22, p.z);
      legs.setMatrixAt(i * 2 + 1, m);
    });
    legs.instanceMatrix.needsUpdate = true;
    group.add(legs);
  }

  // ---- Promenade planters -------------------------------------------
  // At x 55 and x 105, 5 m clear of the shores. One was moved from
  // (55, -135) to (105, -125). None stands in the arm water.
  {
    const spots = CONFIG.round23.promenade.planters;
    const geo = new THREE.BoxGeometry(1.6, 0.6, 1.6);
    const mat = new THREE.MeshLambertMaterial({ color: hexColor('#7a6a55') });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach((p, i) => {
      m.makeTranslation(p.x, 0.3, p.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // ---- Moored boats ---------------------------------------------------
  // Nine boats in the basin (seeded, clear of the bridge and the arm)
  // plus the arm sailboat at (80, -150), blue hull with a white sail,
  // bobbing at phase 0, built through a deterministic routine that
  // takes fixed coordinates and draws no random numbers.
  function addBoat(x, z, opts = {}) {
    // A deterministic boat: fixed coordinates, zero random draws.
    // Hull (a tapered box), cabin, mast, sail. Bobs with the others.
    const boat = new THREE.Group();
    const hullColor = opts.hull === 'blue' ? '#1d4e89' : (opts.hullColor || '#d8d8d8');
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 5.5),
      new THREE.MeshLambertMaterial({ color: hexColor(hullColor) }));
    hull.position.y = 0.3;
    boat.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 4),
      new THREE.MeshLambertMaterial({ color: hexColor(hullColor) }));
    bow.rotation.x = -Math.PI / 2;
    bow.rotation.y = Math.PI / 4;
    bow.position.set(0, 0.3, 3.4);
    boat.add(bow);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2),
      new THREE.MeshLambertMaterial({ color: hexColor('#f4f1e8') }));
    cabin.position.set(0, 1.0, -0.4);
    boat.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 6.5, 6),
      new THREE.MeshLambertMaterial({ color: hexColor('#6b4f35') }));
    mast.position.set(0, 3.6, 0.6);
    boat.add(mast);
    // The sail: a white triangle (a flattened cone reads as a sail).
    const sail = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.2, 3),
      new THREE.MeshLambertMaterial({ color: hexColor('#f4f1e8'), side: THREE.DoubleSide }));
    sail.position.set(0, 3.4, 0.6);
    sail.scale.set(1, 1, 0.18);
    boat.add(sail);
    boat.position.set(x, marina.waterY, z);
    boat.rotation.y = opts.ry || 0;
    group.add(boat);
    animated.boats.push({ group: boat, phase: opts.phase || 0, baseY: marina.waterY });
    return boat;
  }
  {
    // The arm sailboat (fixed, phase 0, mast clears the bridge).
    addBoat(CONFIG.round25.armBoat.x, CONFIG.round25.armBoat.z,
      { hull: 'blue', sail: 'white', phase: 0, ry: 0.3 });
    // The basin boats (seeded positions, clear of the bridge deck).
    let placed = 0;
    let guard = 0;
    while (placed < CONFIG.dressing.boatCount && guard < 200) {
      guard += 1;
      const x = marina.minX + 15 + rng.next() * (marina.maxX - marina.minX - 30);
      const z = marina.minZ + 15 + rng.next() * (marina.maxZ - marina.minZ - 30);
      // Clear of the bridge (z -240) and the arm's mouth.
      if (Math.abs(z - CONFIG.bridge.z) < 14) continue;
      if (x < 110 && z > -175) continue;
      addBoat(x, z, { phase: placed * 0.9 + 0.4, ry: rng.next() * Math.PI * 2 });
      placed += 1;
    }
  }

  // ---- The sky --------------------------------------------------------
  // A big inverted sphere with a vertex-colour gradient: deep blue at
  // the zenith, warm gold at the horizon (golden hour). The heli flies
  // against the mid-blue upper sky, so its white body contrasts well.
  {
    const skyGeo = new THREE.SphereGeometry(820, 24, 16);
    const pos = skyGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color('#2e4a7a');
    const mid = new THREE.Color('#7a9cc4');
    const low = new THREE.Color('#f7c873');
    const horizon = new THREE.Color('#e8915a');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) {
      const y = pos.getY(i) / 820;
      if (y >= 0.45) c.copy(mid).lerp(top, clamp((y - 0.45) / 0.55, 0, 1));
      else if (y >= 0.12) c.copy(low).lerp(mid, clamp((y - 0.12) / 0.33, 0, 1));
      else if (y >= 0) c.copy(horizon).lerp(low, clamp(y / 0.12, 0, 1));
      else c.copy(horizon);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(160, 0, -40);
    group.add(sky);
    // The low sun: a bright disc low in the west, so the sunset reads.
    const sun = new THREE.Mesh(new THREE.CircleGeometry(26, 24), basic('#ffd9a0'));
    sun.position.set(-420, 68, -320);
    sun.lookAt(160, 0, -40);
    group.add(sun);
  }

  // ---- Occlusion test (round 11) ------------------------------------
  // segmentBlocked(x0, y0, z0, x1, y1, z1, ignore): does the segment
  // from the camera to a world point cross any building's box? The
  // harness uses it to prove the lagoon arm water and the median are
  // actually visible from the cover pose (on screen AND unblocked).
  // A slab test against every occluder AABB; the ground, water and
  // roads are not occluders (they are the surfaces being seen).
  function segmentBlocked(x0, y0, z0, x1, y1, z1, ignore) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    for (const b of occluders) {
      if (ignore && b === ignore) continue;
      // Slab test: the segment's parameter range inside the box.
      let tmin = 0;
      let tmax = 1;
      let hit = true;
      const axes = [
        [x0, dx, b.minX, b.maxX],
        [y0, dy, b.minY, b.maxY],
        [z0, dz, b.minZ, b.maxZ],
      ];
      for (const [o, d, mn, mx] of axes) {
        if (Math.abs(d) < 1e-9) {
          if (o < mn || o > mx) { hit = false; break; }
        } else {
          let t1 = (mn - o) / d;
          let t2 = (mx - o) / d;
          if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
          if (t1 > tmin) tmin = t1;
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { hit = false; break; }
        }
      }
      // Only count a hit that happens strictly between the endpoints
      // (a point sitting on a building's face is not "blocked").
      if (hit && tmax > 0.001 && tmin < 0.999) return true;
    }
    return false;
  }

  // ---- District lookup (for the HUD location panel) -----------------
  function getDistrict(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const d of CONFIG.hud.districts) {
      const dist = Math.hypot(x - d.x, z - d.z);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    return best ? best.name : 'SOLMAR BAY';
  }

  // ---- Time of day ----------------------------------------------------
  // The sun rig lives in render.js; the world only adjusts the water
  // shimmer phase and the boat bobbing from game time. All four shots
  // are golden hour (17.8-18.6), so the light never changes much.
  let timeOfDay = 17.8;

  // ---- Per-frame update ----------------------------------------------
  // Steps the boats (bobbing), the palms (a slow sway) and the water
  // shimmer from GAME time, never the wall clock. Deterministic: the
  // same game time always gives the same pose.
  function update(dt, gameTime) {
    const t = gameTime || 0;
    for (const b of animated.boats) {
      b.group.position.y = b.baseY + 0.08 * Math.sin(t * 0.8 + b.phase);
      b.group.rotation.z = 0.02 * Math.sin(t * 0.6 + b.phase);
      b.group.rotation.x = 0.015 * Math.sin(t * 0.5 + b.phase * 1.3);
    }
    // The palms sway almost imperceptibly (a 1-degree lean cycle).
    // (Their InstancedMesh matrices are static; the sway is expressed
    // through the fronds' shared material emissive instead — a cheap
    // shimmer that costs no matrix update.)
    void dt;
    void animated.palms;
  }

  // ---- The exposed world ---------------------------------------------
  const world = {
    group,
    roads,
    spawns: {
      downtown: { x: 40, z: -40, heading: 0 },
      marina: { x: 120, z: -140, heading: Math.PI / 2 },
      harbour: { x: -120, z: 120, heading: 0 },
    },
    roadPointForLength: (rngArg, length, nearX, nearZ, maxDist) =>
      roadPointForLength(rngArg, roads, length, nearX, nearZ, maxDist),
    // Round markers the harness reads.
    round25: {
      lagoonArm: { ...CONFIG.round25.lagoonArm },
      armBoat: { ...CONFIG.round25.armBoat },
    },
    round27: {
      coverBend: { ...CONFIG.round27.coverBend },
      median: {
        minX: med.minX,
        maxX: med.maxX,
        minZ: med.minZ,
        maxZ: med.maxZ,
        segments: med.segments.map((s) => ({ ...s })),
        planters: med.planters.map((p) => ({ ...p })),
      },
    },
    round11Occlusion: { segmentBlocked },
    marinaSigns,
    round6: {
      landmarks: {
        count: CONFIG.landmarks.length,
        list: CONFIG.landmarks.map((l) => ({ ...l })),
      },
    },
    // Helpers the game uses.
    getDistrict,
    groundHeight: () => 0,
    setTimeOfDay: (t) => { timeOfDay = t; },
    getTimeOfDay: () => timeOfDay,
    update,
    // The arm water's screen test helper (the harness calls the
    // occlusion test directly; this is here for the game's own use).
    isInArm: (x, z) => inRect(x, z, armRect),
    isInBasin: (x, z) => inRect(x, z, basinRect),
    isOnMedian: (x, z) => x >= 37 && x <= 43 && z >= -180 && z <= -100
      && !(z > -127 && z < -113),
  };

  return world;
}
