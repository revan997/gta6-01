// Renderer, camera and lighting (Lane A; round-2 polish: canvas-texture
// helper, tighter player-following shadows, stronger sun contrast).
import * as THREE from 'three';
import { CONFIG } from './config.js';

// Procedural canvas texture: `draw(ctx, width, height)` paints the canvas;
// returns a THREE.CanvasTexture with sRGB colours and mild anisotropy.
// Used by world.js for building facades, road markings and crosswalks —
// all art stays procedural and offline, no image files.
export function makeCanvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx, width, height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Round-3 polish: a soft radial glow sprite (bright centre fading to
// transparent), for lamp halos and muzzle/impact flashes. `color` is a
// CSS colour; `inner`/`outer` are 0..1 stops of the gradient.
export function makeGlowTexture(color, inner = 0.15, outer = 1) {
  const tex = makeCanvasTexture(128, 128, (ctx, w, h) => {
    const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(inner, color);
    grad.addColorStop(outer, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
  return tex;
}

// Create the renderer for `canvas`, a perspective camera, and the lights.
// Returns { renderer, camera, sunLight, hemiLight, resize, setSize }.
// The caller owns the render loop; resize() is also bound to window resize.
export function createRenderContext(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // (r187 removed PCFSoftShadowMap)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const camera = new THREE.PerspectiveCamera(
    CONFIG.camera.fov,
    window.innerWidth / window.innerHeight,
    CONFIG.camera.near,
    CONFIG.camera.far
  );
  camera.position.set(0, 8, 14);

  // Sun: warm directional light with crisp shadows. The shadow frustum is
  // tight (±120 m) because main.js re-centres the light on the camera
  // focus every frame — a city-wide frustum made shadows invisible.
  // The initial position matches CONFIG.lighting.sunOffset; the loop owns it.
  const sunLight = new THREE.DirectionalLight(CONFIG.colors.sun, CONFIG.lighting.sunIntensity);
  sunLight.position.set(
    CONFIG.lighting.sunOffset[0],
    CONFIG.lighting.sunOffset[1],
    CONFIG.lighting.sunOffset[2],
  );
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  const frustum = CONFIG.lighting.shadowFrustum;
  sunLight.shadow.camera.left = -frustum;
  sunLight.shadow.camera.right = frustum;
  sunLight.shadow.camera.top = frustum;
  sunLight.shadow.camera.bottom = -frustum;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 520;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.4;

  // Hemisphere light: bright sky bounce + warm ground bounce, no shadows.
  // Kept dimmer than round 1 (1.1 washed the shadows out).
  const hemiLight = new THREE.HemisphereLight(0xbfe3f2, 0x8a7a5a, CONFIG.lighting.hemiIntensity);

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  window.addEventListener('resize', resize);

  function setSize(width, height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  return { renderer, camera, sunLight, hemiLight, resize, setSize };
}

export default createRenderContext;
