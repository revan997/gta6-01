// world.js — Solmar Bay: the city, the harbour and the landmarks.
// Fresh build for the round-9 rebuild (attempt #5). Builds the whole city
// from CONFIG + a seeded rng: ground, roads, sidewalks, the Marina basin
// and lagoon arm water, the bridge, the Deco Tower, the Spire, the
// Gatehouse signs, seeded downtown buildings, lamps, planters, palms,
// benches and moored boats. Deterministic: fixed loops, fixed draw order,
// no wall clock, no unseeded randomness.
import * as THREE from '../vendor/three.module.min.js';

const DEFAULT_SEED = 20261122;

// ---------------------------------------------------------------- helpers

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Accept a function, an object with .next()/.random(), a numeric seed, or
// nothing. createRng returns an OBJECT, so callers must normalize it here.
function toCallableRng(rng) {
  if (typeof rng === 'function') return rng;
  if (rng && typeof rng.next === 'function') return () => rng.next();
  if (rng && typeof rng.random === 'function') return () => rng.random();
  if (typeof rng === 'number') return mulberry32(rng);
  return mulberry32(DEFAULT_SEED);
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

// Median segments arrive as {z0,z1} or {minZ,maxZ} objects (or [z0,z1]
// pairs). Normalize every one into a [z0,z1] pair with z0 <= z1. Never
// read [0]/[1] off a raw object — that produced NaN geometry before.
function normalizeSegments(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((s) => {
    if (Array.isArray(s)) {
      return [Math.min(s[0], s[1]), Math.max(s[0], s[1])];
    }
    const a = s.z0 !== undefined ? s.z0 : s.minZ !== undefined ? s.minZ : s[0];
    const b = s.z1 !== undefined ? s.z1 : s.maxZ !== undefined ? s.maxZ : s[1];
    return [Math.min(a, b), Math.max(a, b)];
  });
}

function rectsOverlap(a, b, margin) {
  const m = margin || 0;
  return (
    a.minX - m < b.maxX + m && a.maxX + m > b.minX - m &&
    a.minZ - m < b.maxZ + m && a.maxZ + m > b.minZ - m
  );
}

// 3D slab test: does the segment (a -> b) pass through the box?
// Used for the building sightline guard during placement.
function segmentHitsBox(ax, ay, az, bx, by, bz, box) {
  let tmin = 0;
  let tmax = 1;
  const axes = [
    [ax, bx - ax, box.minX, box.maxX],
    [ay, by - ay, box.minY, box.maxY],
    [az, bz - az, box.minZ, box.maxZ],
  ];
  for (let i = 0; i < axes.length; i += 1) {
    const o = axes[i][0];
    const d = axes[i][1];
    const lo = axes[i][2];
    const hi = axes[i][3];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const t = t1;
        t1 = t2;
        t2 = t;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------- materials

function makeMaterials() {
  return {
    ground: new THREE.MeshLambertMaterial({ color: 0x55663f }),
    asphalt: new THREE.MeshLambertMaterial({ color: 0x3a3a40 }),
    sidewalk: new THREE.MeshLambertMaterial({ color: 0x9a9a92 }),
    grass: new THREE.MeshLambertMaterial({ color: 0x4a7c3a }),
    // Bright blue lagoon water: Lambert 0x1f8fff + blue emissive 0.55 so
    // it reads bright blue on the downscale even in the sunset light.
    water: new THREE.MeshLambertMaterial({
      color: 0x1f8fff,
      emissive: 0x1f8fff,
      emissiveIntensity: 0.55,
    }),
    slate: new THREE.MeshLambertMaterial({ color: 0x25303e }),
    slateLight: new THREE.MeshLambertMaterial({ color: 0x2e3d4e }),
    gold: new THREE.MeshLambertMaterial({
      color: 0xd8a83c,
      emissive: 0x8a6a1a,
      emissiveIntensity: 0.4,
    }),
    goldPane: new THREE.MeshLambertMaterial({
      color: 0xffb800,
      emissive: 0xffb800,
      emissiveIntensity: 1.0,
    }),
    white: new THREE.MeshLambertMaterial({ color: 0xf2ede2 }),
    signBlue: new THREE.MeshLambertMaterial({ color: 0x1c4fd8 }),
    hullBlue: new THREE.MeshLambertMaterial({ color: 0x1f5fd0 }),
    hullWhite: new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    hullRed: new THREE.MeshLambertMaterial({ color: 0xa03a30 }),
    sail: new THREE.MeshLambertMaterial({ color: 0xf6f2e8, side: THREE.DoubleSide }),
    poleGrey: new THREE.MeshLambertMaterial({ color: 0x555c66 }),
    lampGlow: new THREE.MeshLambertMaterial({
      color: 0xffe9b0,
      emissive: 0xffd76a,
      emissiveIntensity: 1.2,
    }),
    trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
    palmLeaf: new THREE.MeshLambertMaterial({ color: 0x2f6b2f }),
    planter: new THREE.MeshLambertMaterial({ color: 0x7a7a72 }),
    shrub: new THREE.MeshLambertMaterial({ color: 0x3f7a33 }),
    benchWood: new THREE.MeshLambertMaterial({ color: 0x8a6a42 }),
    bridgeDeck: new THREE.MeshLambertMaterial({ color: 0x8a8a86 }),
    bridgePylon: new THREE.MeshLambertMaterial({ color: 0x6a6a66 }),
    cable: new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
  };
}

// ---------------------------------------------------------------- buildWorld

export function buildWorld(scene, config, rng) {
  const rand = toCallableRng(rng);
  const cfg = config || {};
  const mat = makeMaterials();
  const group = new THREE.Group();
  group.name = 'world';
  const meshes = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);

  function addMesh(geometry, material, x, y, z, name, kind) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    mesh.userData.kind = kind;
    group.add(mesh);
    meshes.push(mesh);
    return mesh;
  }

  function addBox(w, h, d, x, y, z, material, name, kind) {
    return addMesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, name, kind);
  }

  // ---------------------------------------------------------- config values
  const armCfg = cfg.lagoonArm || {};
  const lagoonArm = {
    minX: armCfg.minX !== undefined ? armCfg.minX : 50,
    maxX: armCfg.maxX !== undefined ? armCfg.maxX : 100,
    minZ: armCfg.minZ !== undefined ? armCfg.minZ : -160,
    maxZ: armCfg.maxZ !== undefined ? armCfg.maxZ : -114,
    sailboat: armCfg.sailboat || { x: 80, z: -150 },
  };
  const basinCfg = cfg.basin || {};
  const basin = {
    minX: basinCfg.minX !== undefined ? basinCfg.minX : 60,
    maxX: basinCfg.maxX !== undefined ? basinCfg.maxX : 330,
    minZ: basinCfg.minZ !== undefined ? basinCfg.minZ : -245,
    maxZ: basinCfg.maxZ !== undefined ? basinCfg.maxZ : -100,
    waterY: 0.05,
  };
  const medianCfg = cfg.median || {};
  const medianSegments = normalizeSegments(
    medianCfg.segments || [
      { z0: -113, z1: -100 },
      { z0: -180, z1: -127 },
    ],
  );
  const median = {
    x0: 37,
    x1: 43,
    segments: medianSegments,
    planters: medianCfg.planters || [],
    collidable: false,
  };
  const bendCfg = (cfg.round27 && cfg.round27.coverBend) || cfg.westBend || {};
  const bend = {
    maxDeg: bendCfg.maxDeg !== undefined ? bendCfg.maxDeg : -17,
    angleDeg: bendCfg.angleDeg !== undefined ? bendCfg.angleDeg : -17,
    zStart: bendCfg.zStart !== undefined ? bendCfg.zStart : -80,
    zEnd: bendCfg.zEnd !== undefined ? bendCfg.zEnd : -70,
    // Pure function of the car's z: 0 before the bend, ramping to -17
    // degrees over z -80..-70, holding -17 after the bend completes.
    headingAt(carZ) {
      const t = clamp(
        (carZ - bend.zStart) / (bend.zEnd - bend.zStart),
        0,
        1,
      );
      return t * ((bend.angleDeg * Math.PI) / 180);
    },
  };

  // ---------------------------------------------------------- ground + roads
  const ground = addMesh(
    new THREE.PlaneGeometry(700, 500),
    mat.ground,
    100, 0, -80,
    'ground',
    'ground',
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;

  // Downtown road at x 40 (surface x 33..47) + sidewalks to x 29 / x 51.
  addBox(14, 0.04, 360, 40, 0.02, -100, mat.asphalt, 'road-downtown', 'road');
  addBox(4, 0.12, 360, 31, 0.06, -100, mat.sidewalk, 'sidewalk-west', 'sidewalk');
  addBox(4, 0.12, 360, 49, 0.06, -100, mat.sidewalk, 'sidewalk-east', 'sidewalk');
  // Cross road at z -120 (surface z -127..-113), split around the lagoon
  // arm so the arm water never floods the road.
  addBox(178, 0.04, 14, -41, 0.02, -120, mat.asphalt, 'road-cross-west', 'road');
  addBox(248, 0.04, 14, 226, 0.02, -120, mat.asphalt, 'road-cross-east', 'road');
  addBox(480, 0.12, 3, 110, 0.06, -111.5, mat.sidewalk, 'sidewalk-cross-south', 'sidewalk');
  addBox(178, 0.12, 3, -41, 0.06, -128.5, mat.sidewalk, 'sidewalk-cross-north-west', 'sidewalk');
  addBox(248, 0.12, 3, 226, 0.06, -128.5, mat.sidewalk, 'sidewalk-cross-north-east', 'sidewalk');
  // West grid streets: vertical at x -20 and x -80, horizontal at z -180,
  // z -60 and z 0 (west of the downtown road only).
  addBox(12, 0.04, 360, -20, 0.02, -100, mat.asphalt, 'road-west-1', 'road');
  addBox(12, 0.04, 360, -80, 0.02, -100, mat.asphalt, 'road-west-2', 'road');
  addBox(158, 0.04, 12, -51, 0.02, -180, mat.asphalt, 'road-horiz-180', 'road');
  addBox(158, 0.04, 12, -51, 0.02, -60, mat.asphalt, 'road-horiz-60', 'road');
  addBox(158, 0.04, 12, -51, 0.02, 0, mat.asphalt, 'road-horiz-0', 'road');
  // Promenade walkway along the basin south edge and the arm east shore.
  addBox(292, 0.06, 12, 206, 0.03, -104, mat.sidewalk, 'promenade-south', 'promenade');
  addBox(12, 0.06, 48, 106, 0.03, -137, mat.sidewalk, 'promenade-arm-east', 'promenade');

  // ---------------------------------------------------------- median strip
  // Grass park strip up the middle of the downtown road, x 37..43,
  // split at the z -120 cross road. No collision, no palms.
  for (let i = 0; i < medianSegments.length; i += 1) {
    const seg = medianSegments[i];
    const len = seg[1] - seg[0];
    const mid = (seg[0] + seg[1]) / 2;
    const strip = addBox(6, 0.16, len, 40, 0.08, mid, mat.grass, `median-${i}`, 'median');
    strip.receiveShadow = true;
  }

  // ---------------------------------------------------------- water
  // Lagoon arm: bright blue, y 0.05, rect exactly 50/100/-160/-114.
  const armWater = addBox(
    lagoonArm.maxX - lagoonArm.minX,
    0.02,
    lagoonArm.maxZ - lagoonArm.minZ,
    (lagoonArm.minX + lagoonArm.maxX) / 2,
    0.05,
    (lagoonArm.minZ + lagoonArm.maxZ) / 2,
    mat.water,
    'water-lagoon-arm',
    'water',
  );
  // Marina basin: bright blue, y 0.05.
  const basinWater = addBox(
    basin.maxX - basin.minX,
    0.02,
    basin.maxZ - basin.minZ,
    (basin.minX + basin.maxX) / 2,
    0.05,
    (basin.minZ + basin.maxZ) / 2,
    mat.water,
    'water-basin',
    'water',
  );

  // ---------------------------------------------------------- Deco Tower
  // Stepped ziggurat at (0, -160), dark slate, gold crown + 12 m gold fin.
  // Tiers at the harness's assumed sizes: base 48x16x48 @ y 8, mid
  // 36x12x36 @ y 22, top 24x8x24 @ y 32. Fin top at y 46.
  const deco = {
    x: 0,
    z: -160,
    height: 46,
    finTop: 46,
    tiers: [],
    panes: [],
  };
  const decoTiers = [
    { w: 48, h: 16, d: 48, y: 8 },
    { w: 36, h: 12, d: 36, y: 22 },
    { w: 24, h: 8, d: 24, y: 32 },
  ];
  for (let i = 0; i < decoTiers.length; i += 1) {
    const t = decoTiers[i];
    const mesh = addBox(t.w, t.h, t.d, 0, t.y, -160, i === 0 ? mat.slate : mat.slateLight, `deco-tier-${i}`, 'deco');
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    deco.tiers.push({ w: t.w, h: t.h, d: t.d, y: t.y, mesh });
  }
  // Gold crown + fin (fin top y 46).
  const crown = addBox(16, 3, 16, 0, 37.5, -160, mat.gold, 'deco-crown', 'deco');
  const fin = addBox(1.2, 12, 6, 0, 40, -160, mat.gold, 'deco-fin', 'deco');
  deco.crown = crown;
  deco.fin = fin;
  // Lit gold panes on the east face: x 24.1 (base) / 18.1 (mid) / 12.1
  // (top), each 3.0 tall x 2.0 wide, goldPane emissive 0xffb800 @ 1.0.
  const paneRows = [
    { x: 24.1, ys: [4, 8, 12], zs: [-168, -160, -152] },
    { x: 18.1, ys: [20, 24], zs: [-166, -160, -154] },
    { x: 12.1, ys: [30, 34], zs: [-164, -160, -156] },
  ];
  for (let r = 0; r < paneRows.length; r += 1) {
    const row = paneRows[r];
    for (let yi = 0; yi < row.ys.length; yi += 1) {
      for (let zi = 0; zi < row.zs.length; zi += 1) {
        const pane = addBox(0.15, 3.0, 2.0, row.x, row.ys[yi], row.zs[zi], mat.goldPane, `deco-pane-${r}-${yi}-${zi}`, 'decoPane');
        deco.panes.push({ x: row.x, y: row.ys[yi], z: row.zs[zi], mesh: pane });
      }
    }
  }

  // ---------------------------------------------------------- Spire
  // Tall thin tower east at (320, -80), 60 m tall, framing the Marina.
  const spire = { x: 320, z: -80, height: 60 };
  const spireMesh = addBox(10, 60, 10, 320, 30, -80, mat.slateLight, 'spire', 'spire');
  spireMesh.castShadow = true;
  const spireTip = addMesh(
    new THREE.ConeGeometry(7, 8, 4),
    mat.slate,
    320, 64, -80,
    'spire-tip',
    'spire',
  );
  spireTip.rotation.y = Math.PI / 4;
  spire.mesh = spireMesh;
  spire.tip = spireTip;

  // ---------------------------------------------------------- bridge
  // Marina bridge at z -240: deck x 60..330, arched profile rising 8 m,
  // deck thickness 1.8, 11 spans, pylons + cables.
  const bridge = { x: 195, z: -240, x0: 60, x1: 330, archHeight: 8, spans: 11, deckY: 8 };
  const bridgeSpan = (bridge.x1 - bridge.x0) / bridge.spans;
  function bridgeArchY(x) {
    return bridge.archHeight * Math.sin((Math.PI * (x - bridge.x0)) / (bridge.x1 - bridge.x0));
  }
  for (let i = 0; i < bridge.spans; i += 1) {
    const cx = bridge.x0 + (i + 0.5) * bridgeSpan;
    const deck = addBox(
      bridgeSpan + 0.4, 1.8, 9,
      cx, bridgeArchY(cx) + 0.9, -240,
      mat.bridgeDeck, `bridge-deck-${i}`, 'bridge',
    );
    deck.castShadow = true;
  }
  const pylonXs = [60, 127.5, 195, 262.5, 330];
  for (let i = 0; i < pylonXs.length; i += 1) {
    const px = pylonXs[i];
    const top = bridgeArchY(px) + 6;
    addBox(3, top, 3, px, top / 2, -240, mat.bridgePylon, `bridge-pylon-${i}`, 'bridge');
    // Two cables from the pylon top down to the deck, 18 m each way.
    for (let s = -1; s <= 1; s += 2) {
      const tx = px + s * 18;
      if (tx < bridge.x0 || tx > bridge.x1) continue;
      const ty = bridgeArchY(tx) + 1.8;
      const dx = tx - px;
      const dy = ty - top;
      const len = Math.sqrt(dx * dx + dy * dy);
      const cable = addBox(0.25, len, 0.25, (px + tx) / 2, (top + ty) / 2, -240, mat.cable, `bridge-cable-${i}-${s}`, 'bridge');
      cable.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    }
  }

  // ---------------------------------------------------------- signs
  // Canvas text texture, guarded for no-DOM (unit harness runs in Node):
  // without a document the sign is plain blue, geometry unchanged.
  function makeSignTexture(text) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1c4fd8';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 84px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function signCorners(center, halfW, halfH, rotY) {
    const ux = Math.cos(rotY);
    const uz = -Math.sin(rotY);
    return [
      { x: center.x + halfW * ux, y: center.y + halfH, z: center.z + halfW * uz },
      { x: center.x + halfW * ux, y: center.y - halfH, z: center.z + halfW * uz },
      { x: center.x - halfW * ux, y: center.y + halfH, z: center.z - halfW * uz },
      { x: center.x - halfW * ux, y: center.y - halfH, z: center.z - halfW * uz },
    ];
  }

  // The Harbour Gatehouse sign wall at x 168..183, MARINA raised to y 9
  // so it clears foreground buildings. Both signs face south-east
  // (rotation.y = +PI/4) so the sunset camera reads them.
  const SIGN_ROT = Math.PI / 4;
  const wallNormal = { x: Math.sin(SIGN_ROT), z: Math.cos(SIGN_ROT) };
  const wall = addBox(16, 12, 1, 175.5 - wallNormal.x * 1.2, 6, -140 - wallNormal.z * 1.2, mat.slate, 'gatehouse-wall', 'gatehouse');
  wall.rotation.y = SIGN_ROT;

  function addSign(text, width, height, centerY, name) {
    const tex = makeSignTexture(text);
    const faceMat = tex
      ? new THREE.MeshBasicMaterial({ map: tex })
      : new THREE.MeshBasicMaterial({ color: 0x1c4fd8 });
    const backing = addBox(width + 0.2, height + 0.2, 0.3, 175.5, centerY, -140, mat.signBlue, `${name}-backing`, 'sign');
    backing.rotation.y = SIGN_ROT;
    const face = addMesh(
      new THREE.PlaneGeometry(width, height),
      faceMat,
      175.5 + wallNormal.x * 0.2, centerY, -140 + wallNormal.z * 0.2,
      name,
      'sign',
    );
    face.rotation.y = SIGN_ROT;
    const sign = {
      text,
      width,
      height,
      position: { x: 175.5, y: centerY, z: -140 },
      corners: signCorners({ x: 175.5, y: centerY, z: -140 }, width / 2, height / 2, SIGN_ROT),
      mesh: face,
      backing,
    };
    return sign;
  }

  const marinaSign = addSign('MARINA', 12.5, 3.0, 9, 'sign-marina');
  const pierSign = addSign('PIER 12', 8.0, 2.0, 5.0, 'sign-pier12');
  const marinaSigns = [marinaSign, pierSign];
  const gatehouse = { x: 175.5, z: -140, signs: marinaSigns, wall };

  // ---------------------------------------------------------- occlusion
  // Only SEEDED BUILDINGS occlude. Landmarks (Deco, Spire, bridge,
  // Gatehouse, boats, signs) are never occluders.
  const buildings = [];
  const exclusions = [
    { minX: 28, maxX: 52, minZ: -280, maxZ: 80 }, // downtown road
    { minX: -130, maxX: 350, minZ: -130, maxZ: -110 }, // cross road
    { minX: -26, maxX: -14, minZ: -280, maxZ: 80 }, // vertical street -20
    { minX: -86, maxX: -74, minZ: -280, maxZ: 80 }, // vertical street -80
    { minX: -130, maxX: 28, minZ: -186, maxZ: -174 }, // street z -180
    { minX: -130, maxX: 28, minZ: -66, maxZ: -54 }, // street z -60
    { minX: -130, maxX: 28, minZ: -6, maxZ: 6 }, // street z 0
    { minX: lagoonArm.minX, maxX: lagoonArm.maxX, minZ: lagoonArm.minZ, maxZ: lagoonArm.maxZ }, // lagoon arm
    { minX: basin.minX, maxX: basin.maxX, minZ: basin.minZ, maxZ: basin.maxZ }, // basin
    { minX: 37, maxX: 43, minZ: -180, maxZ: -100 }, // median
    { minX: -26, maxX: 26, minZ: -186, maxZ: -134 }, // Deco exclusion
    { minX: 164, maxX: 187, minZ: -148, maxZ: -132 }, // gatehouse
    { minX: 312, maxX: 328, minZ: -88, maxZ: -72 }, // spire
    { minX: 55, maxX: 335, minZ: -248, maxZ: -232 }, // bridge corridor
    { minX: 58, maxX: 352, minZ: -112, maxZ: -98 }, // basin south promenade
    { minX: 100, maxX: 114, minZ: -162, maxZ: -112 }, // arm east promenade
  ];

  // Sightline guard: no building may intersect any of these rays from the
  // cover camera. Includes the lagoon-arm-centre ray (origin = the tuned
  // cover camera 43.5, 3.5, -56) that a seeded building blocked before.
  const GUARD_RAYS = [
    { ax: 43.5, ay: 3.5, az: -56, bx: 75, by: 0.05, bz: -137 }, // arm centre
    { ax: 43.5, ay: 3.5, az: -56, bx: 50, by: 0.05, bz: -114 }, // arm SW
    { ax: 43.5, ay: 3.5, az: -56, bx: 100, by: 0.05, bz: -114 }, // arm SE
    { ax: 43.5, ay: 3.5, az: -56, bx: 50, by: 0.05, bz: -160 }, // arm NW
    { ax: 43.5, ay: 3.5, az: -56, bx: 100, by: 0.05, bz: -160 }, // arm NE
    { ax: 46, ay: 4, az: -54, bx: 0, by: 46, bz: -160 }, // Deco fin top
    { ax: 46, ay: 4, az: -54, bx: 175, by: 9, bz: -140 }, // gatehouse
    { ax: 46, ay: 4, az: -54, bx: 80, by: 2, bz: -150 }, // arm sailboat
    { ax: 46, ay: 4, az: -54, bx: 195, by: 10, bz: -240 }, // bridge
    { ax: 46, ay: 4, az: -54, bx: 40, by: 0.1, bz: -110 }, // median near
    { ax: 46, ay: 4, az: -54, bx: 40, by: 0.1, bz: -150 }, // median far
    { ax: 46, ay: 4, az: -54, bx: 320, by: 60, bz: -80 }, // spire
  ];

  const BUILDING_COLORS = [0x3a4450, 0x4a3f38, 0x39424e, 0x51463c, 0x2f3a44, 0x55483a];
  const zones = [
    { x0: -120, x1: 28, z0: -260, z1: 60 }, // west downtown
    { x0: -120, x1: 120, z0: 70, z1: 130 }, // south, behind the cover camera
    { x0: 340, x1: 420, z0: -260, z1: -100 }, // far east skyline
  ];
  const CELL = 30;
  let buildingIndex = 0;
  for (let zi = 0; zi < zones.length; zi += 1) {
    const zone = zones[zi];
    for (let gx = zone.x0; gx < zone.x1; gx += CELL) {
      for (let gz = zone.z0; gz < zone.z1; gz += CELL) {
        if (rand() >= 0.8) continue;
        const w = 12 + rand() * 12;
        const d = 12 + rand() * 12;
        const tall = rand() < 0.1;
        const h = tall ? 35 + rand() * 20 : 8 + rand() * 26;
        const cx = gx + 4 + rand() * (CELL - 8 - w + 8);
        const cz = gz + 4 + rand() * (CELL - 8 - d + 8);
        const rect = { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
        let blocked = false;
        for (let e = 0; e < exclusions.length; e += 1) {
          if (rectsOverlap(rect, exclusions[e], 0)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        for (let b = 0; b < buildings.length; b += 1) {
          if (rectsOverlap(rect, buildings[b], 3)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        const box = {
          minX: rect.minX, maxX: rect.maxX,
          minY: 0, maxY: h,
          minZ: rect.minZ, maxZ: rect.maxZ,
        };
        for (let r = 0; r < GUARD_RAYS.length; r += 1) {
          const ray = GUARD_RAYS[r];
          if (segmentHitsBox(ray.ax, ray.ay, ray.az, ray.bx, ray.by, ray.bz, box)) {
            blocked = true;
            break;
          }
        }
        if (blocked) continue;
        const color = BUILDING_COLORS[Math.floor(rand() * BUILDING_COLORS.length)];
        const mesh = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color }));
        mesh.scale.set(w, h, d);
        mesh.position.set(cx, h / 2, cz);
        mesh.name = `building-${buildingIndex}`;
        mesh.userData.kind = 'building';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
        meshes.push(mesh);
        buildings.push({
          x: cx, z: cz, w, d, height: h,
          minX: rect.minX, maxX: rect.maxX,
          minZ: rect.minZ, maxZ: rect.maxZ,
          mesh,
        });
        buildingIndex += 1;
      }
    }
  }

  function isBlockedAt(x, y, z) {
    for (let i = 0; i < buildings.length; i += 1) {
      const b = buildings[i];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && y < b.height) {
        return true;
      }
    }
    return false;
  }

  // MUST be a real function: the harness calls
  // occ.segmentBlocked(cam.x, cam.y, cam.z, x, 0.05, z, null).
  function segmentBlocked(ax, ay, az, bx, by, bz, ignore) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(2, Math.ceil(len / 1.5));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      if (isBlockedAt(ax + dx * t, ay + dy * t, az + dz * t)) return true;
    }
    return false;
  }
  const round11Occlusion = { segmentBlocked, isBlockedAt };

  // ---------------------------------------------------------- lamps
  // Street lamps along the vertical roads at x 50.6 and x 109.4. The
  // guard skips the basin, the lagoon arm, and the lamp at (189.4, -140)
  // that used to cross the MARINA sign.
  const lamps = [];
  const lampZs = [-260, -220, -180, -140, -100, -60, -20, 20, 60];
  const lampXs = [50.6, 109.4];
  for (let li = 0; li < lampXs.length; li += 1) {
    const lx = lampXs[li];
    for (let zi = 0; zi < lampZs.length; zi += 1) {
      const lz = lampZs[zi];
      if (lx === 189.4 && lz === -140) continue;
      if (lx >= basin.minX && lx <= basin.maxX && lz >= basin.minZ && lz <= basin.maxZ) continue;
      if (lx >= lagoonArm.minX && lx <= lagoonArm.maxX && lz >= lagoonArm.minZ && lz <= lagoonArm.maxZ) continue;
      const pole = addMesh(
        new THREE.CylinderGeometry(0.09, 0.12, 6, 6),
        mat.poleGrey, lx, 3, lz,
        `lamp-pole-${li}-${zi}`, 'lamp',
      );
      const head = addBox(0.5, 0.15, 0.25, lx, 6.1, lz, mat.lampGlow, `lamp-head-${li}-${zi}`, 'lamp');
      lamps.push({ x: lx, z: lz, pole, head });
    }
  }

  // ---------------------------------------------------------- planters
  // Promenade planters: two at x 55 (outside the arm's z range) and two
  // at x 105 on the arm's east shore. NO planter sits inside the arm
  // rectangle. The round23 export keeps only the x > 100 ones.
  const promenadePlanters = [];
  const promenadePlanterSpots = [
    { x: 55, z: -105 },
    { x: 55, z: -172 },
    { x: 105, z: -125 },
    { x: 105, z: -150 },
  ];
  for (let i = 0; i < promenadePlanterSpots.length; i += 1) {
    const s = promenadePlanterSpots[i];
    const box = addBox(1.2, 0.6, 1.2, s.x, 0.3, s.z, mat.planter, `planter-prom-${i}`, 'planter');
    const shrub = addBox(0.9, 0.5, 0.9, s.x, 0.85, s.z, mat.shrub, `planter-shrub-${i}`, 'planter');
    promenadePlanters.push({ x: s.x, z: s.z, mesh: box, shrub });
  }
  // Median planters: 6 low planters on the median strip.
  const medianPlanters = [];
  const medianPlanterZs = [-105, -110, -130, -145, -160, -175];
  for (let i = 0; i < medianPlanterZs.length; i += 1) {
    const z = medianPlanterZs[i];
    const box = addBox(1.2, 0.6, 1.2, 40, 0.46, z, mat.planter, `planter-median-${i}`, 'planter');
    const shrub = addBox(0.9, 0.5, 0.9, 40, 0.96, z, mat.shrub, `planter-median-shrub-${i}`, 'planter');
    medianPlanters.push({ x: 40, z, mesh: box, shrub });
  }
  const planters = promenadePlanters.concat(medianPlanters);
  const promenadePlantersEast = promenadePlanters.filter((p) => p.x > 100);

  // ---------------------------------------------------------- palms
  // Instanced palms along the promenade and streets. None inside the arm
  // rectangle, none on the median.
  const palmSpots = [];
  function palmSpotOk(x, z) {
    if (x >= lagoonArm.minX && x <= lagoonArm.maxX && z >= lagoonArm.minZ && z <= lagoonArm.maxZ) return false;
    if (x >= basin.minX && x <= basin.maxX && z >= basin.minZ && z <= basin.maxZ) return false;
    if (x >= 37 && x <= 43 && z >= -180 && z <= -100) return false;
    if (x >= 28 && x <= 52 && z >= -280 && z <= 80) return false;
    if (x >= -130 && x <= 350 && z >= -130 && z <= -110) return false;
    for (let i = 0; i < buildings.length; i += 1) {
      if (rectsOverlap({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 }, buildings[i], 2)) return false;
    }
    return true;
  }
  for (let i = 0; i < 8; i += 1) {
    palmSpots.push({ x: 104 + rand() * 8, z: -155 + rand() * 40 });
  }
  for (let i = 0; i < 10; i += 1) {
    palmSpots.push({ x: 70 + rand() * 260, z: -104 + rand() * 2 });
  }
  for (let i = 0; i < 20; i += 1) {
    palmSpots.push({ x: -110 + rand() * 130, z: -200 + rand() * 240 });
  }
  for (let i = 0; i < 10; i += 1) {
    palmSpots.push({ x: -100 + rand() * 200, z: 75 + rand() * 50 });
  }
  const palms = [];
  const palmTrunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.28, 7, 6),
    mat.trunk,
    palmSpots.length,
  );
  const palmCrowns = new THREE.InstancedMesh(
    new THREE.SphereGeometry(2.0, 8, 6),
    mat.palmLeaf,
    palmSpots.length,
  );
  palmCrowns.geometry.scale(1, 0.45, 1);
  palmTrunks.name = 'palm-trunks';
  palmTrunks.userData.kind = 'palm';
  palmCrowns.name = 'palm-crowns';
  palmCrowns.userData.kind = 'palm';
  {
    const dummy = new THREE.Object3D();
    let placed = 0;
    for (let i = 0; i < palmSpots.length; i += 1) {
      const s = palmSpots[i];
      if (!palmSpotOk(s.x, s.z)) continue;
      const sc = 0.85 + rand() * 0.3;
      dummy.position.set(s.x, 3.5 * sc, s.z);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      palmTrunks.setMatrixAt(placed, dummy.matrix);
      dummy.position.set(s.x, 7 * sc, s.z);
      dummy.updateMatrix();
      palmCrowns.setMatrixAt(placed, dummy.matrix);
      palms.push({ x: s.x, z: s.z, scale: sc });
      placed += 1;
    }
    palmTrunks.count = placed;
    palmCrowns.count = placed;
    palmTrunks.instanceMatrix.needsUpdate = true;
    palmCrowns.instanceMatrix.needsUpdate = true;
  }
  group.add(palmTrunks);
  group.add(palmCrowns);
  meshes.push(palmTrunks, palmCrowns);

  // ---------------------------------------------------------- benches
  // Two moved benches on the arm's east shore, plus six along the south
  // promenade. All at fixed positions, zero random draws.
  const benches = [];
  const benchSpots = [
    { x: 112, z: -150, rot: Math.PI / 2 },
    { x: 112, z: -135, rot: Math.PI / 2 },
    { x: 70, z: -105, rot: Math.PI },
    { x: 120, z: -105, rot: Math.PI },
    { x: 170, z: -105, rot: Math.PI },
    { x: 220, z: -105, rot: Math.PI },
    { x: 270, z: -105, rot: Math.PI },
    { x: 320, z: -105, rot: Math.PI },
  ];
  for (let i = 0; i < benchSpots.length; i += 1) {
    const s = benchSpots[i];
    const seat = addBox(1.8, 0.12, 0.6, s.x, 0.45, s.z, mat.benchWood, `bench-seat-${i}`, 'bench');
    seat.rotation.y = s.rot;
    const back = addBox(1.8, 0.7, 0.12, s.x, 0.8, s.z - 0.26, mat.benchWood, `bench-back-${i}`, 'bench');
    back.rotation.y = s.rot;
    benches.push({ x: s.x, z: s.z, seat, back });
  }

  // ---------------------------------------------------------- boats
  // Moored boats in the basin (seeded positions, fixed count) + the arm
  // sailboat at (80, -150), blue hull, white sail, bobbing at phase 0.
  // The arm boat is built through the same routine with fixed coordinates
  // and zero random draws, so it never shifts the seeded layout.
  const boats = [];
  const hullMats = [mat.hullWhite, mat.hullBlue, mat.hullRed];
  function addBoat(x, z, phase, hullMat, name) {
    const boatGroup = new THREE.Group();
    boatGroup.name = name;
    boatGroup.position.set(x, 0.05, z);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1, 1.8), hullMat);
    hull.position.y = 0.3;
    hull.name = `${name}-hull`;
    hull.userData.kind = 'boat';
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), mat.poleGrey);
    mast.position.y = 2.8;
    mast.name = `${name}-mast`;
    mast.userData.kind = 'boat';
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3, 2.2), mat.sail);
    sail.position.set(0, 3.2, 0.4);
    sail.name = `${name}-sail`;
    sail.userData.kind = 'boat';
    boatGroup.add(hull, mast, sail);
    group.add(boatGroup);
    meshes.push(hull, mast, sail);
    const boat = { x, z, phase, mesh: boatGroup, hull, mast, sail };
    boats.push(boat);
    return boat;
  }
  for (let i = 0; i < 8; i += 1) {
    const bx = 80 + rand() * 220;
    const bz = -230 + rand() * 110;
    const hullMat = hullMats[Math.floor(rand() * hullMats.length)];
    addBoat(bx, bz, rand() * Math.PI * 2, hullMat, `boat-${i}`);
  }
  const armBoat = addBoat(
    lagoonArm.sailboat.x,
    lagoonArm.sailboat.z,
    0,
    mat.hullBlue,
    'boat-arm',
  );
  const armBoatMarker = {
    x: lagoonArm.sailboat.x,
    y: 0.05,
    z: lagoonArm.sailboat.z,
    phase: 0,
    mesh: armBoat.mesh,
  };

  // ---------------------------------------------------------- landmarks
  const landmarks = [
    { name: 'deco', x: deco.x, y: deco.finTop, z: deco.z },
    { name: 'spire', x: spire.x, y: spire.height, z: spire.z },
    { name: 'bridge', x: 195, y: 10, z: bridge.z },
    { name: 'gatehouse', x: 175, y: 9, z: -140 },
    { name: 'armBoat', x: armBoatMarker.x, y: 2, z: armBoatMarker.z },
  ];

  // ---------------------------------------------------------- update + return
  function update(dt, time) {
    for (let i = 0; i < boats.length; i += 1) {
      const b = boats[i];
      const bob = Math.sin(time * 0.8 + b.phase) * 0.08;
      b.mesh.position.y = 0.05 + bob;
      b.mesh.rotation.z = Math.sin(time * 0.6 + b.phase) * 0.02;
    }
  }

  scene.add(group);

  return {
    group,
    meshes,
    lagoonArm,
    armBoat: armBoatMarker,
    basin,
    median,
    bend,
    bridge,
    deco,
    spire,
    gatehouse,
    marinaSigns,
    landmarks,
    buildings,
    lamps,
    planters,
    medianPlanters,
    promenadePlanters,
    palms,
    benches,
    boats,
    isBlockedAt,
    round25: { lagoonArm, armBoat: armBoatMarker },
    round6: { landmarks },
    round11Occlusion,
    round27: { median, coverBend: bend },
    round23: { promenade: { benches, planters: promenadePlantersEast } },
    update,
  };
}
