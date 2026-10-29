// Seeded, deterministic pseudo-random numbers (mulberry32). The simulation
// must never use Math.random(): seeking replays the run from the start.

function hashString(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed = 1969) {
  let state = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  let spare = null;

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Box-Muller with a cached spare value.
  function normal(mu = 0, sigma = 1) {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return mu + sigma * v;
    }
    let u = 0;
    while (u === 0) u = next();
    const v = next();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return mu + sigma * r * Math.cos(2 * Math.PI * v);
  }

  // Independent stream derived from this seed, so adding a consumer does not
  // shift every other consumer's sequence.
  function fork(label) {
    return createRng((hashString(String(label)) ^ (seed >>> 0)) >>> 0);
  }

  return { next, normal, fork };
}
