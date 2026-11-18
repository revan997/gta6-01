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
  // Keep the page from scrolling on game keys.
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) {
    event.preventDefault();
  }
}

function onKeyUp(event) {
  heldKeys.delete(event.code);
}

function onMouseMove(event) {
  if (!pointerLocked) return;
  mouseDX += event.movementX || 0;
  mouseDY += event.movementY || 0;
}

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
  window.addEventListener('blur', () => { heldKeys.clear(); pressedKeys.clear(); });
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  listenersAttached = true;
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

// Consume and return the e.code values pressed since the last call,
// then clear the set. A held key is reported once, on its first keydown.
function consumePressed() {
  const out = [...pressedKeys];
  pressedKeys.clear();
  return out;
}

export { consumePressed };

export const input = {
  attach,
  requestPointerLock,
  exitPointerLock,
  isDown,
  isDownAny,
  moveVector,
  consumeMouseDelta,
  consumePressed,
  get pointerLocked() {
    return pointerLocked;
  },
  get keys() {
    return heldKeys;
  },
};

export default input;
