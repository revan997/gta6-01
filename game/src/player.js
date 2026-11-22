import * as THREE from '../vendor/three.module.min.js';

// player.js — Rico on foot. createPlayer takes an OBJECT arg, never positional.
// Rico is 1.85 m tall, mid-stride run animation, pistol with DIFFERENT
// geometry from the officer pistol (0.07x0.12x0.35, 0x2a2a2a) so it never
// matches the officer-pistol filter in the harness.

export function createPlayer(ctx = {}) {
  const scene = ctx.scene || null;
  const world = ctx.world || null;

  const group = new THREE.Group();
  group.name = 'rico';
  group.userData.kind = 'rico';
  const skin = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x8a2f2f });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a3242 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.6, 0.26), shirt);
  torso.position.y = 1.12;
  torso.name = 'rico:torso';
  torso.userData.kind = 'rico';
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.29, 0.27), skin);
  head.position.y = 1.58;
  head.name = 'rico:head';
  head.userData.kind = 'rico';
  group.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
  cap.position.y = 1.75;
  cap.name = 'rico:cap';
  cap.userData.kind = 'rico';
  group.add(cap);
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.82, 0.19), pants);
  leftLeg.position.set(-0.12, 0.41, 0);
  leftLeg.name = 'rico:legL';
  leftLeg.userData.kind = 'rico';
  group.add(leftLeg);
  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.82, 0.19), pants);
  rightLeg.position.set(0.12, 0.41, 0);
  rightLeg.name = 'rico:legR';
  rightLeg.userData.kind = 'rico';
  group.add(rightLeg);
  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), shirt);
  leftArm.position.set(-0.3, 1.08, 0);
  leftArm.name = 'rico:armL';
  leftArm.userData.kind = 'rico';
  group.add(leftArm);
  const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.14), shirt);
  rightArm.position.set(0.3, 1.08, 0);
  rightArm.name = 'rico:armR';
  rightArm.userData.kind = 'rico';
  group.add(rightArm);
  // Rico's pistol: 0.07 x 0.12 x 0.35, 0x2a2a2a — deliberately NOT the
  // officer pistol geometry (0.09 x 0.14 x 0.42, 0x111111).
  const pistol = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.12, 0.35),
    new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
  );
  pistol.position.set(0.32, 1.05, 0.18);
  pistol.name = 'rico:pistol';
  pistol.userData.kind = 'pistol';
  group.add(pistol);

  if (scene) scene.add(group);

  const position = new THREE.Vector3(40, 0, -60);
  group.position.copy(position);
  let _heading = 0;
  let _walkPhase = 0;

  const player = {
    mesh: group,
    group,
    kind: 'rico',
    position,
    get heading() { return _heading; },
    set heading(v) { _heading = v; group.rotation.y = _heading + Math.PI; },
    pistol,
    currentCar: null,
    health: 100,
    speed: 0,
    aiming: false,
    onFoot: true,
    world,
    setPosition(x, z, heading) {
      if (heading !== undefined && heading !== null) _heading = heading;
      position.x = x;
      position.z = z;
      group.position.set(x, 0, z);
      group.rotation.y = _heading + Math.PI;
    },
    enterCar(car) {
      if (!car) return false;
      this.currentCar = car;
      this.onFoot = false;
      position.x = car.position.x;
      position.z = car.position.z;
      _heading = car.heading;
      group.position.set(position.x, 0, position.z);
      group.rotation.y = _heading + Math.PI;
      group.visible = false;
      return true;
    },
    exitCar() {
      if (!this.currentCar) return false;
      const car = this.currentCar;
      this.currentCar = null;
      this.onFoot = true;
      position.x = car.position.x + 2.2;
      position.z = car.position.z + 1.5;
      group.position.set(position.x, 0, position.z);
      group.visible = true;
      return true;
    },
    aim(v) {
      this.aiming = !!v;
      return this.aiming;
    },
    update(dt = 1 / 60, input) {
      // On foot: walk/run from input, mid-stride animation. In a car the
      // mesh follows the car (enterCar syncs it).
      if (this.currentCar) {
        position.x = this.currentCar.position.x;
        position.z = this.currentCar.position.z;
        _heading = this.currentCar.heading;
        group.position.set(position.x, 0, position.z);
        group.rotation.y = _heading + Math.PI;
        return;
      }
      let mx = 0;
      let mz = 0;
      if (input) {
        if (input.forward) mz -= 1;
        if (input.back) mz += 1;
        if (input.left) mx -= 1;
        if (input.right) mx += 1;
      }
      const moving = mx !== 0 || mz !== 0;
      const speed = moving ? (input && input.run ? 6.0 : 3.2) : 0;
      this.speed = speed;
      if (moving) {
        const len = Math.hypot(mx, mz) || 1;
        const fx = Math.sin(_heading);
        const fz = Math.cos(_heading);
        const rx = Math.cos(_heading);
        const rz = -Math.sin(_heading);
        position.x += (fx * (-mz / len) + rx * (mx / len)) * speed * dt;
        position.z += (fz * (-mz / len) + rz * (mx / len)) * speed * dt;
        _walkPhase += dt * speed * 1.9;
        // Mid-stride: legs swing opposite, arms pump, slight forward lean.
        leftLeg.rotation.x = Math.sin(_walkPhase) * 0.7;
        rightLeg.rotation.x = -Math.sin(_walkPhase) * 0.7;
        leftArm.rotation.x = -Math.sin(_walkPhase) * 0.55;
        rightArm.rotation.x = Math.sin(_walkPhase) * 0.55;
        torso.rotation.x = 0.08;
      } else {
        _walkPhase *= 0.9;
        leftLeg.rotation.x *= 0.9;
        rightLeg.rotation.x *= 0.9;
        leftArm.rotation.x *= 0.9;
        rightArm.rotation.x *= 0.9;
        torso.rotation.x = 0;
      }
      group.position.set(position.x, 0, position.z);
      group.rotation.y = _heading + Math.PI;
    },
  };
  return player;
}
