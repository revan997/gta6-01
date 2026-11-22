// game/src/random.js — Seeded random generator and easing helpers
// (attempt #8, round-16 rebuild).
//
// One seed, one sequence, identical on every run. All randomness in the
// game comes from here, so the city, traffic, and staging are identical
// on every run. Runtime code must make zero unseeded random calls (the
// only random calls at runtime are the 3D library's internal unique-ID
// generation, which creates object identifiers and never affects scene
// content).
//
// createRng returns an OBJECT, not a function. Anywhere a callable is
// needed, normalize with toCallableRng (defined in the using file, and
// re-exported here for convenience): it accepts a function, an object
// with .next() / .random(), a numeric seed, or nothing.

export const WORLD_SEED = 20261122;

// ---------------------------------------------------------------------
// mulberry32 — a small, fast, deterministic 32-bit PRNG. Returns a
// function that yields a float in [0, 1) on every call. The sequence is
// fully determined by the seed, so two generators with the same seed
// produce the same numbers in the same order, forever.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextFloat() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------
// createRng — the seeded generator every module uses. Returns an OBJECT
// with the full helper API. The object carries its own sequence; two
// objects built from the same seed are independent but identical.
//
//   const rng = createRng(20261122);
//   rng.next()        // float in [0, 1)
//   rng.range(2, 5)   // float in [2, 5)
//   rng.int(0, 10)    // integer in [0, 10)
//   rng.pick(['a','b'])// one element, uniformly
//   rng.chance(0.25)  // true with probability 0.25
export function createRng(seed) {
  const startSeed = (seed === undefined || seed === null ? WORLD_SEED : seed) >>> 0;
  const nextFloat = mulberry32(startSeed);
  let draws = 0;

  const rng = {
    seed: startSeed,

    // The raw next float in [0, 1). Every other helper draws from this.
    // It reads through `holder` so reset() can swap the source.
    next() {
      draws += 1;
      return holder.fn();
    },

    // Alias used by callers that expect a .random() method.
    random() {
      return rng.next();
    },

    // Float in [min, max).
    range(min, max) {
      return min + rng.next() * (max - min);
    },

    // Integer in [min, max) — max exclusive, min inclusive.
    int(min, max) {
      return Math.floor(rng.range(min, max));
    },

    // Integer in [min, max] — both ends inclusive.
    intInclusive(min, max) {
      return Math.floor(rng.range(min, max + 1));
    },

    // One element of an array, uniformly. Returns undefined for an
    // empty array (never throws, so a bad call is visible, not fatal).
    pick(array) {
      if (!array || array.length === 0) return undefined;
      return array[rng.int(0, array.length)];
    },

    // True with probability p (p in [0, 1]).
    chance(p) {
      return rng.next() < p;
    },

    // A new array with the elements shuffled (Fisher-Yates, seeded).
    // The input array is NOT modified.
    shuffle(array) {
      const out = array.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i + 1);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
      }
      return out;
    },

    // A deterministic pick weighted by the given weights array.
    weighted(items, weights) {
      let total = 0;
      for (let i = 0; i < weights.length; i += 1) total += weights[i];
      let roll = rng.next() * total;
      for (let i = 0; i < items.length; i += 1) {
        roll -= weights[i];
        if (roll <= 0) return items[i];
      }
      return items[items.length - 1];
    },

    // Gaussian-ish value in [-1, 1] (mean 0), from two draws.
    gaussian() {
      return (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
    },

    // How many draws this generator has made (debugging aid: a layout
    // shift downstream of a new draw is visible as a changed count).
    get draws() {
      return draws;
    },

    // A child generator derived from this one: it draws one number from
    // the parent to seed itself, so the child sequence is deterministic
    // and does not disturb the parent's later draws beyond that one.
    fork() {
      return createRng(Math.floor(rng.next() * 4294967296));
    },

    // Reset the sequence to the start (same seed, same numbers again).
    reset() {
      holder.fn = mulberry32(startSeed);
      draws = 0;
      return rng;
    },

    // Internal: the raw float source (used by reset).
    _raw: nextFloat,
  };

  // Mutable holder so reset() can swap the float source.
  const holder = { fn: nextFloat };
  return rng;
}

// The default shared generator, seeded with the world seed. Modules that
// need "a" generator without caring which one use this. Layout code
// builds its own createRng(WORLD_SEED) instances so draw order stays
// explicit and auditable.
export const rng = createRng(WORLD_SEED);

// Alias required by the contract: createSeededRandom IS createRng.
export const createSeededRandom = createRng;

// ---------------------------------------------------------------------
// toCallableRng — normalize anything into a () => float-in-[0,1)
// function. Accepts:
//   - a function            -> itself
//   - an object with .random() -> () => obj.random()
//   - an object with .next()   -> () => obj.next()
//   - a numeric seed          -> mulberry32(seed)
//   - nothing / anything else -> mulberry32(WORLD_SEED)
export function toCallableRng(input) {
  if (typeof input === 'function') return input;
  if (input && typeof input.random === 'function') {
    return () => input.random();
  }
  if (input && typeof input.next === 'function') {
    return () => input.next();
  }
  if (typeof input === 'number') return mulberry32(input);
  return mulberry32(WORLD_SEED);
}

// ---------------------------------------------------------------------
// Pure easing helpers. Both are closed-form functions of time with no
// state and no randomness. The elastic-out easing drives the dialogue
// pop-in over 0.35 seconds. The back-out easing drove the camera intro
// pullback, which was reverted because it broke the gates — keep the
// helper in the file but do NOT reintroduce the pullback.

// Back-out: overshoots past 1, then settles back to 1. t in [0, 1].
export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

// Elastic-out: oscillates with decaying amplitude, settling at 1.
// t in [0, 1]. Used for the dialogue pop-in over 0.35 seconds.
export function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

// Cubic-out: fast start, gentle landing. t in [0, 1].
export function easeOutCubic(t) {
  const u = 1 - t;
  return 1 - u * u * u;
}

// Quadratic in-out: gentle at both ends, fastest in the middle.
export function easeInOutQuad(t) {
  if (t < 0.5) return 2 * t * t;
  return 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// ---------------------------------------------------------------------
// Deterministic integer hashes. hash1(x) and hash2(x, y) map integer
// coordinates to a stable float in [0, 1) with no state and no draws, so
// world code can hash a grid cell without touching the seeded sequence.
export function hash1(x) {
  let h = (x | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

export function hash2(x, y) {
  let h = ((x | 0) * 374761393 + (y | 0) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------
// Numeric helpers (pure, no state).

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Smoothstep: 0 below min, 1 above max, smooth S-curve between.
export function smoothstep(min, max, value) {
  const t = clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

// Wrap an angle to (-PI, PI].
export function wrapAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

// Degrees <-> radians.
export function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}
