// Solmar Bay — rendering setup (W2, attempt #7, fresh build).
// Renderer, scene, golden-hour light rig, shared materials, performance
// budgets, sky texture. Written fresh for this recording from the
// round-9 interface contract (W2 section + fixes 6/7) and the rebuild
// spec. THREE comes from the kit vendor file; the relative path works in
// Node (smoke tests) and in the browser (index.html serves game/ as root).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

// ---- Performance budgets (hard gates) ------------------------------------
export const PERF_BUDGETS = {
  maxDrawCalls: CONFIG.perf.maxDrawCalls,
  maxTriangles: CONFIG.perf.maxTriangles,
};

// ---- Shared materials (flat Lambert, sunset palette) ---------------------
// One instance per material; every module shares these, so the material
// count stays low and the look stays consistent.
export const MATERIALS = {
  asphalt: new THREE.MeshLambertMaterial({ color: 0x3b3633 }),
  concrete: new THREE.MeshLambertMaterial({ color: 0x8d877a }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0x9c968a }),
  ground: new THREE.MeshLambertMaterial({ color: 0x67624f }),
  grass: new THREE.MeshLambertMaterial({ color: 0x4d7a38 }),
  sand: new THREE.MeshLambertMaterial({ color: 0xd8c49a }),
  water: new THREE.MeshLambertMaterial({
    color: 0x1f8fff,
    emissive: 0x1f8fff,
    emissiveIntensity: 0.55,
  }),
  slate: new THREE.MeshLambertMaterial({ color: 0x2e3440 }),
  slateLight: new THREE.MeshLambertMaterial({ color: 0x4a5266 }),
  brick: new THREE.MeshLambertMaterial({ color: 0x8a5a44 }),
  cream: new THREE.MeshLambertMaterial({ color: 0xd8cdb8 }),
  warmGrey: new THREE.MeshLambertMaterial({ color: 0x6a655c }),
  gold: new THREE.MeshLambertMaterial({
    color: 0xd8a83c,
    emissive: 0xd8a83c,
    emissiveIntensity: 0.9,
  }),
  goldDim: new THREE.MeshLambertMaterial({
    color: 0xa8822e,
    emissive: 0xa8822e,
    emissiveIntensity: 0.5,
  }),
  glass: new THREE.MeshLambertMaterial({ color: 0x1a2530 }),
  signBlue: new THREE.MeshLambertMaterial({ color: 0x1a4a8a }),
  signWhite: new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }),
  planter: new THREE.MeshLambertMaterial({ color: 0x7a6a55 }),
  planterGreen: new THREE.MeshLambertMaterial({ color: 0x3a6a2a }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6a4a30 }),
  palmLeaf: new THREE.MeshLambertMaterial({ color: 0x2a6a2a }),
  bridgeSteel: new THREE.MeshLambertMaterial({ color: 0x5a6a7a }),
  white: new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }),
  black: new THREE.MeshLambertMaterial({ color: 0x111111 }),
  hullBlue: new THREE.MeshLambertMaterial({ color: 0x2456a8 }),
  sailWhite: new THREE.MeshLambertMaterial({
    color: 0xf8f8f0,
    side: THREE.DoubleSide,
  }),
  lampHead: new THREE.MeshLambertMaterial({
    color: 0xffe0a0,
    emissive: 0xffc860,
    emissiveIntensity: 0.8,
  }),
};

// ---- Renderer ------------------------------------------------------------
// Returns ONLY the renderer. In a browser this is a real WebGLRenderer
// (NoToneMapping + sRGB, PCFShadowMap). In Node (no DOM / no WebGL) it
// returns a stub with the same shape so the unit harness can import and
// call it without crashing; the geometry harness always runs in Chromium.
export function createRenderer(canvas) {
  const opts = { antialias: true, powerPreference: 'high-performance' };
  if (canvas) opts.canvas = canvas;
  try {
    if (typeof document === 'undefined' && !canvas) {
      throw new Error('no DOM: headless stub renderer');
    }
    const renderer = new THREE.WebGLRenderer(opts);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    if (typeof window !== 'undefined' && window.devicePixelRatio) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    renderer.setSize(1280, 720);
    return renderer;
  } catch (err) {
    return {
      isWebGLRenderer: false,
      domElement: canvas || null,
      shadowMap: { enabled: true, type: THREE.PCFShadowMap },
      outputColorSpace: THREE.SRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      info: { render: { calls: 0, triangles: 0, geometries: 0, textures: 0 } },
      setSize() {},
      setPixelRatio() {},
      render() {},
      dispose() {},
      getSize(target) {
        return target ? target.set(1280, 720) : new THREE.Vector2(1280, 720);
      },
    };
  }
}

// ---- Scene ----------------------------------------------------------------
// Fog + sky dome. The sky dome never takes fog (it IS the sky).
export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe8c9a0, 220, 750);
  const tex = createSkyTexture();
  const skyMat = tex
    ? new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false })
    : new THREE.MeshBasicMaterial({ color: 0x5b6daa, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(650, 24, 16), skyMat);
  sky.name = 'skyDome';
  scene.add(sky);
  return scene;
}

// ---- Lights (golden-hour rig) --------------------------------------------
// Warm low sun + hemisphere + cool fill. Values come from CONFIG.lights.
export function setupLights(scene, config = CONFIG) {
  const L = (config && config.lights) || { sun: 2.0, hemi: 0.75, fill: 0.35 };
  const sun = new THREE.DirectionalLight(0xffd9a8, L.sun);
  sun.position.set(-120, 90, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -350;
  sun.shadow.camera.right = 350;
  sun.shadow.camera.top = 350;
  sun.shadow.camera.bottom = -350;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 800;
  sun.shadow.bias = -0.0005;
  sun.target.position.set(0, 0, -100);
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xffe0b8, 0x5a4a3a, L.hemi);
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x8aa0c8, L.fill);
  fill.position.set(150, 80, 200);
  scene.add(fill);
  return { sun, hemi, fill };
}

// ---- Sky texture ----------------------------------------------------------
// The canvas is declared AFTER the no-DOM guard (fix #1: without the
// guard the module throws ReferenceError in Node and the game never
// boots). Sky stops are the LIGHTENED values from CONFIG — the pipeline
// renders sky at ~0.45x intended luminance, so dark stops read near-black.
export function createSkyTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, CONFIG.sky.zenith);
  g.addColorStop(0.55, CONFIG.sky.mid);
  g.addColorStop(1, CONFIG.sky.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- Performance accounting ----------------------------------------------
export function getPerfStats(renderer) {
  const info = renderer && renderer.info && renderer.info.render;
  if (!info) return { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
  return {
    drawCalls: info.calls || 0,
    triangles: info.triangles || 0,
    geometries: info.geometries || 0,
    textures: info.textures || 0,
  };
}

export function withinBudget(stats) {
  return (
    stats.drawCalls <= PERF_BUDGETS.maxDrawCalls &&
    stats.triangles <= PERF_BUDGETS.maxTriangles
  );
}

export function resizeRenderer(renderer, width, height) {
  if (renderer && typeof renderer.setSize === 'function') {
    renderer.setSize(width, height, false);
  }
  return renderer;
}
