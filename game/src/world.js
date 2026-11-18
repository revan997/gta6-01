// Solmar Bay — procedural city builder (Lane A).
// Builds the whole 3D city into the scene from a seeded generator and returns
// the world description object: the single source of truth for roads,
// building collisions and spawn points. Traffic and police ask this object;
// they never rebuild the city.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { createRng } from './random.js';

// District lookup: which named district contains (x, z), or null.
export function districtAt(x, z) {
  for (const key of Object.keys(CONFIG.districts)) {
    const d = CONFIG.districts[key];
    if (x >= d.minX && x <= d.maxX && z >= d.minZ && z <= d.maxZ) return d.label;
  }
  return null;
}

export function buildWorld(scene, seedOrRng) {
  const rng = typeof seedOrRng === 'number' || seedOrRng === undefined
    ? createRng(seedOrRng === undefined ? CONFIG.world.seed : seedOrRng)
    : seedOrRng;

  const C = CONFIG.colors;
  const half = CONFIG.halfCity;
  const roadW = CONFIG.roadWidth;
  const lines = CONFIG.roadLines;

  scene.background = new THREE.Color(C.sky);
  scene.fog = new THREE.Fog(C.fog, 260, 900);

  const roads = [];
  const buildings = []; // collision boxes: { minX, maxX, minZ, maxZ, height, district }

  // Shared materials / geometries (created once, reused everywhere).
  const matGround = new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1 });
  const matRoad = new THREE.MeshStandardMaterial({ color: C.road, roughness: 0.95 });
  const matLine = new THREE.MeshStandardMaterial({ color: C.roadLine, roughness: 0.8 });
  const matSidewalk = new THREE.MeshStandardMaterial({ color: C.sidewalk, roughness: 1 });
  const matSand = new THREE.MeshStandardMaterial({ color: C.sand, roughness: 1 });
  const matWater = new THREE.MeshStandardMaterial({
    color: C.water, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.88,
  });
  const matGlass = new THREE.MeshStandardMaterial({
    color: C.downtownGlass, roughness: 0.15, metalness: 0.55,
  });
  const matRoof = new THREE.MeshStandardMaterial({ color: 0x6a6a68, roughness: 1 });
  const matTrunk = new THREE.MeshStandardMaterial({ color: C.palmTrunk, roughness: 1 });
  const matLeaf = new THREE.MeshStandardMaterial({ color: C.palmLeaf, roughness: 0.9 });
  const matPole = new THREE.MeshStandardMaterial({ color: C.lampPole, roughness: 0.6, metalness: 0.5 });
  const matLamp = new THREE.MeshStandardMaterial({
    color: C.lampGlow, emissive: 0xffdf80, emissiveIntensity: 0.9,
  });
  const matBench = new THREE.MeshStandardMaterial({ color: C.bench, roughness: 1 });
  const matHydrant = new THREE.MeshStandardMaterial({ color: C.hydrant, roughness: 0.6 });
  const matCloud = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const matSun = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
  const matPier = new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 1 });

  const buildingMats = CONFIG.colors.buildingPalette.map(
    (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 })
  );

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const planeGeo = new THREE.PlaneGeometry(1, 1);

  function addBox(material, w, h, d, x, y, z, parent) {
    const mesh = new THREE.Mesh(boxGeo, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    (parent || scene).add(mesh);
    return mesh;
  }

  function addFlat(material, w, d, x, z, y, parent) {
    const mesh = new THREE.Mesh(planeGeo, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(w, d, 1);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    (parent || scene).add(mesh);
    return mesh;
  }

  // ---- Ground, beach and sea ----
  addFlat(matGround, half * 2 + 80, half * 2 + 80, 0, 0, -0.05);
  // Sand strip along the south edge.
  addFlat(matSand, half * 2 + 80, CONFIG.seaStartZ - CONFIG.beachStartZ + 16, 0,
    (CONFIG.beachStartZ + CONFIG.seaStartZ) / 2 + 4, 0.0);
  // Open sea south of the beach.
  addFlat(matWater, half * 2 + 800, 420, 0, CONFIG.seaStartZ + 210, 0.05);
  // Marina basin (north-east): a rectangular bite of water with piers.
  const marina = CONFIG.marina;
  addFlat(matWater, marina.maxX - marina.minX, marina.maxZ - marina.minZ,
    (marina.minX + marina.maxX) / 2, (marina.minZ + marina.maxZ) / 2, 0.05);
  // Marina piers (wooden walkways into the basin).
  for (let i = 0; i < 3; i++) {
    const px = 190 + i * 42;
    addFlat(matPier, 10, 110, px, -240, 0.12);
  }

  // ---- Roads ----
  // Vertical roads (constant x) and horizontal roads (constant z).
  for (const line of lines) {
    roads.push({ start: { x: line, z: -half }, end: { x: line, z: CONFIG.beachStartZ }, width: roadW, axis: 'z' });
    roads.push({ start: { x: -half, z: line }, end: { x: half, z: line }, width: roadW, axis: 'x' });
  }
  // The beachfront promenade along z = beachStartZ.
  roads.push({ start: { x: -half, z: CONFIG.beachStartZ }, end: { x: half, z: CONFIG.beachStartZ }, width: roadW, axis: 'x' });

  for (const road of roads) {
    const length = road.axis === 'x'
      ? road.end.x - road.start.x
      : road.end.z - road.start.z;
    const cx = (road.start.x + road.end.x) / 2;
    const cz = (road.start.z + road.end.z) / 2;
    const w = road.axis === 'x' ? length : road.width;
    const d = road.axis === 'x' ? road.width : length;
    addFlat(matRoad, w, d, cx, cz, 0.02);
    // Sidewalks flanking the road.
    const sw = CONFIG.sidewalkWidth;
    if (road.axis === 'x') {
      addFlat(matSidewalk, length, sw, cx, cz - road.width / 2 - sw / 2, 0.03);
      addFlat(matSidewalk, length, sw, cx, cz + road.width / 2 + sw / 2, 0.03);
      // Centre dashed line.
      addFlat(matLine, length, 0.35, cx, cz, 0.04);
    } else {
      addFlat(matSidewalk, sw, length, cx - road.width / 2 - sw / 2, cz, 0.03);
      addFlat(matSidewalk, sw, length, cx + road.width / 2 + sw / 2, cz, 0.03);
      addFlat(matLine, 0.35, length, cx, cz, 0.04);
    }
  }

  // ---- Buildings ----
  // Blocks are the cells between neighbouring road centrelines.
  const edges = [-half, ...lines, half];
  const windowMatLit = new THREE.MeshStandardMaterial({
    color: C.windowLit, emissive: 0xffd98a, emissiveIntensity: 0.55, roughness: 0.4,
  });
  const windowMatDark = new THREE.MeshStandardMaterial({
    color: C.windowDark, roughness: 0.3, metalness: 0.4,
  });

  function inMarinaBasin(cx, cz) {
    return cx > marina.minX - 10 && cx < marina.maxX && cz > marina.minZ && cz < marina.maxZ;
  }

  for (let ix = 0; ix < edges.length - 1; ix++) {
    for (let iz = 0; iz < edges.length - 1; iz++) {
      const bx0 = edges[ix] + roadW / 2 + 2;
      const bx1 = edges[ix + 1] - roadW / 2 - 2;
      const bz0 = edges[iz] + roadW / 2 + 2;
      const bz1 = edges[iz + 1] - roadW / 2 - 2;
      const cx = (bx0 + bx1) / 2;
      const cz = (bz0 + bz1) / 2;
      if (bz0 >= CONFIG.beachStartZ) continue; // beach / sea, no buildings
      if (inMarinaBasin(cx, cz)) continue; // marina water
      if (rng.chance(0.12)) continue; // plaza / park gap
      const district = districtAt(cx, cz) || 'Downtown';
      const isDowntown = district === 'Downtown';
      const count = rng.int(CONFIG.world.buildingsPerBlockMin, CONFIG.world.buildingsPerBlockMax);
      for (let b = 0; b < count; b++) {
        const bw = rng.range(16, Math.min(34, bx1 - bx0 - 2));
        const bd = rng.range(16, Math.min(34, bz1 - bz0 - 2));
        if (bw < 10 || bd < 10) continue;
        const px = count === 1 ? cx : rng.range(bx0 + bw / 2, bx1 - bw / 2);
        const pz = count === 1 ? cz : rng.range(bz0 + bd / 2, bz1 - bd / 2);
        const height = isDowntown
          ? rng.range(CONFIG.world.downtownMinHeight, CONFIG.world.downtownMaxHeight)
          : rng.range(CONFIG.world.normalMinHeight, CONFIG.world.normalMaxHeight);
        const mat = rng.pick(buildingMats);
        const group = new THREE.Group();
        group.position.set(px, 0, pz);
        scene.add(group);
        addBox(mat, bw, height, bd, 0, height / 2, 0, group);
        // Roof cap.
        addBox(matRoof, bw * 0.92, 0.6, bd * 0.92, 0, height + 0.3, 0, group);
        // Glass window bands on the two wide faces, one per ~6 m of height.
        const floors = Math.max(1, Math.floor(height / 6));
        for (let f = 0; f < floors; f++) {
          const wy = 3 + f * 6;
          if (wy > height - 1.5) break;
          const bandMat = rng.chance(0.3) ? windowMatLit : (isDowntown ? matGlass : windowMatDark);
          addBox(bandMat, bw * 0.82, 1.8, 0.25, 0, wy, bd / 2 + 0.06, group);
          addBox(bandMat, bw * 0.82, 1.8, 0.25, 0, wy, -bd / 2 - 0.06, group);
        }
        buildings.push({
          minX: px - bw / 2, maxX: px + bw / 2,
          minZ: pz - bd / 2, maxZ: pz + bd / 2,
          height, district, x: px, z: pz, w: bw, d: bd,
        });
      }
    }
  }

  // ---- Street props ----
  // Lamps along every road, palms along the beachfront, benches + hydrants.
  function addLamp(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    scene.add(g);
    addBox(matPole, 0.22, 5.2, 0.22, 0, 2.6, 0, g);
    addBox(matPole, 1.4, 0.18, 0.18, 0.6, 5.1, 0, g);
    addBox(matLamp, 0.9, 0.3, 0.5, 1.2, 5.0, 0, g);
  }
  function addPalm(x, z, scale) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale || 1);
    scene.add(g);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 5.5, 6), matTrunk);
    trunk.position.y = 2.75;
    trunk.rotation.z = 0.08;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(boxGeo, matLeaf);
      leaf.scale.set(2.6, 0.12, 0.7);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.2, 5.6, Math.sin(a) * 1.2);
      leaf.rotation.y = -a;
      leaf.rotation.z = 0.35;
      leaf.castShadow = true;
      g.add(leaf);
    }
  }
  function addBench(x, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY || 0;
    scene.add(g);
    addBox(matBench, 2.2, 0.18, 0.6, 0, 0.55, 0, g);
    addBox(matBench, 2.2, 0.7, 0.14, 0, 0.85, -0.28, g);
    addBox(matPole, 0.14, 0.55, 0.14, -0.9, 0.28, 0, g);
    addBox(matPole, 0.14, 0.55, 0.14, 0.9, 0.28, 0, g);
  }
  function addHydrant(x, z) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    scene.add(g);
    addBox(matHydrant, 0.5, 0.8, 0.5, 0, 0.4, 0, g);
    addBox(matHydrant, 0.7, 0.25, 0.5, 0, 0.85, 0, g);
  }

  for (const line of lines) {
    for (let t = -280; t <= 280; t += CONFIG.world.lampSpacing) {
      addLamp(line + roadW / 2 + CONFIG.sidewalkWidth + 0.6, t);
      addLamp(line - roadW / 2 - CONFIG.sidewalkWidth - 0.6, t + 20);
    }
  }
  for (let i = 0; i < CONFIG.world.palmCount; i++) {
    const px = rng.range(-half + 10, half - 10);
    const pz = rng.range(CONFIG.beachStartZ - 14, CONFIG.beachStartZ + 18);
    addPalm(px, pz, rng.range(0.85, 1.35));
  }
  for (let i = 0; i < 18; i++) {
    addBench(rng.range(-280, 280), CONFIG.beachStartZ - 6, 0);
    addHydrant(rng.range(-280, 280), rng.pick(lines) + roadW / 2 + 2);
  }
  // A few palms scattered in plazas / downtown corners.
  for (let i = 0; i < 24; i++) {
    addPalm(rng.range(-280, 280), rng.range(-280, 260), rng.range(0.8, 1.2));
  }

  // ---- Sky: sun disc + clouds ----
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 16), matSun);
  sunMesh.position.set(420, 520, 210);
  scene.add(sunMesh);
  for (let i = 0; i < CONFIG.world.cloudCount; i++) {
    const g = new THREE.Group();
    const cx = rng.range(-500, 500);
    const cy = rng.range(110, 190);
    const cz = rng.range(-500, 500);
    g.position.set(cx, cy, cz);
    scene.add(g);
    const puffs = rng.int(3, 5);
    for (let p = 0; p < puffs; p++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(rng.range(9, 18), 10, 8), matCloud);
      s.scale.y = 0.45;
      s.position.set(rng.range(-16, 16), rng.range(-2, 2), rng.range(-8, 8));
      g.add(s);
    }
  }

  // ---- Queries (the contract) ----
  function isOnRoad(x, z) {
    for (const road of roads) {
      if (road.axis === 'x') {
        if (Math.abs(z - road.start.z) <= road.width / 2 && x >= road.start.x && x <= road.end.x) return true;
      } else if (Math.abs(x - road.start.x) <= road.width / 2 && z >= road.start.z && z <= road.end.z) {
        return true;
      }
    }
    return false;
  }

  // True when a circle at (x, z) with `radius` overlaps any building box.
  function collidesCircle(x, z, radius) {
    return findBuildingCollision(x, z, radius) !== null;
  }

  // The colliding building box, or null.
  function findBuildingCollision(x, z, radius) {
    const r = radius || 0;
    for (const b of buildings) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return b;
    }
    return null;
  }

  function clampToCity(x, z, margin) {
    const m = margin === undefined ? 2 : margin;
    return {
      x: Math.max(-half + m, Math.min(half - m, x)),
      z: Math.max(-half + m, Math.min(half - m, z)),
    };
  }

  const spawns = {
    player: { x: 40, y: 0, z: 40, heading: Math.PI },
    marina: { x: 180, y: 0, z: -140, heading: Math.PI / 2 },
    downtown: { x: 40, y: 0, z: -40, heading: 0 },
    docks: { x: -200, y: 0, z: 200, heading: Math.PI },
    beach: { x: 0, y: 0, z: 286, heading: Math.PI },
  };

  return {
    scene,
    roads,
    buildings,
    districts: CONFIG.districts,
    citySize: CONFIG.citySize,
    halfCity: half,
    roadWidth: roadW,
    spawns,
    isOnRoad,
    collidesCircle,
    findBuildingCollision,
    clampToCity,
    districtAt,
  };
}

export default buildWorld;
