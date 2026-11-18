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

// Round-4 polish: a black/white checker tile (taxi checker band) and a
// bold text sign plate (street-name blades, taxi roof sign, bus-stop sign).
// Both are procedural canvas textures, so the game stays fully offline.
export function makeCheckerTexture(checksX = 8, checksY = 2, colorA = '#111111', colorB = '#f5f5f5') {
  return makeCanvasTexture(128, 32, (ctx, w, h) => {
    const cw = w / checksX;
    const ch = h / checksY;
    for (let y = 0; y < checksY; y++) {
      for (let x = 0; x < checksX; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? colorA : colorB;
        ctx.fillRect(x * cw, y * ch, cw, ch);
      }
    }
  });
}

// Round-4b: a subtle water-surface texture — soft light streaks and
// fine ripple speckle on a deep blue base, so the sea reads as water
// instead of a flat blue plane. Deterministic (no Math.random), so the
// same build always paints the same sea. world.js tiles it on the water.
export function makeWaterTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#1e7fa8';
    ctx.fillRect(0, 0, w, h);
    // Diagonal caustic bands, placed by a fixed hash pattern.
    for (let i = 0; i < 26; i++) {
      const x = (i * 97) % w;
      const y = (i * 57) % h;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.05 + (i % 3) * 0.02).toFixed(2) + ')';
      ctx.lineWidth = 2 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 40, y + 12, x + 80, y - 8, x + 120, y + 6);
      ctx.stroke();
    }
    // Fine ripple speckle.
    for (let i = 0; i < 500; i++) {
      const x = (i * 53) % w;
      const y = (i * 91) % h;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(x, y, 2, 1);
    }
  });
}

export function makeSignTexture(text, bg = '#1d5c2e', fg = '#ffffff') {
  return makeCanvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, w - 6, h - 6);
    ctx.fillStyle = fg;
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text), w / 2, h / 2 + 1);
  });
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
