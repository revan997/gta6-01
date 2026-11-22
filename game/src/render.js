// Solmar Bay — rendering setup, lighting, materials.
//
// The Three.js renderer, the scene, the golden-hour sunset light rig
// (warm low directional sun, soft ambient fill, bright sky), the
// material definitions (dark slate, gold panes, bright blue water,
// warm asphalt, green grass, white signage on blue), and the
// performance accounting (draw calls and triangles, with the budgets
// from the config). No fog (it would wash the bright water out at
// distance) and no shadow maps (they cost frames under SwiftShader and
// the sunset look is carried by the light rig and the flat colours).
//
// Colours are kept predictable: tone mapping is OFF and the output
// colour space is sRGB, so a MeshBasicMaterial renders exactly its
// colour — which is what the pixel gates measure (the bright blue
// water, the gold panes, the dark slate, the white heli body).

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

// ---------------------------------------------------------------------
// Materials. Shared wherever possible, so the scene stays cheap.
// ---------------------------------------------------------------------

export function makeMaterials() {
  const lambert = (color) => new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
  const basic = (color) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
  return {
    // Lambert (sun-shaded) materials for the built city.
    asphalt: lambert(PALETTE.asphalt),
    asphaltWarm: lambert(PALETTE.asphaltWarm),
    sidewalk: lambert(PALETTE.sidewalk),
    kerb: lambert(PALETTE.kerb),
    grass: lambert(PALETTE.grass),
    grassDark: lambert(PALETTE.grassDark),
    slate: lambert(PALETTE.slate),
    slateDark: lambert(PALETTE.slateDark),
    slateLight: lambert(PALETTE.slateLight),
    ground: lambert(PALETTE.ground),
    white: lambert(PALETTE.white),
    black: lambert(PALETTE.black),
    red: lambert(PALETTE.red),
    orange: lambert(PALETTE.orange),
    teal: lambert(PALETTE.teal),
    gold: lambert(PALETTE.gold),
    // Basic (unlit, exact-colour) materials for the gated colours.
    water: basic(PALETTE.water),
    waterBright: basic(PALETTE.waterBright),
    goldPane: basic(PALETTE.goldPane),
    goldBright: basic(PALETTE.goldBright),
    signBlue: basic(PALETTE.signBlue),
    signWhite: basic(PALETTE.signWhite),
    laneLine: basic(PALETTE.laneLine),
    heliWhite: basic(PALETTE.heliWhite),
    sun: basic(PALETTE.sun),
    muzzle: basic(PALETTE.muzzle),
  };
}

// ---------------------------------------------------------------------
// The golden-hour light rig.
// ---------------------------------------------------------------------

// The sun is low in the west (negative x), warm and strong, so the
// west faces glow and the east faces fall into a soft shade. The
// ambient is warm and soft, so nothing goes black. The hemisphere
// light lifts the sky-facing surfaces toward the sky colour.
export function createLightRig(scene) {
  const sun = new THREE.DirectionalLight(0xffc98a, 2.1);
  // Low in the west, slightly north, so the long shadows point east.
  sun.position.set(-320, 95, -140);
  scene.add(sun);
  const ambient = new THREE.AmbientLight(0xffe0b8, 0.85);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0x8fb0d8, 0x5a4a38, 0.55);
  scene.add(hemi);
  // A faint warm bounce from the east (the sunset reflecting off the
  // Marina), so the east faces are not dead.
  const bounce = new THREE.DirectionalLight(0xff9a5a, 0.35);
  bounce.position.set(300, 40, -100);
  scene.add(bounce);
  return { sun, ambient, hemi, bounce };
}

// Set the sun for a time of day (golden hour: 17.8-18.6). The sun sinks
// and warms as the evening goes on; the change is small across the four
// shots, so the look stays consistent.
export function setSunForTime(rig, timeOfDay) {
  const t = Math.max(17, Math.min(19, timeOfDay));
  const sink = (t - 17) / 2; // 0 at 17:00, 1 at 19:00
  rig.sun.position.set(-320, 95 - sink * 45, -140 + sink * 30);
  const warmth = 1 - sink * 0.25;
  rig.sun.color.setRGB(1.0, 0.79 * warmth + 0.1, 0.54 * warmth + 0.08);
  rig.sun.intensity = 2.1 - sink * 0.4;
  rig.ambient.intensity = 0.85 - sink * 0.15;
}

// ---------------------------------------------------------------------
// The renderer.
// ---------------------------------------------------------------------

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  // Predictable colours: no tone mapping, sRGB output. A MeshBasic
  // material then renders exactly its colour, which is what the pixel
  // gates measure.
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  // The scene background is the sky dome's colour at the horizon, so
  // a frame never shows a black edge if the dome is out of view.
  renderer.setClearColor(new THREE.Color(PALETTE.skyMid), 1);
  return renderer;
}

export function resizeRenderer(renderer, camera) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------
// Cameras.
// ---------------------------------------------------------------------

export function createCamera(fov, near, far) {
  const camera = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
  return camera;
}

// ---------------------------------------------------------------------
// Projection: world -> screen (0..1 in x and y, null when behind).
// The harness reads this as window.__solmar.project and uses it to
// measure every geometry gate (GT height, heli span, Deco bbox, the
// MARINA sign, Rico's height, the roadblock, the officers).
// ---------------------------------------------------------------------

export function makeProjector(camera) {
  const v = new THREE.Vector3();
  return function project(x, y, z) {
    v.set(x, y, z).project(camera);
    // Behind the camera (or beyond the far plane) projects outside.
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x + 1) / 2, y: (1 - v.y) / 2 };
  };
}

// ---------------------------------------------------------------------
// Performance accounting. Read after a render: the real draw calls and
// triangles the GPU was asked for. The harness gates these against the
// budgets (draw calls <= 4300, triangles <= 150000).
// ---------------------------------------------------------------------

export function readBudget(renderer) {
  const info = renderer.info.render;
  return { calls: info.calls, triangles: info.triangles };
}

export function budgetOk(budget) {
  return budget.calls <= CONFIG.budgets.drawCalls
    && budget.triangles <= CONFIG.budgets.triangles;
}

// ---------------------------------------------------------------------
// A tiny frame-time helper (for the HUD's FPS readout in free play).
// Pure game-time bookkeeping, no wall-clock scene content.
// ---------------------------------------------------------------------

export function createFrameTimer() {
  let frames = 0;
  let acc = 0;
  let fps = 60;
  function tick(dt) {
    frames += 1;
    acc += dt;
    if (acc >= 0.5) {
      fps = Math.round(frames / acc);
      frames = 0;
      acc = 0;
    }
    return fps;
  }
  return { tick, getFps: () => fps };
}
