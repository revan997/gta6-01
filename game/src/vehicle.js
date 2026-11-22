import * as THREE from '../vendor/three.module.min.js';

// vehicle.js — every vehicle in Solmar Bay, built from primitives.
// 13 models. All factories are thin wrappers around makeVehicle.
// Heading is stored LOGICALLY (_heading); the mesh rotation carries the
// visual +PI correction and NEVER leaks back into car.heading.

export const MODELS = {
  gt:          { label: 'Solmar GT',       silhouette: 'coupe',  body: [4.4, 0.72, 1.9],  color: 0xd21f26, glass: 0x10151c, hero: true },
  palm:        { label: 'Palm Coupe',      silhouette: 'coupe',  body: [4.2, 0.70, 1.85], color: 0xe87a1e, glass: 0x141a20 },
  interceptor: { label: 'Police Interceptor', silhouette: 'sedan', body: [4.6, 0.78, 1.95], color: 0x111418, glass: 0x0e1218, police: true },
  patrol:      { label: 'Patrol Car',      silhouette: 'sedan',  body: [4.6, 0.78, 1.95], color: 0x1a1d22, glass: 0x0e1218, police: true },
  teal:        { label: 'Teal Coupe',      silhouette: 'coupe',  body: [4.2, 0.70, 1.85], color: 0x1f9e8a, glass: 0x10151c },
  sedan:       { label: 'Sedan',           silhouette: 'sedan',  body: [4.5, 0.75, 1.9],  color: 0x3a4a5a, glass: 0x141a20 },
  hatch:       { label: 'Hatchback',       silhouette: 'hatch',  body: [3.9, 0.85, 1.8],  color: 0x8a2f2f, glass: 0x141a20 },
  coupe:       { label: 'Coupe',           silhouette: 'coupe',  body: [4.3, 0.70, 1.85], color: 0x2f5a8a, glass: 0x141a20 },
  pickup:      { label: 'Dune Pickup',     silhouette: 'pickup', body: [4.8, 0.85, 2.0],  color: 0xc2a24a, glass: 0x141a20 },
  van:         { label: 'Van',             silhouette: 'van',    body: [4.9, 1.6, 2.05],  color: 0xdadada, glass: 0x141a20 },
  taxi:        { label: 'Taxi',            silhouette: 'sedan',  body: [4.5, 0.75, 1.9],  color: 0xf2c200, glass: 0x141a20 },
  bus:         { label: 'City Bus',        silhouette: 'bus',    body: [10.5, 2.4, 2.5],  color: 0x2f7a4a, glass: 0x9fc4d4 },
  suv:         { label: 'SUV',             silhouette: 'suv',    body: [4.7, 1.1, 2.0],   color: 0x22262c, glass: 0x141a20 },
};

export const VEHICLE_MODELS = MODELS;

const MODEL_KEYS = Object.keys(MODELS);

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, name, kind, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.name = name;
  m.userData.kind = kind;
  return m;
}

// Build the visible mesh for one model. Every mesh carries name and
// userData.kind = the model name. The model faces -z; callers add +PI
// to mesh.rotation.y for the visual heading correction.
export function buildVehicleMesh(modelName) {
  const def = MODELS[modelName] || MODELS.sedan;
  const g = new THREE.Group();
  g.name = modelName;
  g.userData.kind = modelName;
  const [bw, bh, bd] = def.body;
  const isBus = modelName === 'bus';

  // Body: low slab with a slightly raised hood line.
  const body = box(bw, bh, bd, def.color, `${modelName}:body`, modelName, 0, 0.55 + bh / 2 - 0.35, 0);
  g.add(body);
  // Cabin / glasshouse.
  const cw = bw * (isBus ? 0.96 : 0.62);
  const ch = isBus ? 0.9 : 0.5;
  const cd = bd * (isBus ? 0.92 : 0.55);
  const cabin = box(cw, ch, cd, def.glass, `${modelName}:cabin`, modelName, 0, 0.55 + bh - 0.35 + ch / 2, isBus ? 0 : -bd * 0.08);
  g.add(cabin);
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  const wheelMat = mat(0x0a0a0a);
  const wy = 0.34;
  const wx = bw / 2 - 0.15;
  const wz = bd / 2 - 0.45;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * wx, wy, sz * wz);
    w.name = `${modelName}:wheel`;
    w.userData.kind = modelName;
    g.add(w);
  }
  // Headlights (front = -z face) and taillights (rear = +z face).
  const hl = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffe9a0, emissiveIntensity: 0.9 });
  const tl = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x881111, emissiveIntensity: 0.7 });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), hl);
    h.position.set(sx * (bw / 2 - 0.55), 0.62, -bd / 2 - 0.01);
    h.name = `${modelName}:headlight`;
    h.userData.kind = modelName;
    g.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), tl);
    t.position.set(sx * (bw / 2 - 0.55), 0.62, bd / 2 + 0.01);
    t.name = `${modelName}:taillight`;
    t.userData.kind = modelName;
    g.add(t);
  }
  if (def.police) {
    // Light bar on the roof: red left, blue right.
    const bar = box(bw * 0.42, 0.12, 0.34, 0x222222, `${modelName}:lightbar`, modelName, 0, 0.55 + bh - 0.35 + ch + 0.06, 0);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xcc1111, emissiveIntensity: 1.0 }));
    red.position.set(-bw * 0.11, 0.55 + bh - 0.35 + ch + 0.13, 0);
    red.name = `${modelName}:light-red`;
    red.userData.kind = modelName;
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x1122cc, emissiveIntensity: 1.0 }));
    blue.position.set(bw * 0.11, 0.55 + bh - 0.35 + ch + 0.13, 0);
    blue.name = `${modelName}:light-blue`;
    blue.userData.kind = modelName;
    g.add(blue);
  }
  if (modelName === 'pickup') {
    // Open bed rails.
    const bed = box(bw * 0.5, 0.28, bd * 0.42, 0x3a2f1a, `${modelName}:bed`, modelName, 0, 0.55 + bh - 0.35 + 0.14, bd * 0.22);
    g.add(bed);
  }
  if (modelName === 'taxi') {
    const sign = box(0.5, 0.14, 0.24, 0xf2c200, `${modelName}:taxisign`, modelName, 0, 0.55 + bh - 0.35 + ch + 0.07, 0);
    g.add(sign);
  }
  if (modelName === 'gt') {
    // Hero car: gold stripe + rear spoiler.
    const stripe = box(0.5, 0.03, bd * 0.96, 0xf2c200, `${modelName}:stripe`, modelName, 0, 0.55 + bh - 0.35 + 0.02, 0);
    g.add(stripe);
    const spoiler = box(bw * 0.8, 0.06, 0.3, 0x111111, `${modelName}:spoiler`, modelName, 0, 1.05, bd / 2 - 0.1);
    g.add(spoiler);
  }
  return g;
}

