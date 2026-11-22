// input.js — keyboard + mouse input for Solmar Bay.
// Attempt #9 (top10-rebuild).
//
// One input object owns all key/mouse state. The game loop polls it
// (isDown / getAxis); staged captures ignore it entirely.
//
// Design notes:
//  - KEYS maps logical actions to physical codes. isDown accepts either
//    an action name ('forward') or a raw code ('KeyW').
//  - press()/release() are the single funnel: DOM event handlers call
//    them, and tests call them directly (no DOM needed in Node).
//  - justPressed is an edge set, cleared once per frame by update().
//  - Mouse deltas accumulate between update() calls and reset there.
//  - attach() is a safe no-op when there is no DOM (Node / tests).

export const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  interact: ['KeyE'],
  enterCar: ['KeyE'],
  exitCar: ['KeyF'],
  aim: ['ShiftLeft', 'ShiftRight'],
  reload: ['KeyR'],
  pause: ['KeyP'],
  menu: ['Escape'],
  confirm: ['Enter'],
  horn: ['KeyH'],
  radioNext: ['KeyT'],
  camera: ['KeyC'],
};

export const MOUSE = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
};

// Reverse lookup: code -> action names (first match wins for helpers).
const CODE_TO_ACTION = {};
for (const [action, codes] of Object.entries(KEYS)) {
  for (const code of codes) {
    if (!CODE_TO_ACTION[code]) CODE_TO_ACTION[code] = action;
  }
}

export function createInput() {
  // Currently-held physical codes.
  const down = new Set();
  // Codes pressed since the last update() — edge-triggered.
  const justPressed = new Set();
  // Codes released since the last update().
  const justReleased = new Set();

  const mouse = {
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    down: [false, false, false],
    justPressed: [false, false, false],
    justReleased: [false, false, false],
    wheel: 0,
  };

  let attachedTarget = null;
  let attached = false;

  // -- DOM event handlers (bound once, attached/detached as a group) --
  function onKeyDown(event) {
    if (!event || !event.code) return;
    if (event.repeat) return;
    if (!down.has(event.code)) justPressed.add(event.code);
    down.add(event.code);
  }

  function onKeyUp(event) {
    if (!event || !event.code) return;
    down.delete(event.code);
    justReleased.add(event.code);
  }

  function onBlur() {
    // Losing focus must not leave a key stuck down.
    down.clear();
    justPressed.clear();
  }

  function onMouseMove(event) {
    if (!event) return;
    const nx = typeof event.clientX === 'number' ? event.clientX : mouse.x;
    const ny = typeof event.clientY === 'number' ? event.clientY : mouse.y;
    mouse.dx += nx - mouse.x;
    mouse.dy += ny - mouse.y;
    mouse.x = nx;
    mouse.y = ny;
  }

  function onMouseDown(event) {
    if (!event || typeof event.button !== 'number') return;
    if (!mouse.down[event.button]) mouse.justPressed[event.button] = true;
    mouse.down[event.button] = true;
  }

  function onMouseUp(event) {
    if (!event || typeof event.button !== 'number') return;
    mouse.down[event.button] = false;
    mouse.justReleased[event.button] = true;
  }

  function onWheel(event) {
    if (!event) return;
    mouse.wheel += event.deltaY || 0;
  }

  function onContextMenu(event) {
    // Right mouse is "aim" — never let the browser menu steal it.
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
  }

  const input = {
    keys: down,
    mouse,

    // -- testable funnel (also used by the DOM handlers above) --
    press(code) {
      if (!code || down.has(code)) return;
      justPressed.add(code);
      down.add(code);
    },

    release(code) {
      if (!code) return;
      down.delete(code);
      justReleased.add(code);
    },

    mouseDown(button) {
      if (typeof button !== 'number') return;
      if (!mouse.down[button]) mouse.justPressed[button] = true;
      mouse.down[button] = true;
    },

    mouseUp(button) {
      if (typeof button !== 'number') return;
      mouse.down[button] = false;
      mouse.justReleased[button] = true;
    },

    mouseMove(x, y) {
      mouse.dx += x - mouse.x;
      mouse.dy += y - mouse.y;
      mouse.x = x;
      mouse.y = y;
    },

    // -- queries --
    // Accepts an action name ('forward', 'pause') or a raw code ('KeyW').
    isDown(actionOrCode) {
      if (KEYS[actionOrCode]) {
        return KEYS[actionOrCode].some((code) => down.has(code));
      }
      return down.has(actionOrCode);
    },

    // Edge: pressed since the last update(). Action name or raw code.
    wasPressed(actionOrCode) {
      if (KEYS[actionOrCode]) {
        return KEYS[actionOrCode].some((code) => justPressed.has(code));
      }
      return justPressed.has(actionOrCode);
    },

    wasReleased(actionOrCode) {
      if (KEYS[actionOrCode]) {
        return KEYS[actionOrCode].some((code) => justReleased.has(code));
      }
      return justReleased.has(actionOrCode);
    },

    mouseIsDown(button) {
      return !!mouse.down[button];
    },

    mouseWasPressed(button) {
      return !!mouse.justPressed[button];
    },

    // Driving / on-foot axes in [-1, 1].
    // x: +1 right, -1 left. y: +1 forward, -1 back.
    getAxis() {
      const x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
      const y = (this.isDown('forward') ? 1 : 0) - (this.isDown('back') ? 1 : 0);
      return { x, y };
    },

    actionForCode(code) {
      return CODE_TO_ACTION[code] || null;
    },

    // -- frame bookkeeping: call once per frame, after polling --
    update() {
      justPressed.clear();
      justReleased.clear();
      mouse.justPressed[0] = false;
      mouse.justPressed[1] = false;
      mouse.justPressed[2] = false;
      mouse.justReleased[0] = false;
      mouse.justReleased[1] = false;
      mouse.justReleased[2] = false;
      mouse.dx = 0;
      mouse.dy = 0;
      mouse.wheel = 0;
    },

    // -- DOM wiring (safe no-op without a DOM) --
    attach(target) {
      if (attached) return true;
      const el = target || (typeof window !== 'undefined' ? window : null);
      if (!el || typeof el.addEventListener !== 'function') return false;
      el.addEventListener('keydown', onKeyDown);
      el.addEventListener('keyup', onKeyUp);
      el.addEventListener('blur', onBlur);
      el.addEventListener('mousemove', onMouseMove);
      el.addEventListener('mousedown', onMouseDown);
      el.addEventListener('mouseup', onMouseUp);
      el.addEventListener('wheel', onWheel);
      el.addEventListener('contextmenu', onContextMenu);
      attachedTarget = el;
      attached = true;
      return true;
    },

    detach() {
      if (!attached || !attachedTarget) return false;
      const el = attachedTarget;
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('keyup', onKeyUp);
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onContextMenu);
      attachedTarget = null;
      attached = false;
      down.clear();
      justPressed.clear();
      return true;
    },

    get isAttached() {
      return attached;
    },

    // Full reset (state changes, tests, respawns).
    reset() {
      down.clear();
      justPressed.clear();
      justReleased.clear();
      mouse.down[0] = false;
      mouse.down[1] = false;
      mouse.down[2] = false;
      mouse.dx = 0;
      mouse.dy = 0;
      mouse.wheel = 0;
    },
  };

  return input;
}

// Shared singleton: the game creates exactly one input object and
// passes it around; modules that need input without plumbing use this.
let sharedInput = null;

export function getSharedInput() {
  if (!sharedInput) sharedInput = createInput();
  return sharedInput;
}

export default createInput;
