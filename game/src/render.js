// render.js — rendering setup for Solmar Bay (attempt #8, round-16 rebuild).
// Golden-hour sunset rig, shared materials, performance budgets.
// Written fresh from the interface contract + rebuild spec. No old source read.

import * as THREE from '../vendor/three.module.min.js';

// Hard performance gates (contract §4): draw calls <= 4,300, triangles <= 150,000.
export const PERF_BUDGETS = {
  maxDrawCalls: 4300,
  maxTriangles: 150000,
  drawCalls: 4300,
  triangles: 150000,
};

// Shared flat palette. Water is the bright lagoon blue the pixel gates read:
// Lambert 0x1f8fff with a blue emissive at 0.55 — never near-black.
export const MATERIALS = {
  water: new THREE.MeshLambertMaterial({
    color: 0x1f8fff, emissive: 0x1f8fff, emissiveIntensity: 0.55,
  }),
  asphalt: new THREE.MeshLambertMaterial({ color: 0x4a4038 }),
  roadLine: new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }),
  sidewalk: new THREE.MeshLambertMaterial({ color: 0x9a938a }),
  curb: new THREE.MeshLambertMaterial({ color: 0x6e675e }),
  grass: new THREE.MeshLambertMaterial({ color: 0x5d8a3c }),
  ground: new THREE.MeshLambertMaterial({ color: 0x77804f }),
  buildingSlate: new THREE.MeshLambertMaterial({ color: 0x2e3440 }),
  buildingDark: new THREE.MeshLambertMaterial({ color: 0x232830 }),
  buildingLight: new THREE.MeshLambertMaterial({ color: 0x8a7f70 }),
  buildingGlass: new THREE.MeshLambertMaterial({
    color: 0x3a4a5a, emissive: 0x2a3644, emissiveIntensity: 0.4,
  }),
  goldPane: new THREE.MeshLambertMaterial({
    color: 0xd9a441, emissive: 0xffc861, emissiveIntensity: 1.0,
  }),
  goldFin: new THREE.MeshLambertMaterial({
    color: 0xc9962e, emissive: 0xffbf40, emissiveIntensity: 0.9,
  }),
  signBlue: new THREE.MeshLambertMaterial({ color: 0x1a4a8a }),
  signWhite: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  bridgeDeck: new THREE.MeshLambertMaterial({ color: 0x5a5148 }),
  bridgeCable: new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
  bridgePylon: new THREE.MeshLambertMaterial({ color: 0x6a6058 }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  palmLeaf: new THREE.MeshLambertMaterial({ color: 0x3f7a2e }),
  lampPost: new THREE.MeshLambertMaterial({ color: 0x2f3336 }),
  lampGlow: new THREE.MeshLambertMaterial({
    color: 0xffe9b0, emissive: 0xffdf80, emissiveIntensity: 1.2,
  }),
  benchWood: new THREE.MeshLambertMaterial({ color: 0x7a5a34 }),
  boatHull: new THREE.MeshLambertMaterial({ color: 0x2456a8 }),
  boatSail: new THREE.MeshLambertMaterial({ color: 0xf5f2e8, side: THREE.DoubleSide }),
  marinaWall: new THREE.MeshLambertMaterial({ color: 0xcfc4ae }),
  planterBox: new THREE.MeshLambertMaterial({ color: 0x7a6a52 }),
  shrub: new THREE.MeshLambertMaterial({ color: 0x4a7a34 }),
};

// Sky gradient stops (contract fix #3.5): zenith lightened so the heli
// body reads against the sky (contrast >= 35); horizon stays warm gold.
export const SKY_STOPS = [
  [0.0, '#5b6daa'],
  [0.45, '#7d6fa8'],
  [0.72, '#d9a05f'],
  [1.0, '#f0c078'],
];

// Vertical sky gradient as a canvas texture. Guarded for no-DOM (Node
// smoke tests): returns null there and callers fall back to a solid color.
// NOTE: the canvas MUST be declared after the guard (attempt #4 fix #1:
// a missing declaration threw ReferenceError and the game never booted).
export function createSkyTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  for (const [stop, color] of SKY_STOPS) grad.addColorStop(stop, color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Renderer. Returns ONLY the renderer. In Node (no DOM) returns a stub
// with the same interface so smoke tests can assert the setup without a GPU.
export function createRenderer(canvas) {
  if (typeof document === 'undefined') {
    return {
      isStubRenderer: true,
      domElement: null,
      shadowMap: { enabled: true, type: THREE.PCFShadowMap },
      outputColorSpace: THREE.SRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      setSize() {},
      setPixelRatio() {},
      render() {},
      getSize() { return { width: 1280, height: 720 }; },
      info: { render: { calls: 0, triangles: 0, geometries: 0, textures: 0 } },
      dispose() {},
    };
  }
  const renderer = new THREE.WebGLRenderer({ canvas: canvas || undefined, antialias: true });
  renderer.shadowMap.enabled = true;
  // MUST be PCFShadowMap: PCFSoftShadowMap was removed in this three
  // version and logs a warning every frame (the harness gates warnings === 0).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // NoToneMapping + sRGB is deliberate: a filmic curve desaturates the
  // water blue and Deco gold the pixel gates read.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(1280, 720);
  return renderer;
}

// Scene: warm fog + a sky dome (gradient texture, or solid fallback).
export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd9a05f, 200, 750);
  const skyTex = createSkyTexture();
  const skyMat = new THREE.MeshBasicMaterial({
    side: THREE.BackSide, fog: false, toneMapped: false,
  });
  if (skyTex) skyMat.map = skyTex;
  else skyMat.color = new THREE.Color(0x7d6fa8);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(650, 24, 16), skyMat);
  dome.name = 'skyDome';
  scene.add(dome);
  return scene;
}

// Golden-hour light rig: warm low sun 2.0 + hemisphere 0.75 + cool fill 0.35.
// The sun casts the long shadows; the fill keeps the shadow side readable.
export function setupLights(scene) {
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.0);
  sun.name = 'sun';
  sun.position.set(-150, 60, -60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  if (sun.target) {
    sun.target.position.set(0, 0, -100);
    scene.add(sun.target);
  }
  const hemi = new THREE.HemisphereLight(0xffd9b0, 0x6b5a48, 0.75);
  hemi.name = 'hemi';
  scene.add(hemi);
  const fill = new THREE.DirectionalLight(0x9db8ff, 0.35);
  fill.name = 'fill';
  fill.position.set(180, 90, 140);
  scene.add(fill);
  return { sun, hemi, fill };
}

// Performance accounting, read off the renderer's info block.
export function getPerfStats(renderer) {
  const info = (renderer && renderer.info && renderer.info.render)
    ? renderer.info.render
    : { calls: 0, triangles: 0, geometries: 0, textures: 0 };
  return {
    calls: info.calls || 0,
    triangles: info.triangles || 0,
    geometries: info.geometries || 0,
    textures: info.textures || 0,
  };
}

export function withinBudget(stats) {
  return stats.calls <= PERF_BUDGETS.maxDrawCalls
    && stats.triangles <= PERF_BUDGETS.maxTriangles;
}

export function resizeRenderer(renderer, width, height) {
  if (renderer && typeof renderer.setSize === 'function') {
    renderer.setSize(width, height);
  }
  return renderer;
}
