// Solmar Bay — seeded random (W1, attempt #7, fresh build).
// One deterministic generator for the whole game: the same seed gives the
// same city, the same traffic, the same staging on every run. No unseeded
// randomness anywhere in scene content. Written fresh for this recording.

export const WORLD_SEED = 20261122;

// mulberry32: a small, fast, well-distributed 32-bit PRNG. State is a
// single 32-bit integer; every call advances it deterministically.
export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// createRng returns an OBJECT, not a function. The object carries the
// raw next() plus convenience draws. Anywhere a callable is needed,
// normalize with toCallableRng (below) — never call rng() on the object.
export function createRng(seed = WORLD_SEED) {
  const next = mulberry32(seed);
  const rng = {
    seed: seed | 0,
    next,
    // Uniform float in [0, 1).
    random() {
      return next();
    },
    // Uniform float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Uniform integer in [min, max] inclusive.
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    // Pick one element of an array.
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    // True with probability p.
    chance(p) {
      return next() < p;
    },
    // Fork a child generator with a derived seed (keeps streams apart).
    fork(salt) {
      return createRng(((seed | 0) ^ Math.imul(salt | 0, 0x9e3779b1)) | 0);
    },
  };
  return rng;
}

// Alias required by the contract.
export const createSeededRandom = createRng;

// The shared world generator (single stream for city layout).
export const rng = createRng(WORLD_SEED);

// Normalize anything rng-like into a callable () => [0,1):
// a function passes through; an object with .next()/.random() is wrapped;
// a numeric seed builds a fresh generator; anything else (or nothing)
// falls back to the shared world stream.
export function toCallableRng(r) {
  if (typeof r === 'function') return r;
  if (r && typeof r.next === 'function') return () => r.next();
  if (r && typeof r.random === 'function') return () => r.random();
  if (typeof r === 'number') {
    const f = mulberry32(r);
    return () => f();
  }
  return () => rng.next();
}

// ---- Easings (pure, closed-form, deterministic) ---------------------------
// Back-out (kept for reference; the camera intro pullback that used it
// was reverted — do NOT reintroduce it).
export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
// Elastic-out over 0.35 s (dialogue pop-in). Kept.
export function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}
export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ---- Hashes (deterministic 2D -> [0,1)) ----------------------------------
export function hash1(x, y) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = (h ^ (h >>> 12)) >>> 0;
  return h / 4294967296;
}
export function hash2(x, y) {
  return hash1((x | 0) + 0x9e3779b9, (y | 0) ^ 0x85ebca6b);
}

// ---- Math helpers ---------------------------------------------------------
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
export function lerp(a, b, t) {
  return a + (b - a) * t;
}
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
