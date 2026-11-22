// game/src/input.js — Keyboard and mouse input (attempt #8, round-16 rebuild).
//
// Driving keys, on-foot movement keys, aim and fire (mouse), the pause
// key (the letter P), and menu navigation. Input is ignored during staged
// captures. The module is safe to import in Node (no DOM access at import
// time): listeners are attached only when attach() runs in a browser, and
// every DOM access is guarded by a typeof check.

export const KEYS = {
  // Driving / on-foot movement (WASD + arrows).
  UP: 'KeyW',
  DOWN: 'KeyS',
  LEFT: 'KeyA',
  RIGHT: 'KeyD',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  // Driving verbs (aliases over the movement keys).
  ACCEL: 'KeyW',
  BRAKE: 'KeyS',
  REVERSE: 'KeyS',
  STEER_LEFT: 'KeyA',
  STEER_RIGHT: 'KeyD',
  // On-foot verbs.
  WALK: 'KeyW',
  RUN: 'ShiftLeft',
  SPRINT: 'ShiftLeft',
  JUMP: 'Space',
  // Interaction.
  ENTER_CAR: 'KeyE',
  INTERACT: 'KeyE',
  EXIT_CAR: 'KeyF',
  // Combat.
  AIM: 'MouseRight',
  FIRE: 'MouseLeft',
  RELOAD: 'KeyR',
  WEAPON_NEXT: 'KeyQ',
  // System.
  PAUSE: 'KeyP',
  MUTE: 'KeyM',
  RADIO_NEXT: 'KeyN',
  // Menus.
  CONFIRM: 'Enter',
  CANCEL: 'Escape',
  MENU_UP: 'ArrowUp',
  MENU_DOWN: 'ArrowDown',
};

export const MOUSE = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
};

// Key codes that must never scroll the page while the game is focused.
const PREVENT_DEFAULT_CODES = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
]);

