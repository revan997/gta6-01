// Keyboard + mouse input singleton (Lane A).
// Tracks held keys (by e.code), accumulated mouse deltas, and pointer lock.
// Lane B reads this each frame; nothing here touches the game state itself.

const heldKeys = new Set();
// Keys newly pressed since the last consumePressed() call (pressed-edge
// detection — a key is added here only when it was not already held).
const pressedKeys = new Set();
let mouseDX = 0;
let mouseDY = 0;
let pointerLocked = false;
let attachedCanvas = null;
let listenersAttached = false;

function onKeyDown(event) {
  if (!heldKeys.has(event.code)) pressedKeys.add(event.code);
  heldKeys.add(event.code);
  // Round-8: V cycles the chase-camera distance (near / mid / far).
  // Pressed-edge only (event.repeat is filtered by the game loop's
  // keydown handler, but this singleton also guards it): holding V
  // must not spin through the levels. The level is read by main.js
  // via input.getChaseDistanceLevel() / player.setChaseDistance().
  if (event.code === 'KeyV' && !event.repeat) cycleChaseDistance();
  // Keep the page from scrolling on game keys.
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) {
    event.preventDefault();
  }
  // Round 7: a key pressed while the tab is unfocused can leave a stale
  // wheel delta behind — the blur handler clears it (see attach below).
}

function onKeyUp(event) {
  heldKeys.delete(event.code);
}

function onMouseMove(event) {
  if (!pointerLocked) return;
  mouseDX += event.movementX || 0;
  mouseDY += event.movementY || 0;
}

// Round-5: mouse-wheel delta (pixels, deltaY), accumulated until the game
// loop consumes it — the chase camera zooms in/out per notch.
let wheelDelta = 0;
function onWheel(event) {
  wheelDelta += event.deltaY || 0;
}

// Round-8: chase-camera distance level (0 near / 1 mid / 2 far), cycled
// by the V key. The level lives here so the game loop can read it every
// frame without owning input state; player.js setChaseDistance() is the
// same three levels expressed as distance/height multipliers, and
// main.js applies whichever side it reads (input.chaseDistanceLevel).
// In-game help line (the controls hint in index.html is owned by
// another lane — the coordinator adds "V camera distance" there; this
// export is the same text, kept next to the binding so it cannot drift):
//   V — chase camera near / mid / far
export const CHASE_DISTANCE_HELP = 'V — chase camera near / mid / far';
let chaseDistanceLevel = 1; // 'mid', matching player.js DEFAULT_CHASE_DISTANCE_LEVEL
function cycleChaseDistance() {
  chaseDistanceLevel = (chaseDistanceLevel + 1) % 3;
  notifyChaseDistanceListeners();
  return chaseDistanceLevel;
}
// Round-8 re-touch: chase-distance listeners — main.js registers one to
// show the level name in the HUD when V cycles. Each listener is called
// with the new level name ('near' / 'mid' / 'far'). Returns an
// unsubscribe function; a throwing listener is swallowed so a HUD bug
// can never break input. Only the V cycle notifies — programmatic
// setChaseDistanceLevel() (load / restore) stays silent.
const chaseDistanceListeners = new Set();
function setChaseDistanceListener(fn) {
  if (typeof fn !== 'function') return null;
  chaseDistanceListeners.add(fn);
  return () => { chaseDistanceListeners.delete(fn); };
}
function notifyChaseDistanceListeners() {
  const name = CHASE_DISTANCE_NAMES[chaseDistanceLevel];
  for (const fn of [...chaseDistanceListeners]) {
    try { fn(name); } catch (_) { /* listener errors must not break input */ }
  }
}
function getChaseDistanceLevel() { return chaseDistanceLevel; }
function setChaseDistanceLevel(level) {
  const n = Math.round(level);
  if (n >= 0 && n <= 2) chaseDistanceLevel = n;
  return chaseDistanceLevel;
}
const CHASE_DISTANCE_NAMES = ['near', 'mid', 'far'];
function getChaseDistanceName() { return CHASE_DISTANCE_NAMES[chaseDistanceLevel]; }

function onPointerLockChange() {
  pointerLocked = document.pointerLockElement === attachedCanvas;
  if (!pointerLocked) {
    mouseDX = 0;
    mouseDY = 0;
  }
}

function attach(canvas) {
  if (listenersAttached) return;
  attachedCanvas = canvas || null;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { resetInput(); });
  document.addEventListener('mousemove', onMouseMove);
  window.addEventListener('wheel', onWheel, { passive: true }); // round 5: camera zoom
  document.addEventListener('pointerlockchange', onPointerLockChange);
  listenersAttached = true;
}

// Round-9: reset all transient input state — held keys, pressed edges,
// mouse deltas and the wheel accumulator. The blur handler calls it so
// a key held when the tab loses focus can never stick, and the pause
// menu (or a test) can call input.reset() to the same effect. The
// chase-distance level and its listeners are NOT touched: the V-key
// preference is a setting, not transient state.
// Round-9 fix folded in: the old blur handler cleared keys and wheel
// but left mouseDX/mouseDY behind, so a mouse move made while the tab
// was unfocused could swing the camera on return.
function resetInput() {
  heldKeys.clear();
  pressedKeys.clear();
  mouseDX = 0;
  mouseDY = 0;
  wheelDelta = 0;
}

