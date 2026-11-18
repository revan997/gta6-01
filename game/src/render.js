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

// Round-5 polish: the sun disc — a bright core with warm corona rings —
// and a wide soft halo for atmosphere. Both are procedural canvas
// textures, so the game stays fully offline. world.js uses them for the
// low sunset sun sprites.
// Round-6: stops warmed toward gold (less pink) — #ffb347 / #ff8a2a
// family throughout, matching the warmer round-6 sky.
export function makeSunDiscTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    grad.addColorStop(0, '#fffdf0');
    grad.addColorStop(0.22, '#ffedb0');
    grad.addColorStop(0.42, '#ffb347');
    grad.addColorStop(0.6, 'rgba(255,150,40,0.55)');
    grad.addColorStop(0.8, 'rgba(255,138,42,0.18)');
    grad.addColorStop(1, 'rgba(255,138,42,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    // Corona rings: thin warm circles outside the bright core.
    ctx.strokeStyle = 'rgba(255,190,90,0.35)';
    ctx.lineWidth = 3;
    for (const r of [0.52, 0.64, 0.76]) {
      ctx.beginPath();
      ctx.arc(cx, cy, (w / 2) * r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

export function makeHaloTexture() {
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    grad.addColorStop(0, 'rgba(255,179,71,0.55)');
    grad.addColorStop(0.4, 'rgba(255,150,50,0.22)');
    grad.addColorStop(0.75, 'rgba(255,140,42,0.07)');
    grad.addColorStop(1, 'rgba(255,140,42,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

// Round-6: a small bright radial glow for the Solmar Spire beacon —
// white-gold core fading to transparent, so the beacon tip reads as a
// light at dusk from across the city. world.js uses it on the spire.
export function makeBeaconTexture() {
  return makeCanvasTexture(128, 128, (ctx, w, h) => {
    const cx = w / 2;
    const cy = h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    grad.addColorStop(0, '#fffbe0');
    grad.addColorStop(0.25, '#ffd94a');
    grad.addColorStop(0.6, 'rgba(255,180,60,0.35)');
    grad.addColorStop(1, 'rgba(255,180,60,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
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
  // Round-5: 1.12 (was 1.05) so the sunset colours stay rich — ACES
  // washes them out at the old exposure.
  // Round 7: the burnt-sienna zenith is darker than the plum, so the
  // exposure lifts slightly (CONFIG.round7.exposure, 1.28) to keep the
  // sky luminous; falls back to the round-5 value when the block is gone.
  renderer.toneMappingExposure = CONFIG.round7?.exposure ?? (CONFIG.round5 ? CONFIG.round5.exposure : 1.12);

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

  // Hemisphere light: warm sunset sky bounce + warm ground bounce, no
  // shadows. Round-5 colours come from CONFIG.round5 (warm orange sky,
  // brown ground); kept dimmer than round 1 so shadows stay visible.
  const hemiLight = new THREE.HemisphereLight(
    CONFIG.round5 ? CONFIG.round5.lighting.hemiSky : 0xffb080,
    CONFIG.round5 ? CONFIG.round5.lighting.hemiGround : 0x7a5a40,
    CONFIG.lighting.hemiIntensity,
  );

  // Round-8: a cheap vehicle fill light — one dim, shadowless
  // directional light from the low sun's opposite side (cool, faint),
  // so car paint and the new fender/glasshouse sculpt keep a readable
  // edge at dusk instead of going black on the shadow side. One extra
  // light, no shadows, no per-car cost; main.js aims it at the camera
  // focus alongside the sun (followSun owns the sun; the fill is fixed
  // in the same direction family and needs no per-frame work).
  const vehicleFillLight = new THREE.DirectionalLight(0x8fa8c8, 0.35);
  vehicleFillLight.position.set(-60, 40, -80);
  vehicleFillLight.castShadow = false;

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

  return { renderer, camera, sunLight, hemiLight, vehicleFillLight, resize, setSize };
}

// Round-8: add the vehicle fill light to a scene in one call — the
// one-line wiring main.js uses (scene.add is owned by the caller, like
// sunLight/hemiLight above). Returns the light, or null when no scene
// is given. Also raises car-paint response at dusk: any material passed
// in gets envMapIntensity 1.35, so the sculpted paint keeps a warm
// sheen from the sunset instead of flattening to matte.
export function addVehicleFillLight(scene) {
  if (!scene || typeof scene.add !== 'function') return null;
  const fill = new THREE.DirectionalLight(0x8fa8c8, 0.35);
  fill.position.set(-60, 40, -80);
  fill.castShadow = false;
  scene.add(fill);
  return fill;
}

export function boostCarPaint(material) {
  if (!material || typeof material !== 'object') return material;
  // envMapIntensity only matters once an env map exists; setting it is
  // harmless without one and lifts the paint the moment one is added.
  material.envMapIntensity = 1.35;
  return material;
}

// Round-8: boost the paint of every standard material on a car — the
// wiring that actually calls boostCarPaint(). main.js runs this once
// per car at spawn (makeCar), so the sculpted fenders / glasshouse /
// roof crowns keep a warm dusk sheen. Only MeshStandardMaterial is
// touched (sprites and glow materials are left alone); returns how many
// materials were boosted, 0 when the car has no mesh group.
export function boostCarPaintForCar(car) {
  if (!car?.group || typeof car.group.traverse !== 'function') return 0;
  let boosted = 0;
  car.group.traverse((obj) => {
    const mat = obj?.material;
    if (mat && mat.isMeshStandardMaterial) {
      boostCarPaint(mat);
      boosted += 1;
    }
  });
  return boosted;
}

// Round-9: a warm dusk sheen for car glass. The round-9 integrated
// roofs sit on a tapered glasshouse, but at dusk the glass (near-black
// 0x1a2a38, metalness 0.6, no env map) went flat black on the shadow
// side, so the glasshouse read as a hole under the new roof instead of
// glass. A faint warm emissive (sunset bounce off the glass) lifts the
// shadow side just enough to read as glass without glowing — applied
// at build time in vehicle.js so every car gets it, not just the
// player car (boostCarPaintForCar only runs on spawned player cars).
export function boostGlassSheen(material) {
  if (!material || typeof material !== 'object') return material;
  material.emissive = material.emissive || new THREE.Color(0x000000);
  material.emissive.setHex(0x3a2410);
  material.emissiveIntensity = 0.35;
  return material;
}

// Round-10 (Lane C, facades): per-building facade variation, baked at
// build time so there is no per-frame cost. Building faces were flat
// shaded boxes in one district grey; the skyline read as extruded
// blocks. Three helpers below fix it without touching the seeded rng:
// a deterministic warm/cool tint per building, a warm lit-glass
// material for geometry windows, and the tint application itself.
// All decisions hash the building's (x, z) position, so the same seed
// always paints the same city and the layout stream is undisturbed.

// Warm/cool facade tones (near-white, so they tint the district base
// colour instead of replacing it): warm cream, cool blue-grey, rose,
// pale gold, sage, slate, amber, neutral. One per building, hashed.
export const FACADE_TINTS = [
  { color: 0xffffff, roughness: 0.9 },
  { color: 0xffe6c0, roughness: 0.85 },
  { color: 0xdfe8f2, roughness: 0.8 },
  { color: 0xf2d8c8, roughness: 0.9 },
  { color: 0xfff0d0, roughness: 0.85 },
  { color: 0xd8e4d8, roughness: 0.9 },
  { color: 0xcfd8e8, roughness: 0.75 },
  { color: 0xffe0b0, roughness: 0.85 },
];

// Deterministic tint for the building at (x, z): a 32-bit integer hash
// of the floored position + height, so neighbours rarely share a tone
// and no rng is consumed. Returns one entry of FACADE_TINTS.
export function facadeTintFor(x, z, height) {
  let h = (Math.imul(Math.floor(x * 10), 374761393)
    + Math.imul(Math.floor(z * 10), 668265263)
    + Math.imul(Math.floor(height || 0), 974634211)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return FACADE_TINTS[h % FACADE_TINTS.length];
}

// Apply a facade tint to a building's MeshStandardMaterial: the tint
// colour multiplies the facade map (warm/cool shift per building) and
// the roughness varies the dusk sheen. Guards nulls; returns material.
export function applyFacadeTint(material, tint) {
  if (!material || typeof material !== 'object' || !tint) return material;
  if (material.color && typeof material.color.setHex === 'function') {
    material.color.setHex(tint.color);
  }
  if (typeof tint.roughness === 'number') material.roughness = tint.roughness;
  return material;
}

// A warm lit-window glass material for geometry windows: MeshBasic
// (unlit, so the pane reads as a glow at dusk instead of a shaded
// surface — same perf reasoning as the round-5 window materials).
// `hex` is the warm tone; world.js uses pale gold for most lit panes
// and a deeper gold for a deterministic subset, so lit floors vary.
export function makeLitGlassMaterial(hex = 0xffe9a8) {
  return new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide });
}

export default createRenderContext;
