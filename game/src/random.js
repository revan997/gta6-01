// random.js — seeded pseudo-random generator + easing helpers.
// Attempt #9 (top10-rebuild).
//
// One seed, one sequence, identical on every run. ALL randomness in the
// game comes from here: city layout, traffic, pedestrians, staging.
// Runtime code makes ZERO unseeded random calls and ZERO wall-clock
// calls for scene content.
//
// createRng returns an OBJECT (never a bare function). Anywhere a plain
// callable is needed, normalise with toCallableRng — it accepts a
// function, an object with .next()/.random(), a numeric seed, or nothing.
//
// Easing helpers are pure closed-form functions of time with no state:
// easeOutBack drove the (reverted) camera intro pullback — the helper
// stays, the pullback must NOT be reintroduced; easeOutElastic drives
// the dialogue pop-in over 0.35 s.

export const WORLD_SEED = 20261122;

// ----------------------------------------------------------------------
// mulberry32 — tiny deterministic PRNG. Returns a function that yields
// a float in [0, 1). Same seed => same sequence, forever.
// ----------------------------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ----------------------------------------------------------------------
// createRng — the seeded generator object.
//   const rng = createRng();            // WORLD_SEED
//   const rng = createRng(12345);       // explicit seed
//   rng.next()        -> float [0,1)
//   rng.random()      -> float [0,1) (alias of next)
//   rng.range(a, b)   -> float [a, b)
//   rng.int(a, b)     -> integer [a, b)
//   rng.pick(array)   -> one element
//   rng.chance(p)     -> true with probability p
//   rng.shuffle(arr)  -> NEW shuffled copy (input untouched)
//   rng.fork(salt)    -> independent child generator
//   rng.reset()       -> restart the sequence from the seed
// ----------------------------------------------------------------------
export function createRng(seed = WORLD_SEED) {
  const startSeed = seed >>> 0;
  let nextFn = mulberry32(startSeed);

  const rng = {
    seed: startSeed,

    next() {
      return nextFn();
    },

    random() {
      return nextFn();
    },

    range(min, max) {
      return min + nextFn() * (max - min);
    },

    int(min, max) {
      return Math.floor(min + nextFn() * (max - min));
    },

    pick(array) {
      if (!array || array.length === 0) return undefined;
      return array[Math.floor(nextFn() * array.length)];
    },

    chance(p) {
      return nextFn() < p;
    },

    shuffle(array) {
      const out = array.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(nextFn() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },

    fork(salt) {
      const childSeed = (hash1(startSeed + hash1(salt) * 1000003) * 4294967296) >>> 0;
      return createRng(childSeed);
    },

    reset() {
      nextFn = mulberry32(startSeed);
      return rng;
    },
  };

  return rng;
}

// Alias: some modules import the seeded-random factory under this name.
export const createSeededRandom = createRng;

// The shared world generator. Modules that need "the" rng without
// passing one around use this instance — but prefer an explicitly
// passed rng in new code so tests can reseed.
export const rng = createRng(WORLD_SEED);

// ----------------------------------------------------------------------
// toCallableRng — normalise anything rng-like into a plain () => [0,1)
// function. Accepts: a function (returned as-is), an object with
// .next() or .random(), a numeric seed, or nothing (WORLD_SEED).
// ----------------------------------------------------------------------
export function toCallableRng(input) {
  if (typeof input === 'function') return input;
  if (input && typeof input.next === 'function') {
    return () => input.next();
  }
  if (input && typeof input.random === 'function') {
    return () => input.random();
  }
  if (typeof input === 'number') return mulberry32(input);
  return mulberry32(WORLD_SEED);
}

// ----------------------------------------------------------------------
// Easing helpers — pure functions of t in [0, 1]. No state, no random.
// ----------------------------------------------------------------------

// Back-out: overshoots slightly past 1, then settles. Kept for the
// dialogue/camera helpers; do NOT use it for a camera intro pullback.
export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

// Elastic-out: springy overshoot. Drives the dialogue pop-in (0.35 s).
export function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

// Cubic-out: fast start, gentle landing.
export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Quad in-out: gentle start and landing, fastest in the middle.
export function easeInOutQuad(t) {
  if (t < 0.5) return 2 * t * t;
  return 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ----------------------------------------------------------------------
// Small numeric helpers
// ----------------------------------------------------------------------
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// ----------------------------------------------------------------------
// Deterministic hashes — stable 0..1 values from integer inputs.
// Used for per-position variation that must not consume rng draws
// (e.g. building heights keyed by grid cell).
// ----------------------------------------------------------------------
export function hash1(n) {
  let h = (n | 0) * 374761393;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export function hash2(x, y) {
  let h = ((x | 0) * 374761393 + (y | 0) * 668265263) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

export default createRng;
