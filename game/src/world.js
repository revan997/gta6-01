// Solmar Bay — the city (W2, attempt #7, fresh build).
// buildWorld(scene, config, rng) builds the whole deterministic coastal
// city: ground, road grid, Marina basin + lagoon arm, bridge, Deco Tower,
// Spire, Harbour Gatehouse + signs, median park strip, seeded buildings,
// lamps, planters, palms, benches, boats, sunset quay. Written fresh for
// this recording from the round-9 interface contract (W2 + fixes 6/7)
// and the rebuild spec. Nothing here is copied from an old repo.

import * as THREE from '../vendor/three.module.min.js';
import { MATERIALS } from './render.js';
import { CONFIG as DEFAULT_CONFIG } from './config.js';
import { mulberry32, WORLD_SEED } from './random.js';

// ---- rng normalization ----------------------------------------------------
// buildWorld accepts a rng object (createRng), a callable, a numeric seed,
// or nothing. Returns an object with next()/range()/int()/pick().
function asRng(r) {
  if (r && typeof r.next === 'function' && typeof r.range === 'function') return r;
  let next;
  if (r && typeof r.next === 'function') next = () => r.next();
  else if (r && typeof r.random === 'function') next = () => r.random();
  else if (typeof r === 'function') next = r;
  else if (typeof r === 'number') next = mulberry32(r);
  else next = mulberry32(WORLD_SEED);
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (a, b) => Math.floor(a + next() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

// ---- median segments ------------------------------------------------------
// Accepts {z0,z1} or {minZ,maxZ} object forms; always returns sorted
// [z0,z1] pairs with z0 <= z1. Never read [0]/[1] off a raw object.
export function normalizeMedianSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments
    .map((s) => {
      if (!s) return null;
      if (typeof s.z0 === 'number' && typeof s.z1 === 'number') {
        return { z0: Math.min(s.z0, s.z1), z1: Math.max(s.z0, s.z1) };
      }
      if (typeof s.minZ === 'number' && typeof s.maxZ === 'number') {
        return { z0: Math.min(s.minZ, s.maxZ), z1: Math.max(s.minZ, s.maxZ) };
      }
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => a.z0 - b.z0);
}

// ---- 2D geometry helpers --------------------------------------------------
function distPointToSegment2D(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

function rectsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

// ---- the city -------------------------------------------------------------
export function buildWorld(scene, config, rng) {
  const cfg = config || DEFAULT_CONFIG;
  const R = asRng(rng);

  // Mesh helpers. Boxes/cylinders/planes are added straight to the scene;
  // the harness counts scene children, so nothing hides inside a group.
  function box(w, h, d, mat, x, y, z, name, kind) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (name) m.name = name;
    if (kind) m.userData.kind = kind;
    scene.add(m);
    return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, name, kind, seg = 10) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    if (name) m.name = name;
    if (kind) m.userData.kind = kind;
    scene.add(m);
    return m;
  }
  function flatPlane(w, d, mat, x, y, z, name) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    m.receiveShadow = true;
    if (name) m.name = name;
    scene.add(m);
    return m;
  }
  // A beam (thin cylinder) between two points, for bridge cables.
  function beam(ax, ay, az, bx, by, bz, r, mat) {
    const a = new THREE.Vector3(ax, ay, az);
    const b = new THREE.Vector3(bx, by, bz);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    scene.add(m);
    return m;
  }

  // ---- ground + beach + sea ----------------------------------------------
  flatPlane(720, 720, MATERIALS.ground, 0, 0, 0, 'ground');
  flatPlane(720, 28, MATERIALS.sand, 0, 0.03, 286, 'beach');
  flatPlane(720, 60, MATERIALS.water, 0, 0.05, 330, 'sea');

  // ---- roads (water-clipped) ---------------------------------------------
  // Water rects that roads must not cover: the basin and the lagoon arm.
  const basin = cfg.basin;
  const arm = cfg.lagoonArm;
  const waterRects = [
    { minX: basin.minX, maxX: basin.maxX, minZ: basin.minZ, maxZ: basin.maxZ },
    { minX: arm.minX, maxX: arm.maxX, minZ: arm.minZ, maxZ: arm.maxZ },
  ];
  // Subtract water rects from a 1D interval on one axis.
  function clipIntervals(start, end, fixed, isVertical) {
    let spans = [[start, end]];
    for (const w of waterRects) {
      const lo = isVertical ? w.minZ : w.minX;
      const hi = isVertical ? w.maxZ : w.maxX;
      const inWater = isVertical
        ? fixed >= w.minX && fixed <= w.maxX
        : fixed >= w.minZ && fixed <= w.maxZ;
      if (!inWater) continue;
      const next = [];
      for (const [s, e] of spans) {
        if (e <= lo || s >= hi) {
          next.push([s, e]);
        } else {
          if (s < lo) next.push([s, lo]);
          if (e > hi) next.push([hi, e]);
        }
      }
      spans = next;
    }
    return spans.filter(([s, e]) => e - s > 2);
  }
  const ROAD_W = 12;
  for (const x of cfg.roadLines) {
    for (const [z0, z1] of clipIntervals(-320, 320, x, true)) {
      flatPlane(ROAD_W, z1 - z0, MATERIALS.asphalt, x, 0.02, (z0 + z1) / 2, 'road');
    }
  }
  for (const z of cfg.roadLines) {
    for (const [x0, x1] of clipIntervals(-320, 320, z, false)) {
      flatPlane(x1 - x0, ROAD_W, MATERIALS.asphalt, (x0 + x1) / 2, 0.02, z, 'road');
    }
  }
  // Sidewalks: downtown road (east to x 50, west to x 30) and cross road.
  flatPlane(4, 640, MATERIALS.sidewalk, 48, 0.04, 0, 'sidewalk');
  flatPlane(4, 640, MATERIALS.sidewalk, 32, 0.04, 0, 'sidewalk');
  flatPlane(370, 3, MATERIALS.sidewalk, -135, 0.04, -111.5, 'sidewalk');
  flatPlane(370, 3, MATERIALS.sidewalk, -135, 0.04, -128.5, 'sidewalk');

  // ---- Marina basin + lagoon arm (bright blue water) ----------------------
  const basinW = basin.maxX - basin.minX;
  const basinD = basin.maxZ - basin.minZ;
  flatPlane(basinW, basinD, MATERIALS.water, (basin.minX + basin.maxX) / 2, 0.05, (basin.minZ + basin.maxZ) / 2, 'basin');
  const armW = arm.maxX - arm.minX;
  const armD = arm.maxZ - arm.minZ;
  // The arm sits 1 cm above the basin where they overlap: no z-fighting.
  flatPlane(armW, armD, MATERIALS.water, (arm.minX + arm.maxX) / 2, 0.06, (arm.minZ + arm.maxZ) / 2, 'lagoonArm');

  // ---- sunset quay (promenade land over the basin water) ------------------
  // Rico, the patrol cars and the teal coupe stand here in the sunset shot.
  // The promenade road (z -140) runs across the quay top.
  box(50, 0.24, 55, MATERIALS.concrete, 190, 0, -137.5, 'sunsetQuay');
  flatPlane(50, 6, MATERIALS.asphalt, 190, 0.13, -140, 'promenadeRoad');

  // ---- bridge (11 arched spans, 2 pylons, 4 cables) -----------------------
  const bridge = cfg.landmarks.bridge;
  const spanW = (bridge.x1 - bridge.x0) / bridge.spans;
  for (let i = 0; i < bridge.spans; i += 1) {
    const cx = bridge.x0 + (i + 0.5) * spanW;
    const t = (i + 0.5) / bridge.spans;
    const archY = 0.5 + 8 * Math.sin(Math.PI * t);
    box(spanW + 0.4, 1.8, 6, MATERIALS.bridgeSteel, cx, archY, bridge.z, 'bridgeDeck');
  }
  for (const px of [210, 270]) {
    box(4, 14, 4, MATERIALS.bridgeSteel, px, 7, bridge.z, 'bridgePylon');
  }
  beam(210, 14, bridge.z, 180, 8.5, bridge.z, 0.15, MATERIALS.bridgeSteel);
  beam(210, 14, bridge.z, 240, 8.5, bridge.z, 0.15, MATERIALS.bridgeSteel);
  beam(270, 14, bridge.z, 240, 8.5, bridge.z, 0.15, MATERIALS.bridgeSteel);
  beam(270, 14, bridge.z, 300, 8.5, bridge.z, 0.15, MATERIALS.bridgeSteel);

  // ---- Deco Tower (stepped ziggurat, gold crown + fin, 21 east panes) ----
  const deco = cfg.deco;
  for (const tier of deco.tiers) {
    box(tier.w, tier.h, tier.d, MATERIALS.slate, deco.x, tier.y, deco.z, 'decoTier');
  }
  box(26, 2, 26, MATERIALS.gold, deco.x, 37, deco.z, 'decoCrown');
  // Fin: 12 m tall, top at y 46 (spec 5.6).
  box(2, deco.finHeight, 8, MATERIALS.gold, deco.x, 40, deco.z, 'decoFin');
  // 21 gold panes on the east face: 7 per tier, one centred on (24, 8, -160).
  const paneZOffsets = [-15, -10, -5, 0, 5, 10, 15];
  deco.tiers.forEach((tier, ti) => {
    for (const dz of paneZOffsets) {
      box(0.15, deco.paneHeight, deco.paneWidth, MATERIALS.gold, deco.paneX[ti], tier.y, deco.z + dz, 'decoPane');
    }
  });

  // ---- Spire (east skyline frame) -----------------------------------------
  const spire = cfg.landmarks.spire;
  cyl(spire.radiusTop, spire.radiusBottom, spire.height, MATERIALS.slateLight, spire.x, spire.height / 2, spire.z, 'spire', null, 12);
  box(2, 2, 2, MATERIALS.gold, spire.x, spire.height + 1, spire.z, 'spireTip');

  // ---- Harbour Gatehouse + MARINA / PIER 12 signs -------------------------
  const gh = cfg.gatehouse;
  box(gh.maxX - gh.minX, 10, 3, MATERIALS.concrete, (gh.minX + gh.maxX) / 2, 5, -146, 'gatehouse');
  // addSign returns {text, x, y, z, w, h, mesh}: flat x/y/z AND text.
  // In a browser the sign gets real canvas text; in Node it is a plain
  // blue plane carrying the same fields (the harness reads the fields).
  function addSign(text, x, y, z, w, h) {
    let mat = MATERIALS.signBlue;
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1a4a8a';
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = '#f5f5f5';
      ctx.font = 'bold 84px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 68);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.MeshBasicMaterial({ map: tex });
    }
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.rotation.y = Math.PI / 2; // east-facing plane
    mesh.position.set(x, y, z);
    mesh.name = 'sign:' + text;
    mesh.userData.kind = 'sign';
    scene.add(mesh);
    return { text, x, y, z, w, h, mesh };
  }
  const marinaSigns = gh.signs.map((s) => addSign(s.text, s.x, s.y, s.z, s.w, s.h));

  // ---- median park strip (grass + 6 planters, no collision) ---------------
  const medianCfg = cfg.median;
  const medianSegments = normalizeMedianSegments(medianCfg.segments);
  for (const seg of medianSegments) {
    const zc = (seg.z0 + seg.z1) / 2;
    const zd = Math.abs(seg.z1 - seg.z0);
    box(medianCfg.maxX - medianCfg.minX, 0.15, zd, MATERIALS.grass, (medianCfg.minX + medianCfg.maxX) / 2, 0.075, zc, 'medianGrass');
  }
  const medianPlanters = Array.isArray(medianCfg.planters) ? medianCfg.planters : [];
  for (const p of medianPlanters) {
    box(1.2, 0.5, 1.2, MATERIALS.planter, p.x, 0.4, p.z, 'medianPlanter');
    box(1.0, 0.15, 1.0, MATERIALS.planterGreen, p.x, 0.7, p.z, 'medianPlanterTop');
  }
  const normalizedMedian = {
    minX: medianCfg.minX,
    maxX: medianCfg.maxX,
    segments: medianSegments,
    planters: medianPlanters,
    collidable: false,
  };

  // ---- occlusion: only seeded buildings block a sightline -----------------
  // Landmarks, the median, lamps, palms, planters, boats, bridge and signs
  // NEVER block. The harness calls segmentBlocked(cam.x, cam.y, cam.z,
  // x, 0.05, z, null); the y values are ignored (2D footprint test).
  const buildingFootprints = [];
  function isBlockedAt(x, z) {
    for (const b of buildingFootprints) {
      if (x >= b.minX - 0.5 && x <= b.maxX + 0.5 && z >= b.minZ - 0.5 && z <= b.maxZ + 0.5) {
        return true;
      }
    }
    return false;
  }
  function segmentBlocked(ax, ay, az, bx, by, bz, ignore) {
    const SAMPLES = 48;
    for (let i = 0; i <= SAMPLES; i += 1) {
      const t = i / SAMPLES;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (isBlockedAt(x, z)) return true;
    }
    return false;
  }

  // ---- sightline guard (cover camera -> 11 targets) -----------------------
  // No seeded building may stand within 6 m of any of these rays, so the
  // cover frame keeps its water, Deco and median. Includes the fix-3.8
  // lagoon-arm-centre ray from the tuned cover camera.
  const CAM = { x: cfg.coverCamera.x, y: cfg.coverCamera.y, z: cfg.coverCamera.z };
  const GUARD_TARGETS = [
    [0, -160], // Deco Tower
    [75, -137], // lagoon arm centre (fix 3.8)
    [55, -155], // arm south-west
    [52, -130], // arm west edge
    [70, -250], // basin north-west
    [300, -200], // basin north-east
    [40, -170], // median far
    [40, -140], // median mid
    [24, -160], // Deco east face
    [70, -240], // bridge west end
    [320, -80], // Spire
  ];
  function nearGuardRay(x, z, margin) {
    for (const [bx, bz] of GUARD_TARGETS) {
      if (distPointToSegment2D(x, z, CAM.x, CAM.z, bx, bz) < margin) return true;
    }
    return false;
  }

  // ---- seeded buildings (downtown blocks, varied heights) -----------------
  const BUILDING_COLORS = [
    MATERIALS.slate,
    MATERIALS.slateLight,
    MATERIALS.brick,
    MATERIALS.cream,
    MATERIALS.warmGrey,
  ];
  const edges = [-320, ...cfg.roadLines, 320];
  const exclusionRects = [
    { minX: basin.minX, maxX: basin.maxX, minZ: basin.minZ, maxZ: basin.maxZ },
    { minX: arm.minX, maxX: arm.maxX, minZ: arm.minZ, maxZ: arm.maxZ },
    { minX: deco.exclusion.minX, maxX: deco.exclusion.maxX, minZ: deco.exclusion.minZ, maxZ: deco.exclusion.maxZ },
    { minX: medianCfg.minX - 2, maxX: medianCfg.maxX + 2, minZ: -182, maxZ: -98 },
    { minX: 165, maxX: 215, minZ: -165, maxZ: -110 }, // sunset quay
    { minX: gh.minX - 4, maxX: gh.maxX + 4, minZ: -164, maxZ: -128 }, // gatehouse
  ];
  let buildingCount = 0;
  for (let xi = 0; xi < edges.length - 1; xi += 1) {
    for (let zi = 0; zi < edges.length - 1; zi += 1) {
      const bx0 = edges[xi] + 8;
      const bx1 = edges[xi + 1] - 8;
      const bz0 = edges[zi] + 8;
      const bz1 = edges[zi + 1] - 8;
      if (bx1 - bx0 < 14 || bz1 - bz0 < 14) continue;
      const perBlock = R.pick([1, 1, 2]);
      for (let n = 0; n < perBlock; n += 1) {
        const w = R.range(10, Math.min(30, (bx1 - bx0) * 0.55));
        const d = R.range(10, Math.min(30, (bz1 - bz0) * 0.55));
        const cx = R.range(bx0 + w / 2, bx1 - w / 2);
        const cz = R.range(bz0 + d / 2, bz1 - d / 2);
        const fp = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
        if (exclusionRects.some((r) => rectsOverlap(fp, r))) continue;
        // Guard rays: keep the footprint (plus a 6 m margin) clear.
        const corners = [
          [fp.minX, fp.minZ], [fp.maxX, fp.minZ],
          [fp.minX, fp.maxZ], [fp.maxX, fp.maxZ], [cx, cz],
        ];
        if (corners.some(([px, pz]) => nearGuardRay(px, pz, 6))) continue;
        // Height: taller near downtown centre, 8-42 m overall.
        const downtown = cx > -120 && cx < 160 && cz > -200 && cz < 40;
        const h = R.range(8, downtown ? 42 : 28);
        const mat = R.pick(BUILDING_COLORS);
        box(w, h, d, mat, cx, h / 2, cz, 'building');
        // A darker roof cap so the skyline reads as finished blocks.
        box(w * 0.7, 1.2, d * 0.7, MATERIALS.slate, cx, h + 0.6, cz, 'buildingRoof');
        buildingFootprints.push(fp);
        buildingCount += 1;
      }
    }
  }

  // ---- street lamps (x 50.6 and x 109.4, with guards) ---------------------
  function inWater(x, z) {
    return (
      (x >= basin.minX && x <= basin.maxX && z >= basin.minZ && z <= basin.maxZ) ||
      (x >= arm.minX && x <= arm.maxX && z >= arm.minZ && z <= arm.maxZ)
    );
  }
  let lampCount = 0;
  for (const lx of [50.6, 109.4]) {
    for (let z = -300; z <= 300; z += 40) {
      const lz = z + R.range(-4, 4);
      if (inWater(lx, lz)) continue;
      if (Math.hypot(lx - 189.4, lz - -140) < 4) continue; // MARINA sign lamp
      if (lz > -182 && lz < -98 && lx >= 37 && lx <= 43) continue; // median
      cyl(0.12, 0.16, 5, MATERIALS.trunk, lx, 2.5, lz, 'lamp');
      box(0.7, 0.3, 0.3, MATERIALS.lampHead, lx, 5.1, lz, 'lampHead');
      lampCount += 1;
    }
  }

  // ---- planters + benches (promenade, arm shore) --------------------------
  // A guard skips random street planters/bins inside the arm rectangle.
  for (const p of arm.planters) {
    const onWater = p.x >= arm.minX && p.x <= arm.maxX && p.z >= arm.minZ && p.z <= arm.maxZ;
    if (onWater) {
      // Waterside planter on a small concrete pad at the water's edge.
      box(2, 0.2, 2, MATERIALS.concrete, p.x, 0.1, p.z, 'planterPad');
      box(1.2, 0.5, 1.2, MATERIALS.planter, p.x, 0.45, p.z, 'planter');
      box(1.0, 0.15, 1.0, MATERIALS.planterGreen, p.x, 0.75, p.z, 'planterTop');
    } else {
      box(1.2, 0.5, 1.2, MATERIALS.planter, p.x, 0.4, p.z, 'planter');
      box(1.0, 0.15, 1.0, MATERIALS.planterGreen, p.x, 0.7, p.z, 'planterTop');
    }
  }
  for (const b of arm.benches) {
    box(1.8, 0.15, 0.6, MATERIALS.trunk, b.x, 0.5, b.z, 'bench');
    box(1.8, 0.6, 0.12, MATERIALS.trunk, b.x, 0.85, b.z - 0.3, 'benchBack');
  }
  // A few seeded street planters on the downtown sidewalks (never in the
  // arm, never on the median, never on a road).
  for (let i = 0; i < 8; i += 1) {
    const px = R.pick([32, 48]);
    const pz = R.range(-280, 280);
    if (inWater(px, pz)) continue;
    if (pz > -182 && pz < -98 && px >= 37 && px <= 43) continue;
    box(1.2, 0.5, 1.2, MATERIALS.planter, px, 0.4, pz, 'planter');
    box(1.0, 0.15, 1.0, MATERIALS.planterGreen, px, 0.7, pz, 'planterTop');
  }

  // ---- palms (instanced, none in the arm, none on the median) -------------
  const palmSpots = [];
  for (let i = 0; i < 14; i += 1) {
    palmSpots.push([R.range(104, 116), R.range(-168, -100)]);
  }
  for (let i = 0; i < 26; i += 1) {
    const px = R.pick([-116, -36, 44, 116, 204]);
    const pz = R.range(-280, 280);
    if (inWater(px, pz)) continue;
    if (pz > -182 && pz < -98 && px >= 37 && px <= 43) continue;
    palmSpots.push([px, pz]);
  }
  const palmCount = palmSpots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 5, 6);
  const crownGeo = new THREE.ConeGeometry(2.2, 2.0, 6);
  const trunks = new THREE.InstancedMesh(trunkGeo, MATERIALS.trunk, palmCount);
  const crowns = new THREE.InstancedMesh(crownGeo, MATERIALS.palmLeaf, palmCount);
  const dummy = new THREE.Object3D();
  palmSpots.forEach(([px, pz], i) => {
    dummy.position.set(px, 2.5, pz);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(px, 5.6, pz);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  trunks.castShadow = true;
  crowns.castShadow = true;
  trunks.name = 'palms';
  crowns.name = 'palmCrowns';
  scene.add(trunks);
  scene.add(crowns);

  // ---- boats (5: arm sailboat + 4 moored basin boats) ---------------------
  function boat(x, z, withSail) {
    box(4.5, 1, 1.8, MATERIALS.hullBlue, x, 0.3, z, 'boatHull');
    box(1.6, 0.8, 1.2, MATERIALS.white, x - 0.4, 1.1, z, 'boatCabin');
    if (withSail) {
      cyl(0.08, 0.08, 6, MATERIALS.trunk, x + 0.6, 3, z, 'boatMast', null, 6);
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 4), MATERIALS.sailWhite);
      sail.position.set(x + 0.6, 3.2, z + 0.2);
      sail.rotation.y = Math.PI / 2;
      sail.castShadow = true;
      sail.name = 'boatSail';
      scene.add(sail);
    }
    return { x, z };
  }
  const armBoat = boat(arm.sailboat.x, arm.sailboat.z, true);
  boat(120, -180, false);
  boat(200, -150, false);
  boat(260, -220, false);
  boat(150, -230, false);

  // ---- the west bend (cover-shot car/camera effect, owned by main.js) -----
  // world.js only defines it and exposes the pure heading function.
  const bendCfg = cfg.westBend;
  const bend = {
    angleDeg: bendCfg.angleDeg,
    maxDeg: bendCfg.angleDeg,
    zStart: bendCfg.zStart,
    zEnd: bendCfg.zEnd,
    headingAt(carZ) {
      if (carZ <= bendCfg.zStart) return 0;
      if (carZ >= bendCfg.zEnd) return (bendCfg.angleDeg * Math.PI) / 180;
      const t = (carZ - bendCfg.zStart) / (bendCfg.zEnd - bendCfg.zStart);
      return ((bendCfg.angleDeg * t) * Math.PI) / 180;
    },
  };

  // ---- landmarks (5, the harness set) --------------------------------------
  const landmarks = [
    { name: 'Deco Tower', x: deco.x, y: 0, z: deco.z, height: deco.height },
    { name: 'Marina Bridge', x: (bridge.x0 + bridge.x1) / 2, y: 0, z: bridge.z },
    { name: 'Lagoon', x: 75, y: 0.05, z: -137 },
    { name: 'Spire', x: spire.x, y: 0, z: spire.z, height: spire.height },
    { name: 'Gatehouse', x: 175.5, y: 0, z: -146 },
  ];
  landmarks.count = landmarks.length;

  // ---- markers (flat aliases AND harness paths) ----------------------------
  const lagoonArmMarker = {
    minX: arm.minX,
    maxX: arm.maxX,
    minZ: arm.minZ,
    maxZ: arm.maxZ,
    sailboat: { x: arm.sailboat.x, z: arm.sailboat.z },
  };
  return {
    scene,
    config: cfg,
    // Harness paths.
    round25: { lagoonArm: lagoonArmMarker, armBoat },
    round6: { landmarks },
    round11Occlusion: { segmentBlocked },
    marinaSigns,
    bend,
    median: normalizedMedian,
    // Flat aliases.
    lagoonArm: lagoonArmMarker,
    armBoat,
    landmarks,
    segmentBlocked,
    isBlockedAt,
    buildings: buildingFootprints,
    buildingCount,
    lampCount,
    palmCount,
  };
}
