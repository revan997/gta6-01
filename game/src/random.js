// Solmar Bay — seeded randomness and pure easing helpers.
//
// One seed, one sequence, identical on every run: the city layout, the
// staging and every screenshot reproduce exactly. Nothing in this file
// touches the wall clock or unseeded randomness. The only allowed
// wall-clock use in the whole game is a display-only save timestamp
// (see save.js).

/** The single world seed. Every layout decision in the game derives from it. */
export const WORLD_SEED = 20261122;

/**
 * mulberry32 — a small, fast, well-distributed seeded PRNG.
 * Returns a function that yields floats in [0, 1).
 */
export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * createRng — the game's seeded generator. Returns an OBJECT (not a
 * function), so callers can tell at a glance whether they hold a generator
 * or a plain callable. Anywhere a callable is needed, normalize with
 * toCallableRng (below).
 */
export function createRng(seed = WORLD_SEED) {
  const nextFn = mulberry32(seed);
  let draws = 0;
  const rng = {
    seed,
    /** Next float in [0, 1). */
    next() {
      draws += 1;
      return nextFn();
    },
    /** Alias for next() — the name most call sites reach for. */
    random() {
      return rng.next();
    },
    /** Float in [min, max). */
    float(min = 0, max = 1) {
      return min + (max - min) * rng.next();
    },
    /** Integer in [min, max] inclusive. */
    int(min, max) {
      return Math.floor(rng.float(min, max + 1));
    },
    /** True with probability p (0..1). */
    chance(p) {
      return rng.next() < p;
    },
    /** A random element of a non-empty array. */
    pick(list) {
      if (!list || list.length === 0) return undefined;
      return list[Math.floor(rng.next() * list.length)];
    },
    /** -1 or 1 with equal probability. */
    sign() {
      return rng.next() < 0.5 ? -1 : 1;
    },
    /**
     * A fresh generator derived from this one, so a subsystem can draw
     * without shifting the main sequence. Deterministic: the same parent
     * state always derives the same child.
     */
    fork(salt = 0) {
      const childSeed = (rng.seed ^ Math.floor(rng.next() * 0x7fffffff) ^ (salt | 0)) | 0;
      return createRng(childSeed);
    },
    /** How many draws this generator has produced (diagnostics only). */
    get draws() {
      return draws;
    },
  };
  return rng;
}

/** Alias: createSeededRandom is exactly createRng (same function object). */
export const createSeededRandom = createRng;

/** The shared default generator, seeded once at boot. */
export const rng = createRng(WORLD_SEED);

/**
 * toCallableRng — normalize anything a caller might hand over into a plain
 * function returning floats in [0, 1). Accepts a function (used as-is), an
 * object with .next() or .random() (wrapped), a numeric seed (a fresh
 * generator), or nothing (a fresh generator from WORLD_SEED).
 */
export function toCallableRng(source) {
  if (typeof source === 'function') return source;
  if (source && typeof source.next === 'function') return () => source.next();
  if (source && typeof source.random === 'function') return () => source.random();
  if (typeof source === 'number') {
    const gen = createRng(source);
    return () => gen.next();
  }
  const gen = createRng(WORLD_SEED);
  return () => gen.next();
}

/** Clamp v into [min, max]. */
export function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/** Linear interpolation between a and b at t (0..1). */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * smoothstep — the classic S-curve. One argument: smoothstep(t) for t in
 * [0, 1]. Three arguments: smoothstep(edge0, edge1, x), the GLSL form.
 */
export function smoothstep(edge0, edge1, x) {
  let t;
  if (x === undefined) {
    t = edge0;
  } else {
    t = (x - edge0) / (edge1 - edge0);
  }
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * easeOutBack — overshoots slightly past the target, then settles.
 * Used for the camera intro pullback (reverted — do NOT reintroduce it)
 * and for small UI pops. Endpoint guards: exactly 0 at t=0, exactly 1
 * at t=1 (no epsilon drift).
 */
export function easeOutBack(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = t - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/**
 * easeOutElastic — springy overshoot that decays. Drives the dialogue
 * pop-in over 0.35 seconds. Pure function of time, no state.
 * Endpoint guards: exactly 0 at t=0, exactly 1 at t=1.
 */
export function easeOutElastic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/** easeOutCubic — fast start, gentle stop. */
export function easeOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const u = 1 - t;
  return 1 - u * u * u;
}

/** easeInOutQuad — gentle start and stop. */
export function easeInOutQuad(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.5) return 2 * t * t;
  return 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * hash1 — deterministic 1D hash: the same integer always maps to the same
 * float in [0, 1). Used for per-index variation without drawing from the
 * shared sequence (so adding an element never shifts later draws).
 */
export function hash1(n) {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * hash2 — deterministic 2D hash: the same (x, y) pair always maps to the
 * same float in [0, 1). Used for per-tile variation (building heights,
 * palm lean) without touching the shared sequence.
 */
export function hash2(x, y) {
  let h = ((x | 0) * 374761393 + (y | 0) * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
