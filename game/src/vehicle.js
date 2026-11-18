// Cars — Solmar Bay traffic (Lane A).
// Five original box-built models (coupe, sedan, pickup, van, sports), each a
// distinct shape with wheels, windows and lights. Arcade driving: accelerate,
// brake, reverse, speed-scaled steering, handbrake slide, and simple
// collision against building boxes. A car object is the contract Lane B
// reads: position, heading, speed, model, color, setDriver(driver), update().
import * as THREE from 'three';
import { CONFIG } from './config.js';

export const VEHICLE_MODELS = ['coupe', 'sedan', 'pickup', 'van', 'sports'];

// Model dimensions (length x width x body height) and cabin proportions.
const MODEL_SHAPES = {
  coupe: { length: 4.4, width: 1.9, bodyH: 0.62, cabinL: 2.0, cabinH: 0.5, cabinZ: -0.2, wheels: 0.34 },
  sedan: { length: 4.8, width: 1.9, bodyH: 0.68, cabinL: 2.5, cabinH: 0.58, cabinZ: -0.1, wheels: 0.35 },
  pickup: { length: 5.2, width: 2.0, bodyH: 0.72, cabinL: 1.7, cabinH: 0.62, cabinZ: 0.9, wheels: 0.38 },
  van: { length: 5.0, width: 2.1, bodyH: 1.05, cabinL: 4.2, cabinH: 0.85, cabinZ: 0.1, wheels: 0.36 },
  sports: { length: 4.5, width: 2.0, bodyH: 0.52, cabinL: 1.9, cabinH: 0.42, cabinZ: -0.3, wheels: 0.35 },
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
  const bodyY = shape.wheels * 2 + shape.bodyH / 2;

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
  }
  // Headlights (front = +z) and taillights (rear = -z).
  box(matHead, 0.42, 0.16, 0.08, -W / 2 + 0.35, bodyY, L / 2 + 0.01);
  box(matHead, 0.42, 0.16, 0.08, W / 2 - 0.35, bodyY, L / 2 + 0.01);
  box(matTail, 0.42, 0.16, 0.08, -W / 2 + 0.35, bodyY, -L / 2 - 0.01);
  box(matTail, 0.42, 0.16, 0.08, W / 2 - 0.35, bodyY, -L / 2 - 0.01);

  // Wheels.
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(shape.wheels, shape.wheels, 0.28, 14);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(shape.wheels * 0.55, shape.wheels * 0.55, 0.3, 10);
  hubGeo.rotateZ(Math.PI / 2);
  const wy = shape.wheels;
  const wzF = L / 2 - 0.85;
  const wzR = -L / 2 + 0.85;
  for (const [wx, wz] of [[-W / 2, wzF], [W / 2, wzF], [-W / 2, wzR], [W / 2, wzR]]) {
    const wheel = new THREE.Mesh(wheelGeo, matWheel);
    wheel.position.set(wx, wy, wz);
    wheel.castShadow = true;
    group.add(wheel);
    const hub = new THREE.Mesh(hubGeo, matHub);
    hub.position.set(wx, wy, wz);
    group.add(hub);
    wheels.push(wheel);
  }

  return { group, wheels, shape };
}

// Create one car in `scene`.
// createCar(scene, model, color, x, z, heading)
// `model` is one of VEHICLE_MODELS; `color` is a hex number or CSS string.
export function createCar(scene, model, color, x, z, heading) {
  const name = VEHICLE_MODELS.includes(model) ? model : 'sedan';
  const tune = CONFIG.vehicleModels[name] || CONFIG.vehicleModels.sedan;
  const { group, wheels, shape } = buildCarMesh(name, color === undefined ? 0xc23a2a : color);
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
