// render.js — renderer, scene, golden-hour light rig, materials, budgets.
// Fresh build for the round-9 rebuild (attempt #5). The sunset look is
// deliberate: NoToneMapping + sRGB output, so the bright blue water and
// the gold panes keep their colour on the downscale instead of being
// desaturated by a filmic curve.
import * as THREE from '../vendor/three.module.min.js';

// Hard performance gates from the spec: at most 4,300 draw calls and
// 150,000 triangles per shot.
export const PERF_BUDGETS = {
  drawCalls: 4300,
  triangles: 150000,
  maxDrawCalls: 4300,
  maxTriangles: 150000,
};

// Shared flat materials. Water matches world.js: Lambert 0x1f8fff with
// blue emissive 0.55. Gold panes glow: emissive 0xffb800 at 1.0.
export const MATERIALS = {
  asphalt: new THREE.MeshLambertMaterial({ color: 0x3a3a40 }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0x9a9a92 }),
  grass: new THREE.MeshLambertMaterial({ color: 0x4a7c3a }),
  ground: new THREE.MeshLambertMaterial({ color: 0x55663f }),
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
  blue: new THREE.MeshLambertMaterial({ color: 0x1f5fd0 }),
};

// Sunset sky gradient as a small canvas texture. The zenith stops are
// lightened ('#5b6daa' / '#7d6fa8') so the near-black heli body reads
// against the sky with contrast >= 35; the horizon stays warm gold.
// Guarded for no-DOM: the unit harness runs in Node, where there is no
// document — return null and the sky dome falls back to a plain colour.
export function createSkyTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0.0, '#5b6daa');
  gradient.addColorStop(0.45, '#7d6fa8');
  gradient.addColorStop(0.7, '#c98a5e');
  gradient.addColorStop(1.0, '#e8b25c');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 16, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The scene: warm haze fog + a sky dome carrying the sunset gradient.
// Returns ONLY the scene; main.js adds the world and the lights.
export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd8a06a, 250, 1000);
  const skyTexture = createSkyTexture();
  const skyMaterial = skyTexture
    ? new THREE.MeshBasicMaterial({ map: skyTexture, side: THREE.BackSide, fog: false })
    : new THREE.MeshBasicMaterial({ color: 0x7d6fa8, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 15), skyMaterial);
  sky.name = 'sky-dome';
  sky.userData.kind = 'sky';
  scene.add(sky);
  return scene;
}

// The golden-hour rig: warm low sun 2.0 + hemisphere 0.75 + cool fill
// 0.35. Call ONCE — main.js wires it exactly once. Shadow map type MUST
// be THREE.PCFShadowMap: PCFSoftShadowMap was removed in this three
// version and logs a console warning on every frame, and the harness
// gates warnings.length === 0.
export function setupLights(scene) {
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.0);
  sun.position.set(-180, 100, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0005;
  sun.target.position.set(0, 0, -100);
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0x8fa8d8, 0x6b5a48, 0.75);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x9ab8e8, 0.35);
  fill.position.set(200, 80, -300);
  scene.add(fill);
  return { sun, hemi, fill };
}

// Returns ONLY the renderer. Pass the game canvas; without one a canvas
// is created when a document exists. Throws a clear error with no DOM
// instead of failing deep inside three.
export function createRenderer(canvas) {
  const el = canvas
    || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
  if (!el) {
    throw new Error('createRenderer needs a canvas element (no DOM available)');
  }
  const renderer = new THREE.WebGLRenderer({ canvas: el, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

// Performance accounting from the renderer's own info block.
export function getPerfStats(renderer) {
  const info = renderer && renderer.info && renderer.info.render;
  if (!info) return { drawCalls: 0, triangles: 0 };
  return { drawCalls: info.calls, triangles: info.triangles };
}

export function withinBudget(statsOrRenderer) {
  const stats = statsOrRenderer && typeof statsOrRenderer.drawCalls === 'number'
    ? statsOrRenderer
    : getPerfStats(statsOrRenderer);
  return (
    stats.drawCalls <= PERF_BUDGETS.drawCalls &&
    stats.triangles <= PERF_BUDGETS.triangles
  );
}

export function resizeRenderer(renderer, width, height) {
  const ratio = Math.min(
    (typeof window !== 'undefined' && window.devicePixelRatio) || 1,
    2,
  );
  if (renderer.setPixelRatio) renderer.setPixelRatio(ratio);
  if (renderer.setSize) renderer.setSize(width, height);
}
