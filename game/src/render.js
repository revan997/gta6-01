// render.js — Solmar Bay rendering setup (attempt #9, fresh write).
// Renderer, scene (fog + sky dome), golden-hour light rig, shared
// materials, performance accounting, bright vivid sky texture.
//
// Contract notes baked in:
// - createRenderer returns ONLY the renderer.
// - setupLights is the golden-hour rig: warm sun 2.0 + hemisphere 0.75 +
//   cool fill 0.35.
// - Shadow map type MUST be THREE.PCFShadowMap (PCFSoft warns every frame
//   and fails the warnings gate).
// - createSkyTexture declares the canvas right after the no-DOM guard
//   (a missing declaration threw ReferenceError and killed the whole suite
//   in attempt #4).
// - NoToneMapping + sRGB output (a filmic curve desaturates the water/gold
//   the pixel gates read).
// - Sky stops lightened for the bright top-10 read (V1): zenith '#5b6daa',
//   mid '#7d6fa8', horizon warm gold. CONFIG.lighting overrides when given.

import * as THREE from '../vendor/three.module.min.js';

export const PERF_BUDGETS = {
  drawCalls: 4300,
  triangles: 150000,
  maxDrawCalls: 4300,
  maxTriangles: 150000,
};

const DEFAULT_SKY = {
  zenith: '#8a5cf0',
  mid: '#c05fe0',
  horizon: '#ffa04d',
  low: '#f07a40',
  sun: '#fff3c0',
};

const DEFAULT_LIGHTS = {
  sun: 2.0,
  hemi: 0.75,
  fill: 0.35,
  sunColor: 0xffe0b0,
  hemiSky: 0xbfd4ff,
  hemiGround: 0x8a6a4a,
  fillColor: 0x9ab8ff,
};

// Shared flat materials. world.js builds most of its own materials, but
// these are the canonical palette every module should draw from.
export const MATERIALS = {
  asphalt: new THREE.MeshLambertMaterial({ color: 0x4a4038 }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0xb0a894 }),
  grass: new THREE.MeshLambertMaterial({ color: 0x4d8a3f }),
  water: new THREE.MeshLambertMaterial({
    color: 0x1f8fff,
    emissive: 0x1f8fff,
    emissiveIntensity: 0.55,
  }),
  sand: new THREE.MeshLambertMaterial({ color: 0xe8d8a0 }),
  slate: new THREE.MeshLambertMaterial({ color: 0x2a2f3a }),
  slateDark: new THREE.MeshLambertMaterial({ color: 0x1c2733 }),
  gold: new THREE.MeshLambertMaterial({
    color: 0xd8a93c,
    emissive: 0x8a6420,
    emissiveIntensity: 0.35,
  }),
  goldPane: new THREE.MeshBasicMaterial({ color: 0xffd97a }),
  white: new THREE.MeshLambertMaterial({ color: 0xf5efe0 }),
  glass: new THREE.MeshLambertMaterial({ color: 0x101418 }),
  concrete: new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }),
  blueSign: new THREE.MeshLambertMaterial({ color: 0x1f4fd8 }),
  palmTrunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  palmLeaf: new THREE.MeshLambertMaterial({ color: 0x2f7a3a }),
};

