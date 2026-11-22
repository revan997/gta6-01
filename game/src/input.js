// Solmar Bay — input (keyboard + mouse).
//
// WASD moves (on foot) or drives (in a car). Shift runs. E enters
// or exits a car. P pauses. Right mouse aims, left mouse fires.
// The input is a small state machine: the game reads it once per
// frame, and one-shot actions (E, P) are consumed so they fire once.

import { CONFIG } from './config.js';

export function createInput(canvas) {
  const keys = new Set();
  const actions = new Set();
  const input = {
    // The mouse (for aiming and firing).
    mouseX: 0,
    mouseY: 0,
    aiming: false,
    firing: false,
    // The camera-relative movement (set by main.js each frame).
    cameraHeading: 0,

    // Attach the listeners.
    attach() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        keys.add(e.code);
        if (e.code === 'KeyE') actions.add('enterExit');
        if (e.code === 'KeyP') actions.add('pause');
        if (e.code === 'Escape') actions.add('pause');
        if (e.code === 'KeyM') actions.add('mute');
        if (e.code === 'Space') e.preventDefault();
      });
      window.addEventListener('keyup', (e) => {
        keys.delete(e.code);
      });
      if (canvas) {
        canvas.addEventListener('mousedown', (e) => {
          if (e.button === 2) input.aiming = true;
          if (e.button === 0) input.firing = true;
        });
        window.addEventListener('mouseup', (e) => {
          if (e.button === 2) input.aiming = false;
          if (e.button === 0) input.firing = false;
        });
        canvas.addEventListener('mousemove', (e) => {
          input.mouseX = e.clientX;
          input.mouseY = e.clientY;
        });
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      }
      // Lose the keys when the window blurs (so a stuck key does not
      // drive the car forever).
      window.addEventListener('blur', () => {
        keys.clear();
        input.aiming = false;
        input.firing = false;
      });
    },

    // Consume a one-shot action (returns true once, then false).
    consumeAction(name) {
      if (actions.has(name)) {
        actions.delete(name);
        return true;
      }
      return false;
    },

    // The movement vector (camera-relative): WASD, normalised.
    // Forward is away from the camera (the camera looks along its
    // heading), so W moves away from the camera.
    moveVector() {
      let x = 0;
      let z = 0;
      const h = input.cameraHeading;
      // The camera's forward (on the ground) and right vectors.
      const fx = Math.sin(h);
      const fz = Math.cos(h);
      const rx = Math.cos(h);
      const rz = -Math.sin(h);
      if (keys.has('KeyW') || keys.has('ArrowUp')) { x += fx; z += fz; }
      if (keys.has('KeyS') || keys.has('ArrowDown')) { x -= fx; z -= fz; }
      if (keys.has('KeyD') || keys.has('ArrowRight')) { x += rx; z += rz; }
      if (keys.has('KeyA') || keys.has('ArrowLeft')) { x -= rx; z -= rz; }
      const len = Math.hypot(x, z);
      if (len > 0) { x /= len; z /= len; }
      return { x, z };
    },

    // The drive controls: throttle (0..1), brake (0..1), steer
    // (-1..1, +1 = right). This matches the car's update() exactly:
    // it reads controls.throttle, controls.brake, controls.steer.
    driveControls() {
      const throttle = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
      const brake = (keys.has('KeyS') || keys.has('ArrowDown') || keys.has('Space') ? 1 : 0);
      const steer = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
        - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      return { throttle, brake, steer };
    },

    isRunning() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },

    isAiming() {
      return input.aiming;
    },

    isFiring() {
      return input.firing;
    },

    isPaused() {
      return actions.has('pause');
    },

    // For the tests: inject a key press without a real keyboard.
    press(code) {
      keys.add(code);
      if (code === 'KeyE') actions.add('enterExit');
      if (code === 'KeyP') actions.add('pause');
    },

    release(code) {
      keys.delete(code);
    },
  };
  return input;
}
