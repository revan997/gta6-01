// Solmar Bay — keyboard + mouse input (W1, attempt #7, fresh build).
// Held keys give steering / movement; one-shot presses (confirm, pause)
// are queued as bit flags and taken once by the loop, so a press between
// two frames is never lost and never counted twice. DOM-guarded: the
// module imports cleanly in Node (no window/document at import time).

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_FIRE = 4;

export const KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Space', 'Enter'],
  pause: ['KeyP', 'Escape'],
  handbrake: ['ShiftLeft', 'ShiftRight'],
  enterCar: ['KeyE'],
  horn: ['KeyH'],
};

export const MOUSE = {
  left: 0,
  middle: 1,
  right: 2,
};

function hasDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function createInput(target) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let attached = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    if (KEYS.confirm.includes(event.code)) actions |= ACTION_CONFIRM;
    else if (KEYS.pause.includes(event.code)) actions |= ACTION_PAUSE;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    held.delete(event.code);
  }
  function onBlur() {
    held.clear();
    mouseDown = false;
  }
  function onMouseMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;
  }
  function onMouseDown(event) {
    if (event.button === MOUSE.left) {
      mouseDown = true;
      actions |= ACTION_FIRE;
    }
  }
  function onMouseUp(event) {
    if (event.button === MOUSE.left) mouseDown = false;
  }

  // Attach only when a DOM exists (browser). In Node the object stays
  // inert and every query below just answers "nothing held".
  if (hasDom()) {
    const el = target || window;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    if (el && el !== window && el.addEventListener) {
      el.addEventListener('pointerdown', () => {
        actions |= ACTION_CONFIRM;
      });
    }
    attached = true;
  }

  const api = {
    attached,
    isHeld(code) {
      return held.has(code);
    },
    isDown(name) {
      const codes = KEYS[name] || [];
      return codes.some((c) => held.has(c));
    },
    // Steering: -1 left, +1 right, 0 neither/both.
    steer() {
      const l = KEYS.left.some((c) => held.has(c));
      const r = KEYS.right.some((c) => held.has(c));
      return (r ? 1 : 0) - (l ? 1 : 0);
    },
    // Throttle: -1 brake/reverse, +1 accelerate, 0 neither/both.
    throttle() {
      const u = KEYS.up.some((c) => held.has(c));
      const d = KEYS.down.some((c) => held.has(c));
      return (u ? 1 : 0) - (d ? 1 : 0);
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    // Test / staging hook: pretend a key is held.
    press(code) {
      held.add(code);
    },
    release(code) {
      held.delete(code);
    },
    queueAction(flag) {
      actions |= flag;
    },
    dispose() {
      if (!hasDom()) return;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    },
  };
  return api;
}

let shared = null;
export function getSharedInput(target) {
  if (!shared) shared = createInput(target);
  return shared;
}