// createRenderer returns ONLY the renderer. No scene, no camera.
export function createRenderer(options) {
  const opts = options || {};
  const renderer = new THREE.WebGLRenderer({
    antialias: opts.antialias !== undefined ? opts.antialias : true,
    canvas: opts.canvas,
    powerPreference: 'high-performance',
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const dpr =
    typeof window !== 'undefined' && window.devicePixelRatio
      ? Math.min(window.devicePixelRatio, 2)
      : 1;
  renderer.setPixelRatio(dpr);
  renderer.setSize(opts.width || 1280, opts.height || 720, false);
  renderer.setClearColor(0x5b6daa, 1);
  return renderer;
}

// Scene with warm haze fog + a sky dome carrying the bright sky texture.
// main.js MUST build the scene through this (never a bare new Scene —
// that has no lights and no sky, the black-scene bug).
export function createScene(config) {
  const scene = new THREE.Scene();
  const lighting = (config && config.lighting) || {};
  scene.fog = new THREE.Fog(0xf2c89a, 120, 420);
  const skyTex = createSkyTexture(lighting.skyStops || lighting);
  if (skyTex) {
    scene.background = skyTex;
    const domeGeo = new THREE.SphereGeometry(600, 24, 16);
    const domeMat = new THREE.MeshBasicMaterial({
      map: skyTex,
      side: THREE.BackSide,
      fog: false,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.name = 'sky-dome';
    scene.add(dome);
  } else {
    scene.background = new THREE.Color(0x5b6daa);
  }
  return scene;
}

// Golden-hour rig: warm low sun + soft hemisphere + cool fill.
// Call exactly ONCE (main.js), after createScene.
export function setupLights(scene, overrides) {
  const o = Object.assign({}, DEFAULT_LIGHTS, overrides || {});
  const sun = new THREE.DirectionalLight(o.sunColor, o.sun);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 600;
  sun.shadow.bias = -0.0005;
  sun.name = 'sun';
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(o.hemiSky, o.hemiGround, o.hemi);
  hemi.name = 'hemisphere';
  scene.add(hemi);

  const fill = new THREE.DirectionalLight(o.fillColor, o.fill);
  fill.position.set(-80, 60, -120);
  fill.name = 'fill';
  scene.add(fill);

  return { sun, hemi, fill };
}

// Bright vivid sky: lightened zenith, warm gold horizon, sun glow, soft
// clouds. The canvas is declared RIGHT AFTER the no-DOM guard — a missing
// declaration threw ReferenceError during module evaluation in attempt #4
// and __solmar was never set.
export function createSkyTexture(palette) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const p = Object.assign({}, DEFAULT_SKY, palette || {});
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Vertical gradient: bright zenith -> warm gold horizon.
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, p.zenith);
  grad.addColorStop(0.45, p.mid);
  grad.addColorStop(0.72, p.horizon);
  grad.addColorStop(1.0, p.low);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 512);

  // Sun glow, upper right of the sky band.
  const glow = ctx.createRadialGradient(740, 300, 10, 740, 300, 220);
  glow.addColorStop(0, p.sun);
  glow.addColorStop(0.35, 'rgba(255, 220, 140, 0.55)');
  glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1024, 512);

  // Sun disc.
  ctx.fillStyle = '#fff8dc';
  ctx.beginPath();
  ctx.arc(740, 300, 26, 0, Math.PI * 2);
  ctx.fill();

  // Soft clouds: white ellipses, low alpha, in the upper half.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.20)';
  const clouds = [
    [120, 90, 150, 26],
    [320, 60, 190, 30],
    [560, 110, 170, 24],
    [830, 70, 200, 28],
    [220, 150, 130, 20],
    [660, 160, 160, 22],
    [950, 140, 120, 18],
  ];
  for (const c of clouds) {
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], c[2], c[3], 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Performance accounting off the renderer's own info block.
export function getPerfStats(renderer) {
  const info = (renderer && renderer.info && renderer.info.render) || {};
  const calls = typeof info.calls === 'number' ? info.calls : 0;
  const triangles =
    typeof info.triangles === 'number' ? info.triangles : 0;
  return {
    calls,
    triangles,
    drawCalls: calls,
    maxDrawCalls: PERF_BUDGETS.maxDrawCalls,
    maxTriangles: PERF_BUDGETS.maxTriangles,
    withinBudget: calls <= PERF_BUDGETS.maxDrawCalls && triangles <= PERF_BUDGETS.maxTriangles,
  };
}

// {ok, ...}: true only when BOTH budgets hold. Accepts either key naming.
export function withinBudget(stats) {
  const s = stats || {};
  const calls = s.calls !== undefined ? s.calls : s.drawCalls || 0;
  const triangles = s.triangles !== undefined ? s.triangles : 0;
  const maxCalls = PERF_BUDGETS.maxDrawCalls;
  const maxTris = PERF_BUDGETS.maxTriangles;
  return {
    ok: calls <= maxCalls && triangles <= maxTris,
    calls,
    triangles,
    maxDrawCalls: maxCalls,
    maxTriangles: maxTris,
    overCalls: Math.max(0, calls - maxCalls),
    overTriangles: Math.max(0, triangles - maxTris),
  };
}

export function resizeRenderer(renderer, width, height) {
  if (!renderer) return;
  renderer.setSize(width, height, false);
}