// A drivable car object. position is a THREE.Vector3 (y = 0). heading is
// the LOGICAL heading; the mesh rotation is visual only (+PI correction).
export function makeVehicle(modelName, x = 0, z = 0, heading = 0) {
  const key = MODELS[modelName] ? modelName : 'sedan';
  const def = MODELS[key];
  const mesh = buildVehicleMesh(key);
  let _heading = heading;
  const position = new THREE.Vector3(x, 0, z);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = _heading + Math.PI;
  const car = {
    model: key,
    label: def.label,
    kind: key,
    silhouette: def.silhouette,
    mesh,
    group: mesh,
    position,
    get heading() { return _heading; },
    set heading(v) { _heading = v; },
    setPosition(nx, nz, nh) {
      if (nh !== undefined && nh !== null) _heading = nh;
      position.x = nx;
      position.z = nz;
      mesh.position.x = nx;
      mesh.position.z = nz;
    },
    // Visual sync only: the +PI correction lives on the mesh, never in heading.
    syncMesh() {
      mesh.position.set(position.x, 0, position.z);
      mesh.rotation.y = _heading + Math.PI;
    },
    speed: 0,
    targetSpeed: 0,
    baseTargetSpeed: 0,
    driver: null,
    parked: false,
    update(dt) {
      if (this.parked) return;
      const s = this.speed || 0;
      if (s !== 0) {
        position.x += Math.sin(_heading) * s * dt;
        position.z += Math.cos(_heading) * s * dt;
        mesh.position.set(position.x, 0, position.z);
        mesh.rotation.y = _heading + Math.PI;
      }
    },
  };
  return car;
}

export function createGT(x, z, heading = 0) {
  return makeVehicle('gt', x, z, heading);
}

export function createHeroCar(x, z, heading = 0) {
  return makeVehicle('gt', x, z, heading);
}

export function createSolmarGT(x, z, heading = 0) {
  return makeVehicle('gt', x, z, heading);
}

export function createPalmCoupe(x, z, heading = 0) {
  return makeVehicle('palm', x, z, heading);
}

export function createTealCoupe(x, z, heading = 0) {
  return makeVehicle('teal', x, z, heading);
}

export function createVehicle(kind, x, z, heading = 0) {
  return makeVehicle(kind, x, z, heading);
}

export function createCar(modelName, x, z, heading = 0) {
  return makeVehicle(modelName, x, z, heading);
}

// Vehicle system: owns the scene reference and exposes the factories.
// ctx is an OBJECT {scene, world, rng, player, police}.
export function createVehicleSystem(ctx = {}) {
  const scene = ctx.scene || null;
  function addToScene(car) {
    if (scene && car && car.mesh) scene.add(car.mesh);
    return car;
  }
  return {
    scene,
    makeVehicle,
    buildVehicleMesh,
    createGT: (x, z, h) => createGT(x, z, h),
    createHeroCar: (x, z, h) => createHeroCar(x, z, h),
    createSolmarGT: (x, z, h) => createSolmarGT(x, z, h),
    createPalmCoupe: (x, z, h) => createPalmCoupe(x, z, h),
    createTealCoupe: (x, z, h) => createTealCoupe(x, z, h),
    createVehicle: (kind, x, z, h) => createVehicle(kind, x, z, h),
    createCar: (modelName, x, z, h) => createCar(modelName, x, z, h),
    spawn(modelName, x, z, heading = 0) {
      return addToScene(makeVehicle(modelName, x, z, heading));
    },
    MODELS,
    modelKeys: MODEL_KEYS,
  };
}
