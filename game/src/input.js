// Solmar Bay — keyboard and mouse input.
//
// Held keys give a steering/throttle direction; one-shot presses (start,
// pause, confirm) are queued as bit flags and taken once by the loop, so a
// press between two frames is never lost and never counted twice. A key
// released while the tab is hidden never sends keyup: everything is let go
// on blur.
//
// The module is safe to import in a no-DOM environment (the unit harness):
// listeners are only attached when window/document exist, and every method
// degrades to a no-op instead of throwing.

/** One-shot action flags returned by takeActions(). */
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_FIRE = 4;
export const ACTION_ENTER = 8;

/**
 * KEYS — the physical key codes the game listens for, grouped by action.
 * Driving uses WASD and the arrows; on-foot movement reuses the same keys;
 * P pauses; Space/Enter confirm; E enters/exits a car; R restarts a mission.
 */
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  brake: ['KeyS', 'ArrowDown'],
  accelerate: ['KeyW', 'ArrowUp'],
  handbrake: ['Space'],
  pause: ['KeyP', 'Escape'],
  confirm: ['Space', 'Enter'],
  enterCar: ['KeyE'],
  restart: ['KeyR'],
  horn: ['KeyH'],
  radioNext: ['KeyN'],
  aim: ['ShiftLeft', 'ShiftRight'],
};

/** MOUSE — button indices as the browser reports them. */
export const MOUSE = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
};

const PAUSE_CODES = new Set(KEYS.pause);
const CONFIRM_CODES = new Set(KEYS.confirm);
const ENTER_CODES = new Set(KEYS.enterCar);
const RESTART_CODES = new Set(KEYS.restart);

function hasWindow() {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function';
}

function hasDocument() {
  return typeof document !== 'undefined' && typeof document.addEventListener === 'function';
}

/**
 * createInput — build an input state. `target` is the element that receives
 * pointer events (the game canvas); it defaults to window when omitted.
 * In a no-DOM environment the returned object still works: keys are never
 * down, actions are always 0, mouse is centred.
 */
export function createInput(target) {
  const down = new Set();
  let actions = 0;
  const mouse = {
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    buttons: 0,
    locked: false,
  };
  let attached = false;

  function onKeyDown(event) {
    if (!event || typeof event.code !== 'string') return;
    if (down.has(event.code) && !event.repeat) {
      // Already held: a repeat keydown adds no new action.
    }
    down.add(event.code);
    if (!event.repeat) {
      if (PAUSE_CODES.has(event.code)) actions |= ACTION_PAUSE;
      else if (CONFIRM_CODES.has(event.code)) actions |= ACTION_CONFIRM;
      else if (ENTER_CODES.has(event.code)) actions |= ACTION_ENTER;
    }
    if (typeof event.preventDefault === 'function') {
      // Keep the page from scrolling on arrows/space while playing.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
        event.preventDefault();
      }
    }
  }

  function onKeyUp(event) {
    if (event && typeof event.code === 'string') down.delete(event.code);
  }

  function onBlur() {
    down.clear();
    mouse.buttons = 0;
  }

  function onPointerMove(event) {
    if (!event) return;
    const nx = typeof event.clientX === 'number' ? event.clientX : mouse.x;
    const ny = typeof event.clientY === 'number' ? event.clientY : mouse.y;
    mouse.dx += nx - mouse.x;
    mouse.dy += ny - mouse.y;
    mouse.x = nx;
    mouse.y = ny;
  }

  function onPointerDown(event) {
    if (!event) return;
    mouse.buttons |= 1 << (typeof event.button === 'number' ? event.button : 0);
    actions |= ACTION_FIRE;
  }

  function onPointerUp(event) {
    if (!event) return;
    mouse.buttons &= ~(1 << (typeof event.button === 'number' ? event.button : 0));
  }

  function attach() {
    if (attached || !hasWindow()) return;
    attached = true;
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    const el = target || (hasDocument() ? document : window);
    if (el && typeof el.addEventListener === 'function') {
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointerup', onPointerUp);
    }
  }

  function detach() {
    if (!attached || !hasWindow()) return;
    attached = false;
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    const el = target || (hasDocument() ? document : window);
    if (el && typeof el.removeEventListener === 'function') {
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointerup', onPointerUp);
    }
  }

  // Attach immediately when a window exists; in node this is a no-op.
  attach();

  function isCodeDown(codes) {
    for (const code of codes) {
      if (down.has(code)) return true;
    }
    return false;
  }

  const input = {
    /** True while any of the given codes (or a single code) is held. */
    isDown(codes) {
      if (typeof codes === 'string') return down.has(codes);
      return isCodeDown(codes || []);
    },
    /** True while any of the codes for a named action is held. */
    isActionDown(name) {
      const codes = KEYS[name];
      if (!codes) return false;
      return isCodeDown(codes);
    },
    /** -1 for left, 1 for right, 0 for neither or both. */
    direction() {
      return (isCodeDown(KEYS.right) ? 1 : 0) - (isCodeDown(KEYS.left) ? 1 : 0);
    },
    /** 1 while accelerating, -1 while braking/reversing, 0 otherwise. */
    throttle() {
      if (isCodeDown(KEYS.accelerate)) return 1;
      if (isCodeDown(KEYS.brake)) return -1;
      return 0;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** True if the named one-shot action fired since the last takeActions. */
    hasAction(flag) {
      return (actions & flag) !== 0;
    },
    /** Mouse position (client pixels) and the delta since the last read. */
    mouseState() {
      return { x: mouse.x, y: mouse.y, dx: mouse.dx, dy: mouse.dy, buttons: mouse.buttons };
    },
    /** The mouse delta since the last call, then zeroed (per-frame read). */
    takeMouseDelta() {
      const d = { dx: mouse.dx, dy: mouse.dy };
      mouse.dx = 0;
      mouse.dy = 0;
      return d;
    },
    /** True while the given mouse button is held. */
    isMouseDown(button = MOUSE.LEFT) {
      return (mouse.buttons & (1 << button)) !== 0;
    },
    /** Test-only helper: pretend a key is held (drives the harness). */
    setKey(code, held) {
      if (held) down.add(code);
      else down.delete(code);
    },
    /** Test-only helper: queue a one-shot action. */
    queueAction(flag) {
      actions |= flag;
    },
    /** Forget every held key and queued action. */
    reset() {
      down.clear();
      actions = 0;
      mouse.dx = 0;
      mouse.dy = 0;
      mouse.buttons = 0;
    },
    attach,
    detach,
  };
  return input;
}

let sharedInput = null;

/** The process-wide shared input (created lazily, safe in node). */
export function getSharedInput() {
  if (!sharedInput) sharedInput = createInput();
  return sharedInput;
}