// ---------------------------------------------------------------------
// createInput — one input state object. Call attach() in the browser to
// start listening; call detach() to stop. In tests, drive the state
// directly with press() / release() / setMouse() — no DOM needed.
//
// The state object:
//   down        — Set of key codes currently held
//   justPressed — Set of key codes pressed since the last update()
//   mouse       — { x, y, dx, dy, left, right, middle, wheel }
//   isDown(code) / pressed(code) / axis() helpers
//   enabled     — when false, all reads report "not pressed" (used to
//                 freeze input during staged captures)
export function createInput() {
  const down = new Set();
  const justPressed = new Set();
  const mouse = {
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    left: false,
    right: false,
    middle: false,
    wheel: 0,
    locked: false,
  };

  let attached = false;
  let enabled = true;
  let lastMouseX = 0;
  let lastMouseY = 0;

  function onKeyDown(event) {
    if (!enabled) return;
    if (PREVENT_DEFAULT_CODES.has(event.code)) {
      event.preventDefault();
    }
    if (!down.has(event.code)) {
      justPressed.add(event.code);
    }
    down.add(event.code);
  }

  function onKeyUp(event) {
    down.delete(event.code);
  }

  function onBlur() {
    // Losing focus releases every key, so the car never keeps driving
    // after the player alt-tabs away.
    down.clear();
    mouse.left = false;
    mouse.right = false;
    mouse.middle = false;
  }

  function onMouseMove(event) {
    if (!enabled) return;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.dx = event.clientX - lastMouseX;
    mouse.dy = event.clientY - lastMouseY;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
  }

  function onMouseDown(event) {
    if (!enabled) return;
    if (event.button === MOUSE.LEFT) mouse.left = true;
    if (event.button === MOUSE.RIGHT) mouse.right = true;
    if (event.button === MOUSE.MIDDLE) mouse.middle = true;
  }

  function onMouseUp(event) {
    if (event.button === MOUSE.LEFT) mouse.left = false;
    if (event.button === MOUSE.RIGHT) mouse.right = false;
    if (event.button === MOUSE.MIDDLE) mouse.middle = false;
  }

  function onWheel(event) {
    if (!enabled) return;
    mouse.wheel += event.deltaY;
  }

  function onContextMenu(event) {
    // Right mouse is "aim" — never show the browser menu for it.
    event.preventDefault();
  }

  const input = {
    down,
    justPressed,
    mouse,

    get attached() {
      return attached;
    },

    get enabled() {
      return enabled;
    },

    setEnabled(value) {
      enabled = !!value;
      if (!enabled) {
        down.clear();
        justPressed.clear();
        mouse.left = false;
        mouse.right = false;
        mouse.middle = false;
      }
      return input;
    },

    // Attach the DOM listeners. Safe to call in Node: it no-ops when
    // there is no window/document.
    attach() {
      if (attached) return input;
      if (typeof window === 'undefined' || typeof document === 'undefined') {
        return input;
      }
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', onBlur);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('wheel', onWheel, { passive: true });
      document.addEventListener('contextmenu', onContextMenu);
      attached = true;
      return input;
    },

    // Remove the DOM listeners.
    detach() {
      if (!attached) return input;
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('wheel', onWheel);
        document.removeEventListener('contextmenu', onContextMenu);
      }
      attached = false;
      return input;
    },

    // True while the key is held (and input is enabled).
    isDown(code) {
      if (!enabled) return false;
      return down.has(code);
    },

    // True only on the frame the key went down (cleared by update()).
    pressed(code) {
      if (!enabled) return false;
      return justPressed.has(code);
    },

    // -1 / 0 / +1 steering axis from A/D or Left/Right.
    steerAxis() {
      if (!enabled) return 0;
      let axis = 0;
      if (down.has(KEYS.LEFT) || down.has(KEYS.ARROW_LEFT)) axis -= 1;
      if (down.has(KEYS.RIGHT) || down.has(KEYS.ARROW_RIGHT)) axis += 1;
      return axis;
    },

    // -1 / 0 / +1 throttle axis from W/S or Up/Down.
    // +1 = accelerate, -1 = brake/reverse.
    throttleAxis() {
      if (!enabled) return 0;
      let axis = 0;
      if (down.has(KEYS.UP) || down.has(KEYS.ARROW_UP)) axis += 1;
      if (down.has(KEYS.DOWN) || down.has(KEYS.ARROW_DOWN)) axis -= 1;
      return axis;
    },

    // -1 / 0 / +1 movement axis for on-foot forward/back.
    moveAxis() {
      return input.throttleAxis();
    },

    // True while the run/sprint key is held.
    isRunning() {
      if (!enabled) return false;
      return down.has(KEYS.RUN) || down.has('ShiftRight');
    },

    // True while the aim (right mouse) button is held.
    isAiming() {
      if (!enabled) return false;
      return mouse.right;
    },

    // True while the fire (left mouse) button is held.
    isFiring() {
      if (!enabled) return false;
      return mouse.left;
    },

    // Test / harness hooks: drive the state without a DOM.
    press(code) {
      if (!down.has(code)) justPressed.add(code);
      down.add(code);
      return input;
    },

    release(code) {
      down.delete(code);
      return input;
    },

    setMouse(x, y) {
      mouse.dx = x - lastMouseX;
      mouse.dy = y - lastMouseY;
      mouse.x = x;
      mouse.y = y;
      lastMouseX = x;
      lastMouseY = y;
      return input;
    },

    setMouseButtons(left, right, middle) {
      mouse.left = !!left;
      mouse.right = !!right;
      mouse.middle = !!middle;
      return input;
    },

    // End-of-frame housekeeping: clears justPressed and the mouse
    // deltas. Called once per frame by the game loop.
    update() {
      justPressed.clear();
      mouse.dx = 0;
      mouse.dy = 0;
      mouse.wheel = 0;
      return input;
    },

    // Full reset (used when the game restarts or a shot is staged).
    reset() {
      down.clear();
      justPressed.clear();
      mouse.left = false;
      mouse.right = false;
      mouse.middle = false;
      mouse.dx = 0;
      mouse.dy = 0;
      mouse.wheel = 0;
      return input;
    },
  };

  return input;
}

// The shared input instance for the whole game. main.js uses this one;
// tests build their own with createInput().
let sharedInput = null;

export function getSharedInput() {
  if (!sharedInput) {
    sharedInput = createInput();
  }
  return sharedInput;
}
