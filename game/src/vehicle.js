// Cars — Solmar Bay traffic (Lane A).
// Five original box-built models (coupe, sedan, pickup, van, sports), each a
// distinct shape with wheels, windows and lights. Arcade driving: accelerate,
// brake, reverse, speed-scaled steering, handbrake slide, and simple
// collision against building boxes. A car object is the contract Lane B
// reads: position, heading, speed, model, color, setDriver(driver), update().
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeGlowTexture, makeCheckerTexture, makeSignTexture } from './render.js';

export const VEHICLE_MODELS = ['coupe', 'sedan', 'pickup', 'van', 'sports', 'taxi', 'bus'];

// Round-4: glow / sign textures are built lazily once (canvas work only
// happens in the browser, never at module import).
let headGlowTex = null;
let tailGlowTex = null;
let blueGlowTex = null;
let checkerTex = null;
let taxiSignTex = null;
function glowTextures() {
  if (!headGlowTex) {
    headGlowTex = makeGlowTexture('rgba(255,240,170,0.9)');
    tailGlowTex = makeGlowTexture('rgba(255,60,50,0.9)');
    blueGlowTex = makeGlowTexture('rgba(70,120,255,0.9)');
    checkerTex = makeCheckerTexture(8, 2);
    taxiSignTex = makeSignTexture('TAXI', '#f7c948', '#111111');
  }
  return { headGlowTex, tailGlowTex, blueGlowTex, checkerTex, taxiSignTex };
}

// Model dimensions (length x width x body height) and cabin proportions.
// Round-5: bigger wheels + a per-model `stance` drop so the body sits
// planted on the wheels — bodyY = wheels*2 + bodyH/2 - stance, so the
// wheel tops overlap the body bottom by `stance` instead of the car
// floating on tiny wheels. Length/width/topSpeed/accel are untouched.
const MODEL_SHAPES = {
  coupe: { length: 4.4, width: 1.9, bodyH: 0.58, cabinL: 2.0, cabinH: 0.5, cabinZ: -0.2, wheels: 0.38, stance: 0.06 },
  sedan: { length: 4.8, width: 1.9, bodyH: 0.62, cabinL: 2.5, cabinH: 0.58, cabinZ: -0.1, wheels: 0.40, stance: 0.06 },
  pickup: { length: 5.2, width: 2.0, bodyH: 0.66, cabinL: 1.7, cabinH: 0.62, cabinZ: 0.9, wheels: 0.42, stance: 0.05 },
  van: { length: 5.0, width: 2.1, bodyH: 0.92, cabinL: 4.2, cabinH: 0.85, cabinZ: 0.1, wheels: 0.46, stance: 0.10 },
  sports: { length: 4.5, width: 2.0, bodyH: 0.48, cabinL: 1.9, cabinH: 0.42, cabinZ: -0.3, wheels: 0.38, stance: 0.06 },
  // Round-4 models: the taxi rides on the sedan shape; the bus is long,
  // tall and wide, with a long glass band for windows.
  taxi: { length: 4.8, width: 1.9, bodyH: 0.62, cabinL: 2.5, cabinH: 0.58, cabinZ: -0.1, wheels: 0.40, stance: 0.06 },
  bus: { length: 9.5, width: 2.5, bodyH: 1.42, cabinL: 8.0, cabinH: 0.9, cabinZ: 0, wheels: 0.50, stance: 0.08 },
};

