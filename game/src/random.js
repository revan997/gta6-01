// Deterministic seeded random generator (Lane A).
// All randomness in Lane A files comes from this factory, never from the
// built-in unseeded random function, so a given seed reproduces the same city.
// Uses the mulberry32 algorithm: small, fast, and well distributed.

// Round-5: hash a string to a 32-bit seed (FNV-1a) so named things
// (missions, districts) get a stable, readable seed instead of a magic
// number. Deterministic: the same string always yields the same seed.
export function seedFromString(str) {
  let h = 0x811c9dc5;
  const s = String(str ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Round-8: weighted pick over [{ value, weight }] (or [value, weight]
// tuples) using a caller-supplied rng-like ({ next() }). Pure helper so
// archetype selection in world.js reads as data, not inline roll code.
// Round-8 re-touch: invalid inputs now throw a clear error instead of
// silently returning a wrong value — empty pairs or a zero total weight
// used to return undefined / the first value, hiding caller bugs.
// Behaviour for valid inputs is unchanged.
export function weightedChoice(rng, pairs) {
  if (!pairs || pairs.length === 0) {
    throw new Error('weightedChoice: pairs must be a non-empty array');
  }
  const weights = pairs.map((p) => (Array.isArray(p) ? p[1] : p.weight) || 0);
  const idx = weightedChoiceIndex(rng, weights);
  const chosen = pairs[idx];
  return Array.isArray(chosen) ? chosen[0] : chosen.value;
}

// Round-8 re-touch: weighted pick over a plain weights array — returns
// the winning INDEX. Throws a clear error on an empty array, a
// non-finite or negative weight, a missing rng, or a zero total weight.
// weightedChoice() above is built on this, so both share one roll.
export function weightedChoiceIndex(rng, weights) {
  if (!rng || typeof rng.next !== 'function') {
    throw new Error('weightedChoiceIndex: rng with a next() method is required');
  }
  if (!Array.isArray(weights) || weights.length === 0) {
    throw new Error('weightedChoiceIndex: weights must be a non-empty array');
  }
  let total = 0;
  for (const w of weights) {
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0) {
      throw new Error('weightedChoiceIndex: weights must be finite numbers >= 0');
    }
    total += w;
  }
  if (total <= 0) {
    throw new Error('weightedChoiceIndex: total weight must be greater than 0');
  }
  let roll = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

// Round-6: pure interpolation helpers for the landmark camera focus
// (main.js eases the camera toward a landmark with lerp) and for any
// 0..1 clamp a caller needs without importing a whole utility module.
// Pure functions — no rng state, deterministic by construction.
export function clamp01(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp01(t);
}

// Round-7: smoothstep easing (0..1 in, 0..1 out, zero slope at both
// ends) for camera moves that should ease in AND out — the landmark
// focus blend in main.js uses it so the L-key swing starts and lands
// softly instead of snapping. Pure function, deterministic.
export function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

// Create a generator from a numeric seed.
// Returns { next(), range(min, max), int(min, max), pick(array), chance(p) }.
export function createRng(seed) {
  let state = (seed >>> 0) || 1;
  // Scramble the seed once so seeds 0, 1, 2 ... do not produce near-identical streams.
  state = (state ^ 0x9e3779b9) >>> 0;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Value in [0, 1).
  function range(min, max) {
    return min + next() * (max - min);
  }

  // Integer in [min, max] inclusive.
  function int(min, max) {
    return Math.floor(range(min, max + 1));
  }

  // One element of a non-empty array, uniformly.
  function pick(array) {
    if (!array || array.length === 0) return undefined;
    return array[Math.floor(next() * array.length)];
  }

  // Weighted pick: `pairs` is [{ value, weight }] (or [value, weight]
  // tuples); heavier weights are picked more often. Round 3 uses it for
  // billboard copy so the city name shows most often.
  function weightedPick(pairs) {
    if (!pairs || pairs.length === 0) return undefined;
    let total = 0;
    for (const p of pairs) total += (Array.isArray(p) ? p[1] : p.weight) || 0;
    if (total <= 0) return pick(pairs);
    let roll = next() * total;
    for (const p of pairs) {
      roll -= (Array.isArray(p) ? p[1] : p.weight) || 0;
      if (roll <= 0) return Array.isArray(p) ? p[0] : p.value;
    }
    const last = pairs[pairs.length - 1];
    return Array.isArray(last) ? last[0] : last.value;
  }

  // True with probability p (0..1).
  function chance(p) {
    return next() < p;
  }

  // Round-4b: a standard-normal sample (Box-Muller), mean 0, sd 1,
  // clamped to +-3. Traffic uses it so cruise speeds cluster naturally
  // around the mean instead of spreading uniformly across the range.
  function gaussian() {
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(-3, Math.min(3, z));
  }

  // Deterministic 2D value noise in [0, 1): smooth interpolation of a
  // hashed integer lattice, seeded by this generator's seed. Used for
  // texture speckle and ground variation — same seed, same pattern.
  function hash2(ix, iy) {
    let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed >>> 0, 974634211)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 4294967296;
  }
  function noise2(x, y) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash2(ix, iy);
    const b = hash2(ix + 1, iy);
    const c = hash2(ix, iy + 1);
    const d = hash2(ix + 1, iy + 1);
    const ab = a + (b - a) * sx;
    const cd = c + (d - c) * sx;
    return ab + (cd - ab) * sy;
  }

  // Fisher-Yates shuffle of a copy of `array`, using this generator.
  function shuffle(array) {
    const out = array.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  // Round 4: `n` distinct elements from `array` (a partial Fisher-Yates
  // over a copy), in deterministic order for this generator. Returns
  // fewer than n only when the array is shorter.
  function sample(array, n) {
    if (!array || array.length === 0 || !(n > 0)) return [];
    const out = array.slice();
    const take = Math.min(n, out.length);
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(next() * (out.length - i));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out.slice(0, take);
  }

  return { next, range, int, pick, weightedPick, weightedChoice: (pairs) => weightedChoice({ next }, pairs), chance, gaussian, noise2, shuffle, sample, seedFromString, clamp01, lerp, seed: seed >>> 0 };
}

export default createRng;
