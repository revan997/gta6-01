// Solmar Bay — the seeded pseudo-random generator and easing helpers.
//
// One seed, one sequence, identical on every run. The city layout, the
// traffic, the staging and every screenshot reproduce exactly across
// runs, because every random decision in the game comes from a seeded
// generator created here. Runtime code must make zero calls to the wall
// clock for scene content and zero unseeded random calls (the only
// random calls at runtime are the 3D library's internal unique-ID
// generation, which creates object identifiers and never affects scene
// content). The only allowed wall-clock use is the display-only save
// timestamp (save.js).
//
// Two pure easing helpers are provided as closed-form functions of time
// with no state and no randomness: a back-out easing (used for the
// camera intro pullback, which was reverted because it broke the gates
// — do NOT reintroduce it; the helper stays in the file) and an
// elastic-out easing (used for the dialogue pop-in over 0.35 seconds,
// which is kept). Both must be deterministic pure functions.

// ---------------------------------------------------------------------
// mulberry32 — a small, fast, well-distributed seeded generator.
// ---------------------------------------------------------------------

/**
 * Create a seeded random-number generator. The returned object keeps
 * its own state, so several generators can run side by side without
 * interfering (the world, the traffic and the staging each get one).
 *
 *   const rng = createRng(1337);
 *   rng.next()        // a float in [0, 1)
 *   rng.range(a, b)   // a float in [a, b)
 *   rng.int(a, b)     // an integer in [a, b]
 *   rng.pick(list)    // one element of the list
 *   rng.chance(p)     // true with probability p
 *   rng.shuffle(list) // a shuffled copy of the list
 */
export function createRng(seed) {
  let a = (seed | 0) >>> 0;
  // mulberry32's state must not be zero; fold the seed once.
  if (a === 0) a = 0x9e3779b9;
  function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function range(min, max) {
    return min + next() * (max - min);
  }
  function int(min, max) {
    // Inclusive on both ends, matching the old convention.
    return Math.floor(next() * (max - min + 1)) + min;
  }
  function pick(list) {
    if (!list || list.length === 0) return undefined;
    return list[Math.floor(next() * list.length)];
  }
  function chance(p) {
    return next() < p;
  }
  function shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
  function gaussian() {
    // Box-Muller, two draws, mean 0, standard deviation 1.
    const u1 = Math.max(next(), 1e-9);
    const u2 = next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
  function reset(newSeed) {
    a = (newSeed | 0) >>> 0;
    if (a === 0) a = 0x9e3779b9;
  }
  return { next, range, int, pick, chance, shuffle, gaussian, reset };
}

/**
 * The function form of the same generator (the kit starter's shape):
 * createRandom(seed) returns a function that yields a float in [0, 1)
 * on every call. Kept for modules that want a bare function.
 */
export function createRandom(seed) {
  const rng = createRng(seed);
  return rng.next;
}

// ---------------------------------------------------------------------
// Pure easing helpers — closed-form functions of time, no state,
// no randomness. Both are deterministic: f(t) === f(t) always.
// ---------------------------------------------------------------------

/**
 * Back-out easing: overshoots the target slightly, then settles back.
 * f(0) = 0, f(1) = 1, with a gentle overshoot past 1 in between.
 * Drove the camera intro pullback, which was reverted because it broke
 * the gates — keep the helper in the file but do NOT reintroduce the
 * pullback.
 */
export function backOut(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = Math.max(0, Math.min(1, t)) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}

/**
 * Elastic-out easing: springs past the target with decaying oscillation
 * and settles on it. Used for the dialogue pop-in over 0.35 seconds.
 * f(0) = 0, f(1) = 1.
 */
export function elasticOut(t) {
  const u = Math.max(0, Math.min(1, t));
  if (u === 0) return 0;
  if (u === 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * c4) + 1;
}

/**
 * Ease-out cubic: fast start, gentle landing. Used for HUD fades and
 * the mission-panel slide-in.
 */
export function easeOutCubic(t) {
  const u = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - u, 3);
}

/**
 * Ease-in-out quadratic: gentle at both ends. Used for camera blends
 * in free play (never for the staged cover camera).
 */
export function easeInOutQuad(t) {
  const u = Math.max(0, Math.min(1, t));
  return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
}

/**
 * Smoothstep: the classic S-curve, 0 at t = 0, 1 at t = 1, flat at
 * both ends. Used for the cover bend (the road bends west by 17 deg
 * over the car's z travel from -80 to -70): the bend angle is
 * -17 deg * smoothstep((z - (-80)) / 10), so the bend eases in and
 * out instead of snapping.
 */
export function smoothstep(t) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

/**
 * Linear interpolation.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamp a value into [min, max].
 */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/**
 * Wrap an angle into [-PI, PI].
 */
export function wrapAngle(a) {
  let v = a;
  while (v > Math.PI) v -= 2 * Math.PI;
  while (v < -Math.PI) v += 2 * Math.PI;
  return v;
}

/**
 * The shortest signed angular difference from `from` to `to`, in
 * [-PI, PI]. Used by the police pursuit steering and the aim officer.
 */
export function angleDelta(from, to) {
  return wrapAngle(to - from);
}

// ---------------------------------------------------------------------
// Deterministic noise (for the sea and the clouds). A value-noise
// function of a fixed seed, so the same input always gives the same
// output and no call to Math.random is ever needed.
// ---------------------------------------------------------------------

/**
 * A deterministic 1D value-noise function. hash(x) is a fixed
 * pseudo-random value in [0, 1) for the integer x; noise1(x) blends
 * neighbouring hashes with a smoothstep, so it is continuous.
 */
export function makeNoise1D(seed) {
  const s = (seed | 0) >>> 0;
  function hash(n) {
    let h = (n | 0) ^ (s | 0);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  function noise1(x) {
    const i = Math.floor(x);
    const f = x - i;
    const u = smoothstep(f);
    return lerp(hash(i), hash(i + 1), u);
  }
  return { hash, noise1 };
}

/**
 * A deterministic 2D value-noise function, same idea as makeNoise1D
 * but over (x, y). Used for the sea swell and the cloud drift.
 */
export function makeNoise2D(seed) {
  const s = (seed | 0) >>> 0;
  function hash2(ix, iy) {
    let h = (ix * 374761393 + iy * 668265263 + s * 974634211) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  function noise2(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = smoothstep(fx);
    const uy = smoothstep(fy);
    const a = lerp(hash2(ix, iy), hash2(ix + 1, iy), ux);
    const b = lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux);
    return lerp(a, b, uy);
  }
  return { hash2, noise2 };
}

// ---------------------------------------------------------------------
// A tiny deterministic sequence helper: the deck. The traffic manager
// draws car models from a deck that holds one of every model before
// repeating, so a fresh fleet covers many models on its first spawns.
// ---------------------------------------------------------------------

/**
 * Create a shuffled deck from a list, using the given rng. draw()
 * returns the next card; when the deck runs out it reshuffles itself
 * (a fresh deck holds one of every entry before repeating).
 */
export function createDeck(list, rng) {
  let deck = rng.shuffle(list);
  let index = 0;
  function draw() {
    if (index >= deck.length) {
      deck = rng.shuffle(list);
      index = 0;
    }
    const card = deck[index];
    index += 1;
    return card;
  }
  function remaining() {
    return deck.length - index;
  }
  return { draw, remaining };
}