function buildCarMesh(model, color) {
  const shape = MODEL_SHAPES[model] || MODEL_SHAPES.sedan;
  const group = new THREE.Group();
  const matBody = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.45 });
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.15, metalness: 0.6 });
  const matTrim = new THREE.MeshStandardMaterial({ color: 0x22242a, roughness: 0.7 });
  const matHead = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe98a, emissiveIntensity: 0.9 });
  const matTail = new THREE.MeshStandardMaterial({ color: 0xc22a2a, emissive: 0x881111, emissiveIntensity: 0.7 });
  const matWheel = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 });
  const matHub = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.3, metalness: 0.8 });

  function box(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  }

  const L = shape.length;
  const W = shape.width;
  // Round-5 planted stance: the wheel tops overlap the body bottom by
  // `stance`, so the car sits ON its wheels instead of floating above them.
  const bodyY = shape.wheels * 2 + shape.bodyH / 2 - (shape.stance || 0);

  // Main body. Pickup gets a bed instead of a full rear cabin.
  box(matBody, W, shape.bodyH, L, 0, bodyY, 0);
  if (model === 'pickup') {
    box(matTrim, W - 0.3, 0.35, L * 0.42, 0, bodyY + shape.bodyH / 2 + 0.1, -L * 0.26);
    box(matGlass, W - 0.3, shape.cabinH, shape.cabinL, 0, bodyY + shape.bodyH / 2 + shape.cabinH / 2, shape.cabinZ);
  } else if (model === 'van') {
    // Tall single-box van: body is the cabin.
    box(matGlass, W - 0.24, 0.6, 1.4, 0, bodyY + shape.bodyH / 2 + 0.35, L / 2 - 0.9);
    box(matGlass, W - 0.24, 0.55, 0.9, 0, bodyY + shape.bodyH / 2 + 0.3, -L / 2 + 0.6);
  } else {
    box(matGlass, W - 0.28, shape.cabinH, shape.cabinL, 0,
      bodyY + shape.bodyH / 2 + shape.cabinH / 2 - 0.04, shape.cabinZ);
  }
  // Sports car: low nose spoiler + rear wing.
  if (model === 'sports') {
    box(matTrim, W + 0.1, 0.08, 0.5, 0, bodyY - 0.1, L / 2 - 0.1);
    box(matTrim, W - 0.2, 0.07, 0.4, 0, bodyY + shape.bodyH + 0.25, -L / 2 + 0.3);
    box(matTrim, 0.08, 0.28, 0.08, -W / 2 + 0.2, bodyY + shape.bodyH + 0.12, -L / 2 + 0.3);
    box(matTrim, 0.08, 0.28, 0.08, W / 2 - 0.2, bodyY + shape.bodyH + 0.12, -L / 2 + 0.3);
    // Round-4: side skirts + rear diffuser so the sports car reads lower.
    box(matTrim, 0.1, 0.14, L * 0.72, -W / 2 + 0.02, bodyY - shape.bodyH / 2 + 0.1, 0);
    box(matTrim, 0.1, 0.14, L * 0.72, W / 2 - 0.02, bodyY - shape.bodyH / 2 + 0.1, 0);
    box(matTrim, W - 0.3, 0.16, 0.3, 0, bodyY - shape.bodyH / 2 + 0.08, -L / 2 + 0.15);
  }
  // Round-4: roof racks on the workhorses (pickup cabin roof, van roof
  // centre — clear of the van's front/rear glass boxes).
  if (model === 'pickup' || model === 'van') {
    const rackY = model === 'pickup'
      ? bodyY + shape.bodyH / 2 + shape.cabinH + 0.06
      : bodyY + shape.bodyH / 2 + 0.12;
    const rackL = model === 'pickup' ? shape.cabinL * 0.9 : 1.8;
    const rackZ = model === 'pickup' ? shape.cabinZ : 0;
    for (const sx of [-1, 1]) box(matTrim, 0.07, 0.07, rackL, sx * (W / 2 - 0.35), rackY, rackZ);
    for (const cz of [rackZ - rackL / 2 + 0.2, rackZ, rackZ + rackL / 2 - 0.2]) {
      box(matTrim, W - 0.6, 0.06, 0.08, 0, rackY, cz);
    }
  }
  // Round-4: the taxi gets a checker band along both sides and a TAXI
  // roof sign; the bus gets window dividers along its long glass band
  // and an amber destination display on the windshield.
  const glow = glowTextures();
  if (model === 'taxi') {
    const checkerMat = new THREE.MeshStandardMaterial({ map: glow.checkerTex, roughness: 0.6 });
    for (const sx of [-1, 1]) {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.62, 0.3), checkerMat);
      band.position.set(sx * (W / 2 + 0.015), bodyY, 0);
      band.rotation.y = sx * Math.PI / 2;
      group.add(band);
    }
    const signMat = new THREE.MeshStandardMaterial({ map: glow.taxiSignTex, roughness: 0.6 });
    box(signMat, 0.75, 0.24, 0.32, 0, bodyY + shape.bodyH / 2 + shape.cabinH + 0.08, shape.cabinZ);
  }
  if (model === 'bus') {
    const cabY = bodyY + shape.bodyH / 2 + shape.cabinH / 2 - 0.04;
    for (let z = -3.4; z <= 3.4; z += 1.35) {
      box(matTrim, 0.04, shape.cabinH * 0.85, 0.1, -W / 2 - 0.005, cabY, z);
      box(matTrim, 0.04, shape.cabinH * 0.85, 0.1, W / 2 + 0.005, cabY, z);
    }
    const matDest = new THREE.MeshStandardMaterial({
      color: 0xffc861, emissive: 0xffb020, emissiveIntensity: 1.4,
    });
    box(matDest, 1.3, 0.32, 0.06, 0, cabY + 0.15, shape.cabinZ + shape.cabinL / 2 + 0.03);
    // Round-5: roof AC pod — the bus roof was a bare glass slab.
    box(matTrim, 1.6, 0.22, 3.2, 0, bodyY + shape.bodyH / 2 + shape.cabinH - 0.04 + 0.11, 0);
  }
  // Round-5: distinct cab/hood for the low cars — a body-coloured hood
  // panel ahead of the cabin (slightly below the cabin base), a wider
  // grille (widened in the detail pass below) and a low front valance.
  if (model === 'sedan' || model === 'coupe' || model === 'sports' || model === 'taxi') {
    const cabFront = shape.cabinZ + shape.cabinL / 2;
    const hoodL = Math.max(0.6, L / 2 - cabFront + 0.1);
    const hoodZ = (cabFront + L / 2) / 2;
    box(matBody, W - 0.24, 0.1, hoodL, 0, bodyY + shape.bodyH / 2 - 0.05, hoodZ);
    box(matTrim, W - 0.1, 0.12, 0.14, 0, bodyY - shape.bodyH / 2 + 0.08, L / 2 + 0.02);
  }
  // Round-5: the van gets a real nose instead of a single tall box — a
  // sloped windshield leaning back over the cab front, a short hood bulge
  // low at the front, and a small roof vent behind the roof rack.
  if (model === 'van') {
    const shield = box(matGlass, W - 0.34, 0.72, 0.08, 0, bodyY + shape.bodyH / 2 + 0.12, L / 2 - 0.55);
    shield.rotation.x = -0.3;
    box(matBody, W - 0.2, 0.24, 0.8, 0, bodyY - shape.bodyH / 2 + 0.18, L / 2 - 0.35);
    box(matTrim, 0.55, 0.12, 0.5, 0, bodyY + shape.bodyH / 2 + 0.06, -1.15);
  }
  // Round-5: side skirts on every model (the sports car already had them
  // in round 4) — thin dark boxes along the lower body sides between the
  // wheels, so the car reads lower and the wheels tuck under the body.
  if (model !== 'sports') {
    const skirtL = Math.max(1.2, L * 0.5);
    const skirtY = bodyY - shape.bodyH / 2 + 0.07;
    box(matTrim, 0.1, 0.14, skirtL, -W / 2 + 0.02, skirtY, 0);
    box(matTrim, 0.1, 0.14, skirtL, W / 2 - 0.02, skirtY, 0);
  }
  // Headlights (front = +z) and taillights (rear = -z).
  box(matHead, 0.42, 0.16, 0.08, -W / 2 + 0.35, bodyY, L / 2 + 0.01);
  box(matHead, 0.42, 0.16, 0.08, W / 2 - 0.35, bodyY, L / 2 + 0.01);
  box(matTail, 0.42, 0.16, 0.08, -W / 2 + 0.35, bodyY, -L / 2 - 0.01);
  box(matTail, 0.42, 0.16, 0.08, W / 2 - 0.35, bodyY, -L / 2 - 0.01);
  // Round-4: soft glow sprites at the lights so cars read at dusk and in
  // the menu orbit shot. The tail glows flare with the brake lights
  // (car.update sets their opacity from `braking`).
  const glowCfg = CONFIG.round4?.vehicle || {};
  function glowSprite(tex, x, y, z, scale, opacity) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(scale);
    group.add(sprite);
    return sprite;
  }
  // Round-5: keep the headlight glow sprites + headlight material so
  // traffic.js can run the headlights brighter at dusk.
  const headSpriteL = glowSprite(glow.headGlowTex, -W / 2 + 0.35, bodyY, L / 2 + 0.15,
    glowCfg.headlightGlowScale ?? 1.5, glowCfg.headlightGlowOpacity ?? 0.75);
  const headSpriteR = glowSprite(glow.headGlowTex, W / 2 - 0.35, bodyY, L / 2 + 0.15,
    glowCfg.headlightGlowScale ?? 1.5, glowCfg.headlightGlowOpacity ?? 0.75);
  const headGlows = [headSpriteL.material, headSpriteR.material];
  const headGlowSprites = [headSpriteL, headSpriteR];
  const tailGlowL = glowSprite(glow.tailGlowTex, -W / 2 + 0.35, bodyY, -L / 2 - 0.15,
    glowCfg.tailGlowScale ?? 1.3, glowCfg.tailGlowIdle ?? 0.45).material;
  const tailGlowR = glowSprite(glow.tailGlowTex, W / 2 - 0.35, bodyY, -L / 2 - 0.15,
    glowCfg.tailGlowScale ?? 1.3, glowCfg.tailGlowIdle ?? 0.45).material;

  // Detail pass: bumpers, grille, mirrors, door seams, license plate.
  const matPlate = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 });
  // Front + rear bumpers (thin dark boxes at both ends).
  box(matTrim, W, 0.14, 0.18, 0, bodyY - 0.1, L / 2 + 0.02);
  box(matTrim, W, 0.14, 0.18, 0, bodyY - 0.1, -L / 2 - 0.02);
  // Front grille (dark box at front centre, between the headlights).
  // Round-5: the low cars get a wider grille to go with the hood panel.
  const grilleW = (model === 'sedan' || model === 'coupe' || model === 'sports' || model === 'taxi')
    ? W * 0.62 : W * 0.35;
  box(matTrim, grilleW, 0.16, 0.06, 0, bodyY, L / 2 + 0.03);
  // Side mirrors (small boxes on both sides, near the cabin front).
  const mirrorZ = shape.cabinZ + shape.cabinL / 2 - 0.15;
  const mirrorY = bodyY + shape.bodyH / 2 + 0.18;
  box(matTrim, 0.12, 0.08, 0.2, -W / 2 - 0.05, mirrorY, mirrorZ);
  box(matTrim, 0.12, 0.08, 0.2, W / 2 + 0.05, mirrorY, mirrorZ);
  // Door seam strips (thin dark vertical boxes on both sides).
  const seamZF = shape.cabinZ + shape.cabinL * 0.15;
  const seamZR = shape.cabinZ - shape.cabinL * 0.25;
  for (const sz of [seamZF, seamZR]) {
    box(matTrim, 0.03, shape.bodyH * 0.7, 0.06, -W / 2 - 0.005, bodyY, sz);
    box(matTrim, 0.03, shape.bodyH * 0.7, 0.06, W / 2 + 0.005, bodyY, sz);
  }
  // Rear license plate (small light box, just proud of the rear bumper).
  box(matPlate, 0.5, 0.14, 0.04, 0, bodyY - 0.02, -L / 2 - 0.14);

  // Wheels. The bus gets a middle axle as well (6 wheels).
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(shape.wheels, shape.wheels, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(shape.wheels * 0.55, shape.wheels * 0.55, 0.3, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const wy = shape.wheels;
  const wzF = L / 2 - 0.85;
  const wzR = -L / 2 + 0.85;
  const wheelSpots = [[-W / 2, wzF], [W / 2, wzF], [-W / 2, wzR], [W / 2, wzR]];
  if (model === 'bus') wheelSpots.push([-W / 2, 0], [W / 2, 0]);
  for (const [wx, wz] of wheelSpots) {
    const wheel = new THREE.Mesh(wheelGeo, matWheel);
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    group.add(wheel);
    const hub = new THREE.Mesh(hubGeo, matHub);
    hub.position.set(wx, wy, wz);
    group.add(hub);
    wheels.push(wheel);
  }
  // Round-5: wheel arches — a dark fender box over each wheel, just
  // above the wheel top, so the wheels read as tucked into arches
  // instead of bolted onto a flat box side.
  for (const [wx, wz] of wheelSpots) {
    box(matTrim, 0.36, 0.16, 1.0, wx, shape.wheels * 2 + 0.05, wz);
  }

  return { group, wheels, shape, tailMat: matTail, tailGlows: [tailGlowL, tailGlowR], headMat: matHead, headGlows, headGlowSprites };
}

// Create one car in `scene`.
// createCar(scene, model, color, x, z, heading)
// `model` is one of VEHICLE_MODELS; `color` is a hex number or CSS string.
export function createCar(scene, model, color, x, z, heading) {
  const name = VEHICLE_MODELS.includes(model) ? model : 'sedan';
  const tune = CONFIG.vehicleModels[name] || CONFIG.vehicleModels.sedan;
  const { group, wheels, shape, tailMat, tailGlows, headMat, headGlows, headGlowSprites } = buildCarMesh(name, color === undefined ? 0xc23a2a : color);
  group.position.set(x || 0, 0, z || 0);
  scene.add(group);

  const car = {
    group,
    mesh: group,
    model: name,
    color,
    position: group.position, // THREE.Vector3 — Lane B reads car.position
    heading: heading || 0,
    speed: 0, // signed m/s, forward positive
    driver: null,
    wheels,
    tailMat, // round 3: brake lights flare by setting its emissiveIntensity
    tailGlows, // round 4: tail glow sprite materials, flared with braking
    headMat, // round 5: headlight material, brightened at dusk by traffic.js
    headGlows, // round 5: headlight glow sprite materials (dusk headlights)
    headGlowSprites, // round 5: headlight glow sprites (dusk scale-up)
    braking: false, // round 3: true while the brakes are on
    skidding: false, // round 3: true on a hard handbrake turn at speed
    length: shape.length,
    width: shape.width,
    topSpeed: CONFIG.vehicle.maxSpeed * tune.topSpeed,
    accel: CONFIG.vehicle.accel * tune.accel,

    setDriver(driver) {
      this.driver = driver || null;
    },

    // One frame of arcade driving.
    // `controls` (optional): { throttle (0..1 or -1..1), steer (-1..1),
    //   brake (bool), handbrake (bool) }. When omitted the car coasts.
    // `inputState` (optional, alternative): the input singleton — W/S drive,
    //   A/D steer, Space handbrake. `world` is the world description object.
    update(dt, world, controls, inputState) {
      const safeDt = Math.min(dt || 0.016, 0.05);
      let throttle = 0;
      let steer = 0;
      let brake = false;
      let handbrake = false;
      if (controls) {
        throttle = controls.throttle || 0;
        if (controls.forward) throttle = 1;
        if (controls.reverse) throttle = -1;
        steer = controls.steer || 0;
        brake = !!controls.brake;
        handbrake = !!controls.handbrake;
      } else if (inputState && typeof inputState.isDown === 'function') {
        if (inputState.isDown('KeyW') || inputState.isDown('ArrowUp')) throttle = 1;
        if (inputState.isDown('KeyS') || inputState.isDown('ArrowDown')) throttle = -1;
        if (inputState.isDown('KeyA') || inputState.isDown('ArrowLeft')) steer = -1;
        if (inputState.isDown('KeyD') || inputState.isDown('ArrowRight')) steer = 1;
        brake = inputState.isDown('KeyS') && this.speed > 0.5;
        handbrake = inputState.isDown('Space');
      }

      // Longitudinal forces.
      if (throttle > 0) this.speed += this.accel * throttle * safeDt;
      else if (throttle < 0) {
        if (this.speed > 0.5) this.speed -= CONFIG.vehicle.brake * safeDt; // braking first
        else this.speed += CONFIG.vehicle.reverseAccel * throttle * safeDt; // then reverse
      }
      if (brake && this.speed > 0) this.speed -= CONFIG.vehicle.brake * safeDt;
      // Drag + rolling resistance.
      this.speed -= this.speed * CONFIG.vehicle.drag * safeDt;
      if (throttle === 0) this.speed -= Math.sign(this.speed) * CONFIG.vehicle.rollingDrag * safeDt;
      if (Math.abs(this.speed) < 0.08 && throttle === 0) this.speed = 0;
      this.speed = Math.max(-CONFIG.vehicle.maxReverseSpeed, Math.min(this.topSpeed, this.speed));

      // Steering authority falls with speed; handbrake loosens the rear.
      const speedRatio = Math.min(1, Math.abs(this.speed) / this.topSpeed);
      const steerAuthority = CONFIG.vehicle.steerAngle
        * (1 - speedRatio * (1 - CONFIG.vehicle.steerSpeedScale));
      const grip = handbrake ? CONFIG.vehicle.handbrakeGripLoss : 1;
      this.heading += steer * steerAuthority * Math.sign(this.speed) * grip * safeDt * (2.2 - speedRatio);
      if (handbrake) this.speed *= (1 - 0.9 * safeDt);

      // Round-3 polish: brake lights flare while braking, and a hard
      // handbrake turn at speed counts as a skid (main.js plays the
      // screech from the `skidding` flag).
      this.braking = brake || (throttle < 0 && this.speed > 0.5);
      if (this.tailMat) this.tailMat.emissiveIntensity = this.braking ? 2.6 : 0.7;
      // Round-4: the tail glow sprites flare with the brake lights.
      if (this.tailGlows) {
        const glowCfg = CONFIG.round4?.vehicle || {};
        const glow = this.braking ? (glowCfg.tailGlowBrake ?? 0.95) : (glowCfg.tailGlowIdle ?? 0.45);
        for (const g of this.tailGlows) g.opacity = glow;
      }
      this.skidding = Boolean(handbrake && steer !== 0
        && Math.abs(this.speed) > (CONFIG.drivingFeel?.skidSpeed ?? 18));

      const nx = this.position.x + Math.sin(this.heading) * this.speed * safeDt;
      const nz = this.position.z + Math.cos(this.heading) * this.speed * safeDt;

      // Building collision: stop dead on impact (simple arcade response).
      if (world && typeof world.collidesCircle === 'function') {
        if (!world.collidesCircle(nx, nz, CONFIG.vehicle.radius)) {
          this.position.x = nx;
          this.position.z = nz;
        } else {
          this.speed *= -0.15;
        }
        if (world.clampToCity) {
          const c = world.clampToCity(this.position.x, this.position.z, 3);
          this.position.x = c.x;
          this.position.z = c.z;
        }
      } else {
        this.position.x = nx;
        this.position.z = nz;
      }

      group.rotation.y = this.heading;
      // Spin the wheels with travel.
      const spin = (this.speed * safeDt) / Math.max(shape.wheels, 0.01);
      for (const wheel of wheels) wheel.rotation.x += spin;
      // Front wheels visually steer.
      wheels[0].rotation.y = steer * 0.3;
      wheels[1].rotation.y = steer * 0.3;
    },

    // Speed in km/h, for the HUD.
    get speedKmh() {
      return Math.abs(this.speed) * 3.6;
    },
  };

  group.rotation.y = car.heading;
  return car;
}

// Police light bar: a red + blue emissive bar on the roof plus white side
// stripes. Attached by the caller (main.js / police wiring) via
// attachPoliceLightBar, NOT by createCar, so ordinary traffic cars stay
// unmarked. Idempotent: calling it twice on the same car returns the
// existing bar. Returns the lightBar record, or null for a car with no
// 3D group (e.g. a stand-in police car).
export function attachPoliceLightBar(car) {
  if (!car || !car.group) return null;
  if (car.lightBar) return car.lightBar;
  // The mesh was built from the Lane A model shape; the display name on
  // car.model (e.g. 'Solmar Police Interceptor') is not a shape key, so
  // fall back to the sedan shape, which is what the interceptor uses.
  const shape = MODEL_SHAPES[car.model] || MODEL_SHAPES.sedan;
  const L = shape.length;
  const W = shape.width;
  // Round-5: same planted-stance bodyY as buildCarMesh, so the bar sits
  // on the actual roof (0.05–0.10 lower than the old formula would put it).
  const bodyY = shape.wheels * 2 + shape.bodyH / 2 - (shape.stance || 0);
  const roofY = bodyY + shape.bodyH / 2 + shape.cabinH - 0.04;
  const matBase = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.6 });
  const matStripe = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
  // Round-5 dusk: the bar lamps run brighter so they read against the
  // sunset (on 3.6 / off 0.4, up from 2.2 / 0.15), with a red/blue glow
  // sprite over each lamp that flashes with the phase.
  const matRed = new THREE.MeshStandardMaterial({ color: 0xcc0000, emissive: 0xff2222, emissiveIntensity: 3.6 });
  const matBlue = new THREE.MeshStandardMaterial({ color: 0x0033cc, emissive: 0x2244ff, emissiveIntensity: 0.4 });

  function add(material, w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    car.group.add(mesh);
    return mesh;
  }

  // Bar base + one red (driver side) and one blue (passenger side) lamp.
  add(matBase, 0.95, 0.08, 0.42, 0, roofY + 0.02, shape.cabinZ);
  add(matRed, 0.42, 0.13, 0.32, -0.25, roofY + 0.1, shape.cabinZ);
  add(matBlue, 0.42, 0.13, 0.32, 0.25, roofY + 0.1, shape.cabinZ);
  // Round-5: glow sprites over the lamps (phase 0: red on, blue dim).
  const glow = glowTextures();
  function barGlow(tex, x, opacity) {
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, roofY + 0.14, shape.cabinZ);
    sprite.scale.setScalar(1.1);
    car.group.add(sprite);
    return sprite;
  }
  const redGlowSprite = barGlow(glow.tailGlowTex, -0.25, 0.9);
  const blueGlowSprite = barGlow(glow.blueGlowTex, 0.25, 0.12);
  // White side stripes along the body.
  add(matStripe, 0.03, 0.14, L * 0.55, -W / 2 - 0.01, bodyY + 0.02, 0);
  add(matStripe, 0.03, 0.14, L * 0.55, W / 2 + 0.01, bodyY + 0.02, 0);

  car.lightBar = {
    red: matRed, blue: matBlue,
    redGlow: redGlowSprite.material, blueGlow: blueGlowSprite.material,
    redGlowSprite, blueGlowSprite,
  };
  return car.lightBar;
}

