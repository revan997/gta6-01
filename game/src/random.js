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

  return { next, range, int, pick, chance, noise2, shuffle, seed: seed >>> 0 };
}

export default createRng;
