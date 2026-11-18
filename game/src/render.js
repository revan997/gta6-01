// Renderer, camera and lighting (Lane A).
import * as THREE from 'three';
import { CONFIG } from './config.js';

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

  // Sun: warm directional light with soft shadows over the whole city.
  const sunLight = new THREE.DirectionalLight(CONFIG.colors.sun, 2.6);
  sunLight.position.set(140, 190, 70);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.left = -360;
  sunLight.shadow.camera.right = 360;
  sunLight.shadow.camera.top = 360;
  sunLight.shadow.camera.bottom = -360;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 700;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.4;

  // Hemisphere light: bright sky bounce + warm ground bounce, no shadows.
  const hemiLight = new THREE.HemisphereLight(0xbfe3f2, 0x8a7a5a, 1.1);

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