function requestPointerLock(canvas) {
  const target = canvas || attachedCanvas;
  if (!target) return;
  attach(target);
  if (document.pointerLockElement !== target) {
    try {
      const result = target.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (err) {
      // Pointer lock can be refused (e.g. iframe permissions); game still runs.
    }
  }
}

function exitPointerLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}

// Is the named key currently held? Accepts e.code values such as 'KeyW',
// 'Space', 'ShiftLeft', 'ArrowUp'. Also accepts single letters ('w', 'W').
function isDown(code) {
  if (heldKeys.has(code)) return true;
  if (typeof code === 'string' && code.length === 1) {
    return heldKeys.has('Key' + code.toUpperCase());
  }
  return false;
}

// Round-3 polish: true when ANY of the given codes is held. The game
// loop uses it to tell throttle input apart from coasting (FOV kick).
function isDownAny(...codes) {
  for (const code of codes) if (isDown(code)) return true;
  return false;
}

// Movement helpers used by the player / vehicle update.
// Forward is W / ArrowUp, back is S / ArrowDown, left A, right D.
function moveVector() {
  let x = 0;
  let y = 0;
  if (isDown('KeyW') || isDown('ArrowUp')) y += 1;
  if (isDown('KeyS') || isDown('ArrowDown')) y -= 1;
  if (isDown('KeyA') || isDown('ArrowLeft')) x -= 1;
  if (isDown('KeyD') || isDown('ArrowRight')) x += 1;
  return { x, y };
}

// Consume and return the mouse movement accumulated since the last call.
function consumeMouseDelta() {
  const out = { dx: mouseDX, dy: mouseDY };
  mouseDX = 0;
  mouseDY = 0;
  return out;
}

// Round-5: consume and return the accumulated wheel delta (pixels,
// deltaY) since the last call, then clear it. Positive = scrolled down.
function consumeWheelDelta() {
  const out = wheelDelta;
  wheelDelta = 0;
  return out;
}

// Round-6: consume and return which of the given codes were pressed
// since the last consumePressed() — a multi-code pressed-edge check for
// one-shot keys that share the press queue (the landmark-focus key L
// and the camera toggle C both read the same queue in main.js).
function consumePressedCodes(...codes) {
  const hit = [];
  for (const code of codes) {
    const alt = typeof code === 'string' && code.length === 1 ? 'Key' + code.toUpperCase() : null;
    if (pressedKeys.has(code) || (alt && pressedKeys.has(alt))) {
      pressedKeys.delete(code);
      if (alt) pressedKeys.delete(alt);
      hit.push(code);
    }
  }
  return hit;
}

// Consume and return the e.code values pressed since the last call,
// then clear the set. A held key is reported once, on its first keydown.
function consumePressed() {
  const out = [...pressedKeys];
  pressedKeys.clear();
  return out;
}

// Round 4: peek whether a key was pressed since the last consumePressed()
// WITHOUT consuming it — for toggles and one-shot checks that share the
// press queue with the game loop. Accepts e.code values and single
// letters, like isDown(). anyPressed() is true when any code matches.
function pressed(code) {
  if (pressedKeys.has(code)) return true;
  if (typeof code === 'string' && code.length === 1) {
    return pressedKeys.has('Key' + code.toUpperCase());
  }
  return false;
}

function anyPressed(...codes) {
  for (const code of codes) if (pressed(code)) return true;
  return false;
}

// Round-4b: check AND consume a single pressed code — so two consumers
// (the game loop and a menu handler) do not both act on the same press.
// Accepts e.code values and single letters, like isDown().
function consumePressedCode(code) {
  const alt = typeof code === 'string' && code.length === 1 ? 'Key' + code.toUpperCase() : null;
  if (pressedKeys.has(code) || (alt && pressedKeys.has(alt))) {
    pressedKeys.delete(code);
    if (alt) pressedKeys.delete(alt);
    return true;
  }
  return false;
}

export { consumePressed, setChaseDistanceListener };

export const input = {
  attach,
  reset: resetInput, // round-9: clear all transient input state
  requestPointerLock,
  exitPointerLock,
  isDown,
  isDownAny,
  pressed,
  anyPressed,
  consumePressedCode,
  consumePressedCodes,
  moveVector,
  consumeMouseDelta,
  consumeWheelDelta,
  consumePressed,
  cycleChaseDistance,
  getChaseDistanceLevel,
  setChaseDistanceLevel,
  getChaseDistanceName,
  setChaseDistanceListener,
  chaseDistanceHelp: CHASE_DISTANCE_HELP,
  get chaseDistanceLevel() {
    return chaseDistanceLevel;
  },
  get pointerLocked() {
    return pointerLocked;
  },
  get keys() {
    return heldKeys;
  },
};

export default input;
