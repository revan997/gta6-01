// Deterministic seeded random generator (Lane A).
// All randomness in Lane A files comes from this factory, never from the
// built-in unseeded random function, so a given seed reproduces the same city.
// Uses the mulberry32 algorithm: small, fast, and well distributed.

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

  // True with probability p (0..1).
  function chance(p) {
    return next() < p;
  }

  return { next, range, int, pick, chance, seed: seed >>> 0 };
}

export default createRng;