// Set the police light-bar flash phase. Phase 0: red bright / blue dim;
// phase 1: red dim / blue bright. Safe no-op on a car with no light bar.
// Round-5 dusk levels: bright 3.6 / dim 0.4 (was 2.2 / 0.15), and the
// bar glow sprites flash with the lamps when the car has them.
export function setPoliceLightPhase(car, phase) {
  if (!car || !car.lightBar) return;
  const blueOn = phase === 1;
  car.lightBar.red.emissiveIntensity = blueOn ? 0.4 : 3.6;
  car.lightBar.blue.emissiveIntensity = blueOn ? 3.6 : 0.4;
  if (car.lightBar.redGlow) car.lightBar.redGlow.opacity = blueOn ? 0.12 : 0.9;
  if (car.lightBar.blueGlow) car.lightBar.blueGlow.opacity = blueOn ? 0.9 : 0.12;
}

// Nearest car to `point` ({x, z} or THREE.Vector3) within `maxDistance`.
// Returns the car, or null. `cars` is an array of car objects.
export function findNearestCar(cars, point, maxDistance) {
  const max = maxDistance === undefined ? CONFIG.player.enterCarDistance : maxDistance;
  let best = null;
  let bestD = max;
  for (const car of cars || []) {
    if (!car || !car.position) continue;
    const dx = car.position.x - point.x;
    const dz = car.position.z - point.z;
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

export default createCar;
